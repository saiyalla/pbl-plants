"""Razorpay integration: create orders and verify signatures.

We talk to Razorpay's REST API with httpx (no SDK needed) and verify signatures
ourselves with HMAC-SHA256, exactly as Razorpay documents:

  * checkout callback:  HMAC(key_secret,  f"{razorpay_order_id}|{razorpay_payment_id}")
  * webhooks:           HMAC(webhook_secret, raw_request_body), sent in X-Razorpay-Signature

Never mark an order paid based on what the browser says — only on a verified signature.
"""

import hashlib
import hmac

import httpx

RAZORPAY_API = "https://api.razorpay.com/v1"


class PaymentGatewayError(Exception):
    pass


def _hmac_hex(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


def verify_payment_signature(order_id: str, payment_id: str, signature: str, key_secret: str) -> bool:
    if not (order_id and payment_id and signature and key_secret):
        return False
    expected = _hmac_hex(key_secret, f"{order_id}|{payment_id}".encode())
    return hmac.compare_digest(expected, signature)


def verify_webhook_signature(raw_body: bytes, signature: str, webhook_secret: str) -> bool:
    if not (signature and webhook_secret):
        return False
    expected = _hmac_hex(webhook_secret, raw_body)
    return hmac.compare_digest(expected, signature)


def create_razorpay_order(
    *, amount_paise: int, receipt: str, key_id: str, key_secret: str, client: httpx.Client | None = None
) -> str:
    """Create an order on Razorpay and return its id (order_XXXX)."""
    # Turn on automatic payment capture in the Razorpay dashboard so payments don't sit "authorized".
    payload = {"amount": amount_paise, "currency": "INR", "receipt": receipt}
    own_client = client is None
    client = client or httpx.Client(timeout=15)
    try:
        resp = client.post(f"{RAZORPAY_API}/orders", json=payload, auth=(key_id, key_secret))
    except httpx.HTTPError as exc:
        raise PaymentGatewayError(f"Could not reach Razorpay: {exc}") from exc
    finally:
        if own_client:
            client.close()
    if resp.status_code >= 400:
        raise PaymentGatewayError(f"Razorpay rejected the order ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["id"]


def create_payment_link(
    *,
    amount_paise: int,
    description: str,
    customer_name: str,
    customer_phone: str,
    reference_id: str,
    key_id: str,
    key_secret: str,
    client: httpx.Client | None = None,
) -> dict:
    """Create a Razorpay Payment Link and return its id + shareable URL.

    Used for out-of-zone orders, where the amount (cart + courier charge) is only known after
    checkout — a hosted link lets the customer pay it later instead of at the normal Checkout.
    """
    payload = {
        "amount": amount_paise,
        "currency": "INR",
        "description": description,
        "customer": {"name": customer_name, "contact": f"+91{customer_phone}"},
        "notify": {"sms": False, "email": False},  # sent manually via WhatsApp, not Razorpay's own notifications
        "reminder_enable": False,
        "reference_id": reference_id,
    }
    own_client = client is None
    client = client or httpx.Client(timeout=15)
    try:
        resp = client.post(f"{RAZORPAY_API}/payment_links", json=payload, auth=(key_id, key_secret))
    except httpx.HTTPError as exc:
        raise PaymentGatewayError(f"Could not reach Razorpay: {exc}") from exc
    finally:
        if own_client:
            client.close()
    if resp.status_code >= 400:
        raise PaymentGatewayError(f"Razorpay rejected the payment link ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    return {"id": data["id"], "short_url": data["short_url"]}


def get_payment_link_status(
    *, link_id: str, key_id: str, key_secret: str, client: httpx.Client | None = None
) -> dict:
    """Pull a Payment Link's status straight from Razorpay.

    The webhook is the normal way we find out a link was paid, but it's a server-to-server
    call — it can't reach a `localhost` dev server, and could in principle be missed even in
    production. This is the manual fallback: ask Razorpay directly instead of waiting for it.
    """
    own_client = client is None
    client = client or httpx.Client(timeout=15)
    try:
        resp = client.get(f"{RAZORPAY_API}/payment_links/{link_id}", auth=(key_id, key_secret))
    except httpx.HTTPError as exc:
        raise PaymentGatewayError(f"Could not reach Razorpay: {exc}") from exc
    finally:
        if own_client:
            client.close()
    if resp.status_code >= 400:
        raise PaymentGatewayError(f"Razorpay rejected the lookup ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    payments = data.get("payments") or []
    payment_id = payments[-1]["payment_id"] if payments else None
    return {"status": data.get("status"), "payment_id": payment_id}
