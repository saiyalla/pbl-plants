import re
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import DiscountType, OrderStatus, PaymentMethod, PaymentStatus


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    tagline: str
    category: str
    badge: str | None
    care: list[str]
    icon: str
    image_url: str | None
    price_paise: int | None
    price_is_from: bool
    in_stock: bool


class ProductCreate(BaseModel):
    """A new product added from the admin panel."""

    name: str = Field(min_length=2, max_length=120)
    category: str = Field(min_length=2, max_length=40)
    tagline: str = Field(default="", max_length=200)
    badge: str | None = None
    care: list[str] = Field(default_factory=list)
    icon: str = Field(default="leaf", max_length=40)
    price_paise: int | None = Field(default=None, ge=0)
    price_is_from: bool = False
    in_stock: bool = True

    @field_validator("name", "tagline")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class ProductUpdate(BaseModel):
    """What the team can change from the admin panel."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    category: str | None = Field(default=None, min_length=2, max_length=40)
    tagline: str | None = Field(default=None, max_length=200)
    care: list[str] | None = None
    icon: str | None = Field(default=None, max_length=40)
    price_paise: int | None = Field(default=None, ge=0)
    clear_price: bool = False
    price_is_from: bool | None = None
    in_stock: bool | None = None
    badge: str | None = None
    clear_badge: bool = False
    image_url: str | None = None
    clear_image: bool = False


class CartLine(BaseModel):
    product_id: int
    quantity: int = Field(ge=1, le=20)


class OrderCreate(BaseModel):
    customer_name: str = Field(min_length=2, max_length=120)
    phone: str
    address: str = Field(min_length=10, max_length=500)
    pincode: str
    notes: str = Field(default="", max_length=500)
    payment_method: PaymentMethod
    coupon_code: str | None = Field(default=None, max_length=24)
    items: list[CartLine] = Field(min_length=1, max_length=30)

    @field_validator("customer_name", "address", "notes")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("phone")
    @classmethod
    def indian_mobile(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if not re.fullmatch(r"[6-9]\d{9}", digits):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits

    @field_validator("pincode")
    @classmethod
    def six_digits(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("Pincode must be 6 digits")
        return v


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    product_id: int | None
    product_name: str
    unit_price_paise: int
    quantity: int
    line_total_paise: int


class RazorpayCheckout(BaseModel):
    key_id: str
    razorpay_order_id: str
    amount_paise: int
    currency: str = "INR"


class OrderOut(BaseModel):
    """What the customer sees."""

    model_config = ConfigDict(from_attributes=True)

    public_id: str
    customer_name: str
    payment_method: PaymentMethod
    payment_status: PaymentStatus
    status: OrderStatus
    subtotal_paise: int
    delivery_fee_paise: int
    coupon_code: str | None
    discount_paise: int
    total_paise: int
    out_of_zone: bool
    shipping_courier: str | None
    items: list[OrderItemOut]
    created_at: datetime
    # Only set when there's something to pay right now — a fresh online order, or an
    # out-of-zone order once the team has set the shipping charge. Lets the order's own page
    # open the same Razorpay Checkout widget used at checkout, rather than a hosted link.
    razorpay: RazorpayCheckout | None = None


class AdminOrderOut(OrderOut):
    """What the team sees — includes contact and delivery details."""

    id: int
    phone: str
    address: str
    pincode: str
    notes: str
    razorpay_order_id: str | None
    razorpay_payment_id: str | None
    updated_at: datetime


class OfferOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    min_spend_paise: int
    reward_text: str
    active: bool


class OfferCreate(BaseModel):
    min_spend_paise: int = Field(ge=0)
    reward_text: str = Field(min_length=2, max_length=200)
    active: bool = True

    @field_validator("reward_text")
    @classmethod
    def strip(cls, v: str) -> str:
        return v.strip()


class OfferUpdate(BaseModel):
    min_spend_paise: int | None = Field(default=None, ge=0)
    reward_text: str | None = Field(default=None, min_length=2, max_length=200)
    active: bool | None = None


class RazorpayCheckout(BaseModel):
    key_id: str
    razorpay_order_id: str
    amount_paise: int
    currency: str = "INR"


class OrderCreated(BaseModel):
    order: OrderOut
    razorpay: RazorpayCheckout | None = None


class PaymentVerify(BaseModel):
    public_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class StatusUpdate(BaseModel):
    status: OrderStatus


class ShippingQuoteIn(BaseModel):
    """Submitted from the admin panel once the team has a courier quote for an out-of-zone order."""

    shipping_fee_paise: int = Field(ge=0)
    courier: str | None = Field(default=None, max_length=40)

    @field_validator("courier")
    @classmethod
    def strip(cls, v: str | None) -> str | None:
        v = v.strip() if v else None
        return v or None


class ShippingQuoteResult(BaseModel):
    order: AdminOrderOut
    whatsapp_url: str
    message: str


class CodCollected(BaseModel):
    collected: bool = True


class DeliveryCheck(BaseModel):
    pincode: str
    deliverable: bool
    delivery_fee_paise: int
    base_fee_paise: int = 0
    free_delivery_min_paise: int = 0
    distance_km: float | None = None
    cod_allowed: bool = False


class CouponOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    discount_type: DiscountType
    discount_value: int
    min_order_paise: int
    max_discount_paise: int | None
    usage_limit: int | None
    used_count: int
    active: bool
    expires_at: datetime | None


class CouponCreate(BaseModel):
    code: str | None = Field(default=None, max_length=24)
    discount_type: DiscountType
    discount_value: int = Field(gt=0)
    min_order_paise: int = Field(default=0, ge=0)
    max_discount_paise: int | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    active: bool = True
    expires_at: datetime | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, v: str | None) -> str | None:
        return v.strip().upper() if v else None

    @field_validator("discount_value")
    @classmethod
    def percent_range(cls, v: int, info) -> int:
        if info.data.get("discount_type") == DiscountType.percent and v > 100:
            raise ValueError("A percent discount can't exceed 100.")
        return v


class CouponUpdate(BaseModel):
    discount_type: DiscountType | None = None
    discount_value: int | None = Field(default=None, gt=0)
    min_order_paise: int | None = Field(default=None, ge=0)
    max_discount_paise: int | None = Field(default=None, ge=0)
    usage_limit: int | None = Field(default=None, ge=1)
    active: bool | None = None
    expires_at: datetime | None = None


class CouponApplyResult(BaseModel):
    valid: bool
    message: str
    discount_paise: int = 0


class CartSnapshotLine(BaseModel):
    name: str
    quantity: int
    price_paise: int


class CheckoutDraftIn(BaseModel):
    customer_name: str = Field(default="", max_length=120)
    phone: str
    pincode: str = Field(default="", max_length=6)
    cart_snapshot: list[CartSnapshotLine] = Field(default_factory=list)
    subtotal_paise: int = Field(default=0, ge=0)

    @field_validator("phone")
    @classmethod
    def indian_mobile(cls, v: str) -> str:
        digits = re.sub(r"\D", "", v)
        if len(digits) == 12 and digits.startswith("91"):
            digits = digits[2:]
        elif len(digits) == 11 and digits.startswith("0"):
            digits = digits[1:]
        if not re.fullmatch(r"[6-9]\d{9}", digits):
            raise ValueError("Enter a valid 10-digit Indian mobile number")
        return digits


class CheckoutDraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phone: str
    customer_name: str
    pincode: str
    cart_snapshot: list[CartSnapshotLine]
    subtotal_paise: int
    recovery_coupon_code: str | None
    recovery_sent_at: datetime | None
    created_at: datetime
    updated_at: datetime


class CheckoutRecoveryResult(BaseModel):
    coupon_code: str
    whatsapp_url: str
    message: str


class DeliveryZoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pincode: str
    distance_km: float
    label: str


class DeliveryZoneCreate(BaseModel):
    pincode: str
    distance_km: float = Field(ge=0)
    label: str = Field(default="", max_length=80)

    @field_validator("pincode")
    @classmethod
    def six_digits(cls, v: str) -> str:
        v = v.strip()
        if not re.fullmatch(r"\d{6}", v):
            raise ValueError("Pincode must be 6 digits")
        return v


class DeliveryZoneUpdate(BaseModel):
    distance_km: float | None = Field(default=None, ge=0)
    label: str | None = Field(default=None, max_length=80)


class DeliverySettingsOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    free_km: float
    rate_paise_per_km: int
    free_delivery_min_paise: int
    max_km: float


class DeliverySettingsUpdate(BaseModel):
    free_km: float | None = Field(default=None, ge=0)
    rate_paise_per_km: int | None = Field(default=None, ge=0)
    free_delivery_min_paise: int | None = Field(default=None, ge=0)
    max_km: float | None = Field(default=None, ge=0)
