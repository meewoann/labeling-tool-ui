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
  6. Annotation (box, polygon)
"""

import json
import math
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
    """Tạo các bảng nếu chưa có (chạy nhiều lần cũng không sao), rồi nâng cấp database cũ nếu cần."""
    conn.executescript(SCHEMA_FILE.read_text(encoding="utf-8"))
    _upgrade_old_database(conn)


def _upgrade_old_database(conn):
    """
    "CREATE TABLE IF NOT EXISTS" không sửa bảng đã có. Nên với database tạo từ phiên bản cũ,
    các cột mới phải được thêm vào đây. Mỗi bước tự kiểm tra nên chạy lại bao nhiêu lần cũng an toàn.
    """
    image_columns = {row["name"] for row in conn.execute("PRAGMA table_info(images)")}
    if "annotation_version" not in image_columns:
        conn.execute("ALTER TABLE images ADD COLUMN annotation_version INTEGER NOT NULL DEFAULT 0")
        conn.commit()


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
        """SELECT c.id, c.project_id, c.name, c.color, c.created_at,
                  (SELECT COUNT(*) FROM annotations a WHERE a.class_id = c.id) AS annotation_count
           FROM classes c WHERE c.project_id = ? ORDER BY c.id""",
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
    """Xoá class và MỌI annotation dùng class đó. Trả về số annotation bị xoá theo."""
    get_class(conn, class_id)
    with conn:
        removed = conn.execute("SELECT COUNT(*) FROM annotations WHERE class_id = ?", (class_id,)).fetchone()[0]
        # Báo cho ai đang mở các ảnh này biết dữ liệu đã đổi (phiên bản tăng lên → họ sẽ thấy xung đột khi lưu)
        conn.execute(
            """UPDATE images SET annotation_version = annotation_version + 1
               WHERE id IN (SELECT DISTINCT image_id FROM annotations WHERE class_id = ?)""",
            (class_id,),
        )
        conn.execute("DELETE FROM classes WHERE id = ?", (class_id,))
    return removed


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
                    i.updated_at, f.name AS folder_name, f.path || '/' || i.rel_path AS full_path,
                    (SELECT COUNT(*) FROM annotations a WHERE a.image_id = i.id) AS annotation_count
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
                  i.status, i.updated_at, f.name AS folder_name, f.path || '/' || i.rel_path AS full_path,
                  (SELECT COUNT(*) FROM annotations a WHERE a.image_id = i.id) AS annotation_count
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


# ==========================================================
# 6. ANNOTATION (BOX, POLYGON)
# ==========================================================

ANNOTATION_TYPES = ("bbox", "polygon")
MIN_BOX_SIZE = 0.001            # hộp nhỏ hơn 0,1% cạnh ảnh coi như bấm nhầm
MIN_POLYGON_AREA = 1e-7         # đa giác gần như bằng 0 (các điểm thẳng hàng) bị từ chối
MAX_POLYGON_POINTS = 1000
MAX_ANNOTATIONS_PER_IMAGE = 2000


class VersionConflict(Exception):
    """Có người khác đã lưu annotation của ảnh này sau khi bạn mở nó."""


def _coordinate(value, name):
    """Một toạ độ hợp lệ: số hữu hạn nằm trong [0, 1] (cho phép lệch 1e-9 do làm tròn). Trả về đã làm tròn 6 số lẻ."""
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} phải là một số")
    if value < -1e-9 or value > 1 + 1e-9:
        raise ValueError(f"{name} phải nằm trong khoảng 0 đến 1")
    return round(min(max(float(value), 0.0), 1.0), 6)


def validate_annotation(item):
    """
    Kiểm tra 1 annotation do trình duyệt gửi lên: {"class_id": 1, "type": "bbox", "data": {...}}.
    Trả về (class_id, type, data đã làm sạch). Sai thì ném ValueError có câu giải thích.
    """
    if not isinstance(item, dict):
        raise ValueError("annotation phải là một object")
    class_id, kind, data = item.get("class_id"), item.get("type"), item.get("data")
    if isinstance(class_id, bool) or not isinstance(class_id, int):
        raise ValueError("class_id phải là số nguyên")
    if kind not in ANNOTATION_TYPES:
        raise ValueError(f"type phải là một trong {ANNOTATION_TYPES}")
    if not isinstance(data, dict):
        raise ValueError("data phải là một object")

    if kind == "bbox":
        x, y = _coordinate(data.get("x"), "x"), _coordinate(data.get("y"), "y")
        w, h = _coordinate(data.get("w"), "w"), _coordinate(data.get("h"), "h")
        if w < MIN_BOX_SIZE or h < MIN_BOX_SIZE:
            raise ValueError("hộp quá nhỏ")
        if x + w > 1 + 1e-6 or y + h > 1 + 1e-6:
            raise ValueError("hộp vượt ra ngoài ảnh")
        return class_id, kind, {"x": x, "y": y, "w": round(min(w, 1 - x), 6), "h": round(min(h, 1 - y), 6)}

    points = data.get("points")
    if not isinstance(points, list) or not 3 <= len(points) <= MAX_POLYGON_POINTS:
        raise ValueError(f"đa giác cần từ 3 đến {MAX_POLYGON_POINTS} điểm")
    clean = []
    for point in points:
        if not isinstance(point, (list, tuple)) or len(point) != 2:
            raise ValueError("mỗi điểm phải có dạng [x, y]")
        clean.append([_coordinate(point[0], "x"), _coordinate(point[1], "y")])
    area = abs(sum(clean[i][0] * clean[(i + 1) % len(clean)][1] - clean[(i + 1) % len(clean)][0] * clean[i][1]
                   for i in range(len(clean)))) / 2   # công thức diện tích Gauss
    if area < MIN_POLYGON_AREA:
        raise ValueError("đa giác quá nhỏ hoặc các điểm thẳng hàng")
    return class_id, kind, {"points": clean}


def get_annotations(conn, image_id):
    """Annotation của 1 ảnh cùng số phiên bản hiện tại. Trả về {"version", "status", "annotations": [...]}."""
    image = conn.execute(
        "SELECT annotation_version, status FROM images WHERE id = ?", (image_id,)
    ).fetchone()
    if image is None:
        raise LookupError(f"Không tìm thấy ảnh #{image_id}")
    rows = conn.execute(
        "SELECT id, class_id, type, data FROM annotations WHERE image_id = ? ORDER BY id", (image_id,)
    ).fetchall()
    return {
        "version": image["annotation_version"],
        "status": image["status"],
        "annotations": [
            {"id": r["id"], "class_id": r["class_id"], "type": r["type"], "data": json.loads(r["data"])} for r in rows
        ],
    }


def save_annotations(conn, image_id, base_version, items):
    """
    Thay TOÀN BỘ annotation của ảnh bằng danh sách `items`.

    base_version là phiên bản mà trình duyệt đã đọc. Nếu từ đó có người khác lưu (phiên bản đã tăng)
    thì ném VersionConflict và không đổi gì: tránh việc 2 người sửa cùng 1 ảnh mà người lưu sau
    âm thầm ghi đè mất công của người trước.

    Ảnh đang 'unlabeled' mà có ít nhất 1 annotation thì tự chuyển thành 'labeled'.
    """
    image = get_image(conn, image_id)
    if not isinstance(items, list):
        raise ValueError("annotations phải là một danh sách")
    if len(items) > MAX_ANNOTATIONS_PER_IMAGE:
        raise ValueError(f"Mỗi ảnh tối đa {MAX_ANNOTATIONS_PER_IMAGE} annotation")

    # Kiểm tra hết trước khi ghi gì
    allowed_classes = {c["id"] for c in list_classes(conn, image["project_id"])}
    clean = []
    for index, item in enumerate(items, start=1):
        try:
            class_id, kind, data = validate_annotation(item)
            if class_id not in allowed_classes:
                raise ValueError("class không thuộc project của ảnh này")
        except ValueError as error:
            raise ValueError(f"Annotation {index}: {error}")
        clean.append((class_id, kind, json.dumps(data, separators=(",", ":"))))

    conn.execute("BEGIN IMMEDIATE")   # khoá ghi ngay, để kiểm tra phiên bản và ghi là 1 khối không ai chen ngang
    try:
        updated = conn.execute(
            """UPDATE images SET annotation_version = annotation_version + 1, updated_at = datetime('now')
               WHERE id = ? AND annotation_version = ?""",
            (image_id, base_version),
        ).rowcount
        if updated == 0:
            raise VersionConflict("Ảnh này vừa được người khác thay đổi. Hãy tải lại trước khi lưu.")
        conn.execute("DELETE FROM annotations WHERE image_id = ?", (image_id,))
        conn.executemany(
            "INSERT INTO annotations (image_id, class_id, type, data) VALUES (?, ?, ?, ?)",
            [(image_id, c, k, d) for c, k, d in clean],
        )
        if clean:
            conn.execute("UPDATE images SET status = 'labeled' WHERE id = ? AND status = 'unlabeled'", (image_id,))
        conn.commit()
    except BaseException:
        conn.rollback()
        raise
    return get_annotations(conn, image_id)
