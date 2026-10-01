import hmac
import re
import secrets
from datetime import timedelta
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.limiter import limiter
from app.models import (
    ALLOWED_TRANSITIONS,
    CheckoutDraft,
    Coupon,
    DeliveryZone,
    DiscountType,
    Offer,
    Order,
    OrderStatus,
    PaymentMethod,
    PaymentStatus,
    Product,
    utcnow,
)
from app.schemas import (
    AdminOrderOut,
    CheckoutDraftOut,
    CheckoutRecoveryResult,
    CouponCreate,
    CouponOut,
    CouponUpdate,
    DeliverySettingsOut,
    DeliverySettingsUpdate,
    DeliveryZoneCreate,
    DeliveryZoneOut,
    DeliveryZoneUpdate,
    OfferCreate,
    OfferOut,
    OfferUpdate,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    ShippingQuoteIn,
    ShippingQuoteResult,
    StatusUpdate,
)
from app.routers.payments import mark_paid
from app.services.notify import notify_team, rupees
from app.services.orders import get_delivery_settings
from app.services.payments import PaymentGatewayError, create_razorpay_order, get_order_payments

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "products"
ALLOWED_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


@limiter.limit("30/minute")
def require_admin(
    request: Request,
    authorization: str = Header(default=""),
    settings: Settings = Depends(get_settings),
) -> None:
    """Rate-limited so a wrong/weak admin token can't be brute-forced — 30/min per IP is
    generous for the dashboard's own polling but slow going for a guesser."""
    if not settings.admin_token:
        raise HTTPException(503, "Admin panel is disabled — set ADMIN_TOKEN on the server.")
    token = authorization.removeprefix("Bearer ").strip()
    if not hmac.compare_digest(token, settings.admin_token):
        raise HTTPException(401, "Wrong admin token.")


router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def unique_slug(db: Session, name: str) -> str:
    base = re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", name.lower())).strip("-") or "product"
    slug = base
    n = 2
    while db.scalar(select(Product.id).where(Product.slug == slug)):
        slug = f"{base}-{n}"
        n += 1
    return slug


def generate_coupon_code(db: Session) -> str:
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    while True:
        code = "".join(secrets.choice(alphabet) for _ in range(8))
        if not db.scalar(select(Coupon.id).where(Coupon.code == code)):
            return code


@router.get("/orders", response_model=list[AdminOrderOut])
def list_orders(
    status: OrderStatus | None = None,
    limit: int = Query(default=100, le=500),
    db: Session = Depends(get_db),
):
    q = select(Order).order_by(Order.created_at.desc()).limit(limit)
    if status:
        q = q.where(Order.status == status)
    return db.scalars(q).all()


