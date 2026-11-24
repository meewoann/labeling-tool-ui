"""
db.py — toàn bộ code làm việc với database (SQLite).

Muốn đổi sang PostgreSQL sau này thì chủ yếu chỉ sửa file này (và schema.sql),
phần còn lại của dự án không cần biết dữ liệu nằm ở đâu.

Mục lục:
  1. Cấu hình & kết nối
  2. Project
  3. Class (nhãn)
  4. Import folder ảnh
  5. Xem ảnh & đổi trạng thái
"""

import os
import re
import sqlite3
from pathlib import Path

from PIL import Image  # chỉ dùng để đọc kích thước ảnh (không load cả ảnh vào RAM)


# ==========================================================
# 1. CẤU HÌNH & KẾT NỐI
# ==========================================================

BASE_DIR = Path(__file__).resolve().parent
SCHEMA_FILE = BASE_DIR / "schema.sql"

def default_db_path():
    """File database mặc định: backend/data/labelkit.db.
    Muốn đổi chỗ thì đặt biến môi trường LABELKIT_DB=/duong/dan/khac.db
    (đọc mỗi lần gọi, nên test có thể đổi sang DB tạm mà không sợ ghi nhầm vào DB thật)."""
    return Path(os.environ.get("LABELKIT_DB", BASE_DIR / "data" / "labelkit.db"))

# Chỉ nhận các đuôi file ảnh này khi quét folder
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}

# Các trạng thái hợp lệ của 1 ảnh (phải khớp với CHECK trong schema.sql)
STATUSES = ("unlabeled", "labeled", "review")


def connect(db_path=None):
    """Mở kết nối tới database (tự tạo thư mục/file nếu chưa có)."""
    path = Path(db_path or default_db_path())
    path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(path, check_same_thread=False)  # web server chạy request ở nhiều thread
    conn.row_factory = sqlite3.Row            # đọc cột theo tên: row["name"]
    conn.execute("PRAGMA foreign_keys = ON")  # bắt buộc bật thì xoá project mới xoá luôn ảnh
    conn.execute("PRAGMA journal_mode = WAL") # nhiều người đọc cùng lúc không bị khoá
    return conn


def init_db(conn):
    """Tạo các bảng nếu chưa có (chạy nhiều lần cũng không sao)."""
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))


# ==========================================================
# 2. PROJECT
# ==========================================================

def create_project(conn, name, description=""):
    """Tạo project mới, trả về id."""
    name = name.strip()
    if not name:
        raise ValueError("Tên project không được để trống")
    try:
        with conn:  # "with conn" = tự commit nếu ok, tự rollback nếu lỗi
            cur = conn.execute(
                "INSERT INTO projects (name, description) VALUES (?, ?)", (name, description)
            )
    except sqlite3.IntegrityError:
        raise ValueError(f"Project '{name}' đã tồn tại")
    return cur.lastrowid


def find_project(conn, ref):
    """Tìm project theo tên hoặc theo id. Không thấy thì báo lỗi LookupError."""
    row = conn.execute("SELECT * FROM projects WHERE name = ?", (str(ref),)).fetchone()
    if row is None and str(ref).isdigit():
        row = conn.execute("SELECT * FROM projects WHERE id = ?", (int(ref),)).fetchone()
    if row is None:
        raise LookupError(f"Không tìm thấy project '{ref}'")
    return row


def list_projects(conn, project_id=None):
    """Danh sách project kèm số ảnh theo từng trạng thái (đủ để vẽ trang Projects)."""
    sql = """
        SELECT p.id, p.name, p.description, p.created_at, p.updated_at,
               COUNT(i.id)                                  AS total,
               COALESCE(SUM(i.status = 'unlabeled'), 0)     AS unlabeled,
               COALESCE(SUM(i.status = 'labeled'), 0)       AS labeled,
               COALESCE(SUM(i.status = 'review'), 0)        AS review,
               MIN(i.id)                                    AS cover_image_id,
               (SELECT COUNT(*) FROM classes c WHERE c.project_id = p.id) AS class_count
        FROM projects p
        LEFT JOIN images i ON i.project_id = p.id
        {where}
        GROUP BY p.id
        ORDER BY p.id
    """
    if project_id is None:
        return conn.execute(sql.format(where="")).fetchall()
    return conn.execute(sql.format(where="WHERE p.id = ?"), (project_id,)).fetchall()


def delete_project(conn, project_id):
    """Xoá project cùng toàn bộ folder/ảnh trong DB. KHÔNG xoá file ảnh trên ổ đĩa."""
    with conn:
        conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))


