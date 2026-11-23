"""
test_auth.py — kiểm tra auth.py (băm mật khẩu, tài khoản, phiên, khoá đăng nhập sai).
Chạy:  cd backend && python3 -m unittest -v
"""

import tempfile
import unittest
from pathlib import Path

import auth
import db


class AuthTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = db.connect(Path(self.tmp.name) / "test.db")
        db.init_db(self.conn)

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    # ----- mật khẩu -----
    def test_hash_is_salted_and_verifiable(self):
        h1, h2 = auth.hash_password("correct horse"), auth.hash_password("correct horse")
        self.assertNotEqual(h1, h2)                        # muối khác nhau → bản băm khác nhau
        self.assertNotIn("correct horse", h1)              # không chứa mật khẩu thật
        self.assertTrue(auth.verify_password("correct horse", h1))
        self.assertFalse(auth.verify_password("correct horsf", h1))
        self.assertFalse(auth.verify_password("x", "rác"))  # bản băm hỏng không gây lỗi

    def test_validation(self):
        for bad in ("ab", "has space", "a/b", "x" * 33, "tên-có-dấu", ""):
            with self.assertRaises(ValueError, msg=bad):
                auth.validate_username(bad)
        for good in ("abc", "Alex.N_1-x", "x" * 32):
            auth.validate_username(good)
        with self.assertRaises(ValueError):
            auth.validate_password("short")
        with self.assertRaises(ValueError):
            auth.validate_password("x" * 129)
        auth.validate_password("long-enough")

    # ----- tài khoản -----
    def test_create_and_authenticate(self):
        auth.create_user(self.conn, "Alex", "password123")
        self.assertIsNotNone(auth.authenticate(self.conn, "Alex", "password123"))
        self.assertIsNotNone(auth.authenticate(self.conn, "alex", "password123"))   # không phân biệt hoa thường
        self.assertIsNone(auth.authenticate(self.conn, "Alex", "wrong-password"))
        self.assertIsNone(auth.authenticate(self.conn, "nobody", "password123"))
        with self.assertRaises(ValueError):
            auth.create_user(self.conn, "ALEX", "password123")                      # trùng username

    def test_stored_hash_is_not_the_password(self):
        auth.create_user(self.conn, "alex", "password123")
        stored = self.conn.execute("SELECT password_hash FROM users").fetchone()[0]
        self.assertTrue(stored.startswith("scrypt$"))
        self.assertNotIn("password123", stored)

    def test_first_admin_only_once(self):
        self.assertEqual(auth.count_users(self.conn), 0)
        auth.create_first_admin(self.conn, "boss", "password123")
        self.assertEqual([u["is_admin"] for u in auth.list_users(self.conn)], [1])
        with self.assertRaises(PermissionError):
            auth.create_first_admin(self.conn, "hacker", "password123")
        self.assertEqual(auth.count_users(self.conn), 1)

    # ----- phiên -----
    def test_session_lifecycle(self):
        uid = auth.create_user(self.conn, "alex", "password123")
        token = auth.create_session(self.conn, uid)
        self.assertEqual(auth.get_user_by_token(self.conn, token)["username"], "alex")
        self.assertIsNone(auth.get_user_by_token(self.conn, token + "x"))
        self.assertIsNone(auth.get_user_by_token(self.conn, ""))
        self.assertIsNone(auth.get_user_by_token(self.conn, None))
        # DB không giữ token thật
        stored = self.conn.execute("SELECT token_hash FROM sessions").fetchone()[0]
        self.assertNotEqual(stored, token)
        auth.delete_session(self.conn, token)
        self.assertIsNone(auth.get_user_by_token(self.conn, token))

    def test_expired_session_rejected(self):
        uid = auth.create_user(self.conn, "alex", "password123")
        token = auth.create_session(self.conn, uid)
        with self.conn:
            self.conn.execute("UPDATE sessions SET expires_at = datetime('now', '-1 minute')")
        self.assertIsNone(auth.get_user_by_token(self.conn, token))

    def test_password_change_logs_out_other_sessions(self):
        uid = auth.create_user(self.conn, "alex", "password123")
        mine, other = auth.create_session(self.conn, uid), auth.create_session(self.conn, uid)
        auth.set_password(self.conn, uid, "brand-new-pass", keep_token=mine)
        self.assertIsNotNone(auth.get_user_by_token(self.conn, mine))
        self.assertIsNone(auth.get_user_by_token(self.conn, other))
        self.assertIsNone(auth.authenticate(self.conn, "alex", "password123"))
        self.assertIsNotNone(auth.authenticate(self.conn, "alex", "brand-new-pass"))
        with self.assertRaises(ValueError):
            auth.set_password(self.conn, uid, "short")
        with self.assertRaises(LookupError):
            auth.set_password(self.conn, 999, "long-enough-pass")

    def test_deleting_user_deletes_sessions(self):
        uid = auth.create_user(self.conn, "alex", "password123")
        token = auth.create_session(self.conn, uid)
        with self.conn:
            self.conn.execute("DELETE FROM users WHERE id = ?", (uid,))
        self.assertIsNone(auth.get_user_by_token(self.conn, token))

    # ----- khoá đăng nhập sai -----
    def test_limiter(self):
        lim = auth.LoginLimiter(max_attempts=3, window=60)
        for i in range(3):
            self.assertFalse(lim.is_blocked("Alex", "1.1.1.1", now=100 + i))
            lim.record_failure("Alex", "1.1.1.1", now=100 + i)
        self.assertTrue(lim.is_blocked("alex", "1.1.1.1", now=110))       # không phân biệt hoa thường
        self.assertFalse(lim.is_blocked("alex", "2.2.2.2", now=110))      # IP khác không bị ảnh hưởng
        self.assertFalse(lim.is_blocked("bob", "1.1.1.1", now=110))       # user khác không bị ảnh hưởng
        self.assertFalse(lim.is_blocked("alex", "1.1.1.1", now=200))      # hết 60 giây thì mở lại
        lim.record_failure("alex", "1.1.1.1", now=200)
        lim.reset("alex", "1.1.1.1")
        self.assertFalse(lim.is_blocked("alex", "1.1.1.1", now=201))


if __name__ == "__main__":
    unittest.main()
