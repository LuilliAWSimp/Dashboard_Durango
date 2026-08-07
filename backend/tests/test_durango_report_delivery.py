from __future__ import annotations

import unittest
from unittest.mock import patch

from pydantic import ValidationError

from app.api.routes import water
from app.schemas.export import DailyWaterReportEmailRequest
from app.services.email_service import EmailSendResult


class DurangoReportDeliveryTests(unittest.TestCase):
    def request(self, formats: list[str]) -> DailyWaterReportEmailRequest:
        return DailyWaterReportEmailRequest(to='operacion@example.com', date='2026-08-07', formats=formats)

    def deliver(self, formats: list[str]):
        report = {'period_label': '07/08/2026'}
        with patch.object(water, 'ensure_smtp_configured'), patch.object(
            water, '_report_or_error', return_value=report
        ) as report_loader, patch.object(
            water, 'build_daily_water_report_pdf', return_value=(b'pdf', 'reporte.pdf')
        ) as pdf_builder, patch.object(
            water, 'build_daily_water_report_excel', return_value=(b'xlsx', 'reporte.xlsx')
        ) as excel_builder, patch.object(
            water,
            'send_email_with_bytes_attachments',
            return_value=EmailSendResult(message='Aceptado', message_id='test-message'),
        ) as sender:
            response = water.email_daily_water_report(self.request(formats))
        return response, report_loader, pdf_builder, excel_builder, sender

    def test_email_can_send_only_pdf(self) -> None:
        response, report_loader, pdf_builder, excel_builder, sender = self.deliver(['pdf'])
        report_loader.assert_called_once()
        pdf_builder.assert_called_once()
        excel_builder.assert_not_called()
        self.assertEqual(response['attachments'], ['reporte.pdf'])
        self.assertEqual(len(sender.call_args.kwargs['attachments']), 1)

    def test_email_can_send_only_excel(self) -> None:
        response, report_loader, pdf_builder, excel_builder, sender = self.deliver(['xlsx'])
        report_loader.assert_called_once()
        pdf_builder.assert_not_called()
        excel_builder.assert_called_once()
        self.assertEqual(response['attachments'], ['reporte.xlsx'])
        self.assertEqual(len(sender.call_args.kwargs['attachments']), 1)

    def test_email_builds_report_once_for_pdf_and_excel(self) -> None:
        response, report_loader, pdf_builder, excel_builder, sender = self.deliver(['pdf', 'xlsx'])
        report_loader.assert_called_once()
        pdf_builder.assert_called_once()
        excel_builder.assert_called_once()
        self.assertEqual(response['attachments'], ['reporte.pdf', 'reporte.xlsx'])
        self.assertEqual(len(sender.call_args.kwargs['attachments']), 2)

    def test_email_rejects_empty_or_unknown_formats(self) -> None:
        with self.assertRaises(ValidationError):
            self.request([])
        with self.assertRaises(ValidationError):
            self.request(['csv'])


if __name__ == '__main__':
    unittest.main()
