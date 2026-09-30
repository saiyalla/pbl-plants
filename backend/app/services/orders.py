"""Order building. Prices always come from the database — never from the browser."""

from dataclasses import dataclass
from datetime import timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings
from app.models import (
    Coupon,
    DeliverySettings,
    DeliveryZone,
    DiscountType,
    Order,
    OrderItem,
    PaymentMethod,
    PaymentStatus,
    Product,
    utcnow,
)
from app.schemas import OrderCreate


@dataclass
class OrderError(Exception):
    message: str
    status_code: int = 422


@dataclass
class DeliveryResult:
    deliverable: bool
    fee_paise: int
    base_fee_paise: int
    distance_km: float | None
    cod_allowed: bool
    free_delivery_min_paise: int


@dataclass
class CouponResult:
    valid: bool
    message: str
    discount_paise: int
    coupon: Coupon | None


def get_delivery_settings(db: Session) -> DeliverySettings:
    settings_row = db.get(DeliverySettings, 1)
    if settings_row is None:  # pragma: no cover — seeded on startup, defensive only
        settings_row = DeliverySettings(id=1)
        db.add(settings_row)
        db.commit()
        db.refresh(settings_row)
    return settings_row


def compute_delivery(db: Session, pincode: str, subtotal_paise: int) -> DeliveryResult:
    s = get_delivery_settings(db)
    zone = db.scalar(select(DeliveryZone).where(DeliveryZone.pincode == pincode))
    if zone is None:
        return DeliveryResult(
            deliverable=False, fee_paise=0, base_fee_paise=0, distance_km=None,
            cod_allowed=False, free_delivery_min_paise=s.free_delivery_min_paise,
        )

    if zone.distance_km > s.max_km:
        return DeliveryResult(
            deliverable=False, fee_paise=0, base_fee_paise=0, distance_km=zone.distance_km,
            cod_allowed=False, free_delivery_min_paise=s.free_delivery_min_paise,
        )

    cod_allowed = zone.distance_km <= s.free_km
    extra_km = max(0.0, zone.distance_km - s.free_km)
    base_fee = round(extra_km * s.rate_paise_per_km)
    fee = 0 if subtotal_paise >= s.free_delivery_min_paise else base_fee
    return DeliveryResult(
        deliverable=True, fee_paise=fee, base_fee_paise=base_fee, distance_km=zone.distance_km,
        cod_allowed=cod_allowed, free_delivery_min_paise=s.free_delivery_min_paise,
    )


def compute_coupon_discount(db: Session, code: str, subtotal_paise: int) -> CouponResult:
    coupon = db.scalar(select(Coupon).where(Coupon.code == code.strip().upper()))
    if coupon is None:
        return CouponResult(False, "That coupon code doesn't exist.", 0, None)
    if not coupon.active:
        return CouponResult(False, "This coupon is no longer active.", 0, coupon)
    if coupon.expires_at:
        expires_at = coupon.expires_at
        if expires_at.tzinfo is None:  # SQLite drops tzinfo on round-trip
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at < utcnow():
            return CouponResult(False, "This coupon has expired.", 0, coupon)
    if coupon.usage_limit is not None and coupon.used_count >= coupon.usage_limit:
        return CouponResult(False, "This coupon has already been fully redeemed.", 0, coupon)
    if subtotal_paise < coupon.min_order_paise:
        short = (coupon.min_order_paise - subtotal_paise) // 100
        return CouponResult(False, f"Add ₹{short} more to use this coupon.", 0, coupon)

    if coupon.discount_type == DiscountType.percent:
        discount = round(subtotal_paise * coupon.discount_value / 100)
        if coupon.max_discount_paise is not None:
            discount = min(discount, coupon.max_discount_paise)
    else:
        discount = coupon.discount_value
    discount = min(discount, subtotal_paise)
    return CouponResult(True, "Coupon applied.", discount, coupon)


