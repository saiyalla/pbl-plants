import app.services.orders as orders_service
from tests.conftest import order_payload, product_id


def test_catalog_is_seeded(client):
    products = client.get("/api/products").json()
    assert len(products) == 10
    bamboo = next(p for p in products if p["slug"] == "lucky-bamboo")
    assert bamboo["price_paise"] == 20000 and bamboo["price_is_from"] is False


def test_cod_order_uses_server_prices(client):
    res = client.post("/api/orders", json=order_payload(client))
    assert res.status_code == 201, res.text
    order = res.json()["order"]
    assert order["public_id"].startswith("PBL-")
    assert order["total_paise"] == 40000  # 2 × ₹200
    assert order["payment_status"] == "cod_due"
    assert order["status"] == "placed"
    assert res.json()["razorpay"] is None


def test_client_cannot_send_its_own_price(client):
    payload = order_payload(client)
    payload["items"][0]["unit_price_paise"] = 1  # ignored — not part of the schema
    payload["total_paise"] = 1
    order = client.post("/api/orders", json=payload).json()["order"]
    assert order["total_paise"] == 40000


def test_duplicate_lines_are_merged(client):
    pid = product_id(client, "lucky-bamboo")
    payload = order_payload(client, items=[{"product_id": pid, "quantity": 1}, {"product_id": pid, "quantity": 2}])
    order = client.post("/api/orders", json=payload).json()["order"]
    assert len(order["items"]) == 1 and order["items"][0]["quantity"] == 3


def test_cod_rejected_outside_delivery_area(client):
    res = client.post("/api/orders", json=order_payload(client, pincode="500081"))
    assert res.status_code == 422
    assert "delivery charge" in res.json()["detail"]


def test_out_of_zone_online_order_awaits_shipping_quote(client):
    res = client.post("/api/orders", json=order_payload(client, pincode="500081", payment_method="online"))
    assert res.status_code == 201, res.text
    body = res.json()
    order = body["order"]
    assert order["out_of_zone"] is True
    assert order["delivery_fee_paise"] == 0
    assert order["total_paise"] == 40000  # cart only — shipping added later
    assert order["payment_status"] == "pending"
    assert body["razorpay"] is None  # amount isn't known yet, so no checkout is started


def test_pending_zone_detected_via_pincode_lookup(client, monkeypatch):
    # A pincode we've never configured, but the lookup says it's in Visakhapatnam.
    monkeypatch.setattr(orders_service, "lookup_district", lambda pincode, client=None: "Visakhapatnam")
    res = client.post("/api/orders", json=order_payload(client, pincode="530099", payment_method="online"))
    assert res.status_code == 201, res.text
    order = res.json()["order"]
    assert order["pending_zone"] is True
    assert order["out_of_zone"] is False
    assert order["delivery_fee_paise"] == 0
    assert order["total_paise"] == 40000  # cart only — delivery fee added once confirmed
    assert order["payment_status"] == "pending"
    assert res.json()["razorpay"] is None  # amount isn't known yet


def test_pending_zone_cod_rejected(client, monkeypatch):
    monkeypatch.setattr(orders_service, "lookup_district", lambda pincode, client=None: "Visakhapatnam")
    res = client.post("/api/orders", json=order_payload(client, pincode="530099"))
    assert res.status_code == 422


def test_delivery_check_flags_pending_zone(client, monkeypatch):
    monkeypatch.setattr(orders_service, "lookup_district", lambda pincode, client=None: "Visakhapatnam District")
    body = client.get("/api/delivery/check?pincode=530099").json()
    assert body["deliverable"] is False
    assert body["pending_zone"] is True


def test_rejects_bad_phone(client):
    res = client.post("/api/orders", json=order_payload(client, phone="12345"))
    assert res.status_code == 422


def test_rejects_ask_for_price_items(client):
    items = [{"product_id": product_id(client, "zz-plant"), "quantity": 1}]
    res = client.post("/api/orders", json=order_payload(client, items=items))
    assert res.status_code == 422
    assert "price confirmed" in res.json()["detail"]


def test_rejects_out_of_stock(client, admin_headers):
    pid = product_id(client, "lucky-bamboo")
    client.patch(f"/api/admin/products/{pid}", json={"in_stock": False}, headers=admin_headers)
    res = client.post("/api/orders", json=order_payload(client))
    assert res.status_code == 422 and "out of stock" in res.json()["detail"]


def test_delivery_check(client):
    assert client.get("/api/delivery/check?pincode=530016").json()["deliverable"] is True
    assert client.get("/api/delivery/check?pincode=560001").json()["deliverable"] is False


def test_customer_tracking_needs_matching_phone(client):
    order = client.post("/api/orders", json=order_payload(client)).json()["order"]
    code = order["public_id"]
    assert client.get(f"/api/orders/{code}?phone=9876543210").status_code == 200
    assert client.get(f"/api/orders/{code}?phone=9999999999").status_code == 404


def test_order_placement_is_rate_limited(client):
    # The 6th order attempt within a minute from the same client should be throttled.
    for _ in range(5):
        assert client.post("/api/orders", json=order_payload(client)).status_code == 201
    res = client.post("/api/orders", json=order_payload(client))
    assert res.status_code == 429


def test_order_tracking_is_rate_limited(client):
    order = client.post("/api/orders", json=order_payload(client)).json()["order"]
    code = order["public_id"]
    for _ in range(10):
        assert client.get(f"/api/orders/{code}?phone=9876543210").status_code == 200
    res = client.get(f"/api/orders/{code}?phone=9876543210")
    assert res.status_code == 429