@router.patch("/orders/{order_id}/status", response_model=AdminOrderOut)
def update_status(order_id: int, data: StatusUpdate, db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found.")
    if data.status not in ALLOWED_TRANSITIONS[order.status]:
        raise HTTPException(
            409, f"Can't move an order from {order.status.value} to {data.status.value}."
        )
    unpaid_online = order.payment_method == PaymentMethod.online and order.payment_status != PaymentStatus.paid
    if unpaid_online and data.status != OrderStatus.cancelled:
        raise HTTPException(409, "This online order hasn't been paid yet — only cancelling is allowed.")

    order.status = data.status
    # The delivery team collects cash at the door, so "delivered" settles a COD order.
    if data.status == OrderStatus.delivered and order.payment_status == PaymentStatus.cod_due:
        order.payment_status = PaymentStatus.cod_collected
    db.commit()
    db.refresh(order)
    return order


@router.post("/orders/{order_id}/shipping-quote", response_model=ShippingQuoteResult)
def set_shipping_quote(
    order_id: int,
    data: ShippingQuoteIn,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Once the team has a courier quote for an out-of-zone order, this sets the shipping
    charge, creates a Razorpay order for cart + shipping (the same mechanism as a normal
    online order), and hands back a wa.me link to the customer's own order page — sending it
    is still a manual click, same as the checkout-draft recovery flow, until a WhatsApp
    Business API is wired up."""
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found.")
    if not order.out_of_zone:
        raise HTTPException(409, "This order isn't an out-of-zone courier order.")
    if order.payment_status == PaymentStatus.paid:
        raise HTTPException(409, "This order is already paid.")
    if not settings.online_payments_enabled:
        raise HTTPException(503, "Online payments aren't set up — add Razorpay keys first.")

    order.delivery_fee_paise = data.shipping_fee_paise
    order.shipping_courier = data.courier
    order.total_paise = max(0, order.subtotal_paise - order.discount_paise) + order.delivery_fee_paise

    try:
        order.razorpay_order_id = create_razorpay_order(
            amount_paise=order.total_paise,
            receipt=order.public_id,
            key_id=settings.razorpay_key_id,
            key_secret=settings.razorpay_key_secret,
        )
    except PaymentGatewayError as e:
        raise HTTPException(502, f"Couldn't create the payment: {e}") from None

    order.payment_status = PaymentStatus.pending
    db.commit()
    db.refresh(order)

    pay_url = f"{settings.site_url}/order/{order.public_id}?phone={order.phone}"
    courier_bit = f" via {order.shipping_courier}" if order.shipping_courier else ""
    message = (
        f"Hi {order.customer_name.split(' ')[0]}, your PBL Plants order {order.public_id} is ready to "
        f"ship{courier_bit}. Parcel + shipping total: {rupees(order.total_paise)}. "
        f"Pay here to dispatch: {pay_url}"
    )
    return ShippingQuoteResult(
        order=AdminOrderOut.model_validate(order),
        whatsapp_url=f"https://wa.me/91{order.phone}?text={quote(message)}",
        message=message,
    )


@router.post("/orders/{order_id}/refresh-payment", response_model=AdminOrderOut)
def refresh_payment_status(order_id: int, db: Session = Depends(get_db), settings: Settings = Depends(get_settings)):
    """Manual fallback for when the webhook hasn't (or can't) reach us — e.g. testing against a
    local server with no public URL. Asks Razorpay directly instead of waiting for it."""
    order = db.get(Order, order_id)
    if order is None:
        raise HTTPException(404, "Order not found.")
    if not order.razorpay_order_id:
        raise HTTPException(409, "This order has nothing to pay yet.")
    if order.payment_status == PaymentStatus.paid:
        return order

    try:
        payments = get_order_payments(
            razorpay_order_id=order.razorpay_order_id,
            key_id=settings.razorpay_key_id,
            key_secret=settings.razorpay_key_secret,
        )
    except PaymentGatewayError as e:
        raise HTTPException(502, f"Couldn't check the payment: {e}") from None

    captured = next((p for p in payments if p.get("status") == "captured"), None)
    if captured and mark_paid(db, order, captured["id"]):
        notify_team(order, "New PAID order")
    db.refresh(order)
    return order


@router.get("/products", response_model=list[ProductOut])
def admin_products(db: Session = Depends(get_db)):
    return db.scalars(select(Product).order_by(Product.sort_order, Product.id)).all()


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(data: ProductCreate, db: Session = Depends(get_db)):
    slug = unique_slug(db, data.name)
    next_sort = (db.scalar(select(func.max(Product.sort_order))) or 0) + 1
    product = Product(slug=slug, sort_order=next_sort, **data.model_dump())
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    delete_uploaded_file(product.image_url)
    db.delete(product)
    db.commit()


@router.post("/products/{product_id}/image", response_model=ProductOut)
async def upload_product_image(product_id: int, file: UploadFile, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")

    ext = ALLOWED_IMAGE_TYPES.get(file.content_type or "")
    if ext is None:
        raise HTTPException(415, "Upload a JPEG, PNG, WebP or GIF image.")

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Image must be 5 MB or smaller.")

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{product.slug}-{secrets.token_hex(6)}{ext}"
    (UPLOAD_DIR / filename).write_bytes(data)

    delete_uploaded_file(product.image_url)
    product.image_url = f"/uploads/products/{filename}"
    db.commit()
    db.refresh(product)
    return product


def delete_uploaded_file(image_url: str | None) -> None:
    if not image_url or not image_url.startswith("/uploads/products/"):
        return
    path = UPLOAD_DIR / Path(image_url).name
    path.unlink(missing_ok=True)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, data: ProductUpdate, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(404, "Product not found.")
    if data.clear_price:
        product.price_paise = None
    elif data.price_paise is not None:
        product.price_paise = data.price_paise
    if data.clear_badge:
        product.badge = None
    if data.clear_image:
        delete_uploaded_file(product.image_url)
        product.image_url = None
    for field in ("name", "category", "tagline", "care", "icon", "price_is_from", "in_stock", "badge", "image_url"):
        value = getattr(data, field)
        if value is not None:
            setattr(product, field, value)
    db.commit()
    db.refresh(product)
    return product


@router.get("/offers", response_model=list[OfferOut])
def admin_offers(db: Session = Depends(get_db)):
    return db.scalars(select(Offer).order_by(Offer.sort_order, Offer.min_spend_paise)).all()


@router.post("/offers", response_model=OfferOut, status_code=201)
def create_offer(data: OfferCreate, db: Session = Depends(get_db)):
    next_sort = (db.scalar(select(func.max(Offer.sort_order))) or 0) + 1
    offer = Offer(sort_order=next_sort, **data.model_dump())
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return offer


@router.patch("/offers/{offer_id}", response_model=OfferOut)
def update_offer(offer_id: int, data: OfferUpdate, db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(404, "Offer not found.")
    for field in ("min_spend_paise", "reward_text", "active"):
        value = getattr(data, field)
        if value is not None:
            setattr(offer, field, value)
    db.commit()
    db.refresh(offer)
    return offer


@router.delete("/offers/{offer_id}", status_code=204)
def delete_offer(offer_id: int, db: Session = Depends(get_db)):
    offer = db.get(Offer, offer_id)
    if offer is None:
        raise HTTPException(404, "Offer not found.")
    db.delete(offer)
    db.commit()


@router.get("/delivery-zones", response_model=list[DeliveryZoneOut])
def list_delivery_zones(db: Session = Depends(get_db)):
    return db.scalars(select(DeliveryZone).order_by(DeliveryZone.distance_km)).all()


@router.post("/delivery-zones", response_model=DeliveryZoneOut, status_code=201)
def create_delivery_zone(data: DeliveryZoneCreate, db: Session = Depends(get_db)):
    if db.scalar(select(DeliveryZone).where(DeliveryZone.pincode == data.pincode)):
        raise HTTPException(409, f"{data.pincode} is already in the delivery zone list.")
    zone = DeliveryZone(**data.model_dump())
    db.add(zone)
    db.commit()
    db.refresh(zone)
    return zone


@router.patch("/delivery-zones/{zone_id}", response_model=DeliveryZoneOut)
def update_delivery_zone(zone_id: int, data: DeliveryZoneUpdate, db: Session = Depends(get_db)):
    zone = db.get(DeliveryZone, zone_id)
    if zone is None:
        raise HTTPException(404, "Delivery zone not found.")
    for field in ("distance_km", "label"):
        value = getattr(data, field)
        if value is not None:
            setattr(zone, field, value)
    db.commit()
    db.refresh(zone)
    return zone


@router.delete("/delivery-zones/{zone_id}", status_code=204)
def delete_delivery_zone(zone_id: int, db: Session = Depends(get_db)):
    zone = db.get(DeliveryZone, zone_id)
    if zone is None:
        raise HTTPException(404, "Delivery zone not found.")
    db.delete(zone)
    db.commit()


@router.get("/delivery-settings", response_model=DeliverySettingsOut)
def admin_delivery_settings(db: Session = Depends(get_db)):
    return get_delivery_settings(db)


@router.patch("/delivery-settings", response_model=DeliverySettingsOut)
def update_delivery_settings(data: DeliverySettingsUpdate, db: Session = Depends(get_db)):
    s = get_delivery_settings(db)
    for field in ("free_km", "rate_paise_per_km", "free_delivery_min_paise", "max_km"):
        value = getattr(data, field)
        if value is not None:
            setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return s


@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(db: Session = Depends(get_db)):
    return db.scalars(select(Coupon).order_by(Coupon.created_at.desc())).all()


@router.post("/coupons", response_model=CouponOut, status_code=201)
def create_coupon(data: CouponCreate, db: Session = Depends(get_db)):
    code = data.code or generate_coupon_code(db)
    if db.scalar(select(Coupon.id).where(Coupon.code == code)):
        raise HTTPException(409, f"Coupon code {code} already exists.")
    payload = data.model_dump()
    payload["code"] = code
    coupon = Coupon(**payload)
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.patch("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: int, data: CouponUpdate, db: Session = Depends(get_db)):
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(404, "Coupon not found.")
    for field in ("discount_type", "discount_value", "min_order_paise", "max_discount_paise", "usage_limit", "active", "expires_at"):
        value = getattr(data, field)
        if value is not None:
            setattr(coupon, field, value)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.delete("/coupons/{coupon_id}", status_code=204)
def delete_coupon(coupon_id: int, db: Session = Depends(get_db)):
    coupon = db.get(Coupon, coupon_id)
    if coupon is None:
        raise HTTPException(404, "Coupon not found.")
    db.delete(coupon)
    db.commit()


@router.get("/checkout-drafts", response_model=list[CheckoutDraftOut])
def list_checkout_drafts(db: Session = Depends(get_db)):
    return db.scalars(select(CheckoutDraft).order_by(CheckoutDraft.updated_at.desc())).all()


@router.delete("/checkout-drafts/{draft_id}", status_code=204)
def delete_checkout_draft(draft_id: int, db: Session = Depends(get_db)):
    draft = db.get(CheckoutDraft, draft_id)
    if draft is None:
        raise HTTPException(404, "Checkout draft not found.")
    db.delete(draft)
    db.commit()


@router.post("/checkout-drafts/{draft_id}/recover", response_model=CheckoutRecoveryResult)
def recover_checkout_draft(draft_id: int, db: Session = Depends(get_db)):
    """Generates a one-time 10%-off coupon for this abandoned checkout and prepares a WhatsApp
    message to send it — sending is manual until an SMS/WhatsApp provider is wired up."""
    draft = db.get(CheckoutDraft, draft_id)
    if draft is None:
        raise HTTPException(404, "Checkout draft not found.")

    code = generate_coupon_code(db)
    coupon = Coupon(
        code=code,
        discount_type=DiscountType.percent,
        discount_value=10,
        usage_limit=1,
        expires_at=utcnow() + timedelta(days=3),
    )
    db.add(coupon)

    draft.recovery_coupon_code = code
    draft.recovery_sent_at = utcnow()
    db.commit()

    items = ", ".join(f"{line['quantity']} × {line['name']}" for line in draft.cart_snapshot) or "your cart"
    first_name = (draft.customer_name or "there").split(" ")[0]
    message = (
        f"Hi {first_name}, you left {items} waiting at PBL Plants! "
        f"Complete your order and use code {code} for 10% off — valid for the next 3 days."
    )
    return CheckoutRecoveryResult(
        coupon_code=code,
        whatsapp_url=f"https://wa.me/91{draft.phone}?text={quote(message)}",
        message=message,
    )
