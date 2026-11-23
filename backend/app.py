"""
app.py — web server: vừa cung cấp API (/api/...) vừa phục vụ luôn các trang HTML.

Chạy:
    python3 backend/app.py              # chỉ máy này truy cập được, http://localhost:8000
    python3 backend/app.py --lan        # cho cả máy khác CÙNG MẠNG truy cập
    python3 backend/app.py 9000 --lan   # đổi cổng
    python3 backend/app.py --no-browser # không tự mở trình duyệt (dùng trong Docker / trên server)

Biến môi trường (không bắt buộc):
    LABELKIT_DB           đường dẫn file database      (mặc định backend/data/labelkit.db)
    LABELKIT_UPLOAD_DIR   nơi lưu ảnh upload từ web    (mặc định backend/data/uploads)
    LABELKIT_IMPORT_ROOT  chỉ cho import folder nằm trong thư mục này (mặc định: không giới hạn)

Mục lục:
  1. Cấu hình & helper
  2. Đăng nhập
  3. Tài khoản: đổi mật khẩu, quản lý người dùng
  4. Project
  5. Import / upload folder ảnh
  6. Ảnh: danh sách, trạng thái, file, thumbnail
  7. Phục vụ trang web & chạy server
"""

import os
import shutil
import sys
from pathlib import Path, PurePosixPath
from typing import List, Optional

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from pydantic import BaseModel

import auth
import db


# ==========================================================
# 1. CẤU HÌNH & HELPER
# ==========================================================

FRONTEND_DIR = db.BASE_DIR.parent / "frontend"         # thư mục chứa index.html, css/, js/...
THUMB_WIDTH = 320


# Các đường dẫn dưới đây đọc từ biến môi trường mỗi lần dùng (không đọc 1 lần lúc khởi động)
def data_dir():
    return db.default_db_path().parent


def upload_dir():
    return Path(os.environ.get("LABELKIT_UPLOAD_DIR", data_dir() / "uploads")).resolve()


def thumb_dir():
    return data_dir() / "thumbs"


def import_root():
    return os.environ.get("LABELKIT_IMPORT_ROOT")      # None = không giới hạn

COOKIE_NAME = "labelkit_session"

# Các đường dẫn /api/ được dùng khi CHƯA đăng nhập. Mọi đường dẫn /api/ khác đều bị chặn mặc định,
# nên sau này thêm endpoint mới mà quên khoá thì vẫn an toàn.
PUBLIC_API = {"/api/health", "/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/logout"}

login_limiter = auth.LoginLimiter()   # khoá tạm khi đăng nhập sai nhiều lần
_initialized_dbs = set()              # các file DB đã tạo bảng, để không chạy lại schema ở mỗi request


def get_conn():
    """Mỗi request dùng 1 kết nối DB riêng, xong thì đóng."""
    conn = db.connect()
    path = str(db.default_db_path())
    if path not in _initialized_dbs:
        db.init_db(conn)
        _initialized_dbs.add(path)
    try:
        yield conn
    finally:
        conn.close()


def require_login(request: Request, conn=Depends(get_conn)):
    """Chạy trước MỌI request. /api/ nào không nằm trong PUBLIC_API thì phải đang đăng nhập."""
    path = request.url.path
    if not path.startswith("/api/") or path in PUBLIC_API:
        return
    token = request.cookies.get(COOKIE_NAME)
    user = auth.get_user_by_token(conn, token)
    if user is None:
        raise HTTPException(401, "Not logged in")
    request.state.user = user
    request.state.token = token


# docs_url/redoc_url/openapi_url = None: tắt trang tài liệu API tự động của FastAPI,
# vì nó công khai (không cần đăng nhập) và liệt kê toàn bộ API.
app = FastAPI(title="LabelKit API", dependencies=[Depends(require_login)],
              docs_url=None, redoc_url=None, openapi_url=None)


def get_project_or_404(conn, project_id):
    rows = db.list_projects(conn, project_id)
    if not rows:
        raise HTTPException(404, "Không tìm thấy project")
    return rows[0]


