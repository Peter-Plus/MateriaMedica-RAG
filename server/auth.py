import hashlib
import hmac
import re
import secrets
from datetime import datetime, timedelta, timezone

from .db import connect, transaction, utcnow
from .config import MAX_USERS


USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,24}$")


class AuthError(ValueError):
    pass


def _hash_password(password, salt=None):
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1)
    return "scrypt$16384$8$1${}${}".format(salt.hex(), digest.hex())


def _verify_password(password, stored):
    try:
        _, n, r, p, salt_hex, expected_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt_hex),
                                n=int(n), r=int(r), p=int(p))
        return hmac.compare_digest(digest, bytes.fromhex(expected_hex))
    except (ValueError, TypeError):
        return False


def _new_session(con, user_id):
    token = secrets.token_urlsafe(32)
    expiry = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(timespec="seconds")
    con.execute("INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (hashlib.sha256(token.encode()).hexdigest(), user_id, expiry))
    return token


def register(username, password):
    if not isinstance(username, str) or not USERNAME_RE.fullmatch(username):
        raise AuthError("用户名须为 3–24 位英文字母、数字或下划线")
    if not isinstance(password, str) or not 8 <= len(password) <= 128:
        raise AuthError("密码须为 8–128 位")
    with transaction() as con:
        if con.execute("SELECT COUNT(*) FROM users").fetchone()[0] >= MAX_USERS:
            raise AuthError("注册人数已达上限")
        if con.execute("SELECT 1 FROM users WHERE username=?", (username,)).fetchone():
            raise AuthError("用户名已存在")
        cur = con.execute("INSERT INTO users(username, password_hash, created_at) VALUES (?, ?, ?)",
                          (username, _hash_password(password), utcnow()))
        token = _new_session(con, cur.lastrowid)
    return {"token": token, "user": {"id": cur.lastrowid, "username": username}}


def login(username, password):
    if not isinstance(username, str) or not isinstance(password, str):
        raise AuthError("用户名或密码错误")
    with transaction() as con:
        row = con.execute("SELECT id, username, password_hash FROM users WHERE username=?", (username,)).fetchone()
        if not row or not _verify_password(password, row["password_hash"]):
            raise AuthError("用户名或密码错误")
        token = _new_session(con, row["id"])
    return {"token": token, "user": {"id": row["id"], "username": row["username"]}}


def user_for_token(token):
    if not token:
        return None
    digest = hashlib.sha256(token.encode()).hexdigest()
    with connect() as con:
        row = con.execute(
            "SELECT u.id, u.username FROM sessions s JOIN users u ON u.id=s.user_id "
            "WHERE s.token_hash=? AND s.expires_at>?",
            (digest, utcnow()),
        ).fetchone()
    return dict(row) if row else None


def logout(token):
    with transaction() as con:
        con.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))

