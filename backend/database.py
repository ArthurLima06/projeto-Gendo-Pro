import sqlite3
from flask import g

from config.settings import DATABASE_DIR


def get_db():
    """Retorna uma conexão com o banco de dados SQLite atual (por request)."""
    if "db" not in g:
        g.db = sqlite3.connect(
            DATABASE_DIR / "database.db",
            detect_types=sqlite3.PARSE_DECLTYPES,
            check_same_thread=False,
        )
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(e=None):
    """Fecha a conexão com o banco de dados no final do request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Inicializa o banco de dados executando o schema SQL."""
    db = get_db()
    schema_path = DATABASE_DIR / "schema.sql"
    if not schema_path.exists():
        raise FileNotFoundError(f"Schema file not found: {schema_path}")
    with schema_path.open("r", encoding="utf-8") as f:
        db.executescript(f.read())
