[English](../README.md) · **Tiếng Việt**

# LabelKit — Image Annotation UI Prototype

Prototype giao diện (click được) cho một tool gán nhãn ảnh dùng để làm dataset computer vision.
Tất cả các trang và việc chuyển trang đều hoạt động, nhưng các tính năng thật (vẽ box, lưu dữ liệu,
export file) **chưa** được làm. Toàn bộ dữ liệu là dữ liệu giả.

Chỉ dùng HTML + CSS + JavaScript thuần: không framework, không npm, không có bước build.

**Demo:** https://meewoann.github.io/labeling-tool-ui/

## Các trang

| File | Nội dung |
| --- | --- |
| `index.html` | Trang vào: tự chuyển sang `projects.html` (chưa có đăng nhập) |
| `projects.html` | Thẻ thống kê và lưới project (số ảnh, % đã gán nhãn, lần cập nhật). Nút **New Project** mở modal |
| `project.html` | Tổng quan 1 project: 4 thẻ thống kê và 3 tab **Images / Classes / Members**, có modal Upload và Add/Edit class |
| `label.html` | Workspace gán nhãn: thanh công cụ, canvas có bounding box giả, panel class/annotation/thông tin ảnh, dải thumbnail Prev/Next, nút Save, modal phím tắt |
| `export.html` | Chọn định dạng (YOLO / COCO / Pascal VOC), slider chia train/val/test, nút Export |
| `settings.html` | Form hồ sơ và tuỳ chọn (chỉ có giao diện) |
| `404.html` | Trang lỗi, có link quay về projects |

## Cách chạy

Mở trực tiếp file `index.html` bằng trình duyệt (double-click) là chạy được.
Cần có Internet để tải icon (Lucide), font (Inter) và ảnh mẫu (picsum.photos).

Giao diện được thiết kế cho màn hình rộng từ 1280px trở lên.

## File nào làm gì

```
labeling-tool-ui/
├── index.html … 404.html   Mỗi trang là 1 file HTML. Sidebar và top bar được copy y hệt vào từng file
├── serve.py                Chạy server nhỏ: python3 serve.py rồi mở http://localhost:8000
├── backend/                Database + API lưu folder ảnh và trạng thái (xem mục "Database" bên dưới)
├── css/style.css           Toàn bộ CSS. Biến màu (--primary, --bg, --text…) nằm ở đầu file
├── js/app.js               Toàn bộ JavaScript (xem mục lục ở đầu file)
└── README.md
```

**`css/style.css`**: muốn đổi màu chủ đạo thì chỉ cần sửa các biến trong `:root` ở đầu file.

**`js/app.js`** gồm 5 phần:

1. **Mock data**: các mảng `DEMO_PROJECTS`, `DEMO_CLASSES`, `DEMO_IMAGES`, `DEMO_MEMBERS`. Mặc định công tắc `USE_DEMO_DATA = false` nên các trang hiện trạng thái trống (chưa upload gì). Đổi thành `true` để xem giao diện với dữ liệu mẫu.
2. **Helper**: `showToast()`, `openModal()`, `makeSelectable()`…
3. **Tương tác chung**: highlight sidebar, mở/đóng modal, chuyển tab, ô search.
4. **Code riêng từng trang**: `initProjectsPage()`, `initLabelPage()`…
5. **Khởi chạy**: đọc `<body data-page="...">` để biết đang ở trang nào rồi gọi đúng hàm.

Một số quy ước trong HTML mà `app.js` dựa vào:

- `data-open-modal="id-cua-modal"`: click để mở modal đó
- `data-close-modal`: click để đóng modal chứa nút này (click ra ngoài hoặc nhấn Esc cũng đóng)
- `data-tab="images"`: click để hiện panel `id="tab-images"`
- `data-toast="Nội dung"`: click để hiện toast với nội dung đó
- `data-nav="projects"` trên link sidebar: dùng để highlight mục đang ở

## Phím tắt trên trang label

