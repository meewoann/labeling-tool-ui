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
