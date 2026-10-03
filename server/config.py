import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def load_dotenv(path=None):
    path = path or ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_dotenv()
DATA_DIR = Path(os.getenv("BCRAG_DATA_DIR", str(ROOT / "data"))).resolve()
DB_PATH = DATA_DIR / "bcrag.sqlite3"
HOST = os.getenv("BCRAG_HOST", "127.0.0.1")
PORT = int(os.getenv("BCRAG_PORT", "8000"))
API_KEY = os.getenv("BCRAG_API_KEY", "")
API_BASE_URL = os.getenv("BCRAG_API_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").rstrip("/")
CHAT_MODEL = os.getenv("BCRAG_CHAT_MODEL", "qwen3.7-flash")
EMBED_MODEL = os.getenv("BCRAG_EMBED_MODEL", "text-embedding-v4")
EMBED_DIMENSIONS = int(os.getenv("BCRAG_EMBED_DIMENSIONS", "256"))
DAILY_CHAT_LIMIT = int(os.getenv("BCRAG_DAILY_CHAT_LIMIT", "40"))
GLOBAL_DAILY_CHAT_LIMIT = int(os.getenv("BCRAG_GLOBAL_DAILY_CHAT_LIMIT", "200"))
MAX_USERS = int(os.getenv("BCRAG_MAX_USERS", "100"))
MAX_DOCUMENT_BYTES = int(os.getenv("BCRAG_MAX_DOCUMENT_BYTES", str(20 * 1024 * 1024)))

