import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.limiter import limiter
from app.models import CheckoutDraft, Order, PaymentMethod, PaymentStatus
from app.schemas import CheckoutDraftIn, OrderCreate, OrderCreated, OrderOut, RazorpayCheckout
from app.services.notify import notify_team
from app.services.orders import OrderError, build_order
from app.services.payments import PaymentGatewayError, create_razorpay_order

router = APIRouter(prefix="/api/orders", tags=["orders"])


@router.post("/draft", status_code=204)
@limiter.limit("20/minute")
def save_checkout_draft(request: Request, data: CheckoutDraftIn, db: Session = Depends(get_db)):
    """Upserted as the customer fills in the checkout form, so an abandoned checkout can be
    recovered later. Deleted automatically once that phone number places an order."""
    draft = db.scalar(select(CheckoutDraft).where(CheckoutDraft.phone == data.phone))
    if draft is None:
        draft = CheckoutDraft(phone=data.phone)
        db.add(draft)
    draft.customer_name = data.customer_name
    draft.pincode = data.pincode
    draft.cart_snapshot = [line.model_dump() for line in data.cart_snapshot]
    draft.subtotal_paise = data.subtotal_paise
    db.commit()


@router.post("", response_model=OrderCreated, status_code=201)
@limiter.limit("5/minute")
def place_order(
    request: Request,
    data: OrderCreate,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    try:
        order = build_order(db, data, settings)
    except OrderError as e:
        raise HTTPException(e.status_code, e.message) from None

    db.add(order)
    db.flush()  # assigns public_id

    checkout = None
    if order.payment_method == PaymentMethod.online and not order.out_of_zone:
        try:
            rp_id = create_razorpay_order(
                amount_paise=order.total_paise,
                receipt=order.public_id,
                key_id=settings.razorpay_key_id,
                key_secret=settings.razorpay_key_secret,
            )
        except PaymentGatewayError:
            db.rollback()
            raise HTTPException(502, "Payment gateway is unavailable — please try again or choose Cash on Delivery.")
        order.razorpay_order_id = rp_id
        checkout = RazorpayCheckout(
            key_id=settings.razorpay_key_id, razorpay_order_id=rp_id, amount_paise=order.total_paise
        )

    # The checkout was completed (submitted), even if online payment fails afterward — stop
    # treating it as abandoned.
    draft = db.scalar(select(CheckoutDraft).where(CheckoutDraft.phone == order.phone))
    if draft is not None:
        db.delete(draft)

    db.commit()
    db.refresh(order)

    # COD and out-of-zone orders go to the team straight away (the latter needs a courier
    # booked); other online orders only get notified once payment is verified.
    if order.payment_method == PaymentMethod.cod:
        background.add_task(notify_team, order, "New COD order")
    elif order.out_of_zone:
        background.add_task(notify_team, order, "New order — needs a courier quote")

    return OrderCreated(order=OrderOut.model_validate(order), razorpay=checkout)


@router.get("/{public_id}", response_model=OrderOut)
@limiter.limit("10/minute")
def track_order(
    request: Request,
    public_id: str,
    phone: str = Query(min_length=10),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Customers look up their order with the order code + the phone number they used."""
    order = db.scalar(select(Order).where(Order.public_id == public_id.upper()))
    digits = re.sub(r"\D", "", phone)[-10:]
    if order is None or order.phone != digits:
        raise HTTPException(404, "No order found with that code and phone number.")

    out = OrderOut.model_validate(order)
    if order.razorpay_order_id and order.payment_status != PaymentStatus.paid:
        out.razorpay = RazorpayCheckout(
            key_id=settings.razorpay_key_id, razorpay_order_id=order.razorpay_order_id, amount_paise=order.total_paise
        )
    return out
