import asyncio
import base64
import hashlib
import hmac
import json
import logging
import uuid
from datetime import datetime, timezone
from urllib import parse, request

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


def _percent_encode(value: str) -> str:
    return parse.quote(value, safe="~")


def _normalize_endpoint(endpoint: str | None) -> str:
    value = (endpoint or "dypnsapi.aliyuncs.com").strip()
    return value.removeprefix("https://").removeprefix("http://").rstrip("/")


def _normalize_cn_phone_number(phone_number: str) -> str:
    value = phone_number.strip().replace(" ", "").replace("-", "")
    if value.startswith("+86") and len(value) == 14:
        return value[3:]
    if value.startswith("86") and len(value) == 13:
        return value[2:]
    return value.lstrip("+")


def _has_aliyun_config(settings: Settings) -> bool:
    return bool(
        settings.aliyun_access_key_id
        and settings.aliyun_access_key_secret
        and settings.sms_sign_name
        and settings.sms_template_code
        and settings.aliyun_sms_endpoint
    )


def _resolve_provider(settings: Settings) -> str:
    provider = settings.sms_provider.lower().strip()
    if provider in {"aliyun", "ali", "aliyun_sms", "dypns", "dypnsapi"}:
        return "aliyun"

    # The current local .env keeps SMS_PROVIDER=log but also contains a complete
    # Aliyun DYPNS configuration. Prefer real sending in that case so the app
    # works without forcing the user to rename the existing provider value.
    if provider == "log" and _has_aliyun_config(settings):
        return "aliyun"

    return provider


def is_sms_debug_mode() -> bool:
    return _resolve_provider(get_settings()) == "log"


def _build_signed_url(endpoint: str, params: dict[str, str], access_key_secret: str) -> str:
    canonical_query = "&".join(
        f"{_percent_encode(key)}={_percent_encode(params[key])}" for key in sorted(params)
    )
    string_to_sign = f"GET&%2F&{_percent_encode(canonical_query)}"
    key = f"{access_key_secret}&".encode("utf-8")
    digest = hmac.new(key, string_to_sign.encode("utf-8"), hashlib.sha1).digest()
    signature = base64.b64encode(digest).decode("utf-8")
    signed_query = f"Signature={_percent_encode(signature)}&{canonical_query}"
    return f"https://{endpoint}/?{signed_query}"


def _base_aliyun_params(settings: Settings, action: str, version: str) -> dict[str, str]:
    if not settings.aliyun_access_key_id or not settings.aliyun_access_key_secret:
        raise RuntimeError("Aliyun access key is not configured")

    return {
        "AccessKeyId": settings.aliyun_access_key_id,
        "Action": action,
        "Format": "JSON",
        "RegionId": "cn-hangzhou",
        "SignatureMethod": "HMAC-SHA1",
        "SignatureNonce": str(uuid.uuid4()),
        "SignatureVersion": "1.0",
        "Timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "Version": version,
    }


def _template_param(settings: Settings, code: str) -> str:
    return json.dumps(
        {
            settings.sms_template_code_key: code,
            "min": str(settings.sms_code_expire_minutes),
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _request_aliyun(endpoint: str, params: dict[str, str], access_key_secret: str) -> dict:
    url = _build_signed_url(endpoint, params, access_key_secret)
    with request.urlopen(url, timeout=10) as response:
        body = response.read().decode("utf-8")
    return json.loads(body)


def _ensure_ok_response(payload: dict) -> None:
    if payload.get("Code") == "OK" and payload.get("Success", True) is not False:
        return

    message = payload.get("Message") or payload.get("Code") or "Aliyun SMS request failed"
    request_id = payload.get("RequestId")
    logger.warning(
        "Aliyun SMS failed request_id=%s code=%s message=%s",
        request_id,
        payload.get("Code"),
        message,
    )
    raise RuntimeError(f"Aliyun SMS failed: {message}")


def _send_dypns_verify_code_sync(phone_number: str, code: str, purpose: str) -> None:
    settings = get_settings()
    if not settings.sms_sign_name:
        raise RuntimeError("SMS_SIGN_NAME is not configured")
    if not settings.sms_template_code:
        raise RuntimeError("SMS_TEMPLATE_CODE is not configured")
    if not settings.aliyun_access_key_secret:
        raise RuntimeError("ALIYUN_ACCESS_KEY_SECRET is not configured")

    endpoint = _normalize_endpoint(settings.aliyun_sms_endpoint)
    params = _base_aliyun_params(settings, "SendSmsVerifyCode", "2017-05-25")
    params.update(
        {
            "AutoRetry": "1",
            "CodeLength": str(max(4, min(8, len(code)))),
            "CountryCode": "86",
            "DuplicatePolicy": "1",
            "Interval": str(settings.sms_resend_cooldown_seconds),
            "OutId": f"{purpose}-{uuid.uuid4().hex}",
            "PhoneNumber": _normalize_cn_phone_number(phone_number),
            "ReturnVerifyCode": "false",
            "SignName": settings.sms_sign_name,
            "TemplateCode": settings.sms_template_code,
            "TemplateParam": _template_param(settings, code),
            "ValidTime": str(settings.sms_code_expire_minutes * 60),
        }
    )
    payload = _request_aliyun(endpoint, params, settings.aliyun_access_key_secret)
    _ensure_ok_response(payload)


def _send_dysms_sync(phone_number: str, code: str) -> None:
    settings = get_settings()
    if not settings.sms_sign_name:
        raise RuntimeError("SMS_SIGN_NAME is not configured")
    if not settings.sms_template_code:
        raise RuntimeError("SMS_TEMPLATE_CODE is not configured")
    if not settings.aliyun_access_key_secret:
        raise RuntimeError("ALIYUN_ACCESS_KEY_SECRET is not configured")

    endpoint = _normalize_endpoint(settings.aliyun_sms_endpoint)
    params = _base_aliyun_params(settings, "SendSms", "2017-05-25")
    params.update(
        {
            "PhoneNumbers": _normalize_cn_phone_number(phone_number),
            "SignName": settings.sms_sign_name,
            "TemplateCode": settings.sms_template_code,
            "TemplateParam": _template_param(settings, code),
        }
    )
    payload = _request_aliyun(endpoint, params, settings.aliyun_access_key_secret)
    _ensure_ok_response(payload)


async def send_sms_code(phone_number: str, code: str, purpose: str) -> None:
    settings = get_settings()
    provider = _resolve_provider(settings)

    if provider == "log":
        logger.warning("SMS code phone=%s purpose=%s code=%s", phone_number, purpose, code)
        return

    if provider == "aliyun":
        endpoint = _normalize_endpoint(settings.aliyun_sms_endpoint)
        if "dypnsapi" in endpoint:
            await asyncio.to_thread(_send_dypns_verify_code_sync, phone_number, code, purpose)
        else:
            await asyncio.to_thread(_send_dysms_sync, phone_number, code)
        return

    raise RuntimeError(f"Unsupported SMS_PROVIDER={settings.sms_provider!r}")
