import os
import sqlite3
import uuid
from datetime import datetime

from flask import g
from werkzeug.security import generate_password_hash

from config.settings import DATABASE_DIR


def get_db():
    """Retorna uma conexao com o banco de dados SQLite atual (por request)."""
    if "db" not in g:
        g.db = sqlite3.connect(
            DATABASE_DIR / "database.db",
            detect_types=sqlite3.PARSE_DECLTYPES,
            check_same_thread=False,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(e=None):
    """Fecha a conexao com o banco de dados no final do request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _ensure_column(db, table_name, column_name, ddl):
    existing = {row["name"] for row in db.execute(f"PRAGMA table_info({table_name})").fetchall()}
    if column_name not in existing:
        db.execute(f"ALTER TABLE {table_name} ADD COLUMN {ddl}")


def _seed_default_admin(db):
    row = db.execute("SELECT COUNT(*) AS total FROM professionals").fetchone()
    if row and row["total"] > 0:
        return

    now = datetime.utcnow().isoformat()
    admin_name = os.getenv("GENDO_ADMIN_NAME", "Administrador GridTime")
    admin_email = os.getenv("GENDO_ADMIN_EMAIL", "admin@gridtime.local").strip().lower()
    admin_password = os.getenv("GENDO_ADMIN_PASSWORD", "Admin@123")

    db.execute(
        """
        INSERT INTO professionals
        (id, name, email, password_hash, phone, role, future_plan, future_status, future_company_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            str(uuid.uuid4()),
            admin_name,
            admin_email,
            generate_password_hash(admin_password),
            None,
            "admin",
            None,
            "active",
            None,
            now,
            now,
        ),
    )


def init_db():
    """Inicializa o banco de dados executando o schema SQL e migracoes incrementais."""
    db = get_db()
    schema_path = DATABASE_DIR / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")

    with schema_path.open("r", encoding="utf-8") as f:
        db.executescript(f.read())

    _ensure_column(db, "agenda", "duracao", "duracao INTEGER NOT NULL DEFAULT 60")
    _ensure_column(db, "agenda", "professional_id", "professional_id TEXT")

    _ensure_column(db, "professionals", "future_plan", "future_plan TEXT")
    _ensure_column(db, "professionals", "future_status", "future_status TEXT NOT NULL DEFAULT 'active'")
    _ensure_column(db, "professionals", "future_company_id", "future_company_id TEXT")
    _ensure_column(db, "professionals", "specialty", "specialty TEXT")
    _ensure_column(db, "pacientes", "cep", "cep TEXT")
    _ensure_column(db, "pacientes", "endereco", "endereco TEXT")
    _ensure_column(db, "pacientes", "numero", "numero TEXT")
    _ensure_column(db, "pacientes", "bairro", "bairro TEXT")
    _ensure_column(db, "pacientes", "cidade", "cidade TEXT")
    _ensure_column(db, "pacientes", "forma_atendimento", "forma_atendimento TEXT NOT NULL DEFAULT 'particular'")
    _ensure_column(db, "pacientes", "convenio_id", "convenio_id TEXT")
    _ensure_column(db, "pacientes", "convenio_nome", "convenio_nome TEXT")
    _ensure_column(db, "pacientes", "plano_convenio", "plano_convenio TEXT")
    _ensure_column(db, "pacientes", "updated_at", "updated_at TEXT")

    _ensure_column(db, "agenda", "forma_atendimento", "forma_atendimento TEXT NOT NULL DEFAULT 'particular'")
    _ensure_column(db, "agenda", "convenio_id", "convenio_id TEXT")
    _ensure_column(db, "agenda", "convenio_nome", "convenio_nome TEXT")
    _ensure_column(db, "agenda", "plano_convenio", "plano_convenio TEXT")

    _ensure_column(db, "financeiro", "forma_atendimento", "forma_atendimento TEXT NOT NULL DEFAULT 'particular'")
    _ensure_column(db, "financeiro", "convenio_id", "convenio_id TEXT")
    _ensure_column(db, "financeiro", "convenio_nome", "convenio_nome TEXT")
    _ensure_column(db, "financeiro", "plano_convenio", "plano_convenio TEXT")

    db.execute("CREATE INDEX IF NOT EXISTS idx_professionals_email ON professionals(email)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_agenda_professional_id ON agenda(professional_id)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions(token_hash)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_pacientes_forma_atendimento ON pacientes(forma_atendimento)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_agenda_forma_atendimento ON agenda(forma_atendimento)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_financeiro_forma_atendimento ON financeiro(forma_atendimento)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_convenios_status ON convenios(status)")

    _seed_default_admin(db)
    db.commit()
