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

    # ----- annotation -----
    def annotated_setup(self):
        """Project có 2 class, 3 ảnh. Trả về (danh sách ảnh, id class car, id class person)."""
        db.import_folder(self.conn, self.project_id, self.photos)
        car = db.create_class(self.conn, self.project_id, "car", "#3B82F6")
        person = db.create_class(self.conn, self.project_id, "person", "#F59E0B")
        return db.list_images(self.conn, self.project_id), car, person

    BOX = {"x": 0.1, "y": 0.2, "w": 0.3, "h": 0.4}
    TRIANGLE = {"points": [[0.1, 0.1], [0.5, 0.1], [0.3, 0.6]]}

    def test_save_and_read_annotations(self):
        images, car, person = self.annotated_setup()
        image_id = images[0]["id"]
        self.assertEqual(db.get_annotations(self.conn, image_id), {"version": 0, "status": "unlabeled", "annotations": []})

        result = db.save_annotations(self.conn, image_id, 0, [
            {"class_id": car, "type": "bbox", "data": {"x": 0.1234567891, "y": 0.2, "w": 0.3, "h": 0.4}},
            {"class_id": person, "type": "polygon", "data": self.TRIANGLE},
        ])
        self.assertEqual(result["version"], 1)
        self.assertEqual(result["status"], "labeled")                 # unlabeled + có annotation → tự thành labeled
        self.assertEqual([(a["class_id"], a["type"]) for a in result["annotations"]], [(car, "bbox"), (person, "polygon")])
        self.assertEqual(result["annotations"][0]["data"]["x"], 0.123457)   # làm tròn 6 số lẻ
        self.assertEqual(result["annotations"][1]["data"], self.TRIANGLE)

        # Lưu lại danh sách khác: thay thế hoàn toàn, version tăng tiếp
        result = db.save_annotations(self.conn, image_id, 1, [{"class_id": car, "type": "bbox", "data": self.BOX}])
        self.assertEqual((result["version"], len(result["annotations"])), (2, 1))

        # Số đếm xuất hiện ở danh sách ảnh và danh sách class
        self.assertEqual(db.list_images(self.conn, self.project_id)[0]["annotation_count"], 1)
        self.assertEqual(db.get_image(self.conn, image_id)["annotation_count"], 1)
        self.assertEqual({c["name"]: c["annotation_count"] for c in db.list_classes(self.conn, self.project_id)}, {"car": 1, "person": 0})

        # Xoá hết: trạng thái KHÔNG bị tự đổi lại (có thể người dùng chủ đích đánh dấu ảnh không có vật thể)
        result = db.save_annotations(self.conn, image_id, 2, [])
        self.assertEqual((result["annotations"], result["status"]), ([], "labeled"))

    def test_status_is_only_auto_changed_from_unlabeled(self):
        images, car, _ = self.annotated_setup()
        db.set_status(self.conn, images[0]["id"], "review")
        result = db.save_annotations(self.conn, images[0]["id"], 0, [{"class_id": car, "type": "bbox", "data": self.BOX}])
        self.assertEqual(result["status"], "review")

    def test_annotation_validation(self):
        images, car, person = self.annotated_setup()
        image_id = images[0]["id"]
        other_project = db.create_project(self.conn, "Other")
        foreign = db.create_class(self.conn, other_project, "alien", "#000000")
        box = lambda **kw: {"class_id": car, "type": "bbox", "data": {**self.BOX, **kw}}
        bad = [
            ("nan", box(x=float("nan"))), ("infinity", box(w=float("inf"))), ("negative", box(x=-0.2)),
            ("beyond 1", box(x=1.5)), ("string", box(x="0.1")), ("bool", box(x=True)), ("missing", {"class_id": car, "type": "bbox", "data": {"x": 0.1}}),
            ("tiny box", box(w=0.0001)), ("box off the image", box(x=0.9, w=0.3)),
            ("unknown type", {"class_id": car, "type": "circle", "data": self.BOX}),
            ("class not int", {"class_id": "1", "type": "bbox", "data": self.BOX}),
            ("class of another project", {"class_id": foreign, "type": "bbox", "data": self.BOX}),
            ("class that does not exist", {"class_id": 99999, "type": "bbox", "data": self.BOX}),
            ("2 points", {"class_id": car, "type": "polygon", "data": {"points": [[0, 0], [1, 1]]}}),
            ("collinear polygon", {"class_id": car, "type": "polygon", "data": {"points": [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3]]}}),
            ("bad point", {"class_id": car, "type": "polygon", "data": {"points": [[0.1, 0.1], [0.5], [0.3, 0.6]]}}),
            ("point outside", {"class_id": car, "type": "polygon", "data": {"points": [[0.1, 0.1], [1.5, 0.1], [0.3, 0.6]]}}),
            ("not an object", "bbox"),
        ]
        for label, item in bad:
            with self.assertRaises(ValueError, msg=label):
                db.save_annotations(self.conn, image_id, 0, [item])
        with self.assertRaises(ValueError):
            db.save_annotations(self.conn, image_id, 0, "nope")
        with self.assertRaises(ValueError):
            db.save_annotations(self.conn, image_id, 0, [{"class_id": car, "type": "bbox", "data": self.BOX}] * (db.MAX_ANNOTATIONS_PER_IMAGE + 1))

        # Hộp sát mép (làm tròn) vẫn được nhận
        db.save_annotations(self.conn, image_id, 0, [box(x=0.7, w=0.3)])
        # Không có lần lưu hỏng nào làm đổi phiên bản hay dữ liệu
        self.assertEqual(db.get_annotations(self.conn, image_id)["version"], 1)
        with self.assertRaises(LookupError):
            db.save_annotations(self.conn, 99999, 0, [])

    def test_failed_save_changes_nothing(self):
        images, car, _ = self.annotated_setup()
        image_id = images[0]["id"]
        db.save_annotations(self.conn, image_id, 0, [{"class_id": car, "type": "bbox", "data": self.BOX}])
        with self.assertRaises(ValueError):    # annotation thứ 2 sai → annotation cũ phải còn nguyên
            db.save_annotations(self.conn, image_id, 1, [
                {"class_id": car, "type": "bbox", "data": {**self.BOX, "x": 0.5}},
                {"class_id": car, "type": "polygon", "data": {"points": []}},
            ])
        after = db.get_annotations(self.conn, image_id)
        self.assertEqual((after["version"], [a["data"] for a in after["annotations"]]), (1, [self.BOX]))

    def test_two_editors_cannot_silently_overwrite_each_other(self):
        images, car, person = self.annotated_setup()
        image_id = images[0]["id"]
        mine = db.get_annotations(self.conn, image_id)["version"]       # cả hai cùng mở ở version 0
        theirs = mine
        db.save_annotations(self.conn, image_id, theirs, [{"class_id": car, "type": "bbox", "data": self.BOX}])   # người kia lưu trước
        with self.assertRaises(db.VersionConflict):
            db.save_annotations(self.conn, image_id, mine, [{"class_id": person, "type": "polygon", "data": self.TRIANGLE}])
        kept = db.get_annotations(self.conn, image_id)
        self.assertEqual([a["type"] for a in kept["annotations"]], ["bbox"])    # công của người lưu trước còn nguyên
        db.save_annotations(self.conn, image_id, kept["version"], [])          # tải lại rồi lưu thì được

    def test_deleting_a_class_removes_its_annotations(self):
        images, car, person = self.annotated_setup()
        a, b = images[0]["id"], images[1]["id"]
        db.save_annotations(self.conn, a, 0, [{"class_id": car, "type": "bbox", "data": self.BOX},
                                               {"class_id": person, "type": "bbox", "data": self.BOX}])
        db.save_annotations(self.conn, b, 0, [{"class_id": person, "type": "polygon", "data": self.TRIANGLE}])
        self.assertEqual(db.delete_class(self.conn, person), 2)
        self.assertEqual([x["class_id"] for x in db.get_annotations(self.conn, a)["annotations"]], [car])
        self.assertEqual(db.get_annotations(self.conn, b)["annotations"], [])
        # Ai đang mở 2 ảnh này sẽ gặp xung đột khi lưu, thay vì lưu đè lên dữ liệu đã đổi
        self.assertEqual(db.get_annotations(self.conn, a)["version"], 2)
        self.assertEqual(db.get_annotations(self.conn, b)["version"], 2)
        self.assertEqual(db.get_annotations(self.conn, images[2]["id"])["version"], 0)   # ảnh không liên quan thì không đổi

    def test_deleting_project_removes_annotations(self):
        images, car, _ = self.annotated_setup()
        db.save_annotations(self.conn, images[0]["id"], 0, [{"class_id": car, "type": "bbox", "data": self.BOX}])
        db.delete_project(self.conn, self.project_id)
        self.assertEqual(self.conn.execute("SELECT COUNT(*) FROM annotations").fetchone()[0], 0)

    def test_old_database_is_upgraded(self):
        """Database tạo từ bản cũ (bảng images chưa có cột annotation_version) vẫn dùng được sau khi nâng cấp."""
        old_path = self.root / "old.db"
        old = sqlite3.connect(old_path)
        old.executescript("""
            CREATE TABLE projects (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
                description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')));
            CREATE TABLE folders (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, path TEXT NOT NULL,
                name TEXT NOT NULL, imported_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (project_id, path));
            CREATE TABLE images (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER NOT NULL, folder_id INTEGER NOT NULL,
                rel_path TEXT NOT NULL, filename TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL,
                size_bytes INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'unlabeled', created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (folder_id, rel_path));
            INSERT INTO projects (name) VALUES ('Legacy');
            INSERT INTO folders (project_id, path, name) VALUES (1, '/x', 'x');
            INSERT INTO images (project_id, folder_id, rel_path, filename, width, height, size_bytes) VALUES (1, 1, 'a.jpg', 'a.jpg', 10, 10, 5);
        """)
        old.commit(); old.close()

        conn = db.connect(old_path)
        db.init_db(conn)
        db.init_db(conn)                                         # chạy lại lần 2 không lỗi
        self.assertEqual(db.get_annotations(conn, 1), {"version": 0, "status": "unlabeled", "annotations": []})
        car = db.create_class(conn, 1, "car", "#3B82F6")
        self.assertEqual(db.save_annotations(conn, 1, 0, [{"class_id": car, "type": "bbox", "data": self.BOX}])["version"], 1)
        self.assertEqual(conn.execute("SELECT filename FROM images").fetchone()[0], "a.jpg")   # dữ liệu cũ còn nguyên
        conn.close()

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
