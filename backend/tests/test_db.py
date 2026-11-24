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

    def test_count_get_and_window(self):
        db.import_folder(self.conn, self.project_id, self.photos)
        images = db.list_images(self.conn, self.project_id)
        db.set_status(self.conn, images[1]["id"], "review")

        self.assertEqual(db.count_images(self.conn, self.project_id), 3)
        self.assertEqual(db.count_images(self.conn, self.project_id, "review"), 1)
        self.assertEqual(db.get_image(self.conn, images[2]["id"])["rel_path"], "sub/c.jpg")
        with self.assertRaises(LookupError):
            db.get_image(self.conn, 99999)

        # Cửa sổ 2 ảnh quanh ảnh thứ 3 (vị trí 2) bắt đầu từ offset 1
        self.assertEqual(db.image_window_offset(self.conn, self.project_id, images[2]["id"], 2), 1)
        self.assertEqual(db.image_window_offset(self.conn, self.project_id, images[0]["id"], 2), 0)
        # Ảnh bìa project = ảnh đầu tiên
        cover = db.list_projects(self.conn, self.project_id)[0]["cover_image_id"]
        self.assertEqual(cover, images[0]["id"])

    def test_class_crud_and_validation(self):
        car = db.create_class(self.conn, self.project_id, "  Car  ", "#3b82f6")
        person = db.create_class(self.conn, self.project_id, "person", "#F59E0B")
        classes = db.list_classes(self.conn, self.project_id)
        self.assertEqual([(c["name"], c["color"]) for c in classes], [("Car", "#3B82F6"), ("person", "#F59E0B")])  # màu viết hoa, tên được dọn khoảng trắng
        self.assertEqual(db.list_projects(self.conn, self.project_id)[0]["class_count"], 2)

        for bad_name in ("", "   ", "x" * 51, "bell\x07"):
            with self.assertRaises(ValueError, msg=repr(bad_name)):
                db.create_class(self.conn, self.project_id, bad_name, "#000000")
        for bad_color in ("red", "#12345", "#GGGGGG", "3B82F6", ""):
            with self.assertRaises(ValueError, msg=bad_color):
                db.create_class(self.conn, self.project_id, "ok-name", bad_color)
        with self.assertRaises(ValueError):                                  # trùng tên, không phân biệt hoa thường
            db.create_class(self.conn, self.project_id, "CAR", "#000000")

        db.update_class(self.conn, car, name="Truck")
        db.update_class(self.conn, car, color="#ef4444")
        self.assertEqual((db.get_class(self.conn, car)["name"], db.get_class(self.conn, car)["color"]), ("Truck", "#EF4444"))
        with self.assertRaises(ValueError):
            db.update_class(self.conn, car, name="Person")                   # trùng với class khác
        with self.assertRaises(LookupError):
            db.update_class(self.conn, 99999, name="x")

        # Hai project khác nhau có thể dùng cùng tên class
        other = db.create_project(self.conn, "Other")
        db.create_class(self.conn, other, "person", "#10B981")

        db.delete_class(self.conn, person)
        self.assertEqual([c["name"] for c in db.list_classes(self.conn, self.project_id)], ["Truck"])
        with self.assertRaises(LookupError):
            db.delete_class(self.conn, person)

        db.delete_project(self.conn, other)                                  # xoá project thì class đi theo
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM classes").fetchone()[0], 1)

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
