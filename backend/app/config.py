from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration comes from environment variables (or a .env file)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database — SQLite for local dev, Postgres in production.
    database_url: str = "sqlite:///./pbl.db"

    # CORS: the Next.js site's origin(s), comma-separated.
    frontend_origins: str = "http://localhost:3000"

    # Minimum order value. Delivery zones/fees are managed in the database (see DeliveryZone,
    # DeliverySettings) and tuned from the admin panel, not here.
    min_order_paise: int = 0

    # Admin panel — a long random string. Admin endpoints are disabled when empty.
    admin_token: str = ""

    # Razorpay — online payments are disabled until these are set.
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    # Optional: new-order alerts to the team via a Telegram bot.
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.frontend_origins.split(",") if o.strip()]

    @property
    def site_url(self) -> str:
        """The customer-facing site, used to build links sent outside the browser (e.g. in a
        WhatsApp message). Prefers an https origin over a plain-http dev one when both are listed."""
        origins = self.origins
        return next((o for o in origins if o.startswith("https://")), origins[0] if origins else "")

    @property
    def online_payments_enabled(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


@lru_cache
def get_settings() -> Settings:
    return Settings()
