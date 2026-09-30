import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import Base, get_db
from app.limiter import limiter
from app.main import app
from app.seed import seed_if_empty

ADMIN_TOKEN = "test-admin-token"
KEY_SECRET = "test_key_secret"
WEBHOOK_SECRET = "test_webhook_secret"


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """The rate limiter's counters are process-global — reset them so one test's requests
    don't exhaust another test's limit."""
    limiter.reset()
    yield


@pytest.fixture
def settings() -> Settings:
    return Settings(
        database_url="sqlite://",
        admin_token=ADMIN_TOKEN,
        razorpay_key_id="rzp_test_123",
        razorpay_key_secret=KEY_SECRET,
        razorpay_webhook_secret=WEBHOOK_SECRET,
    )


@pytest.fixture
def db_session():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    with Session() as s:
        seed_if_empty(s)
    yield Session
    engine.dispose()


@pytest.fixture
def client(db_session, settings):
    def _db():
        s = db_session()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_settings] = lambda: settings
    yield TestClient(app)  # no `with`: skips the real-DB lifespan
    app.dependency_overrides.clear()


@pytest.fixture
def admin_headers():
    return {"Authorization": f"Bearer {ADMIN_TOKEN}"}


def product_id(client, slug: str) -> int:
    return next(p["id"] for p in client.get("/api/products").json() if p["slug"] == slug)


def order_payload(client, **overrides):
    payload = {
        "customer_name": "Ravi Kumar",
        "phone": "+91 98765 43210",
        "address": "12-3-45, Seethammapeta Main Road, Visakhapatnam",
        "pincode": "530016",
        "payment_method": "cod",
        "items": [{"product_id": product_id(client, "lucky-bamboo"), "quantity": 2}],
    }
    payload.update(overrides)
    return payload
