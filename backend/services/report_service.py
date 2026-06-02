import logging
from io import BytesIO
from typing import Any

import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from backend.database import get_db

logger = logging.getLogger(__name__)

REPORT_TYPES = {"general", "records", "patient_data", "appointments"}
REPORT_TITLES = {
    "general": "Relatorio Geral",
    "records": "Relatorio de Prontuarios",
    "patient_data": "Relatorio de Dados do Paciente",
    "appointments": "Relatorio de Agendamentos",
}


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


def _format_cpf(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    if len(digits) != 11:
        return "-"
    return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"


def _money(value: Any) -> str:
    return f"R$ {float(value or 0):.2f}"


def _care_type_label(value: Any) -> str:
    return "Convenio" if str(value or "particular").strip().lower() == "convenio" else "Particular"


def _validate_report_type(report_type: str | None) -> str:
    normalized = str(report_type or "general").strip().lower()
    if normalized not in REPORT_TYPES:
        raise ValueError("Tipo de relatorio invalido.")
    return normalized


def _fetch_patient(patient_id: str) -> dict[str, Any]:
    db = get_db()
    patient_row = db.execute(
        """
        SELECT
            id, nome, cpf, idade, escola, responsavel, telefone, email, cep,
            endereco, numero, bairro, cidade, forma_atendimento, convenio_nome,
            plano_convenio, observacoes, created_at, updated_at
        FROM pacientes
        WHERE id = ?
        """,
        (patient_id,),
    ).fetchone()
    if patient_row is None:
        raise PatientNotFoundError("Paciente nao encontrado.")
    return _row_to_dict(patient_row)


def _fetch_sessions(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, data, atividade, evolucao, observacoes, created_at
        FROM sessoes
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, created_at ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _fetch_notes(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT id, data, hora, observacoes, created_at
        FROM registros
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, hora ASC, created_at ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _fetch_appointments(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            a.id, a.data, a.horario, a.status, a.motivo,
            COALESCE(pr.name, a.profissional) AS profissional,
            pr.specialty AS especialidade,
            a.observacoes, a.forma_atendimento, a.convenio_nome, a.plano_convenio
        FROM agenda a
        LEFT JOIN professionals pr ON pr.id = a.professional_id
        WHERE a.paciente_id = ?
          AND date(a.data) BETWEEN date(?) AND date(?)
        ORDER BY date(a.data) ASC, a.horario ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _fetch_financial_entries(patient_id: str, start_date: str, end_date: str) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            id, data, valor, status, metodo_pagamento, observacoes,
            forma_atendimento, convenio_nome, plano_convenio, transaction_type,
            source, appointment_id, created_at
        FROM financeiro
        WHERE paciente_id = ?
          AND date(data) BETWEEN date(?) AND date(?)
        ORDER BY date(data) ASC, created_at ASC
        """,
        (patient_id, start_date, end_date),
    ).fetchall()
    return [_row_to_dict(row) for row in rows]


def _financial_summary(entries: list[dict[str, Any]]) -> dict[str, Any]:
    paid = 0.0
    pending = 0.0
    overdue = 0.0
    convenio = 0.0
    particular = 0.0
    for entry in entries:
        value = float(entry.get("valor") or 0)
        care_type = str(entry.get("forma_atendimento") or "particular").strip().lower()
        status = str(entry.get("status") or "").strip().lower()
        if care_type == "convenio":
            convenio += value
        else:
            particular += value
            if status == "pago":
                paid += value
            elif status == "pendente":
                pending += abs(value)
            elif status == "atrasado":
                overdue += abs(value)
    return {
        "total_paid": paid,
        "total_pending": pending,
        "total_overdue": overdue,
        "total_convenio": convenio,
        "total_particular": particular,
        "balance": sum(float(entry.get("valor") or 0) for entry in entries),
    }


def _patient_sheet_row(patient: dict[str, Any], start_date: str, end_date: str) -> dict[str, Any]:
    return {
        "Nome": _safe_value(patient.get("nome")),
        "CPF": _format_cpf(patient.get("cpf")),
        "Telefone": _safe_value(patient.get("telefone")),
        "Email": _safe_value(patient.get("email")),
        "Idade": _safe_value(patient.get("idade")),
        "Profissao": _safe_value(patient.get("escola")),
        "Responsavel": _safe_value(patient.get("responsavel")),
        "CEP": _safe_value(patient.get("cep")),
        "Endereco": _safe_value(patient.get("endereco")),
        "Numero": _safe_value(patient.get("numero")),
        "Bairro": _safe_value(patient.get("bairro")),
        "Cidade": _safe_value(patient.get("cidade")),
        "Forma de Atendimento": _care_type_label(patient.get("forma_atendimento")),
        "Convenio": _safe_value(patient.get("convenio_nome")),
        "Plano": _safe_value(patient.get("plano_convenio")),
        "Observacoes": _safe_value(patient.get("observacoes")),
        "Data Inicial": start_date,
        "Data Final": end_date,
    }


def _draw_wrapped_line(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    line_height: float = 14,
) -> float:
    words = str(text).split()
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


def generate_patient_pdf(
    patient_id: str,
    start_date: str,
    end_date: str,
    report_type: str | None = "general",
) -> tuple[BytesIO, str]:
    selected_type = _validate_report_type(report_type)
    patient = _fetch_patient(patient_id)
    sessions = _fetch_sessions(patient_id, start_date, end_date)
    notes = _fetch_notes(patient_id, start_date, end_date)
    appointments = _fetch_appointments(patient_id, start_date, end_date)
    financial_entries = _fetch_financial_entries(patient_id, start_date, end_date)
    summary = _financial_summary(financial_entries)

    logger.info(
        "Generating %s PDF report for patient=%s period=%s..%s",
        selected_type,
        patient_id,
        start_date,
        end_date,
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
    pdf.drawString(margin, y, REPORT_TITLES[selected_type])
    y -= 22
    pdf.setFont("Helvetica", 10)
    line(f"Paciente: {_safe_value(patient.get('nome'))} | CPF: {_format_cpf(patient.get('cpf'))}")
    line(f"Periodo: {start_date} ate {end_date}")
    y -= 6

    if selected_type in {"general", "records", "patient_data"}:
        section_title("Dados do Paciente")
        patient_fields = [
            ("Nome", patient.get("nome")),
            ("CPF", _format_cpf(patient.get("cpf"))),
            ("Telefone", patient.get("telefone")),
            ("Email", patient.get("email")),
            ("Endereco", patient.get("endereco")),
            ("Numero", patient.get("numero")),
            ("Bairro", patient.get("bairro")),
            ("Cidade", patient.get("cidade")),
            ("Responsavel", patient.get("responsavel")),
            ("Profissao", patient.get("escola")),
            ("Forma de Atendimento", _care_type_label(patient.get("forma_atendimento"))),
            ("Convenio", patient.get("convenio_nome")),
            ("Plano", patient.get("plano_convenio")),
            ("Observacoes", patient.get("observacoes")),
        ]
        basic_limit = 4 if selected_type == "records" else len(patient_fields)
        for label, value in patient_fields[:basic_limit]:
            line(f"{label}: {_safe_value(value)}")
        y -= 6

    if selected_type in {"general", "records"}:
        section_title("Prontuarios")
        if not sessions and not notes:
            line("Nenhum prontuario encontrado no periodo selecionado.")
        for session in sessions:
            line(f"- {session.get('data')} | Atividade: {_safe_value(session.get('atividade'))}", indent=10)
            line(f"  Evolucao: {_safe_value(session.get('evolucao'))}", indent=10)
            line(f"  Observacoes: {_safe_value(session.get('observacoes'))}", indent=10)
            y -= 4
        for note in notes:
            line(f"- {note.get('data')} {_safe_value(note.get('hora'))} | {_safe_value(note.get('observacoes'))}", indent=10)
            y -= 4

    if selected_type in {"general", "appointments"}:
        section_title("Agendamentos")
        if not appointments:
            line("Nenhum agendamento encontrado no periodo selecionado.")
        for appointment in appointments:
            line(
                f"- {appointment.get('data')} {appointment.get('horario')} | Status: {_safe_value(appointment.get('status'))}",
                indent=10,
            )
            line(f"  Profissional: {_safe_value(appointment.get('profissional'))}", indent=10)
            line(f"  Especialidade: {_safe_value(appointment.get('especialidade'))}", indent=10)
            line(f"  Tipo: {_care_type_label(appointment.get('forma_atendimento'))}", indent=10)
            line(f"  Convenio: {_safe_value(appointment.get('convenio_nome'))}", indent=10)
            line(f"  Plano: {_safe_value(appointment.get('plano_convenio'))}", indent=10)
            line(f"  Motivo: {_safe_value(appointment.get('motivo'))}", indent=10)
            y -= 4

    if selected_type == "general":
        section_title("Financeiro")
        line(f"Total pago: {_money(summary['total_paid'])}")
        line(f"Total pendente: {_money(summary['total_pending'])}")
        line(f"Total atrasado: {_money(summary['total_overdue'])}")
        line(f"Convenio: {_money(summary['total_convenio'])}")
        line(f"Particular: {_money(summary['total_particular'])}")
        if not financial_entries:
            line("Nenhum lancamento financeiro no periodo selecionado.")
        for entry in financial_entries:
            line(
                f"- {entry.get('data')} | Valor: {_money(entry.get('valor'))} | Status: {_safe_value(entry.get('status'))}",
                indent=10,
            )
            line(f"  Atendimento: {_care_type_label(entry.get('forma_atendimento'))}", indent=10)
            line(f"  Metodo: {_safe_value(entry.get('metodo_pagamento'))}", indent=10)
            y -= 4

        section_title("Resumo Geral")
        line(f"Quantidade de consultas: {len(appointments)}")
        line(f"Quantidade de prontuarios: {len(sessions) + len(notes)}")
        line(f"Situacao financeira: {'Pendente' if summary['total_pending'] or summary['total_overdue'] else 'Sem pendencias'}")
        line(f"Total pago: {_money(summary['total_paid'])}")
        line(f"Total pendente: {_money(summary['total_pending'] + summary['total_overdue'])}")

    pdf.save()
    buffer.seek(0)
    filename = f"relatorio_{selected_type}_{patient_id}_{start_date}_{end_date}.pdf"
    return buffer, filename


def generate_patient_excel(
    patient_id: str,
    start_date: str,
    end_date: str,
    report_type: str | None = "general",
) -> tuple[BytesIO, str]:
    selected_type = _validate_report_type(report_type)
    patient = _fetch_patient(patient_id)
    sessions = _fetch_sessions(patient_id, start_date, end_date)
    notes = _fetch_notes(patient_id, start_date, end_date)
    appointments = _fetch_appointments(patient_id, start_date, end_date)
    financial_entries = _fetch_financial_entries(patient_id, start_date, end_date)
    summary = _financial_summary(financial_entries)

    patient_df = pd.DataFrame([_patient_sheet_row(patient, start_date, end_date)])
    records_rows = [
        {
            "Tipo": "Sessao",
            "Data": session.get("data"),
            "Hora": "",
            "Atividade/Motivo": _safe_value(session.get("atividade")),
            "Evolucao": _safe_value(session.get("evolucao")),
            "Observacoes": _safe_value(session.get("observacoes")),
        }
        for session in sessions
    ] + [
        {
            "Tipo": "Registro",
            "Data": note.get("data"),
            "Hora": _safe_value(note.get("hora")),
            "Atividade/Motivo": "",
            "Evolucao": "",
            "Observacoes": _safe_value(note.get("observacoes")),
        }
        for note in notes
    ]
    appointments_rows = [
        {
            "Data": item.get("data"),
            "Hora": item.get("horario"),
            "Profissional": _safe_value(item.get("profissional")),
            "Especialidade": _safe_value(item.get("especialidade")),
            "Tipo de Atendimento": _care_type_label(item.get("forma_atendimento")),
            "Convenio": _safe_value(item.get("convenio_nome")),
            "Plano": _safe_value(item.get("plano_convenio")),
            "Status": _safe_value(item.get("status")),
            "Motivo": _safe_value(item.get("motivo")),
            "Observacoes": _safe_value(item.get("observacoes")),
        }
        for item in appointments
    ]
    financial_rows = [
        {
            "Data": entry.get("data"),
            "Valor": float(entry.get("valor") or 0),
            "Status": _safe_value(entry.get("status")),
            "Metodo": _safe_value(entry.get("metodo_pagamento")),
            "Forma de Atendimento": _care_type_label(entry.get("forma_atendimento")),
            "Convenio": _safe_value(entry.get("convenio_nome")),
            "Plano": _safe_value(entry.get("plano_convenio")),
            "Tipo": _safe_value(entry.get("transaction_type")),
            "Observacoes": _safe_value(entry.get("observacoes")),
        }
        for entry in financial_entries
    ]
    summary_df = pd.DataFrame(
        [
            {
                "Consultas": len(appointments),
                "Prontuarios": len(records_rows),
                "Total Pago": summary["total_paid"],
                "Total Pendente": summary["total_pending"],
                "Total Atrasado": summary["total_overdue"],
                "Convenio": summary["total_convenio"],
                "Particular": summary["total_particular"],
                "Saldo": summary["balance"],
            }
        ]
    )

    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        patient_df.to_excel(writer, index=False, sheet_name="Dados do Paciente")
        if selected_type in {"general", "records"}:
            pd.DataFrame(records_rows or [{"Mensagem": "Nenhum prontuario encontrado."}]).to_excel(
                writer, index=False, sheet_name="Prontuarios"
            )
        if selected_type in {"general", "appointments"}:
            pd.DataFrame(appointments_rows or [{"Mensagem": "Nenhum agendamento encontrado."}]).to_excel(
                writer, index=False, sheet_name="Agendamentos"
            )
        if selected_type == "general":
            pd.DataFrame(financial_rows or [{"Mensagem": "Nenhum lancamento financeiro encontrado."}]).to_excel(
                writer, index=False, sheet_name="Financeiro"
            )
            summary_df.to_excel(writer, index=False, sheet_name="Resumo")

    output.seek(0)
    filename = f"relatorio_{selected_type}_{patient_id}_{start_date}_{end_date}.xlsx"
    return output, filename


def generate_financial_pdf(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    entries = _fetch_financial_entries(patient_id, start_date, end_date)
    summary = _financial_summary(entries)

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
    line(f"CPF: {_format_cpf(patient.get('cpf'))}")
    line(f"Periodo: {start_date} ate {end_date}")
    y -= 6

    section_title("Resumo Financeiro")
    line(f"Total de lancamentos: {len(entries)}")
    line(f"Saldo atual: {_money(summary['balance'])}")
    line(f"Valor pago: {_money(summary['total_paid'])}")
    line(f"Pendencias: {_money(summary['total_pending'])}")
    line(f"Atrasos: {_money(summary['total_overdue'])}")
    line(f"Convenio: {_money(summary['total_convenio'])}")
    line(f"Particular: {_money(summary['total_particular'])}")
    y -= 6

    section_title("Pagamentos no Periodo")
    if not entries:
        line("Nenhum pagamento encontrado no periodo selecionado.")
    for entry in entries:
        line(
            f"- Data: {_safe_value(entry.get('data'))} | Valor: {_money(entry.get('valor'))} | Status: {_safe_value(entry.get('status'))}",
            indent=10,
        )
        line(f"  Atendimento: {_care_type_label(entry.get('forma_atendimento'))}", indent=10)
        line(f"  Metodo: {_safe_value(entry.get('metodo_pagamento'))}", indent=10)
        line(f"  Convenio: {_safe_value(entry.get('convenio_nome'))}", indent=10)
        line(f"  Plano: {_safe_value(entry.get('plano_convenio'))}", indent=10)
        line(f"  Observacoes: {_safe_value(entry.get('observacoes'))}", indent=10)
        y -= 4

    pdf.save()
    buffer.seek(0)
    filename = f"relatorio_financeiro_{patient_id}_{start_date}_{end_date}.pdf"
    return buffer, filename


def generate_financial_excel(patient_id: str, start_date: str, end_date: str) -> tuple[BytesIO, str]:
    patient = _fetch_patient(patient_id)
    entries = _fetch_financial_entries(patient_id, start_date, end_date)

    rows = [
        {
            "Paciente": _safe_value(patient.get("nome")),
            "CPF": _format_cpf(patient.get("cpf")),
            "Data": _safe_value(entry.get("data")),
            "Valor": float(entry.get("valor") or 0),
            "Tipo": _safe_value(entry.get("transaction_type") or "payment"),
            "Forma de Atendimento": _care_type_label(entry.get("forma_atendimento")),
            "Status": _safe_value(entry.get("status")),
            "Metodo de Pagamento": _safe_value(entry.get("metodo_pagamento")),
            "Convenio": _safe_value(entry.get("convenio_nome")),
            "Plano": _safe_value(entry.get("plano_convenio")),
            "Observacoes": _safe_value(entry.get("observacoes")),
            "Data do Registro": _safe_value(entry.get("created_at")),
        }
        for entry in entries
    ]

    financial_df = pd.DataFrame(rows or [{"Mensagem": "Nenhum pagamento encontrado no periodo selecionado."}])
    output = BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        financial_df.to_excel(writer, index=False, sheet_name="Relatorio Financeiro")

    output.seek(0)
    filename = f"relatorio_financeiro_{patient_id}_{start_date}_{end_date}.xlsx"
    return output, filename