def image_json(row):
    """Đổi 1 dòng ảnh trong DB thành JSON cho trình duyệt (kèm link ảnh)."""
    return {
        "id": row["id"],
        "filename": row["filename"],
        "rel_path": row["rel_path"],
        "folder_name": row["folder_name"],
        "width": row["width"],
        "height": row["height"],
        "size_bytes": row["size_bytes"],
        "status": row["status"],
        "updated_at": row["updated_at"],
        "thumb_url": f"/api/images/{row['id']}/thumb",
        "file_url": f"/api/images/{row['id']}/file",
    }


def check_import_root(folder):
    """Nếu có đặt LABELKIT_IMPORT_ROOT thì chỉ cho import folder nằm trong đó."""
    if import_root() is None:
        return
    root = Path(import_root()).expanduser().resolve()
    target = Path(folder).expanduser().resolve()
    if root != target and root not in target.parents:
        raise HTTPException(403, f"Chỉ được import folder nằm trong {root}")


# ==========================================================
# 2. ĐĂNG NHẬP
# ==========================================================

class CredentialsIn(BaseModel):
    username: str
    password: str


def user_json(user):
    return {"id": user["id"], "username": user["username"], "is_admin": bool(user["is_admin"])}


def start_session(request: Request, response: Response, conn, user_id):
    """Tạo phiên và gửi token cho trình duyệt qua cookie.
    HttpOnly: JavaScript không đọc được cookie (chống đánh cắp qua XSS).
    SameSite=Lax: trang web khác không thể gửi lệnh POST kèm cookie của bạn (chống CSRF)."""
    token = auth.create_session(conn, user_id)
    response.set_cookie(
        COOKIE_NAME, token,
        max_age=auth.SESSION_DAYS * 86400, httponly=True, samesite="lax",
        secure=request.url.scheme == "https", path="/",
    )


@app.get("/api/auth/status")
def auth_status(request: Request, conn=Depends(get_conn)):
    """Trang đăng nhập hỏi: đã có tài khoản nào chưa? Mình đã đăng nhập chưa?"""
    user = auth.get_user_by_token(conn, request.cookies.get(COOKIE_NAME))
    return {"needs_setup": auth.count_users(conn) == 0, "user": user_json(user) if user else None}


