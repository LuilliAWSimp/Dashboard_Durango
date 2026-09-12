from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, EmailStr, Field


ReportPeriodMode = Literal['previous_calendar_day_24h', 'fixed_12h_blocks']
ReportFormat = Literal['pdf', 'excel']


class ReportEmailScheduleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    period_mode: ReportPeriodMode = 'previous_calendar_day_24h'
    formats: list[ReportFormat] = Field(default_factory=lambda: ['pdf', 'excel'], min_length=1, max_length=2)
    recipients: list[EmailStr] = Field(min_length=1, max_length=20)
    cc: list[EmailStr] = Field(default_factory=list, max_length=20)
    enabled: bool = True
    send_delay_minutes: int | None = Field(default=None, ge=1, le=60)
    subject: str | None = Field(default=None, max_length=180)
    message: str | None = Field(default=None, max_length=4000)


class ReportEmailScheduleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    period_mode: ReportPeriodMode | None = None
    formats: list[ReportFormat] | None = Field(default=None, min_length=1, max_length=2)
    recipients: list[EmailStr] | None = Field(default=None, min_length=1, max_length=20)
    cc: list[EmailStr] | None = Field(default=None, max_length=20)
    enabled: bool | None = None
    send_delay_minutes: int | None = Field(default=None, ge=1, le=60)
    subject: str | None = Field(default=None, max_length=180)
    message: str | None = Field(default=None, max_length=4000)
