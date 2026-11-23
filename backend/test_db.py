"""
test_db.py — kiểm tra db.py chạy đúng.
Chạy:  cd backend && python3 -m unittest -v
Mỗi test dùng database + folder ảnh tạm, không đụng tới dữ liệu thật.
"""

import sqlite3
import tempfile
import unittest
from pathlib import Path

from PIL import Image

import db


def make_image(path, size=(40, 30)):
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", size, "green").save(path)


class DbTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.conn = db.connect(self.root / "test.db")
        db.init_db(self.conn)

        # Folder ảnh giả: 3 ảnh hợp lệ (1 nằm trong folder con) + các file cần bị bỏ qua
        self.photos = self.root / "photos"
        make_image(self.photos / "a.jpg", (40, 30))
        make_image(self.photos / "b.PNG", (20, 10))        # đuôi viết hoa vẫn nhận
        make_image(self.photos / "sub" / "c.jpg")
        (self.photos / "notes.txt").write_text("không phải ảnh")
        make_image(self.photos / ".hidden.jpg")             # file ẩn → bỏ qua
        make_image(self.photos / ".cache" / "d.jpg")        # folder ẩn → bỏ qua
        (self.photos / "broken.jpg").write_bytes(b"hong")   # đuôi ảnh nhưng nội dung hỏng

        self.project_id = db.create_project(self.conn, "Demo")

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def test_create_project_and_duplicate(self):
        with self.assertRaises(ValueError):
            db.create_project(self.conn, "Demo")
        with self.assertRaises(ValueError):
            db.create_project(self.conn, "   ")
        self.assertEqual(db.find_project(self.conn, "Demo")["id"], self.project_id)
        self.assertEqual(db.find_project(self.conn, str(self.project_id))["name"], "Demo")
        with self.assertRaises(LookupError):
            db.find_project(self.conn, "khong-co")

    def test_import_folder(self):
        result = db.import_folder(self.conn, self.project_id, self.photos)
        self.assertEqual(result["added"], 3)
        self.assertEqual(result["existing"], 0)
        self.assertEqual(result["skipped"], ["broken.jpg"])

        images = db.list_images(self.conn, self.project_id)
        self.assertEqual([i["rel_path"] for i in images], ["a.jpg", "b.PNG", "sub/c.jpg"])
        self.assertTrue(all(i["status"] == "unlabeled" for i in images))
        a = images[0]
        self.assertEqual((a["width"], a["height"]), (40, 30))
        self.assertTrue(Path(a["full_path"]).is_file())

    def test_reimport_keeps_status_and_adds_only_new(self):
        db.import_folder(self.conn, self.project_id, self.photos)
        first = db.list_images(self.conn, self.project_id)[0]
        db.set_status(self.conn, first["id"], "labeled")

        make_image(self.photos / "new.jpg")
        result = db.import_folder(self.conn, self.project_id, self.photos)
        self.assertEqual((result["added"], result["existing"]), (1, 3))

        self.assertEqual(len(db.list_folders(self.conn, self.project_id)), 1)  # vẫn 1 folder
        images = {i["rel_path"]: i for i in db.list_images(self.conn, self.project_id)}
        self.assertEqual(images["a.jpg"]["status"], "labeled")   # trạng thái cũ được giữ
        self.assertEqual(images["new.jpg"]["status"], "unlabeled")

    def test_import_missing_folder(self):
        with self.assertRaises(NotADirectoryError):
            db.import_folder(self.conn, self.project_id, self.root / "khong-ton-tai")

    def test_status_and_stats(self):
        db.import_folder(self.conn, self.project_id, self.photos)
        ids = [i["id"] for i in db.list_images(self.conn, self.project_id)]
        db.set_status(self.conn, ids[0], "labeled")
        db.set_status(self.conn, ids[1], "review")

        stats = db.list_projects(self.conn, self.project_id)[0]
        self.assertEqual(
            (stats["total"], stats["unlabeled"], stats["labeled"], stats["review"]), (3, 1, 1, 1)
        )
        only_labeled = db.list_images(self.conn, self.project_id, status="labeled")
        self.assertEqual([i["id"] for i in only_labeled], [ids[0]])

    def test_invalid_status_and_unknown_id(self):
        db.import_folder(self.conn, self.project_id, self.photos)
        image_id = db.list_images(self.conn, self.project_id)[0]["id"]
        with self.assertRaises(ValueError):
            db.set_status(self.conn, image_id, "xong-roi")
        with self.assertRaises(LookupError):
            db.set_status(self.conn, 99999, "labeled")
        # Nhiều id mà có 1 id sai → không ảnh nào bị đổi
        with self.assertRaises(LookupError):
            db.set_status_many(self.conn, [image_id, 99999], "labeled")
        self.assertEqual(db.list_images(self.conn, self.project_id)[0]["status"], "unlabeled")
        # DB cũng tự chặn trạng thái sai, kể cả khi bỏ qua code Python
        with self.assertRaises(sqlite3.IntegrityError):
            self.conn.execute("UPDATE images SET status = 'bay-ba' WHERE id = ?", (image_id,))

    def test_two_folders_and_delete_project(self):
        other = self.root / "other"
        make_image(other / "x.jpg")
        db.import_folder(self.conn, self.project_id, self.photos)
        db.import_folder(self.conn, self.project_id, other)
        self.assertEqual([f["image_count"] for f in db.list_folders(self.conn, self.project_id)], [3, 1])

        db.delete_project(self.conn, self.project_id)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM images").fetchone()[0], 0)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM folders").fetchone()[0], 0)
        self.assertTrue((self.photos / "a.jpg").exists())  # file ảnh thật vẫn còn nguyên


if __name__ == "__main__":
    unittest.main()
