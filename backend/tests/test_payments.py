import hashlib
import hmac
import json

import pytest

from app.routers import admin as admin_router
from app.routers import orders as orders_router
from tests.conftest import KEY_SECRET, WEBHOOK_SECRET, order_payload


def sign(secret: str, message: bytes) -> str:
    return hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()


@pytest.fixture
def online_order(client, monkeypatch):
    monkeypatch.setattr(orders_router, "create_razorpay_order", lambda **kw: "order_TEST123")
    res = client.post("/api/orders", json=order_payload(client, payment_method="online"))
    assert res.status_code == 201, res.text
    return res.json()


def test_online_order_returns_checkout_details(online_order):
    assert online_order["order"]["payment_status"] == "pending"
    assert online_order["razorpay"] == {
        "key_id": "rzp_test_123",
        "razorpay_order_id": "order_TEST123",
        "amount_paise": 40000,
        "currency": "INR",
    }


def test_verify_with_valid_signature_marks_paid(client, online_order):
    body = {
        "public_id": online_order["order"]["public_id"],
        "razorpay_order_id": "order_TEST123",
        "razorpay_payment_id": "pay_ABC",
        "razorpay_signature": sign(KEY_SECRET, b"order_TEST123|pay_ABC"),
    }
    res = client.post("/api/payments/verify", json=body)
    assert res.status_code == 200 and res.json()["payment_status"] == "paid"


def test_verify_with_forged_signature_is_rejected(client, online_order):
    body = {
        "public_id": online_order["order"]["public_id"],
        "razorpay_order_id": "order_TEST123",
        "razorpay_payment_id": "pay_ABC",
        "razorpay_signature": "0" * 64,
    }
    assert client.post("/api/payments/verify", json=body).status_code == 400


def _webhook(client, event: str, secret: str = WEBHOOK_SECRET):
    raw = json.dumps(
        {"event": event, "payload": {"payment": {"entity": {"id": "pay_WH", "order_id": "order_TEST123"}}}}
    ).encode()
    return client.post(
        "/api/payments/webhook",
        content=raw,
        headers={"X-Razorpay-Signature": sign(secret, raw), "Content-Type": "application/json"},
    )


def test_webhook_marks_paid_and_is_idempotent(client, online_order, admin_headers):
    assert _webhook(client, "payment.captured").status_code == 200
    assert _webhook(client, "payment.captured").status_code == 200
    orders = client.get("/api/admin/orders", headers=admin_headers).json()
    assert orders[0]["payment_status"] == "paid"
    assert orders[0]["razorpay_payment_id"] == "pay_WH"


def test_webhook_with_bad_signature_is_rejected(client, online_order):
    assert _webhook(client, "payment.captured", secret="wrong").status_code == 400


def test_failed_payment_does_not_override_paid(client, online_order, admin_headers):
    _webhook(client, "payment.captured")
    _webhook(client, "payment.failed")
    assert client.get("/api/admin/orders", headers=admin_headers).json()[0]["payment_status"] == "paid"


def test_online_disabled_without_keys(client, settings):
    settings.razorpay_key_id = ""
    res = client.post("/api/orders", json=order_payload(client, payment_method="online"))
    assert res.status_code == 503


def test_payment_link_webhook_marks_out_of_zone_order_paid(client, admin_headers, monkeypatch):
    monkeypatch.setattr(
        admin_router, "create_payment_link", lambda **kw: {"id": "plink_TEST", "short_url": "https://rzp.io/i/test"}
    )
    client.post("/api/orders", json=order_payload(client, pincode="500081", payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    client.post(
        f"/api/admin/orders/{oid}/shipping-quote",
        json={"shipping_fee_paise": 15000},
        headers=admin_headers,
    )

    raw = json.dumps(
        {
            "event": "payment_link.paid",
            "payload": {
                "payment_link": {"entity": {"id": "plink_TEST"}},
                "payment": {"entity": {"id": "pay_LINK1"}},
            },
        }
    ).encode()
    res = client.post(
        "/api/payments/webhook",
        content=raw,
        headers={"X-Razorpay-Signature": sign(WEBHOOK_SECRET, raw), "Content-Type": "application/json"},
    )
    assert res.status_code == 200

    order = client.get("/api/admin/orders", headers=admin_headers).json()[0]
    assert order["payment_status"] == "paid"
    assert order["razorpay_payment_id"] == "pay_LINK1"