@app.post("/api/auth/setup")
def auth_setup(body: CredentialsIn, request: Request, response: Response, conn=Depends(get_conn)):
    """Tạo tài khoản admin đầu tiên. Chỉ chạy được khi database chưa có user nào."""
    try:
        user_id = auth.create_first_admin(conn, body.username, body.password)
    except PermissionError as error:
        raise HTTPException(403, str(error))
    except ValueError as error:
        raise HTTPException(400, str(error))
    start_session(request, response, conn, user_id)
    return user_json(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


@app.post("/api/auth/login")
def auth_login(body: CredentialsIn, request: Request, response: Response, conn=Depends(get_conn)):
    ip = request.client.host if request.client else "unknown"
    if login_limiter.is_blocked(body.username, ip):
        raise HTTPException(429, "Too many failed attempts. Please try again in a few minutes.")

    too_long = len(body.username) > 64 or len(body.password) > 1024
    user = None if too_long else auth.authenticate(conn, body.username, body.password)
    if user is None:
        login_limiter.record_failure(body.username, ip)
        # Cùng 1 câu trả lời dù username không tồn tại hay mật khẩu sai (không để lộ username nào có thật)
        raise HTTPException(401, "Wrong username or password")

    login_limiter.reset(body.username, ip)
    start_session(request, response, conn, user["id"])
    return user_json(user)


@app.post("/api/auth/logout")
def auth_logout(request: Request, response: Response, conn=Depends(get_conn)):
    token = request.cookies.get(COOKIE_NAME)
    if token:
        auth.delete_session(conn, token)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
def auth_me(request: Request):
    return user_json(request.state.user)


# ==========================================================
# 3. TÀI KHOẢN: ĐỔI MẬT KHẨU, QUẢN LÝ NGƯỜI DÙNG
# ==========================================================
# Lưu ý: sai mật khẩu hiện tại trả 400, KHÔNG trả 401, vì giao diện coi 401 là "hết phiên đăng nhập"
# và sẽ đá người dùng về trang đăng nhập.

class PasswordChangeIn(BaseModel):
    current_password: str
    new_password: str


class NewUserIn(BaseModel):
    username: str
    password: str
    is_admin: bool = False


class ResetPasswordIn(BaseModel):
    new_password: str


def require_admin(request: Request):
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(401, "Not logged in")
    if not user["is_admin"]:
        raise HTTPException(403, "Only admins can do this")


@app.post("/api/auth/password")
def change_my_password(body: PasswordChangeIn, request: Request, conn=Depends(get_conn)):
    """Người đang đăng nhập tự đổi mật khẩu. Các thiết bị khác bị đăng xuất, thiết bị này giữ nguyên."""
    user = request.state.user
    ip = request.client.host if request.client else "unknown"
    # Dùng chung bộ đếm với đăng nhập: có người cầm được phiên của bạn cũng không thể đoán mật khẩu hiện tại vô hạn
    if login_limiter.is_blocked(user["username"], ip):
        raise HTTPException(429, "Too many failed attempts. Please try again in a few minutes.")
    if auth.authenticate(conn, user["username"], body.current_password) is None:
        login_limiter.record_failure(user["username"], ip)
        raise HTTPException(400, "Current password is wrong")
    login_limiter.reset(user["username"], ip)
    try:
        auth.set_password(conn, user["id"], body.new_password, keep_token=request.state.token)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return {"ok": True}


@app.get("/api/users", dependencies=[Depends(require_admin)])
def list_users(conn=Depends(get_conn)):
    return [{**dict(u), "is_admin": bool(u["is_admin"])} for u in auth.list_users(conn)]


@app.post("/api/users", status_code=201, dependencies=[Depends(require_admin)])
def create_user(body: NewUserIn, conn=Depends(get_conn)):
    if auth.find_user(conn, body.username):
        raise HTTPException(409, f"Username '{body.username}' already exists")
    try:
        user_id = auth.create_user(conn, body.username, body.password, is_admin=body.is_admin)
    except ValueError as error:
        raise HTTPException(400, str(error))
    user = auth.get_user(conn, user_id)
    return {**dict(user), "is_admin": bool(user["is_admin"])}


@app.post("/api/users/{user_id}/password", dependencies=[Depends(require_admin)])
def reset_user_password(user_id: int, body: ResetPasswordIn, conn=Depends(get_conn)):
    """Admin đặt lại mật khẩu cho người khác (họ bị đăng xuất khỏi mọi thiết bị)."""
    try:
        auth.set_password(conn, user_id, body.new_password)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except LookupError as error:
        raise HTTPException(404, str(error))
    return {"ok": True}


@app.delete("/api/users/{user_id}", dependencies=[Depends(require_admin)])
def delete_user(user_id: int, request: Request, conn=Depends(get_conn)):
    if user_id == request.state.user["id"]:
        raise HTTPException(400, "You cannot delete your own account")
    try:
        auth.delete_user(conn, user_id)
    except LookupError as error:
        raise HTTPException(404, str(error))
    return {"ok": True}


# ==========================================================
# 4. PROJECT
# ==========================================================

class ProjectIn(BaseModel):
    name: str
    description: str = ""


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/projects")
def list_projects(conn=Depends(get_conn)):
    return [dict(row) for row in db.list_projects(conn)]


@app.post("/api/projects", status_code=201)
def create_project(body: ProjectIn, conn=Depends(get_conn)):
    try:
        project_id = db.create_project(conn, body.name, body.description)
    except ValueError as error:
        raise HTTPException(409, str(error))
    return dict(db.list_projects(conn, project_id)[0])


@app.get("/api/projects/{project_id}")
def get_project(project_id: int, conn=Depends(get_conn)):
    project = dict(get_project_or_404(conn, project_id))
    project["folders"] = [dict(f) for f in db.list_folders(conn, project_id)]
    return project


# ==========================================================
# 5. IMPORT / UPLOAD FOLDER ẢNH
# ==========================================================

class ImportIn(BaseModel):
    path: str


class FinishIn(BaseModel):
    folder: str


@app.post("/api/projects/{project_id}/import")
def import_folder(project_id: int, body: ImportIn, conn=Depends(get_conn)):
    """Import folder đã nằm sẵn trên máy chủ (hợp với dataset lớn)."""
    get_project_or_404(conn, project_id)
    check_import_root(body.path)
    try:
        return db.import_folder(conn, project_id, body.path)
    except NotADirectoryError as error:
        raise HTTPException(400, str(error))


def upload_target(project_id, folder_name):
    """Folder trên máy chủ nơi lưu ảnh upload: uploads/project_<id>/<tên folder>."""
    name = PurePosixPath(folder_name.replace("\\", "/")).name.strip()
    if name in ("", ".", ".."):
        raise HTTPException(400, "Tên folder không hợp lệ")
    return upload_dir() / f"project_{project_id}" / name


@app.post("/api/projects/{project_id}/upload")
def upload_batch(
    project_id: int,
    folder: str = Form(...),
    paths: List[str] = Form(...),
    files: List[UploadFile] = File(...),
    conn=Depends(get_conn),
):
    """
    Nhận 1 lô ảnh từ trình duyệt (trình duyệt gửi từng lô nhỏ để có thanh tiến độ).
    paths[i] là đường dẫn tương đối của files[i] bên trong folder, vd "cam1/a.jpg".
    Chỉ lưu file ra ổ đĩa; gọi /upload/finish sau khi gửi hết để ghi vào database.
    """
    get_project_or_404(conn, project_id)
    if len(paths) != len(files):
        raise HTTPException(400, "paths và files không khớp số lượng")

    target = upload_target(project_id, folder)
    saved = ignored = 0
    for rel, upload in zip(paths, files):
        rel_path = PurePosixPath(rel.replace("\\", "/"))
        unsafe = rel_path.is_absolute() or ".." in rel_path.parts
        if unsafe or rel_path.suffix.lower() not in db.IMAGE_EXTENSIONS:
            ignored += 1  # bỏ qua file không phải ảnh hoặc đường dẫn nguy hiểm
            continue
        destination = target / rel_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        with open(destination, "wb") as out:
            shutil.copyfileobj(upload.file, out)
        saved += 1
    return {"saved": saved, "ignored": ignored}


@app.post("/api/projects/{project_id}/upload/finish")
def upload_finish(project_id: int, body: FinishIn, conn=Depends(get_conn)):
    """Sau khi upload hết các lô: quét folder vừa lưu và ghi ảnh vào database."""
    get_project_or_404(conn, project_id)
    target = upload_target(project_id, body.folder)
    if not target.is_dir():
        raise HTTPException(400, "Chưa có ảnh nào được upload cho folder này")
    return db.import_folder(conn, project_id, target)


# ==========================================================
# 6. ẢNH: DANH SÁCH, TRẠNG THÁI, FILE, THUMBNAIL
# ==========================================================

class StatusIn(BaseModel):
    status: str


@app.get("/api/projects/{project_id}/images")
def list_images(
    project_id: int,
    status: Optional[str] = None,
    limit: int = 60,
    offset: int = 0,
    around: Optional[int] = None,
    conn=Depends(get_conn),
):
    """
    Danh sách ảnh có phân trang. Nếu truyền around=<id ảnh> thì trả về 1 cửa sổ
    `limit` ảnh có ảnh đó ở giữa (dùng cho trang gán nhãn).
    """
    get_project_or_404(conn, project_id)
    limit = max(1, min(limit, 500))
    if around is not None:
        offset = db.image_window_offset(conn, project_id, around, limit)
    try:
        rows = db.list_images(conn, project_id, status, limit, offset)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return {
        "items": [image_json(r) for r in rows],
        "total": db.count_images(conn, project_id, status),
        "offset": offset,
    }


@app.patch("/api/images/{image_id}")
def update_image(image_id: int, body: StatusIn, conn=Depends(get_conn)):
    try:
        db.set_status(conn, image_id, body.status)
    except ValueError as error:
        raise HTTPException(400, str(error))
    except LookupError as error:
        raise HTTPException(404, str(error))
    return {"id": image_id, "status": body.status}


def image_file_or_404(conn, image_id):
    try:
        row = db.get_image(conn, image_id)
    except LookupError as error:
        raise HTTPException(404, str(error))
    if not Path(row["full_path"]).is_file():
        raise HTTPException(404, "File ảnh không còn trên máy chủ (đã bị xoá hoặc di chuyển?)")
    return row


@app.get("/api/images/{image_id}/file")
def image_file(image_id: int, conn=Depends(get_conn)):
    row = image_file_or_404(conn, image_id)
    return FileResponse(row["full_path"], headers={"Cache-Control": "public, max-age=3600"})


@app.get("/api/images/{image_id}/thumb")
def image_thumb(image_id: int, conn=Depends(get_conn)):
    """Ảnh thu nhỏ, tạo lần đầu rồi lưu lại để lần sau trả ngay."""
    row = image_file_or_404(conn, image_id)
    thumb = thumb_dir() / f"{image_id}_{THUMB_WIDTH}.jpg"
    if not thumb.is_file():
        thumb_dir().mkdir(parents=True, exist_ok=True)
        with Image.open(row["full_path"]) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_WIDTH, THUMB_WIDTH))  # giữ tỉ lệ, cạnh dài tối đa 320px
            img.save(thumb, "JPEG", quality=80)
    return FileResponse(thumb, headers={"Cache-Control": "public, max-age=86400"})


