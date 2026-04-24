from datetime import datetime

from flask import Blueprint, current_app, jsonify, request, send_file

from backend.services.report_service import (
    PatientNotFoundError,
    generate_patient_excel,
    generate_patient_pdf,
)

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

DATE_FORMAT = "%Y-%m-%d"


def _error_response(status_code: int, code: str, message: str):
    return (
        jsonify(
            {
                "success": False,
                "error": {
                    "code": code,
                    "message": message,
                },
            }
        ),
        status_code,
    )


def _parse_date_range() -> tuple[str, str]:
    start_date = (request.args.get("start_date") or "").strip()
    end_date = (request.args.get("end_date") or "").strip()

    if not start_date or not end_date:
        raise ValueError("start_date e end_date são obrigatórios.")

    try:
        start = datetime.strptime(start_date, DATE_FORMAT).date()
        end = datetime.strptime(end_date, DATE_FORMAT).date()
    except ValueError as exc:
        raise ValueError("Datas devem estar no formato YYYY-MM-DD.") from exc

    if end < start:
        raise ValueError("Data final não pode ser anterior à data inicial.")

    return start.isoformat(), end.isoformat()


@reports_bp.get("/patient/<patient_id>/pdf")
def get_patient_pdf_report(patient_id: str):
    try:
        start_date, end_date = _parse_date_range()
        report_stream, filename = generate_patient_pdf(patient_id, start_date, end_date)
    except ValueError as exc:
        return _error_response(400, "INVALID_DATE_RANGE", str(exc))
    except PatientNotFoundError as exc:
        return _error_response(404, "PATIENT_NOT_FOUND", str(exc))
    except Exception:
        current_app.logger.exception(
            "Failed to generate PDF report for patient=%s", patient_id
        )
        return _error_response(500, "REPORT_GENERATION_ERROR", "Erro ao gerar relatório PDF.")

    return send_file(
        report_stream,
        as_attachment=True,
        download_name=filename,
        mimetype="application/pdf",
    )


@reports_bp.get("/patient/<patient_id>/excel")
def get_patient_excel_report(patient_id: str):
    try:
        start_date, end_date = _parse_date_range()
        report_stream, filename = generate_patient_excel(patient_id, start_date, end_date)
    except ValueError as exc:
        return _error_response(400, "INVALID_DATE_RANGE", str(exc))
    except PatientNotFoundError as exc:
        return _error_response(404, "PATIENT_NOT_FOUND", str(exc))
    except Exception:
        current_app.logger.exception(
            "Failed to generate Excel report for patient=%s", patient_id
        )
        return _error_response(500, "REPORT_GENERATION_ERROR", "Erro ao gerar relatório Excel.")

    return send_file(
        report_stream,
        as_attachment=True,
        download_name=filename,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
