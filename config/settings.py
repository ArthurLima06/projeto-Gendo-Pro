from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = BASE_DIR / "backend"
FRONTEND_DIR = BASE_DIR / "frontend"
DATABASE_DIR = BASE_DIR / "database"
LOGS_DIR = BASE_DIR / "logs"
FRONTEND_DIST_DIR = FRONTEND_DIR / "dist"
ENV_FILE = BASE_DIR / "config" / ".env"
