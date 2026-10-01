"""Ad-hoc column migrations for the MVP `create_all`-on-boot setup (see main.py).

`Base.metadata.create_all` only creates missing *tables* — it never alters an existing one,
so a live database (dev SQLite or prod Postgres) needs its new `orders` columns added by hand
here. Replace this with real Alembic migrations before the schema changes much more.
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# name -> the SQL type used when the column doesn't exist yet.
NEW_ORDER_COLUMNS = {
    "out_of_zone": "BOOLEAN DEFAULT FALSE",
    "shipping_courier": "VARCHAR(40)",
}


def ensure_order_columns(engine: Engine) -> None:
    inspector = inspect(engine)
    if "orders" not in inspector.get_table_names():
        return  # fresh database — create_all already made an up-to-date table
    existing = {c["name"] for c in inspector.get_columns("orders")}
    missing = {name: ddl for name, ddl in NEW_ORDER_COLUMNS.items() if name not in existing}
    if not missing:
        return
    with engine.begin() as conn:
        for name, ddl in missing.items():
            conn.execute(text(f"ALTER TABLE orders ADD COLUMN {name} {ddl}"))