`V` Select · `B` Bounding box · `P` Polygon · `H` Pan · `Z` Zoom · `←` `→` đổi ảnh ·
`1`–`9` chọn class · `Ctrl+S` Save · `?` xem phím tắt · `/` nhảy vào ô search

## Database (backend/)

Lưu **folder ảnh** và **trạng thái từng ảnh** (`unlabeled` / `labeled` / `review`).
Dùng SQLite nên không cần cài gì thêm ngoài Python và thư viện Pillow
(`pip install -r backend/requirements.txt`). Toàn bộ DB là 1 file `backend/data/labelkit.db`
(file này không được đưa lên git).

| File | Làm gì |
| --- | --- |
| `backend/schema.sql` | Cấu trúc 3 bảng: `projects` → `folders` → `images` |
| `backend/db.py` | Mọi hàm làm việc với DB: tạo project, import folder, đổi trạng thái, thống kê |
| `backend/cli.py` | Dùng DB từ dòng lệnh |
| `backend/test_db.py` | Test tự động (`cd backend && python3 -m unittest -v`) |

DB chỉ nhớ **đường dẫn** tới folder ảnh trên máy chủ, không copy ảnh. Vì vậy đừng đổi tên
hoặc di chuyển folder sau khi đã import. Import lại cùng một folder chỉ thêm những ảnh mới,
ảnh cũ giữ nguyên trạng thái.

```bash
python3 backend/cli.py project add "Street Traffic"
python3 backend/cli.py import "Street Traffic" /duong/dan/folder_anh
python3 backend/cli.py stats "Street Traffic"
python3 backend/cli.py images "Street Traffic" --status unlabeled --limit 20
python3 backend/cli.py status 5 labeled          # đổi trạng thái ảnh có id = 5
```

## Chạy web có database (upload folder ảnh, đổi trạng thái)

```bash
pip install -r backend/requirements.txt
python3 backend/app.py            # http://localhost:8000
python3 backend/app.py --lan      # cho cả máy cùng mạng truy cập
```

Một lệnh vừa phục vụ các trang web vừa cung cấp API (`/api/...`).

**Đăng nhập:** lần đầu mở web (database chưa có tài khoản nào) sẽ hiện form "Create the first account".
Tài khoản này là admin. Từ lần sau, mọi trang đều yêu cầu đăng nhập bằng username + password
(hết phiên thì tự quay về trang đăng nhập rồi trả bạn về đúng trang đang xem). Nút **Sign out** nằm ở sidebar.
Quản lý tài khoản (trang **Settings**):

- **Password**: tự đổi mật khẩu (các thiết bị khác bị đăng xuất).
- **Team** (chỉ admin thấy): thêm người mới bằng username + mật khẩu tạm, đặt lại mật khẩu cho người quên, xoá tài khoản.
  Người mới đăng nhập rồi tự đổi mật khẩu của mình. Không có tự đăng ký: chỉ admin mới tạo được tài khoản.
- Không vào được web (ví dụ admin quên mật khẩu)? Dùng dòng lệnh: `python3 backend/cli.py user passwd <username>`.
  Các lệnh khác: `user add <username> [--admin]`, `user list`, `user delete <username>`.

Sau khi đăng nhập, trên giao diện bạn có thể:

- **New Project**: tạo project mới (lưu vào database).
- **Upload** ở trang project: chọn cả folder ảnh từ máy mình (có thanh tiến độ), hoặc nhập đường dẫn
  một folder đã nằm sẵn trên máy chủ (hợp với dataset lớn, không phải upload lại).
- Lọc ảnh theo trạng thái, xem ảnh thật ở trang Annotate, đổi trạng thái
  (`unlabeled` / `labeled` / `review`) bằng ô chọn hoặc nút **Submit for review**.

Không chạy backend thì giao diện vẫn mở được như trước (trống, hoặc có dữ liệu mẫu nếu đặt
`USE_DEMO_DATA = true` trong `js/app.js`). Lúc đó nút Upload sẽ báo cần chạy backend.