# ==========================================================
# 7. PHỤC VỤ TRANG WEB & CHẠY SERVER
# ==========================================================

@app.middleware("http")
async def no_cache_for_pages(request: Request, call_next):
    """Trang HTML/CSS/JS không cache để sửa code xong F5 là thấy ngay."""
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response


# Chỉ phục vụ đúng các trang HTML + css/ + js/. KHÔNG mount cả thư mục dự án,
# vì như vậy sẽ lộ luôn file database (backend/data), .git, code backend...
PAGES = {"index", "projects", "project", "label", "export", "settings", "404"}


@app.get("/", include_in_schema=False)
def home():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/{page}.html", include_in_schema=False)
def html_page(page: str):
    if page not in PAGES:
        raise HTTPException(404, "Không có trang này")
    return FileResponse(FRONTEND_DIR / f"{page}.html")


app.mount("/css", StaticFiles(directory=FRONTEND_DIR / "css"), name="css")
app.mount("/js", StaticFiles(directory=FRONTEND_DIR / "js"), name="js")


if __name__ == "__main__":
    import socket
    import threading
    import webbrowser

    import uvicorn

    args = sys.argv[1:]
    lan = "--lan" in args
    open_browser = "--no-browser" not in args
    numbers = [a for a in args if a.isdigit()]
    port = int(numbers[0]) if numbers else 8000

    print(f"Database: {db.default_db_path()}")
    print(f"Mở: http://localhost:{port}")
    _conn = db.connect()
    db.init_db(_conn)
    if auth.count_users(_conn) == 0:
        print("Chưa có tài khoản nào: mở trang web để tạo tài khoản admin đầu tiên.")
    _conn.close()
    # Trong Docker (Dockerfile đặt LABELKIT_CONTAINER=1) IP của container vô nghĩa với người dùng, nên không in
    if lan and not os.environ.get("LABELKIT_CONTAINER"):
        try:  # lấy IP của máy trong mạng nội bộ (không gửi dữ liệu ra ngoài)
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
                probe.connect(("10.255.255.255", 1))
                print(f"Người cùng mạng mở: http://{probe.getsockname()[0]}:{port}")
        except OSError:
            pass
        print("Chế độ --lan: bất kỳ ai trong mạng này đều dùng và upload được. Chỉ dùng ở mạng bạn tin tưởng.")
    if open_browser:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    uvicorn.run(app, host="0.0.0.0" if lan else "127.0.0.1", port=port)
