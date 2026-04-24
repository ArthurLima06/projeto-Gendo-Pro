import logging
from io import BytesIO
from typing import Any

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from backend.database import get_db

logger = logging.getLogger(__name__)


class ReportError(Exception):
    """Base exception for report generation errors."""


class PatientNotFoundError(ReportError):
    """Raised when a patient cannot be found."""


def _row_to_dict(row) -> dict[str, Any]:
    return dict(row) if row else {}


def _safe_value(value: Any) -> str:
    if value is None:
        return "-"
    if isinstance(value, str) and value.strip() == "":
        return "-"
    return str(value)


def _fetch_patient(patient_id: str) -> dict[str, Any]:
    db = get_db()
    patient_row = db.execute(
        """
        SELECT id, nome, idade, escola, responsavel, telefone, email
        FROM pacientes
        WHERE id = ?
        """,
        (patient_id,),
    ).fetchone()
    if patient_row is None:
        raise PatientNotFoundError("Paciente não encontrado.")
    return _row_to_dict(patient_row)


def _fetch_sessions(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, data, atividade, evolucao, observacoes
        FROM sessoes
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, created_at ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _fetch_appointments(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, data, horario, status, motivo, profissional, observacoes
        FROM agenda
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, horario ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _fetch_notes(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, data, hora, observacoes
        FROM registros
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, hora ASC, created_at ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _draw_wrapped_line(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    line_height: float = 14,
) -> float:
    words = text.split()
    if not words:
        return y - line_height

    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if pdf.stringWidth(candidate, "Helvetica", 10) <= max_width:
            current = candidate
        else:
            pdf.drawString(x, y, current)
            y -= line_height
            current = word
    pdf.drawString(x, y, current)
    return y - line_height


def generate_patient_pdf(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    sessions = _fetch_sessions(patient_id, start_date, end_date)
    appointments = _fetch_appointments(patient_id, start_date, end_date)
    notes = _fetch_notes(patient_id, start_date, end_date)

    logger.info(
        "Generating PDF report for patient=%s period=%s..%s (sessions=%s appointments=%s notes=%s)",
        patient_id,
        start_date,
        end_date,
        len(sessions),
        len(appointments),
        len(notes),
    )

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    margin = 40
    y = height - margin
    max_width = width - (margin * 2)

    def ensure_space(lines: int = 2) -> None:
        nonlocal y
        if y < margin + (lines * 14):
            pdf.showPage()
            y = height - margin
            pdf.setFont("Helvetica", 10)

    def section_title(title: str) -> None:
        nonlocal y
        ensure_space(3)
        pdf.setFont("Helvetica-Bold", 12)
        pdf.drawString(margin, y, title)
        y -= 18
        pdf.setFont("Helvetica", 10)

    def line(text: str, indent: int = 0) -> None:
        nonlocal y
        ensure_space(2)
        y = _draw_wrapped_line(pdf, text, margin + indent, y, max_width - indent)

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(margin, y, "Relatório do Paciente")
    y -= 24

    section_title("Dados do Paciente")
    line(f"Nome: {_safe_value(patient.get('nome'))}")
    line(f"Idade: {_safe_value(patient.get('idade'))}")
    line(f"Escolaridade: {_safe_value(patient.get('escola'))}")
    line(f"Responsável: {_safe_value(patient.get('responsavel'))}")
    line(f"Telefone: {_safe_value(patient.get('telefone'))}")
    line(f"Email: {_safe_value(patient.get('email'))}")
    y -= 6

    section_title("Período do Relatório")
    line(f"Data Inicial: {start_date}")
    line(f"Data Final: {end_date}")
    y -= 6

    section_title("Histórico de Sessões")
    if not sessions and not appointments and not notes:
        line("Nenhum registro encontrado no período selecionado.")
    else:
        if sessions:
            line("Sessões:", indent=0)
            for session in sessions:
                line(
                    f"- {session.get('data')} | Atividade: {_safe_value(session.get('atividade'))}",
                    indent=10,
                )
                line(f"  Evolução: {_safe_value(session.get('evolucao'))}", indent=10)
                line(f"  Observações: {_safe_value(session.get('observacoes'))}", indent=10)
                y -= 4
        if appointments:
            line("Agendamentos:", indent=0)
            for appointment in appointments:
                line(
                    f"- {appointment.get('data')} {_safe_value(appointment.get('horario'))} | Status: {_safe_value(appointment.get('status'))}",
                    indent=10,
                )
                line(f"  Motivo: {_safe_value(appointment.get('motivo'))}", indent=10)
                line(f"  Profissional: {_safe_value(appointment.get('profissional'))}", indent=10)
                line(f"  Observações: {_safe_value(appointment.get('observacoes'))}", indent=10)
                y -= 4

    y -= 6
    section_title("Observações")
    if not notes:
        line("Nenhum registro encontrado no período selecionado.")
    else:
        for note in notes:
            line(
                f"- {note.get('data')} {_safe_value(note.get('hora'))} | {_safe_value(note.get('observacoes'))}",
                indent=10,
            )

    pdf.save()
    buffer.seek(0)
    filename = f"relatorio_paciente_{patient_id}_{start_date}_{end_date}.pdf"
    return buffer, filename


def generate_patient_excel(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    sessions = _fetch_sessions(patient_id, start_date, end_date)
    appointments = _fetch_appointments(patient_id, start_date, end_date)
    notes = _fetch_notes(patient_id, start_date, end_date)

    logger.info(
        "Generating Excel report for patient=%s period=%s..%s (sessions=%s appointments=%s notes=%s)",
        patient_id,
        start_date,
        end_date,
        len(sessions),
        len(appointments),
        len(notes),
    )

    patient_df = pd.DataFrame(
        [
            {
                "Nome": _safe_value(patient.get("nome")),
                "Idade": _safe_value(patient.get("idade")),
                "Escolaridade": _safe_value(patient.get("escola")),
                "Responsável": _safe_value(patient.get("responsavel")),
                "Telefone": _safe_value(patient.get("telefone")),
                "Email": _safe_value(patient.get("email")),
                "Data Inicial": start_date,
                "Data Final": end_date,
            }
        ]
    )

    history_rows: list[dict[str, Any]] = []
    for session in sessions:
        history_rows.append(
            {
                "Tipo": "Sessão",
                "Data": session.get("data"),
                "Hora": "",
                "Atividade/Motivo": _safe_value(session.get("atividade")),
                "Profissional": "",
                "Status": "",
                "Detalhes": _safe_value(session.get("evolucao")),
                "Observações": _safe_value(session.get("observacoes")),
            }
        )
    for appointment in appointments:
        history_rows.append(
            {
                "Tipo": "Agendamento",
                "Data": appointment.get("data"),
                "Hora": _safe_value(appointment.get("horario")),
                "Atividade/Motivo": _safe_value(appointment.get("motivo")),
                "Profissional": _safe_value(appointment.get("profissional")),
                "Status": _safe_value(appointment.get("status")),
                "Detalhes": "",
                "Observações": _safe_value(appointment.get("observacoes")),
            }
        )

    if history_rows:
        history_df = pd.DataFrame(history_rows).sort_values(by=["Data", "Hora"], na_position="last")
    else:
        history_df = pd.DataFrame(
            [{"Mensagem": "Nenhum registro encontrado no período selecionado."}]
        )

    if notes:
        notes_df = pd.DataFrame(
            [
                {
                    "Data": note.get("data"),
                    "Hora": _safe_value(note.get("hora")),
                    "Observação": _safe_value(note.get("observacoes")),
                }
                for note in notes
            ]
        ).sort_values(by=["Data", "Hora"], na_position="last")
    else:
        notes_df = pd.DataFrame(
            [{"Mensagem": "Nenhum registro encontrado no período selecionado."}]
        )

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        patient_df.to_excel(writer, index=False, sheet_name="Dados do Paciente")
        history_df.to_excel(writer, index=False, sheet_name="Histórico de Sessões")
        notes_df.to_excel(writer, index=False, sheet_name="Observações")

    output.seek(0)
    filename = f"relatorio_paciente_{patient_id}_{start_date}_{end_date}.xlsx"
    return output, filename
