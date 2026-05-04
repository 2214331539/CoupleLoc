from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CoupleLoc API"
    environment: str = "local"
    debug: bool = False

    jwt_secret_key: str = Field(min_length=16)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 30

    database_url: str
    auto_create_tables: bool = False
    low_battery_threshold: float = 0.2

    sms_provider: str = "log"
    sms_code_expire_minutes: int = 5
    sms_resend_cooldown_seconds: int = 60
    sms_sign_name: str | None = None
    sms_template_code: str | None = None
    sms_template_code_key: str = "code"
    aliyun_sms_endpoint: str = "dysmsapi.aliyuncs.com"
    aliyun_access_key_id: str | None = None
    aliyun_access_key_secret: str | None = None
    aliyun_sts_endpoint: str | None = None

    cors_origins: list[str] = ["*"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