def build_order(db: Session, data: OrderCreate, settings: Settings) -> Order:
    # A rough subtotal (before we know exact line prices) is enough to check the free-delivery
    # threshold; it's recomputed exactly below once server-side prices are resolved.
    delivery = compute_delivery(db, data.pincode, subtotal_paise=0)
    # Pincodes outside our own delivery zones aren't refused — they're shipped by courier
    # (DTDC/RTC) instead. The exact parcel charge only comes once the team gets a courier
    # quote, so it can't be collected at checkout: COD is impossible (no team visit to collect
    # cash) and online payment for the balance happens later via a link sent after packing.
    out_of_zone = not delivery.deliverable
    if out_of_zone:
        if data.payment_method != PaymentMethod.online:
            raise OrderError(
                "Cash on delivery isn't available for this pincode — we ship it by courier instead. "
                "Choose online payment and we'll confirm the exact shipping charge before dispatch."
            )
        if not settings.online_payments_enabled:
            raise OrderError(
                "Shipping this address needs a courier and online payment, and online payment isn't "
                "set up yet — message us on WhatsApp and we'll help.",
                503,
            )
    else:
        if data.payment_method == PaymentMethod.cod and not delivery.cod_allowed:
            raise OrderError("Cash on delivery isn't available this far — please pay online for this address.")
        if data.payment_method == PaymentMethod.online and not settings.online_payments_enabled:
            raise OrderError("Online payment isn't available right now — please choose Cash on Delivery.", 503)

    # Merge duplicate lines for the same product.
    qty_by_product: dict[int, int] = {}
    for line in data.items:
        qty_by_product[line.product_id] = qty_by_product.get(line.product_id, 0) + line.quantity

    products = {
        p.id: p for p in db.scalars(select(Product).where(Product.id.in_(qty_by_product.keys())))
    }

    items: list[OrderItem] = []
    subtotal = 0
    for product_id, qty in qty_by_product.items():
        product = products.get(product_id)
        if product is None:
            raise OrderError(f"Product {product_id} no longer exists — please refresh your cart.")
        if not product.in_stock:
            raise OrderError(f"{product.name} is out of stock right now.")
        if product.price_paise is None:
            raise OrderError(f"{product.name} needs a price confirmed first — ask us on WhatsApp.")
        if qty > 20:
            raise OrderError(f"For more than 20 × {product.name}, message us on WhatsApp for a bulk price.")
        line_total = product.price_paise * qty
        subtotal += line_total
        items.append(
            OrderItem(
                product_id=product.id,
                product_name=product.name,
                unit_price_paise=product.price_paise,
                quantity=qty,
                line_total_paise=line_total,
            )
        )

    if subtotal < settings.min_order_paise:
        raise OrderError(f"Minimum order is ₹{settings.min_order_paise // 100}.")

    # Recompute with the real subtotal — the free-delivery threshold depends on it. Out-of-zone
    # orders have no fee yet; the team adds one once they have a courier quote.
    fee = 0 if out_of_zone else compute_delivery(db, data.pincode, subtotal).fee_paise

    discount = 0
    coupon_code = None
    if data.coupon_code:
        result = compute_coupon_discount(db, data.coupon_code, subtotal)
        if not result.valid:
            raise OrderError(result.message)
        discount = result.discount_paise
        coupon_code = result.coupon.code
        result.coupon.used_count += 1

    return Order(
        customer_name=data.customer_name,
        phone=data.phone,
        address=data.address,
        pincode=data.pincode,
        notes=data.notes,
        payment_method=data.payment_method,
        payment_status=PaymentStatus.cod_due if data.payment_method == PaymentMethod.cod else PaymentStatus.pending,
        out_of_zone=out_of_zone,
        subtotal_paise=subtotal,
        delivery_fee_paise=fee,
        coupon_code=coupon_code,
        discount_paise=discount,
        total_paise=max(0, subtotal - discount) + fee,
        items=items,
    )
