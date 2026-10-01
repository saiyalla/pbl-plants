import app.services.orders as orders_service
from app.routers import admin as admin_router
from app.routers import orders as orders_router
from tests.conftest import order_payload, product_id


def test_admin_requires_token(client):
    assert client.get("/api/admin/orders").status_code == 401
    assert client.get("/api/admin/orders", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_admin_token_guessing_is_rate_limited(client):
    # 30 wrong guesses/minute is the cap — the 31st should be throttled, not just rejected.
    for _ in range(30):
        assert client.get("/api/admin/orders", headers={"Authorization": "Bearer nope"}).status_code == 401
    res = client.get("/api/admin/orders", headers={"Authorization": "Bearer nope"})
    assert res.status_code == 429


def test_full_cod_lifecycle(client, admin_headers):
    order = client.post("/api/orders", json=order_payload(client)).json()["order"]
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]

    for status in ["confirmed", "packed", "out_for_delivery", "delivered"]:
        res = client.patch(f"/api/admin/orders/{oid}/status", json={"status": status}, headers=admin_headers)
        assert res.status_code == 200, res.text

    final = res.json()
    assert final["status"] == "delivered"
    assert final["payment_status"] == "cod_collected"
    assert final["public_id"] == order["public_id"]


def test_cannot_skip_backwards(client, admin_headers):
    client.post("/api/orders", json=order_payload(client))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    res = client.patch(f"/api/admin/orders/{oid}/status", json={"status": "delivered"}, headers=admin_headers)
    assert res.status_code == 409


