from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.limiter import limiter
from app.models import Offer, Product
from app.schemas import CouponApplyResult, DeliveryCheck, OfferOut, ProductOut
from app.services.orders import compute_coupon_discount, compute_delivery

router = APIRouter(prefix="/api", tags=["catalog"])


@router.get("/products", response_model=list[ProductOut])
def list_products(db: Session = Depends(get_db)):
    return db.scalars(select(Product).order_by(Product.sort_order, Product.id)).all()


@router.get("/offers", response_model=list[OfferOut])
def list_offers(db: Session = Depends(get_db)):
    q = select(Offer).where(Offer.active.is_(True)).order_by(Offer.sort_order, Offer.min_spend_paise)
    return db.scalars(q).all()


@router.get("/delivery/check", response_model=DeliveryCheck)
def check_delivery(
    pincode: str = Query(pattern=r"^\d{6}$"),
    subtotal_paise: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    result = compute_delivery(db, pincode, subtotal_paise)
    return DeliveryCheck(
        pincode=pincode,
        deliverable=result.deliverable,
        delivery_fee_paise=result.fee_paise,
        base_fee_paise=result.base_fee_paise,
        free_delivery_min_paise=result.free_delivery_min_paise,
        distance_km=result.distance_km,
        cod_allowed=result.cod_allowed,
        pending_zone=result.pending_zone,
    )


@router.get("/coupons/apply", response_model=CouponApplyResult)
@limiter.limit("20/minute")
def apply_coupon(
    request: Request,
    code: str = Query(min_length=1, max_length=24),
    subtotal_paise: int = Query(ge=0),
    db: Session = Depends(get_db),
):
    """A read-only preview — the coupon is only actually redeemed (used_count incremented)
    when the order is placed with this code."""
    result = compute_coupon_discount(db, code, subtotal_paise)
    return CouponApplyResult(valid=result.valid, message=result.message, discount_paise=result.discount_paise)
