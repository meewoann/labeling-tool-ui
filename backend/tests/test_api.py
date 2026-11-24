"""
test_api.py — kiểm tra API qua HTTP thật (chủ yếu là đăng nhập và phân quyền).

Test tự bật 1 server trên cổng ngẫu nhiên với database + thư mục upload TẠM,
nên không đụng tới dữ liệu thật. Chỉ dùng thư viện chuẩn, không cần cài thêm gì.

Chạy:  cd backend && python3 -m unittest -v
"""

import http.cookiejar
import json
import os
import socket
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import uvicorn
from PIL import Image

import app as app_module
import auth
import db


class Client:
    """Trình duyệt giả: giữ cookie giữa các request, mỗi Client là 1 người dùng riêng."""

    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def request(self, method, path, body=None, raw=None, headers=None):
        """Trả về (status, dữ liệu, headers). dữ liệu là dict nếu server trả JSON, ngược lại là bytes."""
        headers = dict(headers or {})
        data = raw
        if body is not None:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
        try:
            response = self.opener.open(req)
        except urllib.error.HTTPError as error:
            response = error
        payload = response.read()
        try:
            payload = json.loads(payload)
        except ValueError:
            pass
        return response.status if hasattr(response, "status") else response.code, payload, response.headers

    def get(self, path, **kw):
        return self.request("GET", path, **kw)

    def post(self, path, body=None, **kw):
        return self.request("POST", path, body=body, **kw)

    def token(self):
        return next((c.value for c in self.jar if c.name == app_module.COOKIE_NAME), None)


