from functools import lru_cache
from typing import List
from urllib.parse import quote_plus

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = Field(default="ARCA CONTINENTAL Energy API", alias="APP_NAME")
    api_v1_prefix: str = Field(default="/api/v1", alias="API_V1_PREFIX")
    debug: bool = Field(default=True, alias="DEBUG")
    database_url: str = Field(default="sqlite:///./energy_dashboard.db", alias="DATABASE_URL")
    db_mode: str = Field(default="sqlserver", validation_alias=AliasChoices("DB_MODE", "DATABASE_MODE"))
    allowed_origins_raw: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        alias="ALLOWED_ORIGINS",
    )

    smtp_host: str = Field(default="smtp.office365.com", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, alias="SMTP_PORT")
    smtp_username: str = Field(default="", alias="SMTP_USERNAME")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    smtp_from: str = Field(default="no-reply@example.com", alias="SMTP_FROM")

    # SQL Server settings
    sqlserver_host: str = Field(default=r"SERVER-SCADA\SQLSCADA", validation_alias=AliasChoices("SQLSERVER_HOST", "DB_SERVER"))
    sqlserver_port: int = Field(default=1433, alias="SQLSERVER_PORT")
    sqlserver_database: str = Field(default="ARCA", validation_alias=AliasChoices("SQLSERVER_DATABASE", "DB_NAME"))
    sqlserver_username: str = Field(default="", alias="SQLSERVER_USERNAME")
    sqlserver_password: str = Field(default="", alias="SQLSERVER_PASSWORD")
    sqlserver_driver: str = Field(default="ODBC Driver 17 for SQL Server", validation_alias=AliasChoices("SQLSERVER_DRIVER", "DB_DRIVER"))
    sqlserver_trust_cert: bool = Field(default=True, validation_alias=AliasChoices("SQLSERVER_TRUST_CERT", "DB_TRUST_SERVER_CERTIFICATE"))
    sqlserver_encrypt: str = Field(default="no", validation_alias=AliasChoices("SQLSERVER_ENCRYPT", "DB_ENCRYPT"))
    sqlserver_use_windows_auth: bool = Field(default=True, validation_alias=AliasChoices("SQLSERVER_USE_WINDOWS_AUTH", "DB_TRUSTED_CONNECTION"))

    # Real-source mapping
    sqlserver_source_mode: str = Field(default="table", alias="SQLSERVER_SOURCE_MODE")
    sqlserver_source_table: str = Field(default="dbo.v_dashboard_measurements", alias="SQLSERVER_SOURCE_TABLE")

    @property
    def allowed_origins(self) -> List[str]:
        return [item.strip() for item in self.allowed_origins_raw.split(",") if item.strip()]

    @property
    def resolved_database_url(self) -> str:
        if self.db_mode.lower() == "sqlserver":
            trust = "yes" if self.sqlserver_trust_cert else "no"
            encrypt = str(self.sqlserver_encrypt).lower()
            if encrypt in {"false", "0", "off"}:
                encrypt = "no"
            if encrypt in {"true", "1", "on"}:
                encrypt = "yes"

            server_part = self.sqlserver_host
            if "\\" not in self.sqlserver_host and self.sqlserver_port:
                server_part = f"{self.sqlserver_host},{self.sqlserver_port}"

            parts = [
                f"DRIVER={{{self.sqlserver_driver}}}",
                f"SERVER={server_part}",
                f"DATABASE={self.sqlserver_database}",
                f"TrustServerCertificate={trust}",
                f"Encrypt={encrypt}",
            ]

            if self.sqlserver_use_windows_auth:
                parts.append("Trusted_Connection=yes")
            else:
                parts.extend([
                    f"UID={self.sqlserver_username}",
                    f"PWD={self.sqlserver_password}",
                ])

            connection_string = ";".join(parts)
            return f"mssql+pyodbc:///?odbc_connect={quote_plus(connection_string)}"

        return self.database_url

@lru_cache
def get_settings() -> Settings:
    return Settings()
