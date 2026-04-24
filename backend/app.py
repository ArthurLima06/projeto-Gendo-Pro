import logging
import os
import re
import sqlite3
import unicodedata
import uuid
from datetime import datetime
from io import BytesIO
from urllib.parse import quote

import pandas as pd
from flask import Flask, abort, jsonify, request, send_file, send_from_directory, url_for
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from werkzeug.utils import secure_filename

from config.settings import DATABASE_DIR
from backend.database import close_db, get_db, init_db
from backend.routes import reports_bp

print("BACKEND SERVER STARTED")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

def create_app():

    app = Flask(
        __name__,
        static_folder="static",
        static_url_path="",
    )
    app.logger.setLevel(logging.INFO)
    app.logger.info("Initializing Gendo Pro API at %s", datetime.utcnow().isoformat())

    app.config.from_mapping(
        DATABASE=str(DATABASE_DIR / "database.db"),
        JSONIFY_PRETTYPRINT_REGULAR=False,
    )

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    app.register_blueprint(reports_bp)

    def row_to_dict(row):
        return dict(row) if row else None

    def records_to_dataframe(rows, columns=None):
        records = [dict(row) for row in rows]
        if not records:
            return pd.DataFrame(columns=columns or [])
        return pd.DataFrame.from_records(records)

    def dataframe_to_excel_response(df, sheet_name, filename):
        output = BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name=sheet_name)
        output.seek(0)
        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )

    def build_patient_pdf(patient, sessoes):
        buffer = BytesIO()
        doc = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        margin = 50
        y = height - margin

        def add_line(text, bold=False, size=11):
            nonlocal y
            if y < margin + 40:
                doc.showPage()
                y = height - margin
            font = "Helvetica-Bold" if bold else "Helvetica"
            doc.setFont(font, size)
            doc.drawString(margin, y, text)
            y -= size + 4

        add_line(f"Relatório de evolução - {patient['nome']}", bold=True, size=16)
        add_line(f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}", size=10)
        add_line("-", size=8)
        meta = [
            ("Idade", patient.get("idade")),
            ("Escola", patient.get("escola")),
            ("Responsável", patient.get("responsavel")),
            ("Telefone", patient.get("telefone")),
            ("Email", patient.get("email")),
        ]
        for label, value in meta:
            if value:
                add_line(f"{label}: {value}", size=10)
        add_line("-", size=8)

        doc.setFont("Helvetica-Bold", 12)
        doc.drawString(margin, y, "Sessões registradas")
        y -= 24

        if not sessoes:
            add_line("Nenhuma sessão registrada.", size=11)
        else:
            for sess in sessoes:
                if y < margin + 70:
                    doc.showPage()
                    y = height - margin
                add_line(f"Data: {sess.get('data') or ''} | Atividade: {sess.get('atividade') or '—'}", bold=True)
                add_line(f"Evolução: {sess.get('evolucao') or '—'}", size=10)
                notes = sess.get("observacoes")
                if notes:
                    add_line(f"Observações: {notes}", size=10)
                y -= 6

        doc.save()
        buffer.seek(0)
        return buffer

    def json_payload():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            abort(400, description="É necessário enviar um JSON válido.")
        return data

    def is_blank(value):
        if value is None:
            return True
        if isinstance(value, str):
            return value.strip() == ""
        return False

    def require_fields(data, fields):
        missing = [field for field in fields if is_blank(data.get(field))]
        if missing:
            abort(400, description=f"Campos obrigatórios faltando: {', '.join(missing)}.")

    def parse_float(field_name, value):
        if value is None or value == "":
            abort(400, description=f"{field_name} é obrigatório.")
        try:
            return float(value)
        except (TypeError, ValueError):
            abort(400, description=f"{field_name} precisa ser numérico.")

    def ensure_patient_exists(db, paciente_id):
        row = db.execute("SELECT 1 FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        if row is None:
            abort(400, description="Paciente não encontrado.")

    def fetch_patient_name(db, paciente_id):
        row = db.execute("SELECT nome FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        return row["nome"] if row else None

    def patient_row_to_payload(row):
        if row is None:
            return None
        columns = set(row.keys())
        age_value = row["idade"]
        updated_at = row["updated_at"] if "updated_at" in columns and row["updated_at"] else row["created_at"]
        return {
            "id": row["id"],
            "name": row["nome"],
            "age": str(age_value) if age_value is not None else None,
            "school": row["escola"],
            "responsible": row["responsavel"],
            "phone": row["telefone"],
            "email": row["email"],
            "notes": row["observacoes"],
            "createdAt": row["created_at"],
            "updatedAt": updated_at,
        }

    def find_patient_by_name(db, name):
        if not name:
            return None
        return db.execute(
            "SELECT id, nome FROM pacientes WHERE nome = ? COLLATE NOCASE LIMIT 1",
            (name,),
        ).fetchone()

    def appointment_row_to_payload(row):
        if row is None:
            return None
        return {
            "id": row["id"],
            "patient": row["nome"],
            "date": row["data"],
            "time": row["horario"],
            "professional": row["profissional"],
            "reason": row["motivo"],
            "notes": row["observacoes"],
            "status": row["status"],
        }

    def medical_record_row_to_payload(row):
        if row is None:
            return None
        patient_name = row["paciente_nome"] or ""
        return {
            "id": row["id"],
            "patient": patient_name,
            "date": row["data"],
            "time": row["hora"],
            "reason": row["observacoes"],
            "notes": row["observacoes"],
            "registeredAt": row["created_at"],
        }

    def financial_row_to_payload(row):
        if row is None:
            return None
        amount = row["valor"] or 0
        return {
            "id": row["id"],
            "patient": row["nome"],
            "date": row["data"],
            "amount": f"{amount:.2f}",
            "status": row["status"],
            "registeredAt": row["created_at"],
        }

    def notification_row_to_payload(row):
        return {
            "id": row["id"],
            "title": row["title"],
            "description": row["description"],
            "date": row["date"],
            "read": bool(row["read"]),
            "linkedDate": row["linked_date"],
        }

    def create_notification(db, title, description, linked_date=None):
        notification_id = str(uuid.uuid4())
        now = datetime.utcnow()
        display_date = now.strftime("%d/%m/%Y %H:%M")
        db.execute(
            """
            INSERT INTO notifications
            (id, title, description, date, read, linked_date, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                notification_id,
                title,
                description,
                display_date,
                0,
                linked_date,
                now.isoformat(),
            ),
        )
        return notification_id

    # ----------------------
    # PÁGINAS HTML
    # ----------------------

    @app.route("/favicon.ico")
    def favicon():
        return app.send_static_file("favicon.ico")

    @app.route("/robots.txt")
    def robots():
        return app.send_static_file("robots.txt")

    @app.route("/assets/<path:filename>")
    def assets(filename):
        assets_dir = os.path.join(app.static_folder, "assets")
        return send_from_directory(assets_dir, filename)

    # ----------------------
    # PACIENTES
    # ----------------------

    @app.route("/api/pacientes", methods=["GET"])
    def list_pacientes():

        db = get_db()

        rows = db.execute(
            "SELECT * FROM pacientes ORDER BY nome"
        ).fetchall()

        return jsonify([row_to_dict(r) for r in rows])

    @app.route("/api/pacientes", methods=["POST"])
    def create_paciente():

        data = json_payload()

        require_fields(data, ["nome"])

        new_id = str(uuid.uuid4())

        db = get_db()

        db.execute(
            """
            INSERT INTO pacientes
            (id, nome, idade, escola, responsavel, telefone, email, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("nome"),
                data.get("idade"),
                data.get("escola"),
                data.get("responsavel"),
                data.get("telefone"),
                data.get("email"),
                data.get("observacoes"),
                datetime.utcnow().isoformat(),
            ),
        )

        db.commit()

        return jsonify({"id": new_id})

    @app.route("/api/pacientes/<paciente_id>", methods=["GET"])
    def get_paciente(paciente_id):
        db = get_db()
        row = db.execute(
            "SELECT * FROM pacientes WHERE id = ?", (paciente_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Paciente não encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/pacientes/<paciente_id>", methods=["PATCH"])
    def update_paciente(paciente_id):
        data = json_payload()

        allowed_columns = [
            "nome",
            "idade",
            "escola",
            "responsavel",
            "telefone",
            "email",
            "observacoes",
        ]

        updates = {col: data[col] for col in allowed_columns if col in data}
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")

        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = list(updates.values()) + [paciente_id]

        db = get_db()
        cursor = db.execute(
            f"UPDATE pacientes SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Paciente não encontrado.")
        db.commit()

        return jsonify({"id": paciente_id})

    @app.route("/api/pacientes/<paciente_id>", methods=["DELETE"])
    def delete_paciente(paciente_id):
        db = get_db()
        cursor = db.execute("DELETE FROM pacientes WHERE id = ?", (paciente_id,))
        if cursor.rowcount == 0:
            abort(404, description="Paciente não encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/patients", methods=["GET"])
    def get_patients():
        db = get_db()
        rows = db.execute("SELECT * FROM pacientes ORDER BY nome").fetchall()
        payload = [patient_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/patients", methods=["POST"])
    def create_patient_v2():
        data = json_payload()
        require_fields(data, ["name", "phone", "email"])
        age_value = data.get("age")
        if age_value is not None and age_value != "":
            try:
                age_value = int(age_value)
            except (TypeError, ValueError):
                abort(400, description="Idade precisa ser numérica.")
        else:
            age_value = None

        new_id = str(uuid.uuid4())
        db = get_db()
        db.execute(
            """
            INSERT INTO pacientes
            (id, nome, idade, escola, responsavel, telefone, email, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("name"),
                age_value,
                data.get("school"),
                data.get("responsible"),
                data.get("phone"),
                data.get("email"),
                data.get("notes"),
                datetime.utcnow().isoformat(),
            ),
        )
        db.commit()
        patient = db.execute("SELECT * FROM pacientes WHERE id = ?", (new_id,)).fetchone()
        return jsonify({"success": True, "data": patient_row_to_payload(patient)})

    @app.route("/api/patients/<patient_id>", methods=["PUT"])
    def update_patient_v2(patient_id):
        data = json_payload()
        mapping = {
            "name": "nome",
            "age": "idade",
            "school": "escola",
            "responsible": "responsavel",
            "phone": "telefone",
            "email": "email",
            "notes": "observacoes",
        }
        updates = []
        params = []
        for field, column in mapping.items():
            if field in data:
                value = data[field]
                if field == "age":
                    if value is not None and value != "":
                        try:
                            value = int(value)
                        except (TypeError, ValueError):
                            abort(400, description="Idade precisa ser numérica.")
                    else:
                        value = None
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")
        params.append(patient_id)

        db = get_db()
        cursor = db.execute(
            f"UPDATE pacientes SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Paciente não encontrado.")
        db.commit()

        patient = db.execute("SELECT * FROM pacientes WHERE id = ?", (patient_id,)).fetchone()
        return jsonify({"success": True, "data": patient_row_to_payload(patient)})

    @app.route("/api/patients/<patient_id>", methods=["DELETE"])
    def delete_patient_v2(patient_id):
        db = get_db()
        cursor = db.execute("DELETE FROM pacientes WHERE id = ?", (patient_id,))
        if cursor.rowcount == 0:
            abort(404, description="Paciente não encontrado.")
        db.commit()
        return jsonify({"success": True, "data": {"id": patient_id}})

    # ----------------------
    # AGENDA
    # ----------------------

    @app.route("/api/agenda", methods=["GET"])
    def list_agenda():

        db = get_db()

        rows = db.execute(
            "SELECT * FROM agenda ORDER BY data, horario"
        ).fetchall()

        return jsonify([row_to_dict(r) for r in rows])

    @app.route("/api/agenda", methods=["POST"])
    def create_agenda():

        data = json_payload()

        require_fields(data, ["paciente_id", "data", "horario"])

        db = get_db()

        ensure_patient_exists(db, data.get("paciente_id"))

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO agenda
            (id, paciente_id, data, horario, status, motivo, profissional, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("data"),
                data.get("horario"),
                data.get("status", "agendado"),
                data.get("motivo"),
                data.get("profissional"),
                data.get("observacoes"),
                datetime.utcnow().isoformat(),
            ),
        )

        db.commit()

        return jsonify({"id": new_id})

    @app.route("/api/agenda/<agenda_id>", methods=["GET"])
    def get_agenda(agenda_id):
        db = get_db()
        row = db.execute(
            "SELECT * FROM agenda WHERE id = ?", (agenda_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Agendamento não encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/agenda/<agenda_id>", methods=["PATCH"])
    def update_agenda(agenda_id):
        data = json_payload()
        allowed = ["paciente_id", "data", "horario", "status", "motivo", "profissional", "observacoes"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [agenda_id]

        cursor = db.execute(
            f"UPDATE agenda SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Agendamento não encontrado.")
        db.commit()

        return jsonify({"id": agenda_id})

    @app.route("/api/agenda/<agenda_id>", methods=["DELETE"])
    def delete_agenda(agenda_id):
        db = get_db()
        cursor = db.execute("DELETE FROM agenda WHERE id = ?", (agenda_id,))
        if cursor.rowcount == 0:
            abort(404, description="Agendamento não encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/appointments", methods=["GET"])
    def get_appointments():
        db = get_db()
        rows = db.execute(
            """
            SELECT a.*, p.nome
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            ORDER BY a.data, a.horario
            """
        ).fetchall()
        payload = [appointment_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/appointments", methods=["POST"])
    def create_appointment_v2():
        data = json_payload()
        require_fields(data, ["patient", "date", "time"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente não encontrado.")

        new_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO agenda
            (id, paciente_id, data, horario, status, motivo, profissional, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient["id"],
                data.get("date"),
                data.get("time"),
                data.get("status", "agendado"),
                data.get("reason"),
                data.get("professional"),
                data.get("notes"),
                datetime.utcnow().isoformat(),
            ),
        )
        create_notification(
            db,
            "Novo agendamento",
            f"{patient['nome']} às {data.get('time')} em {data.get('date')}",
            linked_date=data.get("date"),
        )
        db.commit()

        row = db.execute(
            """
            SELECT a.*, p.nome
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            WHERE a.id = ?
            """,
            (new_id,),
        ).fetchone()

        return jsonify({"success": True, "data": appointment_row_to_payload(row)})

    @app.route("/api/appointments/<appointment_id>", methods=["PUT"])
    def update_appointment_v2(appointment_id):
        data = json_payload()
        mapping = {
            "patient": "paciente_id",
            "date": "data",
            "time": "horario",
            "professional": "profissional",
            "reason": "motivo",
            "notes": "observacoes",
            "status": "status",
        }
        updates = []
        params = []
        db = get_db()
        for field, column in mapping.items():
            if field in data:
                value = data[field]
                if field == "patient":
                    patient = find_patient_by_name(db, value)
                    if patient is None:
                        abort(400, description="Paciente não encontrado.")
                    value = patient["id"]
                updates.append(f"{column} = ?")
                params.append(value)
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")
        params.append(appointment_id)

        cursor = db.execute(
            f"UPDATE agenda SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Agendamento não encontrado.")
        db.commit()

        row = db.execute(
            """
            SELECT a.*, p.nome
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            WHERE a.id = ?
            """,
            (appointment_id,),
        ).fetchone()

        return jsonify({"success": True, "data": appointment_row_to_payload(row)})

    @app.route("/api/appointments/<appointment_id>", methods=["DELETE"])
    def delete_appointment_v2(appointment_id):
        db = get_db()
        cursor = db.execute("DELETE FROM agenda WHERE id = ?", (appointment_id,))
        if cursor.rowcount == 0:
            abort(404, description="Agendamento não encontrado.")
        db.commit()
        return jsonify({"success": True, "data": {"id": appointment_id}})

    # ----------------------
    # SESSÕES
    # ----------------------

    @app.route("/api/sessoes", methods=["GET"])
    def list_sessoes():

        db = get_db()

        rows = db.execute(
            "SELECT * FROM sessoes ORDER BY data DESC"
        ).fetchall()

        return jsonify([row_to_dict(r) for r in rows])

    @app.route("/api/sessoes", methods=["POST"])
    def create_sessao():

        data = json_payload()

        require_fields(data, ["paciente_id", "data"])

        db = get_db()

        ensure_patient_exists(db, data.get("paciente_id"))

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO sessoes
            (id, paciente_id, data, atividade, observacoes, evolucao, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("data"),
                data.get("atividade"),
                data.get("observacoes"),
                data.get("evolucao"),
                datetime.utcnow().isoformat(),
            ),
        )

        db.commit()

        return jsonify({"id": new_id})

    @app.route("/api/sessoes/<sessao_id>", methods=["GET"])
    def get_sessao(sessao_id):
        db = get_db()
        row = db.execute(
            "SELECT * FROM sessoes WHERE id = ?", (sessao_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Sessão não encontrada.")
        return jsonify(row_to_dict(row))

    @app.route("/api/sessoes/<sessao_id>", methods=["PATCH"])
    def update_sessao(sessao_id):
        data = json_payload()
        allowed = ["paciente_id", "data", "atividade", "observacoes", "evolucao"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [sessao_id]

        cursor = db.execute(
            f"UPDATE sessoes SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Sessão não encontrada.")
        db.commit()

        return jsonify({"id": sessao_id})

    @app.route("/api/sessoes/<sessao_id>", methods=["DELETE"])
    def delete_sessao(sessao_id):
        db = get_db()
        cursor = db.execute("DELETE FROM sessoes WHERE id = ?", (sessao_id,))
        if cursor.rowcount == 0:
            abort(404, description="Sessão não encontrada.")
        db.commit()
        return "", 204

    # ----------------------
    # FINANCEIRO
    # ----------------------

    @app.route("/api/financeiro", methods=["GET"])
    def list_financeiro():

        db = get_db()

        rows = db.execute(
            "SELECT * FROM financeiro ORDER BY data DESC"
        ).fetchall()

        return jsonify([row_to_dict(r) for r in rows])

    @app.route("/api/financeiro", methods=["POST"])
    def create_financeiro():

        data = json_payload()

        require_fields(data, ["paciente_id", "data", "valor", "status"])

        db = get_db()

        ensure_patient_exists(db, data.get("paciente_id"))

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO financeiro
            (id, paciente_id, data, valor, status, metodo_pagamento, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("data"),
                parse_float("valor", data.get("valor")),
                data.get("status"),
                data.get("metodo_pagamento"),
                data.get("observacoes"),
                datetime.utcnow().isoformat(),
            ),
        )

        db.commit()

        return jsonify({"id": new_id})

    @app.route("/api/financeiro/<lancamento_id>", methods=["GET"])
    def get_financeiro(lancamento_id):
        db = get_db()
        row = db.execute(
            "SELECT * FROM financeiro WHERE id = ?", (lancamento_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Lançamento não encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/financeiro/<lancamento_id>", methods=["PATCH"])
    def update_financeiro(lancamento_id):
        data = json_payload()
        allowed = ["paciente_id", "data", "valor", "status", "metodo_pagamento", "observacoes"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])

        if "valor" in updates:
            updates["valor"] = parse_float("valor", updates["valor"])

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [lancamento_id]

        cursor = db.execute(
            f"UPDATE financeiro SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Lançamento não encontrado.")
        db.commit()

        return jsonify({"id": lancamento_id})

    @app.route("/api/financeiro/<lancamento_id>", methods=["DELETE"])
    def delete_financeiro(lancamento_id):
        db = get_db()
        cursor = db.execute("DELETE FROM financeiro WHERE id = ?", (lancamento_id,))
        if cursor.rowcount == 0:
            abort(404, description="Lançamento não encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/financial", methods=["GET"])
    def get_financial():
        db = get_db()
        rows = db.execute(
            """
            SELECT f.*, p.nome
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            ORDER BY f.data DESC
            """
        ).fetchall()
        payload = [financial_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/financial", methods=["POST"])
    def create_financial_record_v2():
        data = json_payload()
        require_fields(data, ["patient", "date", "amount", "status"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente não encontrado.")

        amount_value = parse_float("amount", data.get("amount"))
        new_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO financeiro
            (id, paciente_id, data, valor, status, metodo_pagamento, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient["id"],
                data.get("date"),
                amount_value,
                data.get("status"),
                data.get("method"),
                data.get("notes"),
                datetime.utcnow().isoformat(),
            ),
        )
        create_notification(
            db,
            "Novo pagamento",
            f"{patient['nome']} - R$ {amount_value:.2f}",
            linked_date=data.get("date"),
        )
        db.commit()

        row = db.execute(
            """
            SELECT f.*, p.nome
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            WHERE f.id = ?
            """,
            (new_id,),
        ).fetchone()
        return jsonify({"success": True, "data": financial_row_to_payload(row)})

    # ----------------------
    # REGISTROS
    # ----------------------

    @app.route("/api/registros", methods=["GET"])
    def list_registros():

        db = get_db()

        rows = db.execute(
            """
            SELECT * FROM registros
            ORDER BY data DESC, hora DESC
            """
        ).fetchall()

        return jsonify([row_to_dict(r) for r in rows])

    @app.route("/api/registros", methods=["POST"])
    def create_registro():

        data = json_payload()

        require_fields(data, ["paciente_id", "data", "hora"])

        db = get_db()

        ensure_patient_exists(db, data.get("paciente_id"))

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO registros
            (id, paciente_id, paciente_nome, data, hora, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("paciente_nome") or fetch_patient_name(db, data.get("paciente_id")),
                data.get("data"),
                data.get("hora"),
                data.get("observacoes"),
                datetime.utcnow().isoformat(),
            ),
        )

        db.commit()

        return jsonify({"id": new_id})

    @app.route("/api/registros/<registro_id>", methods=["GET"])
    def get_registro(registro_id):
        db = get_db()
        row = db.execute(
            "SELECT * FROM registros WHERE id = ?", (registro_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Registro não encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/registros/<registro_id>", methods=["PATCH"])
    def update_registro(registro_id):
        data = json_payload()
        allowed = ["paciente_id", "paciente_nome", "data", "hora", "observacoes"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo válido para atualização.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])
            if "paciente_nome" not in updates:
                updates["paciente_nome"] = fetch_patient_name(db, updates["paciente_id"])

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [registro_id]

        cursor = db.execute(
            f"UPDATE registros SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Registro não encontrado.")
        db.commit()

        return jsonify({"id": registro_id})

    @app.route("/api/registros/<registro_id>", methods=["DELETE"])
    def delete_registro(registro_id):
        db = get_db()
        cursor = db.execute("DELETE FROM registros WHERE id = ?", (registro_id,))
        if cursor.rowcount == 0:
            abort(404, description="Registro não encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/records", methods=["GET"])
    def get_records():
        db = get_db()
        rows = db.execute(
            """
            SELECT r.*
            FROM registros r
            ORDER BY data DESC, hora DESC
            """
        ).fetchall()
        payload = [medical_record_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/records", methods=["POST"])
    def create_record_v2():
        data = json_payload()
        require_fields(data, ["patient", "date", "time"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente não encontrado.")

        new_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO registros
            (id, paciente_id, paciente_nome, data, hora, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient["id"],
                patient["nome"],
                data.get("date"),
                data.get("time"),
                data.get("notes"),
                datetime.utcnow().isoformat(),
            ),
        )
        db.commit()

        row = db.execute("SELECT * FROM registros WHERE id = ?", (new_id,)).fetchone()
        return jsonify({"success": True, "data": medical_record_row_to_payload(row)})

    @app.route("/api/search", methods=["GET"])
    def global_search():
        print("SEARCH REQUEST RECEIVED:", request.args.get("q"))
        raw_query = (request.args.get("q") or "").strip()
        empty_payload = {
            "patients": [],
            "appointments": [],
            "records": [],
            "payments": [],
            "reports": [],
            "pages": [],
        }
        if not raw_query:
            return jsonify(empty_payload)

        db = get_db()

        def normalize_text(value):
            if value is None:
                return ""
            text = unicodedata.normalize("NFKD", str(value).strip().lower())
            return "".join(ch for ch in text if not unicodedata.combining(ch))

        def escape_like(value):
            return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

        db.create_function("normalize_text", 1, normalize_text)

        def distinct_non_empty(values):
            seen = set()
            items = []
            for value in values:
                if not value:
                    continue
                if value in seen:
                    continue
                seen.add(value)
                items.append(value)
            return items

        def build_search_terms(query):
            normalized_query = normalize_text(query)
            terms = [normalized_query]

            if re.fullmatch(r"\d{1,2}/\d{1,2}", normalized_query):
                day_raw, month_raw = normalized_query.split("/")
                day = int(day_raw)
                month = int(month_raw)
                if 1 <= day <= 31 and 1 <= month <= 12:
                    terms.extend(
                        [
                            f"{day:02d}/{month:02d}",
                            f"-{month:02d}-{day:02d}",
                        ]
                    )

            month_aliases = {
                "janeiro": 1,
                "jan": 1,
                "fevereiro": 2,
                "fev": 2,
                "marco": 3,
                "mar": 3,
                "abril": 4,
                "abr": 4,
                "maio": 5,
                "mai": 5,
                "junho": 6,
                "jun": 6,
                "julho": 7,
                "jul": 7,
                "agosto": 8,
                "ago": 8,
                "setembro": 9,
                "set": 9,
                "outubro": 10,
                "out": 10,
                "novembro": 11,
                "nov": 11,
                "dezembro": 12,
                "dez": 12,
                "march": 3,
                "april": 4,
            }
            month_number = month_aliases.get(normalized_query)
            if month_number:
                terms.extend(
                    [
                        f"-{month_number:02d}-",
                        f"/{month_number:02d}",
                    ]
                )

            if normalized_query in {"today", "hoje"}:
                today = datetime.now()
                terms.extend(
                    [
                        today.strftime("%Y-%m-%d"),
                        today.strftime("%d/%m"),
                        today.strftime("%Y"),
                        f"-{today.strftime('%m')}-",
                    ]
                )

            return distinct_non_empty(terms)

        def build_like_where(columns, terms):
            conditions = []
            params = []
            for column in columns:
                normalized_column = f"normalize_text({column})"
                for term in terms:
                    conditions.append(f"{normalized_column} LIKE ? ESCAPE '\\'")
                    params.append(f"%{escape_like(term)}%")
            if not conditions:
                return "1 = 0", []
            return " OR ".join(conditions), params

        def query_table_columns(table_name):
            rows = db.execute(f"PRAGMA table_info({table_name})").fetchall()
            return {row["name"] for row in rows}

        def build_path(base_path, params=None):
            if not params:
                return base_path
            query_parts = []
            for key, value in params.items():
                if value is None or str(value).strip() == "":
                    continue
                query_parts.append(f"{key}={quote(str(value))}")
            if not query_parts:
                return base_path
            return f"{base_path}?{'&'.join(query_parts)}"

        search_terms = build_search_terms(raw_query)
        if not search_terms:
            return jsonify(empty_payload)

        table_columns = {
            "pacientes": query_table_columns("pacientes"),
            "agenda": query_table_columns("agenda"),
            "registros": query_table_columns("registros"),
            "financeiro": query_table_columns("financeiro"),
        }

        patients_columns = []
        for col in ["nome", "telefone", "cpf", "email"]:
            if col in table_columns["pacientes"]:
                patients_columns.append(f"p.{col}")
        patient_where, patient_params = build_like_where(patients_columns, search_terms)
        patients_rows = db.execute(
            f"""
            SELECT p.id, p.nome, p.telefone, p.email
            FROM pacientes p
            WHERE {patient_where}
            ORDER BY p.nome
            LIMIT 10
            """,
            patient_params,
        ).fetchall()

        appointment_columns = ["p.nome"]
        for col in ["data", "horario", "status"]:
            if col in table_columns["agenda"]:
                appointment_columns.append(f"a.{col}")
        appointment_where, appointment_params = build_like_where(appointment_columns, search_terms)
        appointments_rows = db.execute(
            f"""
            SELECT a.id, p.nome AS paciente_nome, a.data, a.horario, a.status
            FROM agenda a
            LEFT JOIN pacientes p ON p.id = a.paciente_id
            WHERE {appointment_where}
            ORDER BY a.data DESC, a.horario DESC
            LIMIT 10
            """,
            appointment_params,
        ).fetchall()

        record_columns = []
        for col in ["paciente_nome", "observacoes", "data"]:
            if col in table_columns["registros"]:
                record_columns.append(f"r.{col}")
        record_where, record_params = build_like_where(record_columns, search_terms)
        records_rows = db.execute(
            f"""
            SELECT r.id, r.paciente_nome, r.observacoes, r.data
            FROM registros r
            WHERE {record_where}
            ORDER BY r.data DESC, r.created_at DESC
            LIMIT 10
            """,
            record_params,
        ).fetchall()

        payment_columns = ["p.nome"]
        for col in ["observacoes", "data", "status"]:
            if col in table_columns["financeiro"]:
                payment_columns.append(f"f.{col}")
        if "valor" in table_columns["financeiro"]:
            payment_columns.append("CAST(f.valor AS TEXT)")
        payment_where, payment_params = build_like_where(payment_columns, search_terms)
        payments_rows = db.execute(
            f"""
            SELECT f.id, p.nome AS paciente_nome, f.observacoes, f.data, f.status, f.valor
            FROM financeiro f
            LEFT JOIN pacientes p ON p.id = f.paciente_id
            WHERE {payment_where}
            ORDER BY f.data DESC, f.created_at DESC
            LIMIT 10
            """,
            payment_params,
        ).fetchall()

        report_catalog_query = """
            WITH report_catalog AS (
                SELECT
                    'patient-pdf' AS id,
                    'Relatorio do Paciente' AS report_name,
                    'PDF' AS report_type,
                    COALESCE((SELECT SUBSTR(MAX(created_at), 1, 10) FROM pacientes), '') AS report_date,
                    '/reports' AS report_path
                UNION ALL
                SELECT
                    'patients-excel' AS id,
                    'Exportacao de Pacientes' AS report_name,
                    'Excel' AS report_type,
                    COALESCE((SELECT SUBSTR(MAX(created_at), 1, 10) FROM pacientes), '') AS report_date,
                    '/reports' AS report_path
                UNION ALL
                SELECT
                    'appointments-excel' AS id,
                    'Exportacao de Agenda' AS report_name,
                    'Excel' AS report_type,
                    COALESCE((SELECT MAX(data) FROM agenda), '') AS report_date,
                    '/reports' AS report_path
                UNION ALL
                SELECT
                    'financial-excel' AS id,
                    'Exportacao Financeira' AS report_name,
                    'Excel' AS report_type,
                    COALESCE((SELECT MAX(data) FROM financeiro), '') AS report_date,
                    '/reports' AS report_path
            )
        """
        reports_where, report_params = build_like_where(
            ["report_name", "report_type", "report_date"], search_terms
        )
        reports_rows = db.execute(
            f"""
            {report_catalog_query}
            SELECT id, report_name, report_type, report_date, report_path
            FROM report_catalog
            WHERE {reports_where}
            LIMIT 10
            """,
            report_params,
        ).fetchall()

        static_pages = [
            {"id": "dashboard", "name": "Dashboard", "path": "/dashboard", "keywords": ["painel"]},
            {
                "id": "patient-registration",
                "name": "Cadastro de Pacientes",
                "path": "/patients/register",
                "keywords": ["cadastro", "paciente", "registrar"],
            },
            {
                "id": "scheduling",
                "name": "Agendamento",
                "path": "/scheduling",
                "keywords": ["agenda", "consulta"],
            },
            {
                "id": "records",
                "name": "Prontuarios",
                "path": "/records",
                "keywords": ["registro", "historico"],
            },
            {
                "id": "patients",
                "name": "Lista de Pacientes",
                "path": "/patients",
                "keywords": ["pacientes", "lista"],
            },
            {
                "id": "reports",
                "name": "Relatorios",
                "path": "/reports",
                "keywords": ["exportar", "pdf", "excel"],
            },
            {
                "id": "financial",
                "name": "Financeiro",
                "path": "/financial",
                "keywords": ["pagamento", "faturamento"],
            },
        ]

        page_results = []
        for page in static_pages:
            searchable = normalize_text(
                " ".join([page["name"], page["path"], " ".join(page["keywords"])])
            )
            if any(term in searchable for term in search_terms):
                page_results.append(
                    {
                        "id": page["id"],
                        "name": page["name"],
                        "type": "page",
                        "path": page["path"],
                        "extraInfo": "Navegacao do sistema",
                    }
                )
        page_results = page_results[:10]

        payload = {
            "patients": [
                {
                    "id": row["id"],
                    "name": row["nome"] or "Paciente",
                    "type": "patient",
                    "path": build_path(
                        "/patients",
                        {"search": raw_query, "patientId": row["id"]},
                    ),
                    "extraInfo": row["telefone"] or row["email"] or "",
                }
                for row in patients_rows
            ],
            "appointments": [
                {
                    "id": row["id"],
                    "name": row["paciente_nome"] or "Agendamento",
                    "type": "appointment",
                    "path": build_path(
                        "/scheduling",
                        {
                            "search": raw_query,
                            "date": row["data"],
                            "appointmentId": row["id"],
                        },
                    ),
                    "extraInfo": " ".join(
                        part
                        for part in [
                            row["data"] or "",
                            row["horario"] or "",
                            row["status"] or "",
                        ]
                        if part
                    ),
                }
                for row in appointments_rows
            ],
            "records": [
                {
                    "id": row["id"],
                    "name": row["paciente_nome"] or "Prontuario",
                    "type": "record",
                    "path": build_path(
                        "/records",
                        {"search": raw_query, "recordId": row["id"]},
                    ),
                    "extraInfo": " ".join(
                        part
                        for part in [row["data"] or "", row["observacoes"] or ""]
                        if part
                    ).strip(),
                }
                for row in records_rows
            ],
            "payments": [
                {
                    "id": row["id"],
                    "name": row["observacoes"] or (row["paciente_nome"] or "Pagamento"),
                    "type": "payment",
                    "path": build_path(
                        "/financial",
                        {"search": raw_query, "paymentId": row["id"]},
                    ),
                    "extraInfo": " ".join(
                        part
                        for part in [
                            row["paciente_nome"] or "",
                            row["data"] or "",
                            row["status"] or "",
                            f"R$ {float(row['valor'] or 0):.2f}",
                        ]
                        if part
                    ).strip(),
                }
                for row in payments_rows
            ],
            "reports": [
                {
                    "id": row["id"],
                    "name": row["report_name"],
                    "type": "report",
                    "path": build_path(
                        row["report_path"] or "/reports",
                        {"search": raw_query, "reportId": row["id"]},
                    ),
                    "extraInfo": " ".join(
                        part
                        for part in [row["report_type"] or "", row["report_date"] or ""]
                        if part
                    ).strip(),
                }
                for row in reports_rows
            ],
            "pages": page_results,
        }

        return jsonify(payload)

    # ----------------------
    # RELATÓRIO / EXPORTAÇÕES
    # ----------------------

    @app.route("/api/relatorio_pdf/<paciente_id>")
    def relatorio_pdf(paciente_id):
        db = get_db()
        patient_row = db.execute("SELECT * FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        if patient_row is None:
            abort(404, description="Paciente não encontrado.")
        sessoes = db.execute(
            """
            SELECT data, atividade, observacoes, evolucao
            FROM sessoes
            WHERE paciente_id = ?
            ORDER BY data DESC
            """,
            (paciente_id,),
        ).fetchall()

        patient = row_to_dict(patient_row)
        sessoes_data = [row_to_dict(s) for s in sessoes]

        pdf = build_patient_pdf(patient, sessoes_data)
        filename = secure_filename(f"relatorio_{patient.get('nome') or paciente_id}.pdf")
        if not filename:
            filename = f"relatorio_{paciente_id}.pdf"

        return send_file(
            pdf,
            as_attachment=True,
            download_name=filename,
            mimetype="application/pdf",
        )

    @app.route("/api/exportar/pacientes")
    def exportar_pacientes():
        db = get_db()
        rows = db.execute(
            """
            SELECT id, nome, idade, escola, responsavel, telefone, email, observacoes, created_at
            FROM pacientes
            ORDER BY nome
            """
        ).fetchall()
        df = records_to_dataframe(rows, columns=["id", "nome", "idade", "escola", "responsavel", "telefone", "email", "observacoes", "created_at"])
        return dataframe_to_excel_response(df, "Pacientes", "pacientes.xlsx")

    @app.route("/api/exportar/agenda")
    def exportar_agenda():
        db = get_db()
        rows = db.execute(
            """
            SELECT
                a.id,
                a.paciente_id,
                p.nome AS paciente_nome,
                a.data,
                a.horario,
                a.status,
                a.motivo,
                a.profissional,
                a.observacoes,
                a.created_at
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            ORDER BY a.data, a.horario
            """
        ).fetchall()
        df = records_to_dataframe(
            rows,
            columns=[
                "id",
                "paciente_id",
                "paciente_nome",
                "data",
                "horario",
                "status",
                "motivo",
                "profissional",
                "observacoes",
                "created_at",
            ],
        )
        return dataframe_to_excel_response(df, "Agenda", "agenda.xlsx")

    @app.route("/api/exportar/financeiro")
    def exportar_financeiro():
        db = get_db()
        rows = db.execute(
            """
            SELECT
                f.id,
                f.paciente_id,
                p.nome AS paciente_nome,
                f.data,
                f.valor,
                f.status,
                f.metodo_pagamento,
                f.observacoes,
                f.created_at
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            ORDER BY f.data DESC
            """
        ).fetchall()
        df = records_to_dataframe(
            rows,
            columns=[
                "id",
                "paciente_id",
                "paciente_nome",
                "data",
                "valor",
                "status",
                "metodo_pagamento",
                "observacoes",
                "created_at",
            ],
        )
        return dataframe_to_excel_response(df, "Financeiro", "financeiro.xlsx")

    @app.route("/api/dashboard")
    def get_dashboard():
        db = get_db()
        total_patients = db.execute("SELECT COUNT(*) AS total FROM pacientes").fetchone()["total"]
        total_appointments = db.execute("SELECT COUNT(*) AS total FROM agenda").fetchone()["total"]
        total_payments = db.execute("SELECT SUM(valor) AS total FROM financeiro").fetchone()["total"] or 0
        today_str = datetime.utcnow().strftime("%Y-%m-%d")
        today_rows = db.execute(
            """
            SELECT a.*, p.nome
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            WHERE a.data = ?
            ORDER BY a.horario
            """,
            (today_str,),
        ).fetchall()
        today_appointments = [appointment_row_to_payload(row) for row in today_rows]

        payments_rows = db.execute(
            """
            SELECT f.*, p.nome
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            ORDER BY f.data DESC
            LIMIT 4
            """
        ).fetchall()
        recent_payments = [financial_row_to_payload(row) for row in payments_rows]

        stats = [
            {"label": "Pacientes ativos", "value": str(total_patients), "icon": "Users", "change": "Atualizado hoje"},
            {"label": "Agendamentos", "value": str(total_appointments), "icon": "CalendarDays", "change": "Últimos 7 dias"},
            {"label": "Faturamento", "value": f"R$ {total_payments:,.2f}", "icon": "DollarSign", "change": "Este mês"},
            {"label": "Relatórios", "value": "Disponível", "icon": "FileText", "change": "Pronto para exportar"},
        ]

        summary = f"{total_patients} pacientes cadastrados · {total_appointments} consultas agendadas"
        return jsonify(
            {
                "success": True,
                "data": {
                    "stats": stats,
                    "todayAppointments": today_appointments,
                    "recentPayments": recent_payments,
                    "summary": summary,
                },
            }
        )

    @app.route("/api/notifications")
    def list_notifications():
        db = get_db()
        rows = db.execute("SELECT * FROM notifications ORDER BY created_at DESC").fetchall()
        payload = [notification_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/notifications/<notification_id>/read", methods=["PUT"])
    def mark_notification_read_endpoint(notification_id):
        db = get_db()
        cursor = db.execute("UPDATE notifications SET read = 1 WHERE id = ?", (notification_id,))
        if cursor.rowcount == 0:
            abort(404, description="Notificação não encontrada.")
        db.commit()
        return jsonify({"success": True, "data": {"success": True}})

    @app.route("/api/notifications/mark-all-read", methods=["POST"])
    def mark_all_notifications_read_endpoint():
        db = get_db()
        db.execute("UPDATE notifications SET read = 1 WHERE read = 0")
        db.commit()
        return jsonify({"success": True, "data": {"success": True}})

    @app.route("/api/reports/patient-pdf", methods=["POST"])
    def reports_patient_pdf():
        db = get_db()
        row = db.execute("SELECT id, nome FROM pacientes ORDER BY created_at DESC LIMIT 1").fetchone()
        if row is None:
            abort(400, description="Nenhum paciente cadastrado para gerar relatórios.")
        filename = secure_filename(f"relatorio_{row['nome']}.pdf") or f"relatorio_{row['id']}.pdf"
        url = url_for("relatorio_pdf", paciente_id=row["id"])
        return jsonify({"success": True, "data": {"url": url, "filename": filename}})

    @app.route("/api/reports/export-excel", methods=["POST"])
    def reports_export_excel():
        url = url_for("exportar_pacientes")
        return jsonify({"success": True, "data": {"url": url, "filename": "pacientes.xlsx"}})

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react_app(path):
        static_folder = app.static_folder

        if path != "" and os.path.exists(os.path.join(static_folder, path)):
            return send_from_directory(static_folder, path)

        return send_from_directory(static_folder, "index.html")

    @app.after_request
    def log_api_response(response):
        if request.path.startswith("/api") and response.status_code >= 400:
            app.logger.warning(
                "API response %s %s %s", request.method, request.path, response.status_code
            )
        return response

    @app.teardown_request
    def log_request_exception(exc):
        if exc:
            app.logger.error("Exception during request %s %s", request.method, request.path, exc_info=exc)

    return app


if __name__ == "__main__":

    app = create_app()
    app.logger.info("Starting Flask server (debug=%s)", app.debug)

    app.run(debug=True)

    
