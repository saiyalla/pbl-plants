import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import Base, SessionLocal, engine
from app.limiter import limiter
from app.migrate import ensure_order_columns
from app.routers import admin, orders, payments, products
from app.seed import seed_if_empty

UPLOAD_ROOT = Path(__file__).resolve().parent.parent / "uploads"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # MVP: create tables on boot. Switch to Alembic migrations before the schema starts changing in prod.
    Base.metadata.create_all(engine)
    ensure_order_columns(engine)
    with SessionLocal() as db:
        seed_if_empty(db)
    yield


settings = get_settings()
app = FastAPI(title="PBL Plants API", version="0.1.0", lifespan=lifespan)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)

UPLOAD_ROOT.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")

app.include_router(products.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(admin.router)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "online_payments": settings.online_payments_enabled,
        "admin": bool(settings.admin_token),
    }
