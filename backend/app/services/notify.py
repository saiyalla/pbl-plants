"""Tell the PBL team about new and paid orders.

Always logs. If TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set, it also posts to a
Telegram group — free, instant, and easy for a small delivery team to watch on their phones.
Failures here never break an order.
"""

import logging

import httpx

from app.config import get_settings
from app.models import Order

log = logging.getLogger("pbl.notify")


def rupees(paise: int) -> str:
    return f"₹{paise / 100:,.0f}" if paise % 100 == 0 else f"₹{paise / 100:,.2f}"


def order_summary(order: Order, headline: str) -> str:
    lines = [
        f"{headline}: {order.public_id}",
        f"{order.customer_name} · {order.phone}",
        f"{order.address}, {order.pincode}",
        "",
        *[f"• {i.quantity} × {i.product_name} — {rupees(i.line_total_paise)}" for i in order.items],
        "",
        f"Total {rupees(order.total_paise)} · {order.payment_method.value.upper()} · {order.payment_status.value}",
    ]
    if order.notes:
        lines.append(f"Note: {order.notes}")
    return "\n".join(lines)


def notify_team(order: Order, headline: str = "New order") -> None:
    text = order_summary(order, headline)
    log.info(text)
    s = get_settings()
    if not (s.telegram_bot_token and s.telegram_chat_id):
        return
    try:
        httpx.post(
            f"https://api.telegram.org/bot{s.telegram_bot_token}/sendMessage",
            json={"chat_id": s.telegram_chat_id, "text": text},
            timeout=10,
        )
    except httpx.HTTPError:
        log.exception("Telegram notification failed for %s", order.public_id)