def multipart(fields, files):
    """Tự ghép body multipart/form-data. fields: [(tên, chữ)], files: [(tên, tên file, bytes)]."""
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, filename, content in files:
        parts.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
            f"Content-Type: application/octet-stream\r\n\r\n".encode() + content + b"\r\n"
        )
    parts.append(f"--{boundary}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


class ApiTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.saved_env = {k: os.environ.get(k) for k in ("LABELKIT_DB", "LABELKIT_UPLOAD_DIR", "LABELKIT_IMPORT_ROOT")}
        os.environ["LABELKIT_DB"] = str(Path(cls.tmp.name) / "api.db")
        os.environ["LABELKIT_UPLOAD_DIR"] = str(Path(cls.tmp.name) / "uploads")
        os.environ.pop("LABELKIT_IMPORT_ROOT", None)
        # Cổng ngẫu nhiên còn trống
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            cls.port = probe.getsockname()[1]
        cls.base = f"http://127.0.0.1:{cls.port}"
        cls.server = uvicorn.Server(uvicorn.Config(app_module.app, host="127.0.0.1", port=cls.port, log_level="error"))
        cls.thread = threading.Thread(target=cls.server.run, daemon=True)
        cls.thread.start()
        for _ in range(100):
            if cls.server.started:
                break
            time.sleep(0.05)
        assert cls.server.started, "server không khởi động được"

    @classmethod
    def tearDownClass(cls):
        cls.server.should_exit = True
        cls.thread.join(timeout=5)
        for key, value in cls.saved_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        cls.tmp.cleanup()

    def setUp(self):
        app_module.login_limiter = auth.LoginLimiter()  # mỗi test bắt đầu với bộ đếm sạch
        self.anon = Client(self.base)

    def db(self):
        return db.connect()

    def make_admin_client(self, name="admin1"):
        """Tạo (nếu chưa có) tài khoản và trả về Client đã đăng nhập."""
        conn = self.db()
        db.init_db(conn)  # tạo bảng nếu server chưa kịp tạo (test này truy cập DB trực tiếp)
        if auth.find_user(conn, name) is None:
            auth.create_user(conn, name, "password123", is_admin=True)
        conn.close()
        client = Client(self.base)
        status, body, _ = client.post("/api/auth/login", {"username": name, "password": "password123"})
        self.assertEqual(status, 200, body)
        return client


class SetupFlowTests(ApiTestCase):
    """Chạy đầu tiên (tên test bắt đầu bằng chữ cái sớm) vì cần database chưa có user nào."""

    def test_a_first_run_setup(self):
        status, body, _ = self.anon.get("/api/auth/status")
        self.assertEqual((status, body["needs_setup"], body["user"]), (200, True, None))

        # Dữ liệu sai bị từ chối
        self.assertEqual(self.anon.post("/api/auth/setup", {"username": "ab", "password": "password123"})[0], 400)
        self.assertEqual(self.anon.post("/api/auth/setup", {"username": "boss", "password": "short"})[0], 400)
        self.assertEqual(self.anon.get("/api/auth/status")[1]["needs_setup"], True)

        # Tạo admin đầu tiên → được đăng nhập luôn
        status, body, headers = self.anon.post("/api/auth/setup", {"username": "boss", "password": "password123"})
        self.assertEqual(status, 200)
        self.assertEqual((body["username"], body["is_admin"]), ("boss", True))
        self.assertNotIn("password", json.dumps(body))
        self.assertEqual(self.anon.get("/api/auth/me")[1]["username"], "boss")
        status, body, _ = self.anon.get("/api/auth/status")
        self.assertEqual((body["needs_setup"], body["user"]["username"]), (False, "boss"))

        # Từ giờ ai cũng không tạo thêm "admin đầu tiên" được nữa
        other = Client(self.base)
        status, body, _ = other.post("/api/auth/setup", {"username": "hacker", "password": "password123"})
        self.assertEqual(status, 403)
        self.assertEqual(other.get("/api/auth/me")[0], 401)


class LoginTests(ApiTestCase):
    def test_everything_requires_login(self):
        """Chưa đăng nhập thì mọi API (trừ vài cái công khai) đều trả 401."""
        self.make_admin_client()  # đảm bảo đã có user
        protected = [
            ("GET", "/api/auth/me"), ("GET", "/api/projects"), ("POST", "/api/projects"),
            ("GET", "/api/projects/1"), ("GET", "/api/projects/1/images"),
            ("POST", "/api/projects/1/import"), ("POST", "/api/projects/1/upload"),
            ("POST", "/api/projects/1/upload/finish"), ("PATCH", "/api/images/1"),
            ("GET", "/api/images/1/file"), ("GET", "/api/images/1/thumb"),
        ]
        for method, path in protected:
            status, _, _ = self.anon.request(method, path, body={} if method in ("POST", "PATCH") else None)
            self.assertEqual(status, 401, f"{method} {path} phải trả 401 khi chưa đăng nhập")

        for path in ("/api/health", "/api/auth/status"):
            self.assertEqual(self.anon.get(path)[0], 200, path)

        # Trang tài liệu API tự động của FastAPI đã bị tắt (nó công khai và liệt kê toàn bộ API)
        for path in ("/docs", "/redoc", "/openapi.json", "/api/this-route-does-not-exist"):
            self.assertEqual(self.anon.get(path)[0], 404, path)

    def test_pages_stay_public_but_nothing_else(self):
        for path in ("/", "/index.html", "/projects.html", "/css/style.css", "/js/app.js"):
            self.assertEqual(self.anon.get(path)[0], 200, path)
        for path in ("/backend/db.py", "/backend/data/api.db", "/.git/config", "/serve.py"):
            self.assertEqual(self.anon.get(path)[0], 404, path)

    def test_login_success_and_cookie_flags(self):
        self.make_admin_client("login-ok")
        status, body, headers = self.anon.post("/api/auth/login", {"username": "LOGIN-OK", "password": "password123"})
        self.assertEqual((status, body["username"]), (200, "login-ok"))   # không phân biệt hoa thường
        cookie = headers.get("Set-Cookie", "")
        self.assertIn(app_module.COOKIE_NAME + "=", cookie)
        self.assertIn("HttpOnly", cookie)
        self.assertIn("samesite=lax", cookie.lower())
        self.assertIn("Path=/", cookie)
        self.assertEqual(self.anon.get("/api/projects")[0], 200)

    def test_wrong_credentials_give_the_same_answer(self):
        self.make_admin_client("exists")
        status1, body1, _ = self.anon.post("/api/auth/login", {"username": "exists", "password": "wrong-password"})
        status2, body2, _ = self.anon.post("/api/auth/login", {"username": "no-such-user", "password": "wrong-password"})
        self.assertEqual((status1, status2), (401, 401))
        self.assertEqual(body1, body2)   # không để lộ username nào có thật
        self.assertEqual(self.anon.get("/api/projects")[0], 401)
        # đầu vào quá dài không làm sập server
        self.assertEqual(self.anon.post("/api/auth/login", {"username": "x" * 500, "password": "y" * 5000})[0], 401)
        # thiếu trường → 422, vẫn không đăng nhập được
        self.assertEqual(self.anon.post("/api/auth/login", {"username": "exists"})[0], 422)

    def test_too_many_failures_lock_the_account_temporarily(self):
        self.make_admin_client("locked")
        for _ in range(5):
            self.assertEqual(self.anon.post("/api/auth/login", {"username": "locked", "password": "nope-nope"})[0], 401)
        # Lần thứ 6: bị khoá, kể cả khi nhập ĐÚNG mật khẩu
        status, body, _ = self.anon.post("/api/auth/login", {"username": "locked", "password": "password123"})
        self.assertEqual(status, 429)
        # Người khác không bị ảnh hưởng
        self.make_admin_client("not-locked")

    def test_logout_invalidates_the_session_token(self):
        client = self.make_admin_client("bye")
        old_token = client.token()
        self.assertEqual(client.get("/api/projects")[0], 200)
        self.assertEqual(client.post("/api/auth/logout")[0], 200)
        self.assertEqual(client.get("/api/projects")[0], 401)
        # Kể cả ai đó đã chép được token cũ cũng không dùng lại được
        replay = Client(self.base).get("/api/projects", headers={"Cookie": f"{app_module.COOKIE_NAME}={old_token}"})
        self.assertEqual(replay[0], 401)
        # Đăng xuất khi chưa đăng nhập cũng không báo lỗi
        self.assertEqual(self.anon.post("/api/auth/logout")[0], 200)

    def test_expired_and_forged_tokens_are_rejected(self):
        client = self.make_admin_client("expiry")
        conn = self.db()
        with conn:
            conn.execute("UPDATE sessions SET expires_at = datetime('now', '-1 minute')")
        conn.close()
        self.assertEqual(client.get("/api/projects")[0], 401)
        forged = Client(self.base).get("/api/projects", headers={"Cookie": f"{app_module.COOKIE_NAME}=not-a-real-token"})
        self.assertEqual(forged[0], 401)

    def test_data_is_reachable_after_login(self):
        """Luồng chính vẫn chạy khi đã đăng nhập: tạo project, upload ảnh, xem ảnh, đổi trạng thái."""
        client = self.make_admin_client("worker")
        status, project, _ = client.post("/api/projects", {"name": "Auth demo", "description": ""})
        self.assertEqual(status, 201)

        image_path = Path(self.tmp.name) / "tiny.jpg"
        Image.new("RGB", (20, 10), "red").save(image_path)
        body, headers = multipart([("folder", "pics"), ("paths", "tiny.jpg")], [("files", "tiny.jpg", image_path.read_bytes())])
        status, saved, _ = client.post(f"/api/projects/{project['id']}/upload", raw=body, headers=headers)
        self.assertEqual((status, saved["saved"]), (200, 1))
        status, result, _ = client.post(f"/api/projects/{project['id']}/upload/finish", {"folder": "pics"})
        self.assertEqual((status, result["added"]), (200, 1))

        images = client.get(f"/api/projects/{project['id']}/images")[1]["items"]
        image_id = images[0]["id"]
        self.assertEqual(client.get(f"/api/images/{image_id}/file")[0], 200)
        self.assertEqual(client.get(f"/api/images/{image_id}/thumb")[0], 200)
        self.assertEqual(client.request("PATCH", f"/api/images/{image_id}", body={"status": "labeled"})[0], 200)

        # Người chưa đăng nhập không xem được ảnh đó, dù biết đúng đường dẫn
        self.assertEqual(self.anon.get(f"/api/images/{image_id}/file")[0], 401)
        self.assertEqual(self.anon.get(f"/api/images/{image_id}/thumb")[0], 401)


class UserManagementTests(ApiTestCase):
    def make_member(self, admin, name, password="password123"):
        """Admin tạo thành viên thường rồi trả về Client đã đăng nhập bằng tài khoản đó."""
        self.assertEqual(admin.post("/api/users", {"username": name, "password": password})[0], 201)
        member = Client(self.base)
        self.assertEqual(member.post("/api/auth/login", {"username": name, "password": password})[0], 200)
        return member

    def test_only_admins_can_manage_users(self):
        admin = self.make_admin_client("um-admin1")
        member = self.make_member(admin, "um-member1")
        calls = [("GET", "/api/users", None), ("POST", "/api/users", {"username": "x-user", "password": "password123"}),
                 ("POST", "/api/users/1/password", {"new_password": "password456"}), ("DELETE", "/api/users/1", None)]
        for method, path, body in calls:
            self.assertEqual(member.request(method, path, body=body)[0], 403, f"member: {method} {path}")
            self.assertEqual(self.anon.request(method, path, body=body)[0], 401, f"anonymous: {method} {path}")
        self.assertEqual(admin.get("/api/users")[0], 200)

    def test_admin_creates_user(self):
        admin = self.make_admin_client("um-admin2")
        status, user, _ = admin.post("/api/users", {"username": "newbie", "password": "password123", "is_admin": False})
        self.assertEqual((status, user["username"], user["is_admin"]), (201, "newbie", False))
        self.assertNotIn("password", json.dumps(user))
        self.assertEqual(admin.post("/api/users", {"username": "NEWBIE", "password": "password123"})[0], 409)   # trùng, không phân biệt hoa thường
        self.assertEqual(admin.post("/api/users", {"username": "ab", "password": "password123"})[0], 400)       # username xấu
        self.assertEqual(admin.post("/api/users", {"username": "weakpass", "password": "short"})[0], 400)       # mật khẩu yếu
        names = [u["username"] for u in admin.get("/api/users")[1]]
        self.assertIn("newbie", names)
        self.assertNotIn("weakpass", names)
        self.assertNotIn("password_hash", json.dumps(admin.get("/api/users")[1]))   # không bao giờ trả bản băm ra ngoài

        # Thành viên mới đăng nhập được nhưng không phải admin
        newbie = Client(self.base)
        status, body, _ = newbie.post("/api/auth/login", {"username": "newbie", "password": "password123"})
        self.assertEqual((status, body["is_admin"]), (200, False))

    def test_change_own_password(self):
        admin = self.make_admin_client("um-admin3")
        user = self.make_member(admin, "changer")
        other_device = Client(self.base)
        other_device.post("/api/auth/login", {"username": "changer", "password": "password123"})

        # Sai mật khẩu hiện tại → 400 (không phải 401, vì 401 làm giao diện tưởng hết phiên)
        self.assertEqual(user.post("/api/auth/password", {"current_password": "wrong-one", "new_password": "password456"})[0], 400)
        # Mật khẩu mới quá yếu
        self.assertEqual(user.post("/api/auth/password", {"current_password": "password123", "new_password": "short"})[0], 400)
        self.assertEqual(user.post("/api/auth/password", {"current_password": "password123", "new_password": "password456"})[0], 200)

        self.assertEqual(user.get("/api/auth/me")[0], 200)            # thiết bị đang đổi vẫn đăng nhập
        self.assertEqual(other_device.get("/api/auth/me")[0], 401)    # thiết bị khác bị đăng xuất
        self.assertEqual(Client(self.base).post("/api/auth/login", {"username": "changer", "password": "password123"})[0], 401)
        self.assertEqual(Client(self.base).post("/api/auth/login", {"username": "changer", "password": "password456"})[0], 200)

    def test_change_password_cannot_be_bruteforced(self):
        admin = self.make_admin_client("um-admin4")
        user = self.make_member(admin, "bruteforced")
        for _ in range(5):
            self.assertEqual(user.post("/api/auth/password", {"current_password": "guess-guess", "new_password": "password456"})[0], 400)
        status, _, _ = user.post("/api/auth/password", {"current_password": "password123", "new_password": "password456"})
        self.assertEqual(status, 429)

    def test_admin_resets_password(self):
        admin = self.make_admin_client("um-admin5")
        victim = self.make_member(admin, "forgetful")
        victim_id = next(u["id"] for u in admin.get("/api/users")[1] if u["username"] == "forgetful")
        self.assertEqual(admin.post(f"/api/users/{victim_id}/password", {"new_password": "short"})[0], 400)
        self.assertEqual(admin.post("/api/users/99999/password", {"new_password": "password456"})[0], 404)
        self.assertEqual(admin.post(f"/api/users/{victim_id}/password", {"new_password": "password456"})[0], 200)
        self.assertEqual(victim.get("/api/auth/me")[0], 401)           # bị đăng xuất khỏi mọi thiết bị
        self.assertEqual(Client(self.base).post("/api/auth/login", {"username": "forgetful", "password": "password123"})[0], 401)
        self.assertEqual(Client(self.base).post("/api/auth/login", {"username": "forgetful", "password": "password456"})[0], 200)

    def test_admin_deletes_user(self):
        admin = self.make_admin_client("um-admin6")
        doomed = self.make_member(admin, "doomed")
        users = {u["username"]: u["id"] for u in admin.get("/api/users")[1]}
        self.assertEqual(admin.request("DELETE", f"/api/users/{users['um-admin6']}")[0], 400)   # không tự xoá mình
        self.assertEqual(admin.get("/api/auth/me")[0], 200)
        self.assertEqual(admin.request("DELETE", "/api/users/99999")[0], 404)
        self.assertEqual(admin.request("DELETE", f"/api/users/{users['doomed']}")[0], 200)
        self.assertEqual(doomed.get("/api/auth/me")[0], 401)           # phiên của họ biến mất ngay
        self.assertEqual(Client(self.base).post("/api/auth/login", {"username": "doomed", "password": "password123"})[0], 401)
        self.assertNotIn("doomed", [u["username"] for u in admin.get("/api/users")[1]])


class ClassApiTests(ApiTestCase):
    def test_class_endpoints(self):
        admin = self.make_admin_client("cls-admin")
        pid = admin.post("/api/projects", {"name": "Classes demo"})[1]["id"]
        base = f"/api/projects/{pid}/classes"

        # Chưa đăng nhập thì không đụng được
        for method, path, body in [("GET", base, None), ("POST", base, {"name": "x", "color": "#000000"}),
                                   ("PATCH", "/api/classes/1", {"name": "y"}), ("DELETE", "/api/classes/1", None)]:
            self.assertEqual(self.anon.request(method, path, body=body)[0], 401, f"{method} {path}")

        self.assertEqual(admin.get(base)[1], [])
        status, car, _ = admin.post(base, {"name": "Car", "color": "#3b82f6"})
        self.assertEqual((status, car["name"], car["color"], car["project_id"]), (201, "Car", "#3B82F6", pid))
        self.assertEqual(admin.post(base, {"name": "car", "color": "#000000"})[0], 409)          # trùng tên
        self.assertEqual(admin.post(base, {"name": "", "color": "#000000"})[0], 400)
        self.assertEqual(admin.post(base, {"name": "bad", "color": "red"})[0], 400)
        self.assertEqual(admin.post("/api/projects/99999/classes", {"name": "x", "color": "#000000"})[0], 404)
        self.assertEqual(admin.post(base, {"name": "x"})[0], 422)                                  # thiếu trường

        admin.post(base, {"name": "Person", "color": "#F59E0B"})
        self.assertEqual([c["name"] for c in admin.get(base)[1]], ["Car", "Person"])

        status, updated, _ = admin.request("PATCH", f"/api/classes/{car['id']}", body={"name": "Truck", "color": "#ef4444"})
        self.assertEqual((status, updated["name"], updated["color"]), (200, "Truck", "#EF4444"))
        self.assertEqual(admin.request("PATCH", f"/api/classes/{car['id']}", body={"name": "person"})[0], 409)
        self.assertEqual(admin.request("PATCH", "/api/classes/99999", body={"name": "z"})[0], 404)

        self.assertEqual(admin.get("/api/projects")[1][0]["class_count"], 2)
        self.assertEqual(admin.request("DELETE", f"/api/classes/{car['id']}")[0], 200)
        self.assertEqual(admin.request("DELETE", f"/api/classes/{car['id']}")[0], 404)
        self.assertEqual([c["name"] for c in admin.get(base)[1]], ["Person"])


if __name__ == "__main__":
    unittest.main()
