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
        SELECT id, nome, idade, escola, responsavel, telefone, email, forma_atendimento, convenio_nome, plano_convenio
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
        SELECT id, data, horario, status, motivo, profissional, observacoes, forma_atendimento, convenio_nome, plano_convenio
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


def _fetch_financial_entries(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            id,
            data,
            valor,
            status,
            metodo_pagamento,
            observacoes,
            forma_atendimento,
            convenio_nome,
            plano_convenio,
            transaction_type,
            created_at
        FROM financeiro
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, created_at ASC
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
    patient_care_type = str(patient.get("forma_atendimento") or "particular").strip().lower()
    line(f"Tipo de Atendimento: {'Convenio' if patient_care_type == 'convenio' else 'Particular'}")
    if patient_care_type == "convenio":
        line(f"Convenio: {_safe_value(patient.get('convenio_nome'))}")
        line(f"Plano: {_safe_value(patient.get('plano_convenio'))}")
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
                appointment_care_type = str(appointment.get("forma_atendimento") or "particular").strip().lower()
                line(f"  Tipo: {'Convenio' if appointment_care_type == 'convenio' else 'Particular'}", indent=10)
                if appointment_care_type == "convenio":
                    line(f"  Convenio: {_safe_value(appointment.get('convenio_nome'))}", indent=10)
                    line(f"  Plano: {_safe_value(appointment.get('plano_convenio'))}", indent=10)
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
                "Tipo de Atendimento": "Convenio"
                if str(patient.get("forma_atendimento") or "particular").strip().lower() == "convenio"
                else "Particular",
                "Convenio": _safe_value(patient.get("convenio_nome")),
                "Plano Convenio": _safe_value(patient.get("plano_convenio")),
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
                "Tipo Atendimento": "",
                "Convenio": "",
                "Plano Convenio": "",
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
                "Tipo Atendimento": "Convenio"
                if str(appointment.get("forma_atendimento") or "particular").strip().lower() == "convenio"
                else "Particular",
                "Convenio": _safe_value(appointment.get("convenio_nome")),
                "Plano Convenio": _safe_value(appointment.get("plano_convenio")),
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


def generate_financial_pdf(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    entries = _fetch_financial_entries(patient_id, start_date, end_date)

    logger.info(
        "Generating financial PDF report for patient=%s period=%s..%s (entries=%s)",
        patient_id,
        start_date,
        end_date,
        len(entries),
    )

    balance_amount = sum(float(entry.get("valor") or 0) for entry in entries)
    particular_entries = [
        entry for entry in entries if str(entry.get("forma_atendimento") or "particular").strip().lower() != "convenio"
    ]
    convenio_entries = [
        entry for entry in entries if str(entry.get("forma_atendimento") or "particular").strip().lower() == "convenio"
    ]
    paid_amount = sum(
        float(entry.get("valor") or 0)
        for entry in particular_entries
        if str(entry.get("status") or "").strip().lower() == "pago"
    )
    pending_amount = sum(
        abs(float(entry.get("valor") or 0))
        for entry in particular_entries
        if str(entry.get("status") or "").strip().lower() == "pendente"
    )
    overdue_amount = sum(
        abs(float(entry.get("valor") or 0))
        for entry in particular_entries
        if str(entry.get("status") or "").strip().lower() == "atrasado"
    )

    status_totals: dict[str, int] = {}
    for entry in entries:
        status = _safe_value(entry.get("status"))
        status_totals[status] = status_totals.get(status, 0) + 1

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
    pdf.drawString(margin, y, "Relatorio Financeiro")
    y -= 24

    section_title("Paciente e Periodo")
    line(f"Paciente: {_safe_value(patient.get('nome'))}")
    line(f"Periodo: {start_date} ate {end_date}")
    y -= 6

    section_title("Resumo Financeiro")
    line(f"Total de lancamentos: {len(entries)}")
    line(f"Saldo atual: R$ {balance_amount:.2f}")
    line(f"Lancamentos Particular: {len(particular_entries)}")
    line(f"Lancamentos Convenio: {len(convenio_entries)}")
    line(f"Valor pago: R$ {paid_amount:.2f}")
    line(f"Pendencias: R$ {pending_amount:.2f}")
    line(f"Atrasos: R$ {overdue_amount:.2f}")
    if status_totals:
        line(
            "Status: "
            + " | ".join([f"{status}: {count}" for status, count in sorted(status_totals.items())])
        )
    y -= 6

    section_title("Pagamentos no Periodo")
    if not entries:
        line("Nenhum pagamento encontrado no periodo selecionado.")
    else:
        for entry in entries:
            entry_care_type = str(entry.get("forma_atendimento") or "particular").strip().lower()
            entry_status = "Convenio" if entry_care_type == "convenio" else _safe_value(entry.get("status"))
            line(
                f"- Data: {_safe_value(entry.get('data'))} | Valor: R$ {float(entry.get('valor') or 0):.2f} | Status: {entry_status}",
                indent=10,
            )
            line(
                f"  Tipo: {_safe_value(entry.get('transaction_type') or 'payment')} | Atendimento: {'Convenio' if entry_care_type == 'convenio' else 'Particular'}",
                indent=10,
            )
            line(f"  Metodo: {_safe_value(entry.get('metodo_pagamento'))}", indent=10)
            line(f"  Convenio: {_safe_value(entry.get('convenio_nome'))}", indent=10)
            line(f"  Plano: {_safe_value(entry.get('plano_convenio'))}", indent=10)
            line(f"  Observacoes: {_safe_value(entry.get('observacoes'))}", indent=10)
            line(f"  Data de registro: {_safe_value(entry.get('created_at'))}", indent=10)
            y -= 4

    pdf.save()
    buffer.seek(0)
    filename = f"relatorio_financeiro_{patient_id}_{start_date}_{end_date}.pdf"
    return buffer, filename


def generate_financial_excel(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    entries = _fetch_financial_entries(patient_id, start_date, end_date)

    logger.info(
        "Generating financial Excel report for patient=%s period=%s..%s (entries=%s)",
        patient_id,
        start_date,
        end_date,
        len(entries),
    )

    rows: list[dict[str, Any]] = []
    for entry in entries:
        care_type = str(entry.get("forma_atendimento") or "particular").strip().lower()
        is_convenio = care_type == "convenio"
        rows.append(
            {
                "Paciente": _safe_value(patient.get("nome")),
                "Data": _safe_value(entry.get("data")),
                "Valor": float(entry.get("valor") or 0),
                "Tipo": _safe_value(entry.get("transaction_type") or "payment"),
                "Forma de Atendimento": "Convenio" if is_convenio else "Particular",
                "Status": "Convenio" if is_convenio else _safe_value(entry.get("status")),
                "Metodo de Pagamento": _safe_value(entry.get("metodo_pagamento")),
                "Convenio": _safe_value(entry.get("convenio_nome")),
                "Plano": _safe_value(entry.get("plano_convenio")),
                "Observacoes": _safe_value(entry.get("observacoes")),
                "Data do Registro": _safe_value(entry.get("created_at")),
            }
        )

    if rows:
        financial_df = pd.DataFrame(rows).sort_values(by=["Data"], na_position="last")
    else:
        financial_df = pd.DataFrame(
            [{"Mensagem": "Nenhum pagamento encontrado no periodo selecionado."}]
        )

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        financial_df.to_excel(writer, index=False, sheet_name="Relatorio Financeiro")

    output.seek(0)
    filename = f"relatorio_financeiro_{patient_id}_{start_date}_{end_date}.xlsx"
    return output, filename
