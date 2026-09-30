import enum
import secrets
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_public_id() -> str:
    # Short, unguessable order code customers can read over the phone, e.g. PBL-7K2QH9XM
    alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "PBL-" + "".join(secrets.choice(alphabet) for _ in range(8))


class PaymentMethod(str, enum.Enum):
    cod = "cod"
    online = "online"


class DiscountType(str, enum.Enum):
    percent = "percent"
    flat = "flat"


class PaymentStatus(str, enum.Enum):
    pending = "pending"          # online order created, awaiting payment
    paid = "paid"
    failed = "failed"
    cod_due = "cod_due"          # cash to be collected on delivery
    cod_collected = "cod_collected"


class OrderStatus(str, enum.Enum):
    placed = "placed"
    confirmed = "confirmed"
    packed = "packed"
    out_for_delivery = "out_for_delivery"
    delivered = "delivered"
    cancelled = "cancelled"


# Which status changes the team is allowed to make from the admin panel.
ALLOWED_TRANSITIONS: dict[OrderStatus, set[OrderStatus]] = {
    OrderStatus.placed: {OrderStatus.confirmed, OrderStatus.cancelled},
    OrderStatus.confirmed: {OrderStatus.packed, OrderStatus.cancelled},
    OrderStatus.packed: {OrderStatus.out_for_delivery, OrderStatus.cancelled},
    OrderStatus.out_for_delivery: {OrderStatus.delivered, OrderStatus.cancelled},
    OrderStatus.delivered: set(),
    OrderStatus.cancelled: set(),
}


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    tagline: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(40), index=True)
    badge: Mapped[str | None] = mapped_column(String(40), nullable=True)
    care: Mapped[list[str]] = mapped_column(JSON, default=list)
    icon: Mapped[str] = mapped_column(String(40), default="leaf")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Price in paise. NULL = "ask for price" (can't be ordered online yet).
    price_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    price_is_from: Mapped[bool] = mapped_column(Boolean, default=False)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class Offer(Base):
    """A promotional banner shown on the site, e.g. 'Spend ₹999+, get a free succulent'.

    Informational only — nothing here is applied automatically to cart pricing. The team
    manually honours it (adds the free item, applies the discount) when packing the order.
    """

    __tablename__ = "offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    min_spend_paise: Mapped[int] = mapped_column(Integer)
    reward_text: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Coupon(Base):
    """A discount code the team generates from the admin panel; customers apply it at checkout.

    Discounts only ever reduce the item subtotal, never the delivery fee. `used_count` is
    incremented each time an order successfully applies the coupon, and checked against
    `usage_limit` (None = unlimited).
    """

    __tablename__ = "coupons"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(24), unique=True, index=True)
    discount_type: Mapped[DiscountType] = mapped_column(Enum(DiscountType))
    # Percent: 1-100. Flat: paise.
    discount_value: Mapped[int] = mapped_column(Integer)
    min_order_paise: Mapped[int] = mapped_column(Integer, default=0)
    max_discount_paise: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    used_count: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CheckoutDraft(Base):
    """A checkout the customer started (name + phone + pincode entered) but hasn't placed.

    One row per phone number, upserted as the customer types. Deleted automatically once that
    phone number successfully places an order. The team can generate a one-time recovery coupon
    from the admin panel and send it manually (WhatsApp/SMS) until that's automated.
    """

    __tablename__ = "checkout_drafts"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(15), unique=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(120), default="")
    pincode: Mapped[str] = mapped_column(String(6), default="")
    # Snapshot of cart lines at the time of the last save: [{name, quantity, price_paise}, ...]
    cart_snapshot: Mapped[list[dict]] = mapped_column(JSON, default=list)
    subtotal_paise: Mapped[int] = mapped_column(Integer, default=0)
    recovery_coupon_code: Mapped[str | None] = mapped_column(String(24), nullable=True)
    recovery_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class DeliveryZone(Base):
    """A pincode the team delivers to, with its road distance from the store."""

    __tablename__ = "delivery_zones"

    id: Mapped[int] = mapped_column(primary_key=True)
    pincode: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    distance_km: Mapped[float] = mapped_column(Float)
    label: Mapped[str] = mapped_column(String(80), default="")


class DeliverySettings(Base):
    """Singleton row (id=1) holding the delivery-fee formula, tuned from the admin panel.

    fee = rate_paise_per_km × max(0, distance_km − free_km), waived entirely once the cart
    subtotal reaches free_delivery_min_paise. Cash on delivery is only offered within free_km;
    beyond that (and beyond max_km) the site requires online payment or refuses delivery.
    """

    __tablename__ = "delivery_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    free_km: Mapped[float] = mapped_column(Float, default=5.0)
    rate_paise_per_km: Mapped[int] = mapped_column(Integer, default=2000)
    free_delivery_min_paise: Mapped[int] = mapped_column(Integer, default=99900)
    max_km: Mapped[float] = mapped_column(Float, default=20.0)


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    public_id: Mapped[str] = mapped_column(String(20), unique=True, index=True, default=new_public_id)

    customer_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(15), index=True)
    address: Mapped[str] = mapped_column(Text)
    pincode: Mapped[str] = mapped_column(String(6))
    notes: Mapped[str] = mapped_column(Text, default="")

    payment_method: Mapped[PaymentMethod] = mapped_column(Enum(PaymentMethod))
    payment_status: Mapped[PaymentStatus] = mapped_column(Enum(PaymentStatus))
    status: Mapped[OrderStatus] = mapped_column(Enum(OrderStatus), default=OrderStatus.placed)

    subtotal_paise: Mapped[int] = mapped_column(Integer)
    delivery_fee_paise: Mapped[int] = mapped_column(Integer, default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(24), nullable=True)
    discount_paise: Mapped[int] = mapped_column(Integer, default=0)
    total_paise: Mapped[int] = mapped_column(Integer)

    razorpay_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    # Set when the pincode isn't in our own delivery zones — we ship these by courier
    # (DTDC/RTC) instead of our own team. The shipping charge is only known after the team
    # gets a courier quote, so it's added later from the admin panel via a Razorpay Payment
    # Link rather than being collected at checkout.
    out_of_zone: Mapped[bool] = mapped_column(Boolean, default=False)
    shipping_courier: Mapped[str | None] = mapped_column(String(40), nullable=True)
    razorpay_payment_link_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    razorpay_payment_link_url: Mapped[str | None] = mapped_column(String(300), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", lazy="selectin"
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"))
    product_id: Mapped[int | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    # Snapshot of name and price at order time, so later price edits don't rewrite history.
    product_name: Mapped[str] = mapped_column(String(120))
    unit_price_paise: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    line_total_paise: Mapped[int] = mapped_column(Integer)

    order: Mapped[Order] = relationship(back_populates="items")
