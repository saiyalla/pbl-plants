"""Starter catalog — mirrors the current PBL Plants site.

Prices are in paise. `None` means "ask for price": the item shows on the site but can't be
ordered online until the team sets a price in the admin panel.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DeliverySettings, DeliveryZone, Product

# The store's own pincode (Seethammapeta, Visakhapatnam) — the one delivery zone we know for
# certain. Add every other pincode the team delivers to, with its distance, from the admin panel.
STORE_PINCODE = "530016"

CATALOG = [
    dict(slug="lucky-bamboo", name="Lucky Bamboo", category="bamboo", icon="logo", badge="Bestseller",
         tagline="Goodluck plant, great gift — 2 or 3-layer (say which in your order note)",
         care=["Low maintenance", "Indirect light"], price_paise=20000),
    dict(slug="lucky-bamboo-8-layer", name="Lucky Bamboo — 8-Layer", category="bamboo", icon="logo",
         badge="Statement piece", tagline="Big, showpiece bamboo — full stock available",
         care=["Low maintenance", "Talking-point size"], price_paise=None),
    dict(slug="golden-money-plant", name="Golden Money Plant", category="foliage", icon="leaf",
         badge="Bestseller", tagline="The Vizag gifting favourite — golden pothos",
         care=["Low to medium light", "Water weekly"], price_paise=None),
    dict(slug="zz-plant", name="ZZ Plant", category="foliage", icon="leaf",
         tagline="Very low upkeep — forgives a missed watering",
         care=["Low light, ok", "Water every 2–3 weeks"], price_paise=None),
    dict(slug="jade-plant", name="Jade Plant", category="succulent", icon="succulent",
         tagline="Easy succulent, said to bring good luck",
         care=["Bright light", "Water every 2 weeks"], price_paise=None),
    dict(slug="six-plant-starter-combo", name="6-Plant Starter Combo", category="gift", icon="gift",
         badge="Bundle", tagline="Bamboo, Money Plant, ZZ, Jade & more — one gift box",
         care=["Great as a gift", "Mixed care levels"], price_paise=180000),
    dict(slug="ceramic-pots", name="Ceramic Pots", category="pots", icon="pot-ceramic",
         tagline="Glazed ceramic pots sized for any indoor plant we sell",
         care=["Multiple sizes", "Various glazes"], price_paise=None),
    dict(slug="plastic-nursery-pots", name="Plastic Nursery Pots", category="pots", icon="pot-plastic",
         tagline="Light, budget-friendly pots — handy for repotting",
         care=["Multiple sizes", "Great value"], price_paise=None),
    dict(slug="potting-soil-mix", name="Potting Soil Mix", category="decor", icon="soil",
         tagline="Ready-to-use mix for healthy roots and repotting",
         care=["For indoor plants", "Bag sizes vary"], price_paise=None),
    dict(slug="decorative-stones", name="Decorative Stones", category="decor", icon="stones",
         tagline="Pebbles & stones to finish off the top of a pot",
         care=["Several colours", "Sold by the bag"], price_paise=None),
]


def seed_if_empty(db: Session) -> int:
    seeded = 0
    if not db.scalar(select(func.count(Product.id))):
        for i, row in enumerate(CATALOG):
            db.add(Product(sort_order=i, **row))
        seeded += len(CATALOG)

    if not db.scalar(select(func.count(DeliveryZone.id))):
        db.add(DeliveryZone(pincode=STORE_PINCODE, distance_km=0, label="Seethammapeta (store)"))
        seeded += 1

    if db.get(DeliverySettings, 1) is None:
        db.add(DeliverySettings(id=1))
        seeded += 1

    db.commit()
    return seeded
