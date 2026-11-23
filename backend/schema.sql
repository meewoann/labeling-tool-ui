-- ==========================================================
-- schema.sql — cấu trúc database (SQLite)
-- Có 3 bảng:  projects  →  folders  →  images
--   projects : mỗi dataset là 1 project
--   folders  : mỗi lần "quăng" 1 folder ảnh vào project
--   images   : từng ảnh trong folder, kèm trạng thái
-- File này chạy lại nhiều lần cũng an toàn (IF NOT EXISTS).
-- ==========================================================

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Folder ảnh nằm trên máy chủ. DB chỉ nhớ ĐƯỜNG DẪN, không copy ảnh.
CREATE TABLE IF NOT EXISTS folders (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  path        TEXT NOT NULL,          -- đường dẫn tuyệt đối, vd: /data/cam1
  name        TEXT NOT NULL,          -- tên folder, vd: cam1
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, path)           -- 1 folder chỉ được thêm 1 lần vào 1 project
);

CREATE TABLE IF NOT EXISTS images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  folder_id   INTEGER NOT NULL REFERENCES folders(id)  ON DELETE CASCADE,
  rel_path    TEXT NOT NULL,          -- đường dẫn trong folder, vd: sub/img_001.jpg
  filename    TEXT NOT NULL,          -- img_001.jpg
  width       INTEGER NOT NULL,
  height      INTEGER NOT NULL,
  size_bytes  INTEGER NOT NULL,
  -- Trạng thái: chưa gán nhãn / đã gán nhãn / đang chờ review
  status      TEXT NOT NULL DEFAULT 'unlabeled'
              CHECK (status IN ('unlabeled', 'labeled', 'review')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (folder_id, rel_path)        -- không bao giờ có 2 dòng cho cùng 1 file
);

-- Giúp lọc "ảnh chưa gán nhãn của project X" nhanh khi có hàng chục nghìn ảnh
CREATE INDEX IF NOT EXISTS idx_images_project_status ON images (project_id, status);
CREATE INDEX IF NOT EXISTS idx_images_folder         ON images (folder_id);

-- ==========================================================
-- Đăng nhập: users + sessions
--   Hiện chỉ có username + password. Khi cần email thì thêm cột email vào users.
-- ==========================================================

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- "Alex" và "alex" là cùng 1 người
  password_hash TEXT NOT NULL,                         -- KHÔNG BAO GIỜ lưu mật khẩu thật
  is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mỗi lần đăng nhập tạo 1 phiên. Trình duyệt giữ "token"; DB chỉ giữ bản băm của token,
-- nên ai đọc được file database cũng không dùng được các phiên đang đăng nhập.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
