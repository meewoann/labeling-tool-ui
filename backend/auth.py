"""
auth.py — đăng nhập bằng username + password.

Không phụ thuộc FastAPI (chỉ dùng thư viện chuẩn của Python), nên test được riêng.

Cách hoạt động:
  - Mật khẩu được băm bằng scrypt kèm "muối" ngẫu nhiên, DB chỉ lưu bản băm.
  - Đăng nhập đúng → tạo 1 phiên (session), trả token ngẫu nhiên cho trình duyệt.
    DB chỉ lưu bản băm SHA-256 của token.
  - Đăng nhập sai quá nhiều lần liên tiếp thì bị khoá tạm (LoginLimiter).

Mục lục:
  1. Băm & kiểm tra mật khẩu
  2. Tài khoản
  3. Phiên đăng nhập
  4. Giới hạn đăng nhập sai
"""

import base64
import hashlib
import hmac
import re
import secrets
import sqlite3
import time

SESSION_DAYS = 14                 # đăng nhập 1 lần dùng được 14 ngày
MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9_.-]{3,32}$")


# ==========================================================
# 1. BĂM & KIỂM TRA MẬT KHẨU
# ==========================================================

# Tham số scrypt. Ghi luôn vào chuỗi băm để sau này tăng độ khó mà mật khẩu cũ vẫn kiểm tra được.
_SCRYPT_N, _SCRYPT_R, _SCRYPT_P = 2 ** 14, 8, 1


def _b64(data):
    return base64.b64encode(data).decode("ascii")


def hash_password(password):
    """Trả về chuỗi dạng  scrypt$N$r$p$muối$bản-băm  (muối khác nhau cho mỗi lần băm)."""
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P)
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${_b64(salt)}${_b64(digest)}"


def verify_password(password, stored):
    """Mật khẩu có khớp bản băm đã lưu không? (so sánh không rò rỉ thời gian)"""
    try:
        scheme, n, r, p, salt, digest = stored.split("$")
        if scheme != "scrypt":
            return False
        expected = base64.b64decode(digest)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=base64.b64decode(salt),
                                n=int(n), r=int(r), p=int(p), dklen=len(expected))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, expected)


# Dùng khi username không tồn tại: vẫn băm 1 lần cho tốn thời gian y như khi có user,
# để kẻ tấn công không đoán được username nào có thật qua thời gian phản hồi.
_DUMMY_HASH = hash_password("not-a-real-password")


def validate_username(username):
    if not USERNAME_PATTERN.match(username):
        raise ValueError("Username phải dài 3-32 ký tự, chỉ gồm chữ, số, dấu chấm, gạch ngang, gạch dưới")


def validate_password(password):
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(f"Mật khẩu phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(f"Mật khẩu tối đa {MAX_PASSWORD_LENGTH} ký tự")


# ==========================================================
# 2. TÀI KHOẢN
# ==========================================================

def count_users(conn):
    return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]


def create_user(conn, username, password, is_admin=False):
    """Tạo tài khoản, trả về id."""
    validate_username(username)
    validate_password(password)
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)",
                (username, hash_password(password), int(is_admin)),
            )
    except sqlite3.IntegrityError:
        raise ValueError(f"Username '{username}' đã tồn tại")
    return cur.lastrowid


def create_first_admin(conn, username, password):
    """
    Tạo tài khoản admin đầu tiên. Chỉ được phép khi database chưa có user nào.
    Dùng BEGIN IMMEDIATE để 2 người cùng bấm "tạo" một lúc cũng chỉ 1 người thành công.
    """
    validate_username(username)
    validate_password(password)
    conn.execute("BEGIN IMMEDIATE")
    try:
        if count_users(conn) > 0:
            raise PermissionError("Đã có tài khoản, không thể tạo tài khoản đầu tiên nữa")
        cur = conn.execute(
            "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, 1)",
            (username, hash_password(password)),
        )
        conn.commit()
        return cur.lastrowid
    except BaseException:
        conn.rollback()
        raise


def list_users(conn):
    return conn.execute("SELECT id, username, is_admin, created_at FROM users ORDER BY id").fetchall()


def find_user(conn, username):
    return conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()


def get_user(conn, user_id):
    return conn.execute(
        "SELECT id, username, is_admin, created_at FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def delete_user(conn, user_id):
    """Xoá tài khoản (các phiên đăng nhập của họ tự bị xoá theo). Project/ảnh họ đã làm vẫn còn."""
    with conn:
        deleted = conn.execute("DELETE FROM users WHERE id = ?", (user_id,)).rowcount
    if deleted == 0:
        raise LookupError("Không tìm thấy user")


def authenticate(conn, username, password):
    """Đúng username + password thì trả về dòng user, sai thì trả về None."""
    user = find_user(conn, username)
    stored = user["password_hash"] if user else _DUMMY_HASH
    matches = verify_password(password, stored)
    return user if (user and matches) else None


def set_password(conn, user_id, new_password, keep_token=None):
    """
    Đổi mật khẩu. Mọi phiên đăng nhập khác của người này bị đăng xuất
    (trừ phiên có token = keep_token, thường là phiên đang đổi mật khẩu).
    """
    validate_password(new_password)
    keep_hash = _hash_token(keep_token) if keep_token else ""
    with conn:
        changed = conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new_password), user_id)
        ).rowcount
        if changed == 0:
            raise LookupError("Không tìm thấy user")
        conn.execute("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", (user_id, keep_hash))


# ==========================================================
# 3. PHIÊN ĐĂNG NHẬP
# ==========================================================

def _hash_token(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(conn, user_id):
    """Tạo phiên mới, trả về token (chỉ lúc này mới thấy token thật, DB chỉ giữ bản băm)."""
    token = secrets.token_urlsafe(32)
    with conn:
        conn.execute(
            "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', ?))",
            (_hash_token(token), user_id, f"+{SESSION_DAYS} days"),
        )
        conn.execute("DELETE FROM sessions WHERE expires_at < datetime('now')")  # dọn phiên hết hạn
    return token


def get_user_by_token(conn, token):
    """Token còn hạn thì trả về dòng user, ngược lại trả về None."""
    if not token:
        return None
    return conn.execute(
        """SELECT u.id, u.username, u.is_admin, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id
           WHERE s.token_hash = ? AND s.expires_at > datetime('now')""",
        (_hash_token(token),),
    ).fetchone()


def delete_session(conn, token):
    with conn:
        conn.execute("DELETE FROM sessions WHERE token_hash = ?", (_hash_token(token),))


# ==========================================================
# 4. GIỚI HẠN ĐĂNG NHẬP SAI
# ==========================================================

class LoginLimiter:
    """
    Đăng nhập sai quá max_attempts lần trong window giây thì khoá tạm theo cặp (username, địa chỉ IP).
    Lưu trong bộ nhớ: tắt server là xoá hết (đủ dùng khi chạy 1 tiến trình).
    """

    def __init__(self, max_attempts=5, window=300):
        self.max_attempts = max_attempts
        self.window = window
        self._failures = {}  # {(username, ip): [thời điểm sai, ...]}

    def _recent(self, key, now):
        recent = [t for t in self._failures.get(key, []) if now - t < self.window]
        self._failures[key] = recent
        return recent

    def is_blocked(self, username, ip, now=None):
        now = time.time() if now is None else now
        return len(self._recent((username.lower(), ip), now)) >= self.max_attempts

    def record_failure(self, username, ip, now=None):
        now = time.time() if now is None else now
        self._recent((username.lower(), ip), now).append(now)

    def reset(self, username, ip):
        self._failures.pop((username.lower(), ip), None)