| File | Làm gì |
| --- | --- |
| `backend/app.py` | Web server + API (FastAPI): đăng nhập, project, upload, import, ảnh, thumbnail, trạng thái |
| `backend/auth.py` | Băm mật khẩu, tài khoản, phiên đăng nhập, khoá đăng nhập sai |
| `backend/test_api.py` | Test API qua HTTP thật (đăng nhập, phân quyền, luồng chính) |

Biến môi trường (không bắt buộc): `LABELKIT_DB` (file database), `LABELKIT_UPLOAD_DIR` (nơi lưu ảnh
upload, mặc định `backend/data/uploads`), `LABELKIT_IMPORT_ROOT` (chỉ cho import folder nằm trong thư mục này).

**Bảo mật hiện có:**
- Mật khẩu được băm bằng scrypt kèm muối, database không lưu mật khẩu thật. Mật khẩu tối thiểu 8 ký tự.
- Mọi đường dẫn `/api/` đều yêu cầu đăng nhập, trừ vài đường dẫn công khai (`/api/health`, `/api/auth/...`).
- Phiên đăng nhập dùng cookie `HttpOnly` + `SameSite=Lax` (JavaScript không đọc được cookie, trang web khác không gửi lệnh thay bạn được). Phiên hết hạn sau 14 ngày.
- Đăng nhập sai 5 lần liên tiếp thì bị khoá vài phút. Thông báo lỗi giống nhau dù username có tồn tại hay không.
- Trang `/docs` và `/openapi.json` của FastAPI đã tắt. Server chỉ phục vụ các trang HTML, `css/` và `js/`;
  file database và code backend không tải được qua web.

**Còn cần lưu ý:**
- **Lần chạy đầu:** ai mở trang web trước sẽ tạo được tài khoản admin. Khi dùng `--lan`, hãy tự mở trang và
  tạo tài khoản ngay sau khi chạy server lần đầu, đừng để đó cho người khác trong mạng.
- Chạy bằng HTTP thường thì mật khẩu đi qua mạng **không mã hoá**. Tạm chấp nhận được ở mạng nội bộ tin cậy;
  khi cho người ở xa truy cập thì đặt phía sau HTTPS (Caddy hoặc Nginx) hoặc dùng VPN như Tailscale.
- Ô "import đường dẫn" cho phép người đã đăng nhập đăng ký bất kỳ folder ảnh nào trên máy chủ. Nên đặt `LABELKIT_IMPORT_ROOT`.
- Mọi tài khoản hiện thấy mọi project (chưa có phân quyền theo project). Chưa có email, đăng ký tự do hay "quên mật khẩu" tự động (admin đặt lại giúp).

**Chưa có:** class, annotation (box/polygon), phân quyền theo project, export thật. Trang gán nhãn hiện chỉ xem ảnh
và đổi trạng thái; các thanh công cụ vẫn là giao diện mẫu.

## Chạy bằng Docker

```bash
docker compose up -d --build
```

Mở http://localhost:8000. Database, ảnh upload và thumbnail nằm trong volume `labelkit-data` nên không mất khi khởi động lại.
Mặc định chỉ máy chạy Docker truy cập được; muốn cho cả mạng, sửa `"127.0.0.1:8000:8000"` thành `"8000:8000"` trong
`docker-compose.yml` (chỉ làm ở mạng tin cậy). Muốn dùng ảnh đã có sẵn trên máy mà không copy, bỏ comment dòng mount
`/path/to/your/images:/images:ro` rồi dùng "import từ đường dẫn trên máy chủ" với `/images/...`.
Chi tiết (sao lưu, quyền ghi thư mục) xem [README tiếng Anh](../README.md#with-docker).

## Cho người cùng mạng xem

```bash
python3 backend/app.py --lan     # bản có database
python3 serve.py --lan           # chỉ file tĩnh, không database
```

Terminal sẽ in ra địa chỉ để gửi cho người cùng mạng (với `serve.py` là link dạng `http://192.168.x.x:8000`).
