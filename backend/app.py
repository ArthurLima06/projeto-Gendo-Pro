import logging
import os
import re
import sqlite3
import unicodedata
import uuid
import hashlib
import secrets
import json
from datetime import datetime, timedelta
from io import BytesIO
from urllib.parse import quote

import pandas as pd
from flask import Flask, abort, g, jsonify, request, send_file, send_from_directory, url_for
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash
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
    app.logger.info("Initializing GridTime API at %s", datetime.utcnow().isoformat())

    app.config.from_mapping(
        DATABASE=str(DATABASE_DIR / "database.db"),
        JSONIFY_PRETTYPRINT_REGULAR=False,
    )

    app.teardown_appcontext(close_db)

    with app.app_context():
        init_db()

    app.register_blueprint(reports_bp)
    VALID_ROLES = {"admin", "common"}
    SESSION_TTL_DAYS = 30
    PASSWORD_MIN_LENGTH = 8
    PATIENT_COMMON_FIELDS = {
        "id",
        "name",
        "cpf",
        "phone",
        "email",
        "careType",
        "agreementName",
        "agreementPlan",
        "createdAt",
        "updatedAt",
    }

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

        add_line(f"RelatÃ³rio de evoluÃ§Ã£o - {patient['nome']}", bold=True, size=16)
        add_line(f"Gerado em {datetime.utcnow().strftime('%d/%m/%Y %H:%M UTC')}", size=10)
        add_line("-", size=8)
        meta = [
            ("Idade", patient.get("idade")),
            ("Escola", patient.get("escola")),
            ("ResponsÃ¡vel", patient.get("responsavel")),
            ("Telefone", patient.get("telefone")),
            ("Email", patient.get("email")),
        ]
        for label, value in meta:
            if value:
                add_line(f"{label}: {value}", size=10)
        care_type = str(patient.get("forma_atendimento") or "particular").strip().lower()
        add_line(f"Tipo de Atendimento: {'Convenio' if care_type == 'convenio' else 'Particular'}", size=10)
        if care_type == "convenio":
            add_line(f"Convenio: {patient.get('convenio_nome') or '-'}", size=10)
            add_line(f"Plano: {patient.get('plano_convenio') or '-'}", size=10)
        add_line("-", size=8)

        doc.setFont("Helvetica-Bold", 12)
        doc.drawString(margin, y, "SessÃµes registradas")
        y -= 24

        if not sessoes:
            add_line("Nenhuma sessÃ£o registrada.", size=11)
        else:
            for sess in sessoes:
                if y < margin + 70:
                    doc.showPage()
                    y = height - margin
                add_line(f"Data: {sess.get('data') or ''} | Atividade: {sess.get('atividade') or 'â€”'}", bold=True)
                add_line(f"EvoluÃ§Ã£o: {sess.get('evolucao') or 'â€”'}", size=10)
                notes = sess.get("observacoes")
                if notes:
                    add_line(f"ObservaÃ§Ãµes: {notes}", size=10)
                y -= 6

        doc.save()
        buffer.seek(0)
        return buffer

    def json_payload():
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            abort(400, description="Ã‰ necessÃ¡rio enviar um JSON vÃ¡lido.")
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
            abort(400, description=f"Campos obrigatÃ³rios faltando: {', '.join(missing)}.")

    def parse_float(field_name, value):
        if value is None or value == "":
            abort(400, description=f"{field_name} Ã© obrigatÃ³rio.")
        try:
            return float(value)
        except (TypeError, ValueError):
            abort(400, description=f"{field_name} precisa ser numÃ©rico.")

    def parse_optional_float(field_name, value, default=None):
        if value is None or value == "":
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            abort(400, description=f"{field_name} precisa ser numÃ©rico.")

    def parse_boolean(value, field_name):
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return bool(value)
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes", "sim", "on"}:
                return True
            if normalized in {"false", "0", "no", "nao", "off"}:
                return False
        abort(400, description=f"{field_name} invalido. Use true ou false.")

    def parse_status(value):
        normalized = str(value or "").strip()
        if not normalized:
            return ""
        allowed = {"Pago", "Pendente", "Atrasado", "Convenio"}
        if normalized not in allowed:
            abort(400, description="status invalido. Use Pago, Pendente, Atrasado ou Convenio.")
        return normalized

    def parse_particular_status(value):
        normalized = parse_status(value)
        if normalized == "Convenio":
            abort(400, description="status invalido para atendimento particular.")
        return normalized

    def normalize_financial_amount(amount_value, status_value, care_type):
        normalized_care_type = str(care_type or "particular").strip().lower()
        numeric_amount = float(amount_value or 0)
        if normalized_care_type == "convenio":
            return numeric_amount

        normalized_status = str(status_value or "").strip()
        if normalized_status in {"Pendente", "Atrasado"}:
            return -abs(numeric_amount)
        if normalized_status == "Pago":
            return abs(numeric_amount)
        return numeric_amount

    def parse_care_type(value, required=True):
        normalized = str(value or "").strip().lower()
        if not normalized:
            if required:
                abort(400, description="forma_atendimento e obrigatoria.")
            return "particular"
        if normalized not in {"particular", "convenio"}:
            abort(400, description="forma_atendimento invalida. Use particular ou convenio.")
        return normalized

    def parse_agreement_status(value):
        normalized = str(value or "").strip().lower()
        if normalized not in {"ativo", "inativo"}:
            abort(400, description="status invalido. Use ativo ou inativo.")
        return normalized

    def parse_agreement_plans(raw_plans):
        if raw_plans is None:
            return []
        if not isinstance(raw_plans, list):
            abort(400, description="planos precisa ser uma lista.")
        plans = []
        for item in raw_plans:
            plan = str(item or "").strip()
            if not plan:
                continue
            if plan not in plans:
                plans.append(plan)
        if not plans:
            abort(400, description="Informe pelo menos um plano aceito.")
        return plans

    def clamp_duration_minutes(value):
        return max(15, min(1440, value))

    def coerce_duration_minutes(value):
        try:
            minutes = int(value)
        except (TypeError, ValueError):
            return 60
        return clamp_duration_minutes(minutes)

    def parse_duration_minutes(value):
        if value is None or value == "":
            return 60
        try:
            minutes = int(value)
        except (TypeError, ValueError):
            abort(400, description="duration precisa ser numérico.")
        return clamp_duration_minutes(minutes)

    def parse_appointment_date(value):
        if is_blank(value):
            abort(400, description="date e obrigatorio.")
        try:
            parsed = datetime.strptime(str(value).strip(), "%Y-%m-%d")
        except (TypeError, ValueError):
            abort(400, description="date invalido. Use o formato YYYY-MM-DD.")
        return parsed.strftime("%Y-%m-%d")

    def parse_appointment_time(value):
        if is_blank(value):
            abort(400, description="time e obrigatorio.")
        try:
            parsed = datetime.strptime(str(value).strip(), "%H:%M")
        except (TypeError, ValueError):
            abort(400, description="time invalido. Use o formato HH:MM.")
        return parsed.strftime("%H:%M")

    def validate_email(email):
        if is_blank(email):
            abort(400, description="email e obrigatorio.")
        normalized_email = str(email).strip().lower()
        email_pattern = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
        if not re.match(email_pattern, normalized_email):
            abort(400, description="email invalido.")
        return normalized_email

    def validate_role(value):
        role = (value or "").strip().lower()
        if role not in VALID_ROLES:
            abort(400, description="role invalida. Use admin ou common.")
        return role

    def validate_password(value):
        password = str(value or "")
        if len(password) < PASSWORD_MIN_LENGTH:
            abort(400, description=f"senha deve ter no minimo {PASSWORD_MIN_LENGTH} caracteres.")
        return password

    def normalize_cep(value):
        if is_blank(value):
            return None
        cep_digits = re.sub(r"\D", "", str(value))
        if len(cep_digits) != 8:
            abort(400, description="cep invalido. Use 8 digitos.")
        return cep_digits

    def normalize_cpf(value, required=True):
        if is_blank(value):
            if required:
                abort(400, description="CPF e obrigatorio.")
            return None

        cpf_digits = re.sub(r"\D", "", str(value))
        if len(cpf_digits) != 11 or cpf_digits == cpf_digits[0] * 11:
            abort(400, description="CPF invalido.")

        def digit_for(base_digits):
            total = sum(int(digit) * weight for digit, weight in zip(base_digits, range(len(base_digits) + 1, 1, -1)))
            remainder = (total * 10) % 11
            return 0 if remainder == 10 else remainder

        first_digit = digit_for(cpf_digits[:9])
        second_digit = digit_for(cpf_digits[:10])
        if first_digit != int(cpf_digits[9]) or second_digit != int(cpf_digits[10]):
            abort(400, description="CPF invalido.")
        return cpf_digits

    def ensure_unique_patient_cpf(db, cpf, patient_id=None):
        if not cpf:
            return
        if patient_id:
            row = db.execute(
                "SELECT id FROM pacientes WHERE cpf = ? AND id <> ? LIMIT 1",
                (cpf, patient_id),
            ).fetchone()
        else:
            row = db.execute(
                "SELECT id FROM pacientes WHERE cpf = ? LIMIT 1",
                (cpf,),
            ).fetchone()
        if row is not None:
            abort(409, description="Ja existe um paciente cadastrado com este CPF.")

    def token_hash(token):
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def parse_bearer_token():
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return None
        token = auth_header[7:].strip()
        return token or None

    def auth_error(code, message, status_code):
        return (
            jsonify(
                {
                    "success": False,
                    "error": {"code": code, "message": message},
                }
            ),
            status_code,
        )

    def now_utc_iso():
        return datetime.utcnow().isoformat()

    def professional_row_to_payload(row):
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "specialty": row["specialty"] if "specialty" in set(row.keys()) else None,
            "email": row["email"],
            "phone": row["phone"],
            "role": row["role"],
            "futurePlan": row["future_plan"],
            "futureStatus": row["future_status"],
            "futureCompanyId": row["future_company_id"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def user_from_professional_row(row):
        if row is None:
            return None
        return {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
        }

    def find_professional_by_id(db, professional_id):
        return db.execute(
            "SELECT * FROM professionals WHERE id = ? LIMIT 1",
            (professional_id,),
        ).fetchone()

    def find_professional_by_email(db, email):
        return db.execute(
            "SELECT * FROM professionals WHERE email = ? COLLATE NOCASE LIMIT 1",
            (email,),
        ).fetchone()

    def find_professional_by_name(db, name):
        if is_blank(name):
            return None
        return db.execute(
            "SELECT * FROM professionals WHERE name = ? COLLATE NOCASE LIMIT 1",
            (str(name).strip(),),
        ).fetchone()

    def resolve_professional_for_appointment(db, data):
        professional_id = data.get("professional_id")
        professional_text = data.get("professional")

        if not is_blank(professional_id):
            professional = find_professional_by_id(db, professional_id)
            if professional is None:
                abort(400, description="Profissional nao encontrado.")
            return professional["id"], professional["name"]

        if is_blank(professional_text):
            return None, None

        typed_value = str(professional_text).strip()
        professional = (
            find_professional_by_id(db, typed_value)
            or find_professional_by_email(db, typed_value.lower())
            or find_professional_by_name(db, typed_value)
        )
        if professional:
            return professional["id"], professional["name"]
        abort(400, description="Profissional nao encontrado.")

    def create_auth_session(db, professional_id):
        raw_token = secrets.token_urlsafe(48)
        now = datetime.utcnow()
        db.execute(
            """
            INSERT INTO auth_sessions
            (id, professional_id, token_hash, created_at, expires_at, last_seen_at, revoked_at)
            VALUES (?, ?, ?, ?, ?, ?, NULL)
            """,
            (
                str(uuid.uuid4()),
                professional_id,
                token_hash(raw_token),
                now.isoformat(),
                (now + timedelta(days=SESSION_TTL_DAYS)).isoformat(),
                now.isoformat(),
            ),
        )
        return raw_token

    def revoke_auth_session(db, raw_token):
        cursor = db.execute(
            """
            UPDATE auth_sessions
            SET revoked_at = ?, last_seen_at = ?
            WHERE token_hash = ? AND revoked_at IS NULL
            """,
            (now_utc_iso(), now_utc_iso(), token_hash(raw_token)),
        )
        return cursor.rowcount > 0

    def get_current_user():
        if hasattr(g, "current_user"):
            return g.current_user

        raw_token = parse_bearer_token()
        if not raw_token:
            g.current_user = None
            g.current_session_token = None
            return None

        db = get_db()
        row = db.execute(
            """
            SELECT
                p.id,
                p.name,
                p.email,
                p.role,
                p.future_status,
                s.id AS session_id,
                s.expires_at
            FROM auth_sessions s
            INNER JOIN professionals p ON p.id = s.professional_id
            WHERE s.token_hash = ? AND s.revoked_at IS NULL
            LIMIT 1
            """,
            (token_hash(raw_token),),
        ).fetchone()

        if row is None:
            g.current_user = None
            g.current_session_token = None
            return None

        expires_at = row["expires_at"]
        if expires_at and expires_at <= now_utc_iso():
            db.execute(
                "UPDATE auth_sessions SET revoked_at = ?, last_seen_at = ? WHERE id = ?",
                (now_utc_iso(), now_utc_iso(), row["session_id"]),
            )
            db.commit()
            g.current_user = None
            g.current_session_token = None
            return None

        if (row["future_status"] or "active").lower() not in {"active", "trial"}:
            g.current_user = None
            g.current_session_token = None
            return None

        db.execute(
            "UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?",
            (now_utc_iso(), row["session_id"]),
        )
        db.commit()

        g.current_user = {
            "id": row["id"],
            "name": row["name"],
            "email": row["email"],
            "role": row["role"],
        }
        g.current_session_token = raw_token
        return g.current_user

    def require_auth():
        user = get_current_user()
        if user is None:
            return auth_error("UNAUTHORIZED", "Sessao invalida ou expirada.", 401)
        return user

    def require_admin():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        if user["role"] != "admin":
            return auth_error("FORBIDDEN", "Acesso permitido apenas para administradores.", 403)
        return user

    def is_admin_user(user):
        return isinstance(user, dict) and user.get("role") == "admin"

    def ensure_patient_exists(db, paciente_id):
        row = db.execute("SELECT 1 FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        if row is None:
            abort(400, description="Paciente nÃ£o encontrado.")

    def fetch_patient_name(db, paciente_id):
        row = db.execute("SELECT nome FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        return row["nome"] if row else None

    def parse_stored_agreement_plans(raw_value):
        if raw_value is None:
            return []
        if isinstance(raw_value, str):
            raw_text = raw_value.strip()
            if not raw_text:
                return []
            try:
                parsed = json.loads(raw_text)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            except json.JSONDecodeError:
                return [part.strip() for part in raw_text.split(",") if part.strip()]
        if isinstance(raw_value, list):
            return [str(item).strip() for item in raw_value if str(item).strip()]
        return []

    def agreement_row_to_payload(row):
        if row is None:
            return None
        plans = parse_stored_agreement_plans(row["planos"] if "planos" in set(row.keys()) else "[]")
        return {
            "id": row["id"],
            "name": row["nome"],
            "careType": row["tipo_atendimento"],
            "plans": plans,
            "notes": row["observacoes"],
            "status": row["status"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def find_agreement_by_id(db, agreement_id):
        if is_blank(agreement_id):
            return None
        return db.execute(
            "SELECT * FROM convenios WHERE id = ? LIMIT 1",
            (agreement_id,),
        ).fetchone()

    def resolve_agreement_for_care(db, care_type, agreement_id, agreement_plan, require_active=True):
        normalized_care_type = parse_care_type(care_type)
        if normalized_care_type == "particular":
            return "particular", None, None, None

        if is_blank(agreement_id):
            abort(400, description="convenio_id e obrigatorio para atendimento por convenio.")
        if is_blank(agreement_plan):
            abort(400, description="plano_convenio e obrigatorio para atendimento por convenio.")

        agreement = find_agreement_by_id(db, agreement_id)
        if agreement is None:
            abort(400, description="Convenio nao encontrado.")

        agreement_status = str(agreement["status"] or "").strip().lower()
        if require_active and agreement_status != "ativo":
            abort(400, description="Convenio inativo nao pode ser utilizado.")

        normalized_plan = str(agreement_plan).strip()
        available_plans = parse_stored_agreement_plans(agreement["planos"])
        if normalized_plan not in available_plans:
            abort(400, description="Plano do convenio invalido para o convenio selecionado.")

        return "convenio", agreement["id"], agreement["nome"], normalized_plan

    def patient_row_to_payload(row, user_role="admin"):
        if row is None:
            return None
        columns = set(row.keys())
        age_value = row["idade"]
        updated_at = row["updated_at"] if "updated_at" in columns and row["updated_at"] else row["created_at"]
        payload = {
            "id": row["id"],
            "name": row["nome"],
            "cpf": row["cpf"] if "cpf" in columns else None,
            "age": str(age_value) if age_value is not None else None,
            "school": row["escola"],
            "responsible": row["responsavel"],
            "phone": row["telefone"],
            "email": row["email"],
            "cep": row["cep"] if "cep" in columns else None,
            "address": row["endereco"] if "endereco" in columns else None,
            "number": row["numero"] if "numero" in columns else None,
            "district": row["bairro"] if "bairro" in columns else None,
            "city": row["cidade"] if "cidade" in columns else None,
            "careType": row["forma_atendimento"] if "forma_atendimento" in columns else "particular",
            "agreementId": row["convenio_id"] if "convenio_id" in columns else None,
            "agreementName": row["convenio_nome"] if "convenio_nome" in columns else None,
            "agreementPlan": row["plano_convenio"] if "plano_convenio" in columns else None,
            "notes": row["observacoes"],
            "createdAt": row["created_at"],
            "updatedAt": updated_at,
        }
        if user_role != "admin":
            payload = {key: value for key, value in payload.items() if key in PATIENT_COMMON_FIELDS}
        return payload

    def patient_row_to_legacy_payload(row, user_role="admin"):
        payload = patient_row_to_payload(row, user_role)
        if payload is None:
            return None

        legacy = {
            "id": payload.get("id"),
            "nome": payload.get("name"),
            "telefone": payload.get("phone"),
            "email": payload.get("email"),
            "created_at": payload.get("createdAt"),
            "updated_at": payload.get("updatedAt"),
        }
        if user_role == "admin":
            legacy.update(
                {
                    "idade": payload.get("age"),
                    "cpf": payload.get("cpf"),
                    "escola": payload.get("school"),
                    "responsavel": payload.get("responsible"),
                    "cep": payload.get("cep"),
                    "endereco": payload.get("address"),
                    "numero": payload.get("number"),
                    "bairro": payload.get("district"),
                    "cidade": payload.get("city"),
                    "forma_atendimento": payload.get("careType"),
                    "convenio_id": payload.get("agreementId"),
                    "convenio_nome": payload.get("agreementName"),
                    "plano_convenio": payload.get("agreementPlan"),
                    "observacoes": payload.get("notes"),
                }
            )
        return legacy

    def find_patient_by_name(db, name):
        if not name:
            return None
        return db.execute(
            """
            SELECT id, nome, cpf, forma_atendimento, convenio_id, convenio_nome, plano_convenio
            FROM pacientes
            WHERE nome = ? COLLATE NOCASE
            LIMIT 1
            """,
            (name,),
        ).fetchone()

    def find_patient_by_id(db, patient_id):
        if is_blank(patient_id):
            return None
        return db.execute(
            """
            SELECT id, nome, cpf, forma_atendimento, convenio_id, convenio_nome, plano_convenio
            FROM pacientes
            WHERE id = ?
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()

    def get_financial_settings(db, patient_id):
        row = db.execute(
            """
            SELECT id, patient_id, auto_charge, consultation_price, created_at, updated_at
            FROM financial_settings
            WHERE patient_id = ?
            LIMIT 1
            """,
            (patient_id,),
        ).fetchone()
        if row is not None:
            return row

        now = now_utc_iso()
        setting_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO financial_settings
            (id, patient_id, auto_charge, consultation_price, created_at, updated_at)
            VALUES (?, ?, 0, 0, ?, ?)
            """,
            (setting_id, patient_id, now, now),
        )
        return db.execute(
            """
            SELECT id, patient_id, auto_charge, consultation_price, created_at, updated_at
            FROM financial_settings
            WHERE id = ?
            LIMIT 1
            """,
            (setting_id,),
        ).fetchone()

    def settings_row_to_payload(row):
        if row is None:
            return {
                "autoCharge": False,
                "consultationPrice": 0,
                "createdAt": None,
                "updatedAt": None,
            }
        return {
            "autoCharge": bool(row["auto_charge"]),
            "consultationPrice": float(row["consultation_price"] or 0),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def get_patient_financial_rows(db, patient_id):
        return db.execute(
            """
            SELECT
                f.*,
                p.nome
            FROM financeiro f
            LEFT JOIN pacientes p ON p.id = f.paciente_id
            WHERE f.paciente_id = ?
            ORDER BY date(f.data) DESC, f.created_at DESC
            """,
            (patient_id,),
        ).fetchall()

    def build_financial_summary(rows):
        total_paid = 0.0
        total_pending = 0.0
        total_overdue = 0.0
        total_convenio = 0.0
        total_particular = 0.0

        for row in rows:
            amount = float(row["valor"] or 0)
            status = str(row["status"] or "").strip()
            care_type = str(row["forma_atendimento"] or "particular").strip().lower()

            if care_type == "convenio":
                total_convenio += amount
            else:
                total_particular += amount

            if status == "Pago":
                total_paid += amount

            if status == "Pendente":
                if amount < 0:
                    total_pending += abs(amount)
                else:
                    total_pending += amount

            if status == "Atrasado":
                if amount < 0:
                    total_overdue += abs(amount)
                else:
                    total_overdue += amount

        balance = sum(float(row["valor"] or 0) for row in rows)
        return {
            "balance": round(balance, 2),
            "totalPaid": round(total_paid, 2),
            "totalPending": round(total_pending, 2),
            "totalOverdue": round(total_overdue, 2),
            "totalConvenio": round(total_convenio, 2),
            "totalParticular": round(total_particular, 2),
        }

    def create_automatic_charge_for_appointment(
        db,
        *,
        appointment_id,
        patient_id,
        appointment_date,
        appointment_time,
        care_type,
        agreement_id,
        agreement_name,
        agreement_plan,
    ):
        normalized_care_type = str(care_type or "particular").strip().lower()
        if normalized_care_type != "particular":
            return None

        settings = get_financial_settings(db, patient_id)
        auto_charge = bool(settings["auto_charge"])
        consultation_price = float(settings["consultation_price"] or 0)
        if (not auto_charge) or consultation_price <= 0:
            return None

        existing = db.execute(
            """
            SELECT id
            FROM financeiro
            WHERE appointment_id = ?
              AND source = 'auto_appointment_charge'
            LIMIT 1
            """,
            (appointment_id,),
        ).fetchone()
        if existing is not None:
            return None

        transaction_id = str(uuid.uuid4())
        now = now_utc_iso()
        db.execute(
            """
            INSERT INTO financeiro
            (
                id, paciente_id, data, valor, status, metodo_pagamento,
                forma_atendimento, convenio_id, convenio_nome, plano_convenio,
                observacoes, created_at, updated_at, transaction_type, source, appointment_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                transaction_id,
                patient_id,
                appointment_date,
                -abs(consultation_price),
                "Pendente",
                None,
                normalized_care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                f"Cobranca automatica de consulta ({appointment_time})",
                now,
                now,
                "charge",
                "auto_appointment_charge",
                appointment_id,
            ),
        )
        return transaction_id

    def appointment_row_to_payload(row):
        if row is None:
            return None
        columns = set(row.keys())
        duration_minutes = coerce_duration_minutes(row["duracao"]) if "duracao" in columns else 60
        professional_name = row["professional_name"] if "professional_name" in columns and row["professional_name"] else row["profissional"]
        professional_specialty = row["professional_specialty"] if "professional_specialty" in columns else None
        if isinstance(professional_specialty, str):
            professional_specialty = professional_specialty.strip() or None
        professional_display = professional_name
        if professional_name and professional_specialty:
            professional_display = f"{professional_name} - {professional_specialty}"
        return {
            "id": row["id"],
            "patientId": row["paciente_id"] if "paciente_id" in columns else None,
            "patient": row["nome"],
            "patientCpf": row["cpf"] if "cpf" in columns else None,
            "date": row["data"],
            "time": row["horario"],
            "professional": professional_name,
            "professionalSpecialty": professional_specialty,
            "professionalDisplay": professional_display,
            "professionalId": row["professional_id"] if "professional_id" in columns else None,
            "reason": row["motivo"],
            "notes": row["observacoes"],
            "status": row["status"],
            "duration": duration_minutes,
            "careType": row["forma_atendimento"] if "forma_atendimento" in columns else "particular",
            "agreementId": row["convenio_id"] if "convenio_id" in columns else None,
            "agreementName": row["convenio_nome"] if "convenio_nome" in columns else None,
            "agreementPlan": row["plano_convenio"] if "plano_convenio" in columns else None,
        }

    def parse_json_list(value):
        if value is None:
            return []
        if isinstance(value, list):
            return [item for item in value if item not in (None, "")]
        if isinstance(value, str):
            text = value.strip()
            if not text:
                return []
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                return []
            if isinstance(parsed, list):
                return [item for item in parsed if item not in (None, "")]
        return []

    def medical_record_row_to_payload(row):
        if row is None:
            return None
        columns = set(row.keys())
        patient_name = row["paciente_nome"] if "paciente_nome" in columns else ""
        reason = row["observacoes"] if "observacoes" in columns else ""
        notes = row["observacoes"] if "observacoes" in columns else ""
        professional_name = row["professional_name"] if "professional_name" in columns else None
        description = row["descricao"] if "descricao" in columns else reason
        evolution = row["evolucao"] if "evolucao" in columns else None
        attachments = parse_json_list(row["anexos"]) if "anexos" in columns else []
        return {
            "id": row["id"],
            "patientId": row["paciente_id"] if "paciente_id" in columns else None,
            "patient": patient_name,
            "patientCpf": row["cpf"] if "cpf" in columns else None,
            "date": row["data"],
            "time": row["hora"] if "hora" in columns else None,
            "reason": reason,
            "description": description,
            "evolution": evolution,
            "professional": professional_name,
            "notes": notes,
            "attachments": attachments,
            "registeredAt": row["created_at"],
        }

    def financial_row_to_payload(row):
        if row is None:
            return None
        columns = set(row.keys())
        amount = row["valor"] or 0
        return {
            "id": row["id"],
            "patientId": row["paciente_id"] if "paciente_id" in columns else None,
            "patient": row["nome"],
            "patientCpf": row["cpf"] if "cpf" in columns else None,
            "date": row["data"],
            "amount": f"{amount:.2f}",
            "status": row["status"],
            "method": row["metodo_pagamento"] if "metodo_pagamento" in columns else None,
            "notes": row["observacoes"] if "observacoes" in columns else None,
            "registeredAt": row["created_at"],
            "updatedAt": row["updated_at"] if "updated_at" in columns else None,
            "careType": row["forma_atendimento"] if "forma_atendimento" in columns else "particular",
            "agreementId": row["convenio_id"] if "convenio_id" in columns else None,
            "agreementName": row["convenio_nome"] if "convenio_nome" in columns else None,
            "agreementPlan": row["plano_convenio"] if "plano_convenio" in columns else None,
            "type": row["transaction_type"] if "transaction_type" in columns else "payment",
            "source": row["source"] if "source" in columns else "manual",
            "appointmentId": row["appointment_id"] if "appointment_id" in columns else None,
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

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc):
        if request.path.startswith("/api"):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": {
                            "code": exc.name.upper().replace(" ", "_"),
                            "message": exc.description or "Erro na requisicao.",
                        },
                    }
                ),
                exc.code,
            )
        return exc

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc):
        app.logger.exception("Unhandled server error")
        if request.path.startswith("/api"):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": {
                            "code": "SERVER_ERROR",
                            "message": "Erro interno do servidor.",
                        },
                    }
                ),
                500,
            )
        raise exc

    @app.before_request
    def enforce_api_auth():
        if not request.path.startswith("/api"):
            return None
        public_paths = {
            "/api/auth/login",
            "/api/auth/reset-password",
            "/api/health",
        }
        if request.path in public_paths:
            return None
        return None if get_current_user() is not None else auth_error(
            "UNAUTHORIZED", "Sessao invalida ou expirada.", 401
        )

    # ----------------------
    # PÃGINAS HTML
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
    # AUTH / PROFESSIONALS
    # ----------------------

    @app.route("/api/auth/login", methods=["POST"])
    def auth_login():
        data = json_payload()
        email = validate_email(data.get("email"))
        password = str(data.get("password") or "")
        if is_blank(password):
            abort(400, description="senha e obrigatoria.")

        db = get_db()
        professional = find_professional_by_email(db, email)
        if professional is None:
            return auth_error("INVALID_CREDENTIALS", "Email ou senha invalidos.", 401)

        if not check_password_hash(professional["password_hash"], password):
            return auth_error("INVALID_CREDENTIALS", "Email ou senha invalidos.", 401)

        if (professional["future_status"] or "active").lower() not in {"active", "trial"}:
            return auth_error(
                "ACCOUNT_BLOCKED",
                "Conta bloqueada temporariamente. Contate o administrador.",
                403,
            )

        token = create_auth_session(db, professional["id"])
        db.commit()
        return jsonify(
            {
                "success": True,
                "data": {
                    "token": token,
                    "user": user_from_professional_row(professional),
                },
            }
        )

    @app.route("/api/auth/me", methods=["GET"])
    def auth_me():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        return jsonify({"success": True, "data": {"user": user}})

    @app.route("/api/auth/logout", methods=["POST"])
    def auth_logout():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        db = get_db()
        raw_token = getattr(g, "current_session_token", None)
        if raw_token:
            revoke_auth_session(db, raw_token)
            db.commit()
        return jsonify({"success": True, "data": {"success": True}})

    @app.route("/api/auth/reset-password", methods=["POST"])
    def auth_reset_password():
        data = json_payload()
        password = validate_password(data.get("newPassword"))
        current_user = get_current_user()

        db = get_db()
        target_professional_id = None
        if isinstance(current_user, dict):
            target_professional_id = current_user["id"]
        else:
            email = validate_email(data.get("email"))
            professional = find_professional_by_email(db, email)
            if professional is None:
                return auth_error("USER_NOT_FOUND", "Usuario nao encontrado.", 404)
            target_professional_id = professional["id"]

        db.execute(
            "UPDATE professionals SET password_hash = ?, updated_at = ? WHERE id = ?",
            (generate_password_hash(password), now_utc_iso(), target_professional_id),
        )
        db.commit()
        return jsonify({"success": True, "data": {"success": True}})

    @app.route("/api/professionals", methods=["GET"])
    def list_professionals():
        user = require_auth()
        if not isinstance(user, dict):
            return user

        db = get_db()
        rows = db.execute(
            """
            SELECT id, name, specialty, email, phone, role, future_plan, future_status, future_company_id, created_at, updated_at
            FROM professionals
            ORDER BY name
            """
        ).fetchall()
        return jsonify({"success": True, "data": [professional_row_to_payload(row) for row in rows]})

    @app.route("/api/professionals", methods=["POST"])
    def create_professional():
        user = require_admin()
        if not isinstance(user, dict):
            return user

        data = json_payload()
        name = (data.get("name") or "").strip()
        if not name:
            abort(400, description="name e obrigatorio.")
        email = validate_email(data.get("email"))
        password = validate_password(data.get("password"))
        role = validate_role(data.get("role"))
        phone = (data.get("phone") or "").strip() or None
        specialty = (data.get("specialty") or "").strip()
        if not specialty:
            abort(400, description="specialty e obrigatoria.")

        db = get_db()
        existing = find_professional_by_email(db, email)
        if existing is not None:
            return auth_error("EMAIL_ALREADY_EXISTS", "Ja existe profissional com este email.", 409)

        now = now_utc_iso()
        professional_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO professionals
            (id, name, specialty, email, password_hash, phone, role, future_plan, future_status, future_company_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                professional_id,
                name,
                specialty,
                email,
                generate_password_hash(password),
                phone,
                role,
                data.get("future_plan"),
                (data.get("future_status") or "active"),
                data.get("future_company_id"),
                now,
                now,
            ),
        )
        db.commit()
        created = find_professional_by_id(db, professional_id)
        return jsonify({"success": True, "data": professional_row_to_payload(created)})

    @app.route("/api/professionals/<professional_id>", methods=["PUT"])
    def update_professional(professional_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        data = json_payload()
        allowed_fields = {
            "name",
            "specialty",
            "email",
            "password",
            "phone",
            "role",
            "future_plan",
            "future_status",
            "future_company_id",
        }
        if not any(field in data for field in allowed_fields):
            abort(400, description="Nenhum campo valido para atualizacao.")

        db = get_db()
        existing = find_professional_by_id(db, professional_id)
        if existing is None:
            abort(404, description="Profissional nao encontrado.")

        updates = []
        params = []

        if "name" in data:
            name = (data.get("name") or "").strip()
            if not name:
                abort(400, description="name e obrigatorio.")
            updates.append("name = ?")
            params.append(name)

        if "email" in data:
            email = validate_email(data.get("email"))
            duplicate = find_professional_by_email(db, email)
            if duplicate is not None and duplicate["id"] != professional_id:
                return auth_error("EMAIL_ALREADY_EXISTS", "Ja existe profissional com este email.", 409)
            updates.append("email = ?")
            params.append(email)

        if "specialty" in data:
            specialty = (data.get("specialty") or "").strip()
            if not specialty:
                abort(400, description="specialty e obrigatoria.")
            updates.append("specialty = ?")
            params.append(specialty)

        if "password" in data and not is_blank(data.get("password")):
            password = validate_password(data.get("password"))
            updates.append("password_hash = ?")
            params.append(generate_password_hash(password))

        if "phone" in data:
            phone = (data.get("phone") or "").strip() or None
            updates.append("phone = ?")
            params.append(phone)

        if "role" in data:
            role = validate_role(data.get("role"))
            updates.append("role = ?")
            params.append(role)

        if "future_plan" in data:
            updates.append("future_plan = ?")
            params.append(data.get("future_plan"))
        if "future_status" in data:
            updates.append("future_status = ?")
            params.append(data.get("future_status"))
        if "future_company_id" in data:
            updates.append("future_company_id = ?")
            params.append(data.get("future_company_id"))

        updates.append("updated_at = ?")
        params.append(now_utc_iso())
        params.append(professional_id)

        db.execute(
            f"UPDATE professionals SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        db.commit()
        updated = find_professional_by_id(db, professional_id)
        return jsonify({"success": True, "data": professional_row_to_payload(updated)})

    @app.route("/api/professionals/<professional_id>", methods=["DELETE"])
    def delete_professional(professional_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        if user["id"] == professional_id:
            abort(400, description="Nao e permitido excluir o proprio usuario logado.")

        db = get_db()
        existing = find_professional_by_id(db, professional_id)
        if existing is None:
            abort(404, description="Profissional nao encontrado.")

        if existing["role"] == "admin":
            admin_count = db.execute(
                "SELECT COUNT(*) AS total FROM professionals WHERE role = 'admin'"
            ).fetchone()
            if admin_count and admin_count["total"] <= 1:
                abort(400, description="Nao e permitido excluir o ultimo administrador do sistema.")

        db.execute("DELETE FROM auth_sessions WHERE professional_id = ?", (professional_id,))
        cursor = db.execute("DELETE FROM professionals WHERE id = ?", (professional_id,))
        if cursor.rowcount == 0:
            abort(404, description="Profissional nao encontrado.")
        db.commit()
        return jsonify({"success": True, "data": {"id": professional_id, "deleted": True}})

    # ----------------------
    # CONVENIOS
    # ----------------------

    @app.route("/api/agreements", methods=["GET"])
    def list_agreements():
        user = require_auth()
        if not isinstance(user, dict):
            return user

        status_filter = (request.args.get("status") or "").strip().lower()
        only_active = (request.args.get("active_only") or "").strip().lower() in {"1", "true", "yes"}

        where_clauses = []
        params = []
        if status_filter:
            if status_filter not in {"ativo", "inativo"}:
                abort(400, description="status invalido. Use ativo ou inativo.")
            where_clauses.append("status = ?")
            params.append(status_filter)
        if only_active:
            where_clauses.append("status = ?")
            params.append("ativo")

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
        db = get_db()
        rows = db.execute(
            f"""
            SELECT *
            FROM convenios
            {where_sql}
            ORDER BY nome
            """,
            params,
        ).fetchall()
        return jsonify({"success": True, "data": [agreement_row_to_payload(row) for row in rows]})

    @app.route("/api/agreements", methods=["POST"])
    def create_agreement():
        user = require_admin()
        if not isinstance(user, dict):
            return user

        data = json_payload()
        name = str(data.get("name") or "").strip()
        if not name:
            abort(400, description="name e obrigatorio.")
        plans = parse_agreement_plans(data.get("plans"))
        status = parse_agreement_status(data.get("status") or "ativo")
        care_type = (data.get("careType") or "").strip() or None
        notes = (data.get("notes") or "").strip() or None

        db = get_db()
        duplicate = db.execute(
            "SELECT id FROM convenios WHERE nome = ? COLLATE NOCASE LIMIT 1",
            (name,),
        ).fetchone()
        if duplicate is not None:
            abort(409, description="Ja existe convenio com este nome.")

        agreement_id = str(uuid.uuid4())
        now = now_utc_iso()
        db.execute(
            """
            INSERT INTO convenios
            (id, nome, tipo_atendimento, planos, observacoes, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                agreement_id,
                name,
                care_type,
                json.dumps(plans, ensure_ascii=False),
                notes,
                status,
                now,
                now,
            ),
        )
        db.commit()
        row = find_agreement_by_id(db, agreement_id)
        return jsonify({"success": True, "data": agreement_row_to_payload(row)})

    @app.route("/api/agreements/<agreement_id>", methods=["PUT"])
    def update_agreement(agreement_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        data = json_payload()
        allowed_fields = {"name", "careType", "plans", "notes", "status"}
        if not any(field in data for field in allowed_fields):
            abort(400, description="Nenhum campo valido para atualizacao.")

        db = get_db()
        existing = find_agreement_by_id(db, agreement_id)
        if existing is None:
            abort(404, description="Convenio nao encontrado.")

        updates = []
        params = []

        if "name" in data:
            name = str(data.get("name") or "").strip()
            if not name:
                abort(400, description="name e obrigatorio.")
            duplicate = db.execute(
                "SELECT id FROM convenios WHERE nome = ? COLLATE NOCASE AND id <> ? LIMIT 1",
                (name, agreement_id),
            ).fetchone()
            if duplicate is not None:
                abort(409, description="Ja existe convenio com este nome.")
            updates.append("nome = ?")
            params.append(name)

        if "careType" in data:
            care_type = (data.get("careType") or "").strip() or None
            updates.append("tipo_atendimento = ?")
            params.append(care_type)

        if "plans" in data:
            plans = parse_agreement_plans(data.get("plans"))
            updates.append("planos = ?")
            params.append(json.dumps(plans, ensure_ascii=False))

        if "notes" in data:
            notes = (data.get("notes") or "").strip() or None
            updates.append("observacoes = ?")
            params.append(notes)

        if "status" in data:
            updates.append("status = ?")
            params.append(parse_agreement_status(data.get("status")))

        updates.append("updated_at = ?")
        params.append(now_utc_iso())
        params.append(agreement_id)
        db.execute(
            f"UPDATE convenios SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        db.commit()
        row = find_agreement_by_id(db, agreement_id)
        return jsonify({"success": True, "data": agreement_row_to_payload(row)})

    @app.route("/api/agreements/<agreement_id>", methods=["DELETE"])
    def delete_agreement(agreement_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        db = get_db()
        row = find_agreement_by_id(db, agreement_id)
        if row is None:
            abort(404, description="Convenio nao encontrado.")

        db.execute("DELETE FROM convenios WHERE id = ?", (agreement_id,))
        db.commit()
        return jsonify({"success": True, "data": {"id": agreement_id, "deleted": True}})

    # ----------------------
    # PACIENTES
    # ----------------------

    @app.route("/api/pacientes", methods=["GET"])
    def list_pacientes():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        db = get_db()
        rows = db.execute("SELECT * FROM pacientes ORDER BY nome").fetchall()
        payload = [patient_row_to_legacy_payload(row, user["role"]) for row in rows]
        return jsonify(payload)

    @app.route("/api/pacientes", methods=["POST"])
    def create_paciente():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        data = json_payload()

        require_fields(data, ["nome", "cpf"])
        cpf_value = normalize_cpf(data.get("cpf"), required=True)
        cep_value = normalize_cep(data.get("cep"))
        db = get_db()
        ensure_unique_patient_cpf(db, cpf_value)

        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("forma_atendimento") or data.get("careType") or "particular",
            data.get("convenio_id") or data.get("agreementId"),
            data.get("plano_convenio") or data.get("agreementPlan"),
            require_active=True,
        )

        new_id = str(uuid.uuid4())
        now = datetime.utcnow().isoformat()

        db.execute(
            """
            INSERT INTO pacientes
            (id, nome, cpf, idade, escola, responsavel, telefone, email, cep, endereco, numero, bairro, cidade, forma_atendimento, convenio_id, convenio_nome, plano_convenio, observacoes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("nome"),
                cpf_value,
                data.get("idade"),
                data.get("escola"),
                data.get("responsavel"),
                data.get("telefone"),
                data.get("email"),
                cep_value,
                data.get("endereco"),
                data.get("numero"),
                data.get("bairro"),
                data.get("cidade"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                data.get("observacoes"),
                now,
                now,
            ),
        )

        db.commit()

        created = db.execute("SELECT * FROM pacientes WHERE id = ?", (new_id,)).fetchone()
        return jsonify({"id": new_id, "paciente": patient_row_to_legacy_payload(created, user["role"])})

    @app.route("/api/pacientes/<paciente_id>", methods=["GET"])
    def get_paciente(paciente_id):
        user = require_auth()
        if not isinstance(user, dict):
            return user
        db = get_db()
        row = db.execute(
            "SELECT * FROM pacientes WHERE id = ?", (paciente_id,)
        ).fetchone()
        if row is None:
            abort(404, description="Paciente nÃ£o encontrado.")
        return jsonify(patient_row_to_legacy_payload(row, user["role"]))

    @app.route("/api/pacientes/<paciente_id>", methods=["PATCH"])
    def update_paciente(paciente_id):
        user = require_auth()
        if not isinstance(user, dict):
            return user
        data = json_payload()

        allowed_columns = [
            "nome",
            "cpf",
            "idade",
            "escola",
            "responsavel",
            "telefone",
            "email",
            "cep",
            "endereco",
            "numero",
            "bairro",
            "cidade",
            "observacoes",
        ]

        updates = {col: data[col] for col in allowed_columns if col in data}
        db = get_db()
        if any(key in data for key in {"forma_atendimento", "convenio_id", "plano_convenio", "careType", "agreementId", "agreementPlan"}):
            care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
                db,
                data.get("forma_atendimento") or data.get("careType") or "particular",
                data.get("convenio_id") or data.get("agreementId"),
                data.get("plano_convenio") or data.get("agreementPlan"),
                require_active=True,
            )
            updates["forma_atendimento"] = care_type
            updates["convenio_id"] = agreement_id
            updates["convenio_nome"] = agreement_name
            updates["plano_convenio"] = agreement_plan
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")
        if "cep" in updates:
            updates["cep"] = normalize_cep(updates.get("cep"))
        if "cpf" in updates:
            updates["cpf"] = normalize_cpf(updates.get("cpf"), required=True)
            ensure_unique_patient_cpf(db, updates["cpf"], paciente_id)
        updates["updated_at"] = now_utc_iso()

        set_clause = ", ".join(f"{col} = ?" for col in updates)
        params = list(updates.values()) + [paciente_id]

        cursor = db.execute(
            f"UPDATE pacientes SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Paciente nÃ£o encontrado.")
        db.commit()
        updated = db.execute("SELECT * FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        return jsonify({"id": paciente_id, "paciente": patient_row_to_legacy_payload(updated, user["role"])})

    @app.route("/api/pacientes/<paciente_id>", methods=["DELETE"])
    def delete_paciente(paciente_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user
        db = get_db()
        cursor = db.execute("DELETE FROM pacientes WHERE id = ?", (paciente_id,))
        if cursor.rowcount == 0:
            abort(404, description="Paciente nÃ£o encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/patients", methods=["GET"])
    def get_patients():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        db = get_db()
        rows = db.execute("SELECT * FROM pacientes ORDER BY nome").fetchall()
        payload = [patient_row_to_payload(row, user["role"]) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/patients", methods=["POST"])
    def create_patient_v2():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        data = json_payload()
        require_fields(data, ["name", "cpf", "phone", "email", "careType"])
        cpf_value = normalize_cpf(data.get("cpf"), required=True)
        age_value = data.get("age")
        if age_value is not None and age_value != "":
            try:
                age_value = int(age_value)
            except (TypeError, ValueError):
                abort(400, description="Idade precisa ser numÃ©rica.")
        else:
            age_value = None
        cep_value = normalize_cep(data.get("cep"))

        new_id = str(uuid.uuid4())
        db = get_db()
        ensure_unique_patient_cpf(db, cpf_value)
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("careType"),
            data.get("agreementId"),
            data.get("agreementPlan"),
            require_active=True,
        )
        now = datetime.utcnow().isoformat()
        db.execute(
            """
            INSERT INTO pacientes
            (id, nome, cpf, idade, escola, responsavel, telefone, email, cep, endereco, numero, bairro, cidade, forma_atendimento, convenio_id, convenio_nome, plano_convenio, observacoes, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("name"),
                cpf_value,
                age_value,
                data.get("school"),
                data.get("responsible"),
                data.get("phone"),
                data.get("email"),
                cep_value,
                data.get("address"),
                data.get("number"),
                data.get("district"),
                data.get("city"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                data.get("notes"),
                now,
                now,
            ),
        )
        db.commit()
        patient = db.execute("SELECT * FROM pacientes WHERE id = ?", (new_id,)).fetchone()
        return jsonify({"success": True, "data": patient_row_to_payload(patient, user["role"])})

    @app.route("/api/patients/<patient_id>", methods=["PUT"])
    def update_patient_v2(patient_id):
        user = require_auth()
        if not isinstance(user, dict):
            return user
        data = json_payload()
        mapping = {
            "name": "nome",
            "cpf": "cpf",
            "age": "idade",
            "school": "escola",
            "responsible": "responsavel",
            "phone": "telefone",
            "email": "email",
            "cep": "cep",
            "address": "endereco",
            "number": "numero",
            "district": "bairro",
            "city": "cidade",
            "notes": "observacoes",
        }
        updates = []
        params = []
        db = get_db()
        for field, column in mapping.items():
            if field in data:
                value = data[field]
                if field == "age":
                    if value is not None and value != "":
                        try:
                            value = int(value)
                        except (TypeError, ValueError):
                            abort(400, description="Idade precisa ser numÃ©rica.")
                    else:
                        value = None
                if field == "cep":
                    value = normalize_cep(value)
                if field == "cpf":
                    value = normalize_cpf(value, required=True)
                    ensure_unique_patient_cpf(db, value, patient_id)
                updates.append(f"{column} = ?")
                params.append(value)

        if any(field in data for field in {"careType", "agreementId", "agreementPlan"}):
            care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
                db,
                data.get("careType") or "particular",
                data.get("agreementId"),
                data.get("agreementPlan"),
                require_active=True,
            )
            updates.extend(
                [
                    "forma_atendimento = ?",
                    "convenio_id = ?",
                    "convenio_nome = ?",
                    "plano_convenio = ?",
                ]
            )
            params.extend([care_type, agreement_id, agreement_name, agreement_plan])
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")
        updates.append("updated_at = ?")
        params.append(now_utc_iso())
        params.append(patient_id)

        cursor = db.execute(
            f"UPDATE pacientes SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Paciente nÃ£o encontrado.")
        db.commit()

        patient = db.execute("SELECT * FROM pacientes WHERE id = ?", (patient_id,)).fetchone()
        return jsonify({"success": True, "data": patient_row_to_payload(patient, user["role"])})

    @app.route("/api/patients/<patient_id>", methods=["DELETE"])
    def delete_patient_v2(patient_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user
        db = get_db()
        cursor = db.execute("DELETE FROM pacientes WHERE id = ?", (patient_id,))
        if cursor.rowcount == 0:
            abort(404, description="Paciente nÃ£o encontrado.")
        db.commit()
        return jsonify({"success": True, "data": {"id": patient_id, "deleted": True}})

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
        patient_row = db.execute(
            """
            SELECT forma_atendimento, convenio_id, convenio_nome, plano_convenio
            FROM pacientes
            WHERE id = ?
            LIMIT 1
            """,
            (data.get("paciente_id"),),
        ).fetchone()
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("forma_atendimento") or (patient_row["forma_atendimento"] if patient_row else "particular"),
            data.get("convenio_id") or (patient_row["convenio_id"] if patient_row else None),
            data.get("plano_convenio") or (patient_row["plano_convenio"] if patient_row else None),
            require_active=True,
        )

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO agenda
            (id, paciente_id, data, horario, status, motivo, profissional, forma_atendimento, convenio_id, convenio_nome, plano_convenio, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("data"),
                data.get("horario"),
                data.get("status", "agendado"),
                data.get("motivo"),
                data.get("profissional"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
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
            abort(404, description="Agendamento nÃ£o encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/agenda/<agenda_id>", methods=["PATCH"])
    def update_agenda(agenda_id):
        data = json_payload()
        allowed = [
            "paciente_id",
            "data",
            "horario",
            "status",
            "motivo",
            "profissional",
            "observacoes",
            "forma_atendimento",
            "convenio_id",
            "plano_convenio",
        ]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])

        if any(key in updates for key in {"forma_atendimento", "convenio_id", "plano_convenio"}):
            care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
                db,
                updates.get("forma_atendimento") or "particular",
                updates.get("convenio_id"),
                updates.get("plano_convenio"),
                require_active=True,
            )
            updates["forma_atendimento"] = care_type
            updates["convenio_id"] = agreement_id
            updates["convenio_nome"] = agreement_name
            updates["plano_convenio"] = agreement_plan

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [agenda_id]

        cursor = db.execute(
            f"UPDATE agenda SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="Agendamento nÃ£o encontrado.")
        db.commit()

        return jsonify({"id": agenda_id})

    @app.route("/api/agenda/<agenda_id>", methods=["DELETE"])
    def delete_agenda(agenda_id):
        db = get_db()
        cursor = db.execute("DELETE FROM agenda WHERE id = ?", (agenda_id,))
        if cursor.rowcount == 0:
            abort(404, description="Agendamento nÃ£o encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/appointments", methods=["GET"])
    def get_appointments():
        db = get_db()
        rows = db.execute(
            """
            SELECT
                a.*,
                p.nome,
                p.cpf,
                pr.name AS professional_name,
                pr.specialty AS professional_specialty
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            LEFT JOIN professionals pr ON a.professional_id = pr.id
            ORDER BY a.data, a.horario
            """
        ).fetchall()
        payload = [appointment_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/appointments", methods=["POST"])
    def create_appointment_v2():
        data = json_payload()
        require_fields(data, ["patient", "date", "time", "careType"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente nÃ£o encontrado.")
        normalized_date = parse_appointment_date(data.get("date"))
        normalized_time = parse_appointment_time(data.get("time"))
        duration_minutes = parse_duration_minutes(data.get("duration"))
        professional_id, professional_name = resolve_professional_for_appointment(db, data)
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("careType"),
            data.get("agreementId"),
            data.get("agreementPlan"),
            require_active=True,
        )

        new_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO agenda
            (id, paciente_id, professional_id, data, horario, duracao, status, motivo, profissional, forma_atendimento, convenio_id, convenio_nome, plano_convenio, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient["id"],
                professional_id,
                normalized_date,
                normalized_time,
                duration_minutes,
                data.get("status", "agendado"),
                data.get("reason"),
                professional_name,
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                data.get("notes"),
                datetime.utcnow().isoformat(),
            ),
        )
        create_notification(
            db,
            "Novo agendamento",
            f"{patient['nome']} Ã s {normalized_time} em {normalized_date}",
            linked_date=normalized_date,
        )
        create_automatic_charge_for_appointment(
            db,
            appointment_id=new_id,
            patient_id=patient["id"],
            appointment_date=normalized_date,
            appointment_time=normalized_time,
            care_type=care_type,
            agreement_id=agreement_id,
            agreement_name=agreement_name,
            agreement_plan=agreement_plan,
        )
        db.commit()

        row = db.execute(
            """
            SELECT
                a.*,
                p.nome,
                p.cpf,
                pr.name AS professional_name,
                pr.specialty AS professional_specialty
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            LEFT JOIN professionals pr ON a.professional_id = pr.id
            WHERE a.id = ?
            """,
            (new_id,),
        ).fetchone()

        return jsonify({"success": True, "data": appointment_row_to_payload(row)})

    @app.route("/api/appointments/<appointment_id>", methods=["PUT"])
    def update_appointment_v2(appointment_id):
        data = json_payload()
        db = get_db()

        existing = db.execute(
            """
            SELECT id, paciente_id, professional_id, data, horario, profissional, duracao, forma_atendimento, convenio_id, convenio_nome, plano_convenio
            FROM agenda
            WHERE id = ?
            """,
            (appointment_id,),
        ).fetchone()
        if existing is None:
            abort(404, description="Agendamento não encontrado.")

        updates = []
        params = []

        next_date = existing["data"]
        next_time = existing["horario"]
        next_professional = existing["profissional"]
        next_professional_id = existing["professional_id"]
        next_care_type = existing["forma_atendimento"] if "forma_atendimento" in set(existing.keys()) else "particular"
        next_agreement_id = existing["convenio_id"] if "convenio_id" in set(existing.keys()) else None
        next_agreement_plan = existing["plano_convenio"] if "plano_convenio" in set(existing.keys()) else None

        if "patient_id" in data:
            patient_id = data.get("patient_id")
            if is_blank(patient_id):
                abort(400, description="patient_id é obrigatório.")
            ensure_patient_exists(db, patient_id)
            updates.append("paciente_id = ?")
            params.append(patient_id)
        elif "patient" in data:
            patient_name = data.get("patient")
            if is_blank(patient_name):
                abort(400, description="patient é obrigatório.")
            patient = find_patient_by_name(db, patient_name)
            if patient is None:
                abort(400, description="Paciente não encontrado.")
            updates.append("paciente_id = ?")
            params.append(patient["id"])

        if "date" in data:
            next_date = parse_appointment_date(data.get("date"))
            updates.append("data = ?")
            params.append(next_date)

        if "time" in data:
            next_time = parse_appointment_time(data.get("time"))
            updates.append("horario = ?")
            params.append(next_time)

        if "professional" in data:
            resolved_id, resolved_name = resolve_professional_for_appointment(db, data)
            next_professional = resolved_name
            next_professional_id = resolved_id
            updates.append("professional_id = ?")
            params.append(next_professional_id)
            updates.append("profissional = ?")
            params.append(next_professional)
        elif "professional_id" in data:
            resolved_id, resolved_name = resolve_professional_for_appointment(db, data)
            next_professional = resolved_name
            next_professional_id = resolved_id
            updates.append("professional_id = ?")
            params.append(next_professional_id)
            updates.append("profissional = ?")
            params.append(next_professional)

        optional_mapping = {
            "reason": "motivo",
            "notes": "observacoes",
            "status": "status",
        }
        for field, column in optional_mapping.items():
            if field in data:
                updates.append(f"{column} = ?")
                params.append(data.get(field))

        if "duration" in data:
            updates.append("duracao = ?")
            params.append(parse_duration_minutes(data.get("duration")))

        if any(field in data for field in {"careType", "agreementId", "agreementPlan"}):
            next_care_type, next_agreement_id, next_agreement_name, next_agreement_plan = resolve_agreement_for_care(
                db,
                data.get("careType") or next_care_type,
                data.get("agreementId") if "agreementId" in data else next_agreement_id,
                data.get("agreementPlan") if "agreementPlan" in data else next_agreement_plan,
                require_active=True,
            )
            updates.extend(
                [
                    "forma_atendimento = ?",
                    "convenio_id = ?",
                    "convenio_nome = ?",
                    "plano_convenio = ?",
                ]
            )
            params.extend([next_care_type, next_agreement_id, next_agreement_name, next_agreement_plan])

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
            SELECT
                a.*,
                p.nome,
                p.cpf,
                pr.name AS professional_name,
                pr.specialty AS professional_specialty
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            LEFT JOIN professionals pr ON a.professional_id = pr.id
            WHERE a.id = ?
            """,
            (appointment_id,),
        ).fetchone()

        app.logger.info(
            "Appointment updated id=%s date=%s time=%s professional=%s",
            appointment_id,
            row["data"] if row else next_date,
            row["horario"] if row else next_time,
            row["profissional"] if row else next_professional,
        )

        return jsonify({"success": True, "data": appointment_row_to_payload(row)})

    @app.route("/api/appointments/<appointment_id>", methods=["DELETE"])
    def delete_appointment_v2(appointment_id):
        db = get_db()
        cursor = db.execute("DELETE FROM agenda WHERE id = ?", (appointment_id,))
        if cursor.rowcount == 0:
            abort(404, description="Agendamento nÃ£o encontrado.")
        db.commit()
        return jsonify({"success": True, "data": {"id": appointment_id}})

    # ----------------------
    # SESSÃ•ES
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
            abort(404, description="SessÃ£o nÃ£o encontrada.")
        return jsonify(row_to_dict(row))

    @app.route("/api/sessoes/<sessao_id>", methods=["PATCH"])
    def update_sessao(sessao_id):
        data = json_payload()
        allowed = ["paciente_id", "data", "atividade", "observacoes", "evolucao"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")

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
            abort(404, description="SessÃ£o nÃ£o encontrada.")
        db.commit()

        return jsonify({"id": sessao_id})

    @app.route("/api/sessoes/<sessao_id>", methods=["DELETE"])
    def delete_sessao(sessao_id):
        db = get_db()
        cursor = db.execute("DELETE FROM sessoes WHERE id = ?", (sessao_id,))
        if cursor.rowcount == 0:
            abort(404, description="SessÃ£o nÃ£o encontrada.")
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

        require_fields(data, ["paciente_id", "data", "valor"])

        db = get_db()

        ensure_patient_exists(db, data.get("paciente_id"))
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("forma_atendimento") or "particular",
            data.get("convenio_id"),
            data.get("plano_convenio"),
            require_active=True,
        )
        status_value = str(data.get("status") or "").strip()
        if care_type == "particular":
            if not status_value:
                abort(400, description="status e obrigatorio para atendimento particular.")
            status_value = parse_particular_status(status_value)
        else:
            status_value = "Convenio"
        amount_value = normalize_financial_amount(
            parse_float("valor", data.get("valor")),
            status_value,
            care_type,
        )

        new_id = str(uuid.uuid4())

        db.execute(
            """
            INSERT INTO financeiro
            (id, paciente_id, data, valor, status, metodo_pagamento, forma_atendimento, convenio_id, convenio_nome, plano_convenio, observacoes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                data.get("paciente_id"),
                data.get("data"),
                amount_value,
                status_value,
                data.get("metodo_pagamento"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
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
            abort(404, description="LanÃ§amento nÃ£o encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/financeiro/<lancamento_id>", methods=["PATCH"])
    def update_financeiro(lancamento_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user
        data = json_payload()
        allowed = [
            "paciente_id",
            "data",
            "valor",
            "status",
            "metodo_pagamento",
            "observacoes",
            "forma_atendimento",
            "convenio_id",
            "plano_convenio",
        ]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")

        db = get_db()
        if "paciente_id" in updates:
            ensure_patient_exists(db, updates["paciente_id"])

        if "valor" in updates:
            updates["valor"] = parse_float("valor", updates["valor"])

        if any(key in updates for key in {"forma_atendimento", "convenio_id", "plano_convenio"}):
            care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
                db,
                updates.get("forma_atendimento") or "particular",
                updates.get("convenio_id"),
                updates.get("plano_convenio"),
                require_active=True,
            )
            updates["forma_atendimento"] = care_type
            updates["convenio_id"] = agreement_id
            updates["convenio_nome"] = agreement_name
            updates["plano_convenio"] = agreement_plan
            if care_type == "convenio":
                updates["status"] = "Convenio"
            elif "status" in updates and is_blank(updates.get("status")):
                abort(400, description="status e obrigatorio para atendimento particular.")

        set_clause = ", ".join(f"{key} = ?" for key in updates)
        params = list(updates.values()) + [lancamento_id]

        cursor = db.execute(
            f"UPDATE financeiro SET {set_clause} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="LanÃ§amento nÃ£o encontrado.")
        db.commit()

        return jsonify({"id": lancamento_id})

    @app.route("/api/financeiro/<lancamento_id>", methods=["DELETE"])
    def delete_financeiro(lancamento_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user
        db = get_db()
        cursor = db.execute("DELETE FROM financeiro WHERE id = ?", (lancamento_id,))
        if cursor.rowcount == 0:
            abort(404, description="LanÃ§amento nÃ£o encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/financial", methods=["GET"])
    def get_financial():
        user = require_auth()
        if not isinstance(user, dict):
            return user
        db = get_db()
        rows = db.execute(
            """
            SELECT f.*, p.nome, p.cpf
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            ORDER BY f.data DESC
            """
        ).fetchall()
        payload = [financial_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/financial/patients", methods=["GET"])
    def get_financial_patients():
        user = require_auth()
        if not isinstance(user, dict):
            return user

        db = get_db()
        patient_rows = db.execute(
            """
            SELECT id, nome, cpf, forma_atendimento, convenio_id, convenio_nome, plano_convenio
            FROM pacientes
            ORDER BY nome
            """
        ).fetchall()

        financial_rows = db.execute(
            """
            SELECT *
            FROM financeiro
            ORDER BY date(data) DESC, created_at DESC
            """
        ).fetchall()
        grouped_rows = {}
        for row in financial_rows:
            grouped_rows.setdefault(row["paciente_id"], []).append(row)

        settings_rows = db.execute(
            """
            SELECT patient_id, auto_charge, consultation_price, created_at, updated_at
            FROM financial_settings
            """
        ).fetchall()
        settings_map = {row["patient_id"]: row for row in settings_rows}

        payload = []
        for patient in patient_rows:
            rows = grouped_rows.get(patient["id"], [])
            summary = build_financial_summary(rows)
            settings_row = settings_map.get(patient["id"])
            if settings_row is None:
                settings_payload = {
                    "autoCharge": False,
                    "consultationPrice": 0,
                    "createdAt": None,
                    "updatedAt": None,
                }
            else:
                settings_payload = settings_row_to_payload(settings_row)

            payload.append(
                {
                    "id": patient["id"],
                    "name": patient["nome"],
                    "cpf": patient["cpf"],
                    "careType": patient["forma_atendimento"] or "particular",
                    "agreementId": patient["convenio_id"],
                    "agreementName": patient["convenio_nome"],
                    "agreementPlan": patient["plano_convenio"],
                    "summary": summary,
                    "settings": settings_payload,
                    "transactionsCount": len(rows),
                }
            )

        return jsonify({"success": True, "data": payload})

    @app.route("/api/financial/patient/<patient_id>", methods=["GET"])
    def get_financial_patient_detail(patient_id):
        user = require_auth()
        if not isinstance(user, dict):
            return user

        db = get_db()
        patient = find_patient_by_id(db, patient_id)
        if patient is None:
            abort(404, description="Paciente nao encontrado.")

        settings_row = get_financial_settings(db, patient_id)
        financial_rows = get_patient_financial_rows(db, patient_id)
        transactions = [financial_row_to_payload(row) for row in financial_rows]

        payload = {
            "patient": {
                "id": patient["id"],
                "name": patient["nome"],
                "cpf": patient["cpf"],
                "careType": patient["forma_atendimento"] or "particular",
                "agreementId": patient["convenio_id"],
                "agreementName": patient["convenio_nome"],
                "agreementPlan": patient["plano_convenio"],
            },
            "summary": build_financial_summary(financial_rows),
            "settings": settings_row_to_payload(settings_row),
            "transactions": transactions,
        }
        return jsonify({"success": True, "data": payload})

    @app.route("/api/financial/patient/<patient_id>/settings", methods=["PUT"])
    def update_financial_patient_settings(patient_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        db = get_db()
        patient = find_patient_by_id(db, patient_id)
        if patient is None:
            abort(404, description="Paciente nao encontrado.")

        data = json_payload()
        if "autoCharge" not in data and "consultationPrice" not in data:
            abort(400, description="Nenhum campo valido para atualizacao.")

        current = get_financial_settings(db, patient_id)
        auto_charge = bool(current["auto_charge"])
        consultation_price = float(current["consultation_price"] or 0)

        if "autoCharge" in data:
            auto_charge = parse_boolean(data.get("autoCharge"), "autoCharge")
        if "consultationPrice" in data:
            consultation_price = parse_optional_float(
                "consultationPrice",
                data.get("consultationPrice"),
                default=0,
            )
            consultation_price = max(0, float(consultation_price or 0))

        now = now_utc_iso()
        db.execute(
            """
            UPDATE financial_settings
            SET auto_charge = ?, consultation_price = ?, updated_at = ?
            WHERE patient_id = ?
            """,
            (1 if auto_charge else 0, consultation_price, now, patient_id),
        )
        db.commit()

        updated = get_financial_settings(db, patient_id)
        return jsonify({"success": True, "data": settings_row_to_payload(updated)})

    @app.route("/api/financial/patient/<patient_id>/transactions", methods=["POST"])
    def create_financial_patient_transaction(patient_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        db = get_db()
        patient = find_patient_by_id(db, patient_id)
        if patient is None:
            abort(404, description="Paciente nao encontrado.")

        data = json_payload()
        require_fields(data, ["date", "amount", "careType"])

        normalized_date = parse_appointment_date(data.get("date"))
        amount_value = parse_float("amount", data.get("amount"))
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("careType"),
            data.get("agreementId"),
            data.get("agreementPlan"),
            require_active=True,
        )

        explicit_status = str(data.get("status") or "").strip()
        if care_type == "convenio":
            status_value = "Convenio"
        elif explicit_status:
            status_value = parse_particular_status(explicit_status)
        else:
            status_value = "Pago" if amount_value >= 0 else "Pendente"
        amount_value = normalize_financial_amount(amount_value, status_value, care_type)

        transaction_type = str(data.get("type") or "").strip().lower()
        if not transaction_type:
            if care_type == "particular" and status_value in {"Pendente", "Atrasado"}:
                transaction_type = "charge"
            else:
                transaction_type = "payment" if amount_value >= 0 else "charge"
        if transaction_type not in {"payment", "charge", "adjustment"}:
            abort(400, description="type invalido. Use payment, charge ou adjustment.")

        now = now_utc_iso()
        new_id = str(uuid.uuid4())
        db.execute(
            """
            INSERT INTO financeiro
            (
                id, paciente_id, data, valor, status, metodo_pagamento,
                forma_atendimento, convenio_id, convenio_nome, plano_convenio,
                observacoes, created_at, updated_at, transaction_type, source, appointment_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient_id,
                normalized_date,
                amount_value,
                status_value,
                data.get("method"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                data.get("notes"),
                now,
                now,
                transaction_type,
                "manual_patient_panel",
                data.get("appointmentId"),
            ),
        )
        db.commit()

        row = db.execute(
            """
            SELECT f.*, p.nome, p.cpf
            FROM financeiro f
            LEFT JOIN pacientes p ON p.id = f.paciente_id
            WHERE f.id = ?
            """,
            (new_id,),
        ).fetchone()
        return jsonify({"success": True, "data": financial_row_to_payload(row)})

    @app.route("/api/financial", methods=["POST"])
    def create_financial_record_v2():
        user = require_admin()
        if not isinstance(user, dict):
            return user
        data = json_payload()
        require_fields(data, ["patient", "date", "amount", "careType"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente nÃ£o encontrado.")

        amount_value = parse_float("amount", data.get("amount"))
        care_type, agreement_id, agreement_name, agreement_plan = resolve_agreement_for_care(
            db,
            data.get("careType"),
            data.get("agreementId"),
            data.get("agreementPlan"),
            require_active=True,
        )
        status_value = str(data.get("status") or "").strip()
        if care_type == "particular":
            if not status_value:
                abort(400, description="status e obrigatorio para atendimento particular.")
            status_value = parse_particular_status(status_value)
        else:
            status_value = "Convenio"
        amount_value = normalize_financial_amount(amount_value, status_value, care_type)

        transaction_type = str(data.get("type") or "payment").strip().lower()
        if transaction_type not in {"payment", "charge", "adjustment"}:
            abort(400, description="type invalido. Use payment, charge ou adjustment.")
        source = str(data.get("source") or "manual").strip() or "manual"

        new_id = str(uuid.uuid4())
        now = now_utc_iso()
        db.execute(
            """
            INSERT INTO financeiro
            (
                id, paciente_id, data, valor, status, metodo_pagamento,
                forma_atendimento, convenio_id, convenio_nome, plano_convenio,
                observacoes, created_at, updated_at, transaction_type, source, appointment_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                new_id,
                patient["id"],
                data.get("date"),
                amount_value,
                status_value,
                data.get("method"),
                care_type,
                agreement_id,
                agreement_name,
                agreement_plan,
                data.get("notes"),
                now,
                now,
                transaction_type,
                source,
                data.get("appointmentId"),
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
            SELECT f.*, p.nome, p.cpf
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            WHERE f.id = ?
            """,
            (new_id,),
        ).fetchone()
        return jsonify({"success": True, "data": financial_row_to_payload(row)})

    @app.route("/api/financial/<financial_id>", methods=["PUT"])
    def update_financial_record_v2(financial_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user

        data = json_payload()
        mapping = {
            "patient": "paciente_id",
            "date": "data",
            "amount": "valor",
            "status": "status",
            "method": "metodo_pagamento",
            "notes": "observacoes",
        }
        updates = []
        params = []
        db = get_db()

        existing = db.execute(
            """
            SELECT forma_atendimento, convenio_id, plano_convenio, status
            FROM financeiro
            WHERE id = ?
            LIMIT 1
            """,
            (financial_id,),
        ).fetchone()
        if existing is None:
            abort(404, description="LanÃ§amento nÃ£o encontrado.")

        next_care_type = existing["forma_atendimento"] if "forma_atendimento" in set(existing.keys()) else "particular"
        next_agreement_id = existing["convenio_id"] if "convenio_id" in set(existing.keys()) else None
        next_agreement_plan = existing["plano_convenio"] if "plano_convenio" in set(existing.keys()) else None
        existing_status = str(existing["status"] or "").strip()

        for field, column in mapping.items():
            if field not in data:
                continue
            value = data.get(field)
            if field == "patient":
                patient = find_patient_by_name(db, value)
                if patient is None:
                    abort(400, description="Paciente nÃ£o encontrado.")
                value = patient["id"]
            if field == "amount":
                value = parse_float("amount", value)
            if field == "status":
                value = parse_status(value)
            updates.append(f"{column} = ?")
            params.append(value)

        if any(field in data for field in {"careType", "agreementId", "agreementPlan"}):
            next_care_type, next_agreement_id, next_agreement_name, next_agreement_plan = resolve_agreement_for_care(
                db,
                data.get("careType") or next_care_type,
                data.get("agreementId") if "agreementId" in data else next_agreement_id,
                data.get("agreementPlan") if "agreementPlan" in data else next_agreement_plan,
                require_active=True,
            )
            updates.extend(
                [
                    "forma_atendimento = ?",
                    "convenio_id = ?",
                    "convenio_nome = ?",
                    "plano_convenio = ?",
                ]
            )
            params.extend([next_care_type, next_agreement_id, next_agreement_name, next_agreement_plan])
            if next_care_type == "convenio":
                updates.append("status = ?")
                params.append("Convenio")
            else:
                status_candidate = parse_particular_status(str(data.get("status") or existing_status).strip())
                if not status_candidate or status_candidate.lower() == "convenio":
                    abort(400, description="status e obrigatorio para atendimento particular.")
                if "status" in data:
                    updates.append("status = ?")
                    params.append(status_candidate)

        if "status" in data and str(next_care_type or "particular").strip().lower() != "convenio":
            status_candidate = parse_particular_status(str(data.get("status") or existing_status).strip())
            if "status" in mapping:
                params_index = None
                for index, assignment in enumerate(updates):
                    if assignment == "status = ?":
                        params_index = index
                        break
                if params_index is not None:
                    params[params_index] = status_candidate

        if not updates:
            abort(400, description="Nenhum campo valido para atualizacao.")

        updates.append("updated_at = ?")
        params.append(now_utc_iso())

        params.append(financial_id)
        cursor = db.execute(
            f"UPDATE financeiro SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if cursor.rowcount == 0:
            abort(404, description="LanÃ§amento nÃ£o encontrado.")
        db.commit()

        row = db.execute(
            """
            SELECT f.*, p.nome, p.cpf
            FROM financeiro f
            LEFT JOIN pacientes p ON f.paciente_id = p.id
            WHERE f.id = ?
            """,
            (financial_id,),
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
            abort(404, description="Registro nÃ£o encontrado.")
        return jsonify(row_to_dict(row))

    @app.route("/api/registros/<registro_id>", methods=["PATCH"])
    def update_registro(registro_id):
        data = json_payload()
        allowed = ["paciente_id", "paciente_nome", "data", "hora", "observacoes"]
        updates = {key: data[key] for key in allowed if key in data}
        if not updates:
            abort(400, description="Nenhum campo vÃ¡lido para atualizaÃ§Ã£o.")

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
            abort(404, description="Registro nÃ£o encontrado.")
        db.commit()

        return jsonify({"id": registro_id})

    @app.route("/api/registros/<registro_id>", methods=["DELETE"])
    def delete_registro(registro_id):
        db = get_db()
        cursor = db.execute("DELETE FROM registros WHERE id = ?", (registro_id,))
        if cursor.rowcount == 0:
            abort(404, description="Registro nÃ£o encontrado.")
        db.commit()
        return "", 204

    @app.route("/api/records", methods=["GET"])
    def get_records():
        db = get_db()
        rows = db.execute(
            """
            SELECT r.*, p.cpf
            FROM registros r
            LEFT JOIN pacientes p ON p.id = r.paciente_id
            ORDER BY data DESC, hora DESC
            """
        ).fetchall()
        payload = [medical_record_row_to_payload(row) for row in rows]
        return jsonify({"success": True, "data": payload})

    @app.route("/api/records/patient/<patient_id>", methods=["GET"])
    def get_records_by_patient(patient_id):
        db = get_db()
        patient = find_patient_by_id(db, patient_id)
        if patient is None:
            abort(404, description="Paciente nao encontrado.")

        record_rows = db.execute(
            """
            SELECT
                r.id,
                r.paciente_id,
                r.paciente_nome,
                p.cpf,
                r.data,
                r.hora,
                r.observacoes,
                r.anexos,
                r.created_at,
                NULL AS descricao,
                NULL AS evolucao,
                NULL AS professional_name
            FROM registros r
            LEFT JOIN pacientes p ON p.id = r.paciente_id
            WHERE r.paciente_id = ?
            """,
            (patient_id,),
        ).fetchall()
        session_rows = db.execute(
            """
            SELECT
                s.id,
                s.paciente_id,
                p.nome AS paciente_nome,
                p.cpf,
                s.data,
                '' AS hora,
                s.observacoes,
                NULL AS anexos,
                s.created_at,
                s.atividade AS descricao,
                s.evolucao AS evolucao,
                NULL AS professional_name
            FROM sessoes s
            LEFT JOIN pacientes p ON p.id = s.paciente_id
            WHERE s.paciente_id = ?
            """,
            (patient_id,),
        ).fetchall()

        combined = [medical_record_row_to_payload(row) for row in record_rows]
        combined.extend([medical_record_row_to_payload(row) for row in session_rows])

        def _sort_key(item):
            date = item.get("date") or ""
            time = item.get("time") or ""
            registered = item.get("registeredAt") or ""
            return (date, time, registered)

        combined.sort(key=_sort_key, reverse=True)
        return jsonify({"success": True, "data": combined})

    @app.route("/api/records", methods=["POST"])
    def create_record_v2():
        data = json_payload()
        require_fields(data, ["patient", "date", "time"])
        db = get_db()
        patient = find_patient_by_name(db, data.get("patient"))
        if patient is None:
            abort(400, description="Paciente nÃ£o encontrado.")

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
            {
                "id": "professionals",
                "name": "Profissionais",
                "path": "/professionals",
                "keywords": ["equipe", "usuarios", "acesso"],
            },
            {
                "id": "agreements",
                "name": "Convenios",
                "path": "/agreements",
                "keywords": ["convenio", "planos", "saude"],
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
    # RELATÃ“RIO / EXPORTAÃ‡Ã•ES
    # ----------------------

    @app.route("/api/relatorio_pdf/<paciente_id>")
    def relatorio_pdf(paciente_id):
        user = require_admin()
        if not isinstance(user, dict):
            return user
        db = get_db()
        patient_row = db.execute("SELECT * FROM pacientes WHERE id = ?", (paciente_id,)).fetchone()
        if patient_row is None:
            abort(404, description="Paciente nÃ£o encontrado.")
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
        user = require_admin()
        if not isinstance(user, dict):
            return user
        db = get_db()
        rows = db.execute(
            """
            SELECT id, nome, idade, escola, responsavel, telefone, email, cep, endereco, numero, bairro, cidade, forma_atendimento, convenio_nome, plano_convenio, observacoes, created_at, updated_at
            FROM pacientes
            ORDER BY nome
            """
        ).fetchall()
        df = records_to_dataframe(
            rows,
            columns=[
                "id",
                "nome",
                "idade",
                "escola",
                "responsavel",
                "telefone",
                "email",
                "cep",
                "endereco",
                "numero",
                "bairro",
                "cidade",
                "forma_atendimento",
                "convenio_nome",
                "plano_convenio",
                "observacoes",
                "created_at",
                "updated_at",
            ],
        )
        return dataframe_to_excel_response(df, "Pacientes", "pacientes.xlsx")

    @app.route("/api/exportar/agenda")
    def exportar_agenda():
        db = get_db()
        rows = db.execute(
            """
            SELECT
                a.id,
                a.paciente_id,
                a.professional_id,
                p.nome AS paciente_nome,
                a.data,
                a.horario,
                a.status,
                a.motivo,
                COALESCE(pr.name, a.profissional) AS profissional,
                a.forma_atendimento,
                a.convenio_nome,
                a.plano_convenio,
                a.observacoes,
                a.created_at
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            LEFT JOIN professionals pr ON a.professional_id = pr.id
            ORDER BY a.data, a.horario
            """
        ).fetchall()
        df = records_to_dataframe(
            rows,
            columns=[
                "id",
                "paciente_id",
                "professional_id",
                "paciente_nome",
                "data",
                "horario",
                "status",
                "motivo",
                "profissional",
                "forma_atendimento",
                "convenio_nome",
                "plano_convenio",
                "observacoes",
                "created_at",
            ],
        )
        return dataframe_to_excel_response(df, "Agenda", "agenda.xlsx")

    @app.route("/api/exportar/financeiro")
    def exportar_financeiro():
        user = require_admin()
        if not isinstance(user, dict):
            return user
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
                f.forma_atendimento,
                f.convenio_nome,
                f.plano_convenio,
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
                "forma_atendimento",
                "convenio_nome",
                "plano_convenio",
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
            SELECT
                a.*,
                p.nome,
                p.cpf,
                pr.name AS professional_name,
                pr.specialty AS professional_specialty
            FROM agenda a
            LEFT JOIN pacientes p ON a.paciente_id = p.id
            LEFT JOIN professionals pr ON a.professional_id = pr.id
            WHERE a.data = ?
            ORDER BY a.horario
            """,
            (today_str,),
        ).fetchall()
        today_appointments = [appointment_row_to_payload(row) for row in today_rows]

        payments_rows = db.execute(
            """
            SELECT f.*, p.nome, p.cpf
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
            abort(404, description="NotificaÃ§Ã£o nÃ£o encontrada.")
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
            abort(400, description="Nenhum paciente cadastrado para gerar relatÃ³rios.")
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

    





