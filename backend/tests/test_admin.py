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
