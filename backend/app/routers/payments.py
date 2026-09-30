import json
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.limiter import limiter
from app.models import Order, PaymentStatus
from app.schemas import OrderOut, PaymentVerify
from app.services.notify import notify_team
from app.services.payments import verify_payment_signature, verify_webhook_signature

router = APIRouter(prefix="/api/payments", tags=["payments"])
log = logging.getLogger("pbl.payments")


def mark_paid(db: Session, order: Order, payment_id: str) -> bool:
    """Idempotent. Returns True only the first time an order becomes paid."""
    if order.payment_status == PaymentStatus.paid:
        return False
    order.payment_status = PaymentStatus.paid
    order.razorpay_payment_id = payment_id
    db.commit()
    return True


@router.post("/verify", response_model=OrderOut)
@limiter.limit("10/minute")
def verify_checkout(
    request: Request,
    data: PaymentVerify,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Called by the browser right after Razorpay Checkout succeeds."""
    order = db.scalar(select(Order).where(Order.public_id == data.public_id))
    if order is None or order.razorpay_order_id != data.razorpay_order_id:
        raise HTTPException(404, "Order not found.")
    if not verify_payment_signature(
        data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature, settings.razorpay_key_secret
    ):
        raise HTTPException(400, "Payment could not be verified.")
    if mark_paid(db, order, data.razorpay_payment_id):
        background.add_task(notify_team, order, "New PAID order")
    return order


@router.post("/webhook")
async def razorpay_webhook(
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
):
    """Server-to-server confirmation from Razorpay — the source of truth if the customer closes the tab."""
    raw = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    if not verify_webhook_signature(raw, signature, settings.razorpay_webhook_secret):
        raise HTTPException(400, "Invalid signature")

    event = json.loads(raw)
    kind = event.get("event", "")
    payload = event.get("payload", {})
    payment = payload.get("payment", {}).get("entity", {})
    payment_id = payment.get("id")

    # Normal Checkout payments are matched by the Razorpay order id we created up front.
    # Payment Link payments (out-of-zone courier orders) never have one of those — the link
    # itself is what we stored — so they're matched by its id instead.
    order = None
    if kind == "payment_link.paid":
        plink_id = payload.get("payment_link", {}).get("entity", {}).get("id")
        if plink_id:
            order = db.scalar(select(Order).where(Order.razorpay_payment_link_id == plink_id))
    else:
        rp_order_id = payment.get("order_id")
        if rp_order_id:
            order = db.scalar(select(Order).where(Order.razorpay_order_id == rp_order_id))

    if order is None:
        log.warning("Webhook %s: no matching order (payment %s)", kind, payment_id)
        return {"ok": True, "ignored": kind}

    if kind in ("payment.captured", "order.paid", "payment_link.paid"):
        if mark_paid(db, order, payment_id):
            background.add_task(notify_team, order, "New PAID order")
    elif kind == "payment.failed" and order.payment_status == PaymentStatus.pending:
        order.payment_status = PaymentStatus.failed
        db.commit()
    return {"ok": True}