# ==========================================================
# 3. CLASS (NHÃN)
# ==========================================================

CLASS_NAME_MAX = 50
COLOR_PATTERN = re.compile(r"^#[0-9A-Fa-f]{6}$")


def _clean_class_name(name):
    name = " ".join(name.split())  # bỏ khoảng trắng thừa ở đầu/cuối/giữa
    if not name:
        raise ValueError("Tên class không được để trống")
    if len(name) > CLASS_NAME_MAX:
        raise ValueError(f"Tên class tối đa {CLASS_NAME_MAX} ký tự")
    if not name.isprintable():
        raise ValueError("Tên class chứa ký tự không hợp lệ")
    return name


def _clean_class_color(color):
    if not COLOR_PATTERN.match(color):
        raise ValueError("Màu phải có dạng #RRGGBB, ví dụ #10B981")
    return color.upper()


def create_class(conn, project_id, name, color):
    """Tạo class cho project, trả về id."""
    name, color = _clean_class_name(name), _clean_class_color(color)
    try:
        with conn:
            cur = conn.execute(
                "INSERT INTO classes (project_id, name, color) VALUES (?, ?, ?)", (project_id, name, color)
            )
    except sqlite3.IntegrityError:
        raise ValueError(f"Class '{name}' đã tồn tại trong project này")
    return cur.lastrowid


def list_classes(conn, project_id):
    """Các class của project theo thứ tự tạo (thứ tự này cũng là phím tắt 1, 2, 3...)."""
    return conn.execute(
        "SELECT id, project_id, name, color, created_at FROM classes WHERE project_id = ? ORDER BY id",
        (project_id,),
    ).fetchall()


def get_class(conn, class_id):
    row = conn.execute(
        "SELECT id, project_id, name, color, created_at FROM classes WHERE id = ?", (class_id,)
    ).fetchone()
    if row is None:
        raise LookupError("Không tìm thấy class")
    return row


def update_class(conn, class_id, name=None, color=None):
    """Đổi tên và/hoặc màu (truyền None = giữ nguyên)."""
    current = get_class(conn, class_id)
    new_name = _clean_class_name(name) if name is not None else current["name"]
    new_color = _clean_class_color(color) if color is not None else current["color"]
    try:
        with conn:
            conn.execute("UPDATE classes SET name = ?, color = ? WHERE id = ?", (new_name, new_color, class_id))
    except sqlite3.IntegrityError:
        raise ValueError(f"Class '{new_name}' đã tồn tại trong project này")


def delete_class(conn, class_id):
    """Xoá class."""
    get_class(conn, class_id)
    with conn:
        conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))


# ==========================================================
# 4. IMPORT FOLDER ẢNH
# ==========================================================

def scan_images(folder):
    """Liệt kê mọi file ảnh trong folder (kể cả folder con), bỏ qua file/folder ẩn."""
    found = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))  # bỏ folder ẩn
        for name in sorted(files):
            if name.startswith("."):
                continue
            if Path(name).suffix.lower() in IMAGE_EXTENSIONS:
                found.append(Path(root) / name)
    return found


