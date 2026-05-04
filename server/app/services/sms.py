import logging

from app.core.config import get_settings

logger = logging.getLogger(__name__)


async def send_sms_code(phone_number: str, code: str, purpose: str) -> None:
    settings = get_settings()
    provider = settings.sms_provider.lower()

    if provider == "log":
        logger.warning("SMS code phone=%s purpose=%s code=%s", phone_number, purpose, code)
        return

    raise RuntimeError(f"Unsupported SMS_PROVIDER={settings.sms_provider!r}")