def test_unpaid_online_order_can_only_be_cancelled(client, admin_headers, monkeypatch):
    monkeypatch.setattr(orders_router, "create_razorpay_order", lambda **kw: "order_X")
    client.post("/api/orders", json=order_payload(client, payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    confirm = client.patch(f"/api/admin/orders/{oid}/status", json={"status": "confirmed"}, headers=admin_headers)
    assert confirm.status_code == 409
    cancel = client.patch(f"/api/admin/orders/{oid}/status", json={"status": "cancelled"}, headers=admin_headers)
    assert cancel.status_code == 200


def test_team_sets_price_then_item_becomes_orderable(client, admin_headers):
    pid = product_id(client, "zz-plant")
    res = client.patch(f"/api/admin/products/{pid}", json={"price_paise": 34900}, headers=admin_headers)
    assert res.json()["price_paise"] == 34900
    order = client.post(
        "/api/orders", json=order_payload(client, items=[{"product_id": pid, "quantity": 1}])
    ).json()["order"]
    assert order["total_paise"] == 34900


def test_price_edit_does_not_change_past_orders(client, admin_headers):
    client.post("/api/orders", json=order_payload(client))
    pid = product_id(client, "lucky-bamboo")
    client.patch(f"/api/admin/products/{pid}", json={"price_paise": 25000}, headers=admin_headers)
    past = client.get("/api/admin/orders", headers=admin_headers).json()[0]
    assert past["items"][0]["unit_price_paise"] == 20000


def test_shipping_quote_creates_razorpay_order_for_out_of_zone_order(client, admin_headers, monkeypatch):
    monkeypatch.setattr(admin_router, "create_razorpay_order", lambda **kw: "order_TEST")
    client.post("/api/orders", json=order_payload(client, pincode="500081", payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]

    res = client.post(
        f"/api/admin/orders/{oid}/shipping-quote",
        json={"shipping_fee_paise": 15000, "courier": "Speedex"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["order"]["delivery_fee_paise"] == 15000
    assert body["order"]["total_paise"] == 55000  # ₹400 cart + ₹150 shipping
    assert body["order"]["shipping_courier"] == "Speedex"
    assert body["order"]["razorpay_order_id"] == "order_TEST"
    assert body["order"]["payment_status"] == "pending"
    assert body["order"]["public_id"] in body["whatsapp_url"]


def test_refresh_payment_pulls_paid_status_from_razorpay(client, admin_headers, monkeypatch):
    monkeypatch.setattr(admin_router, "create_razorpay_order", lambda **kw: "order_TEST")
    client.post("/api/orders", json=order_payload(client, pincode="500081", payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    client.post(f"/api/admin/orders/{oid}/shipping-quote", json={"shipping_fee_paise": 15000}, headers=admin_headers)

    monkeypatch.setattr(
        admin_router, "get_order_payments", lambda **kw: [{"id": "pay_PULLED", "status": "captured"}]
    )
    res = client.post(f"/api/admin/orders/{oid}/refresh-payment", headers=admin_headers)
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["payment_status"] == "paid"
    assert body["razorpay_payment_id"] == "pay_PULLED"


def test_refresh_payment_leaves_order_unpaid_when_still_unpaid(client, admin_headers, monkeypatch):
    monkeypatch.setattr(admin_router, "create_razorpay_order", lambda **kw: "order_TEST")
    client.post("/api/orders", json=order_payload(client, pincode="500081", payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    client.post(f"/api/admin/orders/{oid}/shipping-quote", json={"shipping_fee_paise": 15000}, headers=admin_headers)

    monkeypatch.setattr(admin_router, "get_order_payments", lambda **kw: [{"id": "pay_X", "status": "created"}])
    res = client.post(f"/api/admin/orders/{oid}/refresh-payment", headers=admin_headers)
    assert res.status_code == 200
    assert res.json()["payment_status"] == "pending"


def test_shipping_quote_rejected_for_in_zone_order(client, admin_headers):
    client.post("/api/orders", json=order_payload(client))  # normal Vizag COD order
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    res = client.post(
        f"/api/admin/orders/{oid}/shipping-quote",
        json={"shipping_fee_paise": 15000},
        headers=admin_headers,
    )
    assert res.status_code == 409


def test_confirm_zone_registers_delivery_zone_and_creates_payment(client, admin_headers, monkeypatch):
    monkeypatch.setattr(orders_service, "lookup_district", lambda pincode, client=None: "Visakhapatnam")
    monkeypatch.setattr(admin_router, "create_razorpay_order", lambda **kw: "order_ZONE")
    monkeypatch.setattr(orders_router, "create_razorpay_order", lambda **kw: "order_SECOND")
    client.post("/api/orders", json=order_payload(client, pincode="530099", payment_method="online"))
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]

    res = client.post(
        f"/api/admin/orders/{oid}/confirm-zone",
        json={"distance_km": 9, "label": "New layout"},
        headers=admin_headers,
    )
    assert res.status_code == 200, res.text
    body = res.json()["order"]
    assert body["pending_zone"] is False
    assert body["razorpay_order_id"] == "order_ZONE"
    assert body["payment_status"] == "pending"
    # free_km defaults to 5, rate 2000 paise/km -> (9-5)*2000 = 8000
    assert body["delivery_fee_paise"] == 8000
    assert body["total_paise"] == 48000  # ₹400 cart + ₹80 delivery

    zones = client.get("/api/admin/delivery-zones", headers=admin_headers).json()
    assert any(z["pincode"] == "530099" and z["distance_km"] == 9 for z in zones)

    # The pincode is now a normal zone — a second order there is priced immediately, no quote
    # needed. It's beyond free_km (9 > 5), so COD isn't offered — same as any such zone.
    second_res = client.post("/api/orders", json=order_payload(client, pincode="530099", payment_method="online"))
    assert second_res.status_code == 201, second_res.text
    second = second_res.json()["order"]
    assert second["pending_zone"] is False
    assert second["delivery_fee_paise"] == 8000


def test_confirm_zone_rejected_when_not_pending(client, admin_headers):
    client.post("/api/orders", json=order_payload(client))  # normal Vizag COD order, not pending
    oid = client.get("/api/admin/orders", headers=admin_headers).json()[0]["id"]
    res = client.post(f"/api/admin/orders/{oid}/confirm-zone", json={"distance_km": 5}, headers=admin_headers)
    assert res.status_code == 409
