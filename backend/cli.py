"""
cli.py — dùng database từ dòng lệnh (chưa cần giao diện web).

Ví dụ:
    python3 backend/cli.py init
    python3 backend/cli.py project add "Street Traffic" -d "Xe và người đi bộ"
    python3 backend/cli.py project list
    python3 backend/cli.py import "Street Traffic" /duong/dan/folder_anh
    python3 backend/cli.py folders "Street Traffic"
    python3 backend/cli.py images "Street Traffic" --status unlabeled --limit 20
    python3 backend/cli.py status 5 labeled          # đổi ảnh có id=5
    python3 backend/cli.py stats "Street Traffic"

Dùng file DB khác:  --db /duong/dan/file.db  (hoặc đặt biến môi trường LABELKIT_DB)
"""

import argparse
import sys

import db


def percent(part, total):
    return round(part * 100 / total) if total else 0


def cmd_init(conn, args):
    db.init_db(conn)
    print(f"Đã tạo database tại: {db.DEFAULT_DB_PATH if args.db is None else args.db}")


def cmd_project_add(conn, args):
    project_id = db.create_project(conn, args.name, args.description)
    print(f"Đã tạo project #{project_id}: {args.name}")


def cmd_project_list(conn, args):
    projects = db.list_projects(conn)
    if not projects:
        print("Chưa có project nào. Tạo bằng: project add \"Tên\"")
        return
    print(f"{'ID':<4} {'TÊN':<28} {'ẢNH':>6} {'CHƯA':>6} {'ĐÃ':>6} {'REVIEW':>7}  TIẾN ĐỘ")
    for p in projects:
        print(f"{p['id']:<4} {p['name']:<28} {p['total']:>6} {p['unlabeled']:>6} "
              f"{p['labeled']:>6} {p['review']:>7}  {percent(p['labeled'], p['total'])}%")


def cmd_import(conn, args):
    project = db.find_project(conn, args.project)
    result = db.import_folder(conn, project["id"], args.folder)
    print(f"Project '{project['name']}': thêm {result['added']} ảnh mới, "
          f"bỏ qua {result['existing']} ảnh đã có.")
    if result["skipped"]:
        print(f"Có {len(result['skipped'])} file lỗi, không đọc được:")
        for rel_path in result["skipped"][:10]:
            print("   -", rel_path)
        if len(result["skipped"]) > 10:
            print(f"   ... và {len(result['skipped']) - 10} file nữa")


def cmd_folders(conn, args):
    project = db.find_project(conn, args.project)
    folders = db.list_folders(conn, project["id"])
    if not folders:
        print("Project này chưa có folder nào.")
    for f in folders:
        print(f"#{f['id']:<3} {f['name']:<20} {f['image_count']:>6} ảnh   {f['path']}")


def cmd_images(conn, args):
    project = db.find_project(conn, args.project)
    images = db.list_images(conn, project["id"], args.status, args.limit, args.offset)
    if not images:
        print("Không có ảnh nào.")
    for img in images:
        print(f"#{img['id']:<6} {img['status']:<10} {img['width']}x{img['height']:<6} {img['full_path']}")


def cmd_status(conn, args):
    db.set_status_many(conn, args.image_ids, args.status)
    print(f"Đã đổi {len(args.image_ids)} ảnh sang '{args.status}'.")


def cmd_stats(conn, args):
    project = db.find_project(conn, args.project)
    s = db.list_projects(conn, project["id"])[0]
    print(f"Project: {s['name']}")
    print(f"  Tổng ảnh   : {s['total']}")
    print(f"  Chưa gán   : {s['unlabeled']}")
    print(f"  Đã gán     : {s['labeled']}  ({percent(s['labeled'], s['total'])}%)")
    print(f"  Chờ review : {s['review']}")


def build_parser():
    parser = argparse.ArgumentParser(description="LabelKit database CLI")
    parser.add_argument("--db", help="đường dẫn file database (mặc định backend/data/labelkit.db)")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="tạo database").set_defaults(func=cmd_init)

    p_project = sub.add_parser("project", help="quản lý project")
    p_project_sub = p_project.add_subparsers(dest="action", required=True)
    p_add = p_project_sub.add_parser("add", help="tạo project")
    p_add.add_argument("name")
    p_add.add_argument("-d", "--description", default="")
    p_add.set_defaults(func=cmd_project_add)
    p_project_sub.add_parser("list", help="liệt kê project").set_defaults(func=cmd_project_list)

    p_import = sub.add_parser("import", help="thêm folder ảnh vào project")
    p_import.add_argument("project", help="tên hoặc id project")
    p_import.add_argument("folder", help="đường dẫn folder ảnh")
    p_import.set_defaults(func=cmd_import)

    p_folders = sub.add_parser("folders", help="liệt kê folder của project")
    p_folders.add_argument("project")
    p_folders.set_defaults(func=cmd_folders)

    p_images = sub.add_parser("images", help="liệt kê ảnh của project")
    p_images.add_argument("project")
    p_images.add_argument("--status", choices=db.STATUSES)
    p_images.add_argument("--limit", type=int, default=50)
    p_images.add_argument("--offset", type=int, default=0)
    p_images.set_defaults(func=cmd_images)

    p_status = sub.add_parser("status", help="đổi trạng thái ảnh")
    p_status.add_argument("image_ids", type=int, nargs="+", metavar="image_id")
    p_status.add_argument("status", choices=db.STATUSES)
    p_status.set_defaults(func=cmd_status)

    p_stats = sub.add_parser("stats", help="thống kê project")
    p_stats.add_argument("project")
    p_stats.set_defaults(func=cmd_stats)

    return parser


def main():
    args = build_parser().parse_args()
    conn = db.connect(args.db)
    db.init_db(conn)  # luôn đảm bảo bảng đã tồn tại, không cần nhớ chạy "init"
    try:
        args.func(conn, args)
    except (ValueError, LookupError, NotADirectoryError) as error:
        print(f"Lỗi: {error}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