def import_folder(conn, project_id, folder_path):
    """
    Thêm 1 folder ảnh vào project. Mọi ảnh mới đều có status 'unlabeled'.

    Gọi lại với cùng folder thì chỉ thêm những ảnh MỚI, ảnh cũ (và trạng thái
    của chúng) được giữ nguyên.

    Trả về dict: folder_id, added (ảnh mới), existing (đã có sẵn),
    skipped (danh sách file ảnh bị lỗi không đọc được).
    """
    folder = Path(folder_path).expanduser().resolve()
    if not folder.is_dir():
        raise NotADirectoryError(f"Không phải folder: {folder}")

    with conn:  # cả quá trình import là 1 giao dịch: lỗi giữa chừng thì không lưu nửa vời
        row = conn.execute(
            "SELECT id FROM folders WHERE project_id = ? AND path = ?", (project_id, str(folder))
        ).fetchone()
        if row:
            folder_id = row["id"]
        else:
            folder_id = conn.execute(
                "INSERT INTO folders (project_id, path, name) VALUES (?, ?, ?)",
                (project_id, str(folder), folder.name),
            ).lastrowid

        # Những file đã có trong DB (để bỏ qua)
        known = {
            r["rel_path"]
            for r in conn.execute("SELECT rel_path FROM images WHERE folder_id = ?", (folder_id,))
        }

        new_rows, existing, skipped = [], 0, []
        for file in scan_images(folder):
            rel_path = file.relative_to(folder).as_posix()
            if rel_path in known:
                existing += 1
                continue
            try:
                with Image.open(file) as img:  # chỉ đọc phần đầu file để lấy kích thước
                    width, height = img.size
            except Exception:  # file hỏng / không phải ảnh thật → bỏ qua, không làm hỏng cả lượt import
                skipped.append(rel_path)
                continue
            new_rows.append(
                (project_id, folder_id, rel_path, file.name, width, height, file.stat().st_size)
            )

        conn.executemany(
            """INSERT INTO images (project_id, folder_id, rel_path, filename, width, height, size_bytes)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            new_rows,
        )
        conn.execute("UPDATE projects SET updated_at = datetime('now') WHERE id = ?", (project_id,))

    return {"folder_id": folder_id, "added": len(new_rows), "existing": existing, "skipped": skipped}


def list_folders(conn, project_id):
    """Các folder đã thêm vào project, kèm số ảnh."""
    return conn.execute(
        """SELECT f.id, f.name, f.path, f.imported_at, COUNT(i.id) AS image_count
           FROM folders f LEFT JOIN images i ON i.folder_id = f.id
           WHERE f.project_id = ?
           GROUP BY f.id ORDER BY f.id""",
        (project_id,),
    ).fetchall()


# ==========================================================
# 5. XEM ẢNH & ĐỔI TRẠNG THÁI
# ==========================================================

def list_images(conn, project_id, status=None, limit=50, offset=0):
    """Danh sách ảnh của project (lọc theo status nếu truyền). full_path = đường dẫn file thật."""
    if status is not None and status not in STATUSES:
        raise ValueError(f"Trạng thái không hợp lệ: '{status}'. Chọn một trong {STATUSES}")

    sql = """SELECT i.id, i.filename, i.rel_path, i.width, i.height, i.size_bytes, i.status,
                    i.updated_at, f.name AS folder_name, f.path || '/' || i.rel_path AS full_path
             FROM images i JOIN folders f ON f.id = i.folder_id
             WHERE i.project_id = ?"""
    params = [project_id]
    if status is not None:
        sql += " AND i.status = ?"
        params.append(status)
    sql += " ORDER BY i.id LIMIT ? OFFSET ?"
    params += [limit, offset]
    return conn.execute(sql, params).fetchall()


def count_images(conn, project_id, status=None):
    """Đếm số ảnh của project (lọc theo status nếu truyền)."""
    sql, params = "SELECT COUNT(*) FROM images WHERE project_id = ?", [project_id]
    if status is not None:
        sql += " AND status = ?"
        params.append(status)
    return conn.execute(sql, params).fetchone()[0]


def get_image(conn, image_id):
    """Lấy 1 ảnh (kèm full_path). Không thấy thì báo LookupError."""
    row = conn.execute(
        """SELECT i.id, i.project_id, i.filename, i.rel_path, i.width, i.height, i.size_bytes,
                  i.status, i.updated_at, f.name AS folder_name, f.path || '/' || i.rel_path AS full_path
           FROM images i JOIN folders f ON f.id = i.folder_id WHERE i.id = ?""",
        (image_id,),
    ).fetchone()
    if row is None:
        raise LookupError(f"Không tìm thấy ảnh #{image_id}")
    return row


def image_window_offset(conn, project_id, image_id, size):
    """
    Vị trí bắt đầu (offset) của một "cửa sổ" `size` ảnh có chứa image_id ở giữa.
    Trang gán nhãn dùng cái này để mở ảnh bất kỳ mà không phải tải cả nghìn ảnh.
    """
    position = conn.execute(
        "SELECT COUNT(*) FROM images WHERE project_id = ? AND id < ?", (project_id, image_id)
    ).fetchone()[0]
    return max(0, position - size // 2)


def set_status(conn, image_id, status):
    """Đổi trạng thái của 1 ảnh."""
    set_status_many(conn, [image_id], status)


def set_status_many(conn, image_ids, status):
    """Đổi trạng thái nhiều ảnh cùng lúc. Có id không tồn tại thì không đổi gì cả."""
    if status not in STATUSES:
        raise ValueError(f"Trạng thái không hợp lệ: '{status}'. Chọn một trong {STATUSES}")
    image_ids = list(image_ids)
    with conn:
        changed = conn.executemany(
            "UPDATE images SET status = ?, updated_at = datetime('now') WHERE id = ?",
            [(status, i) for i in image_ids],
        ).rowcount
        if changed != len(image_ids):
            conn.rollback()  # hoàn tác nếu có id sai
            raise LookupError("Có id ảnh không tồn tại")
