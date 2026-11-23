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
├── backend/                Database lưu folder ảnh + trạng thái (xem mục "Database" bên dưới)
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

Giao diện web hiện **chưa** nối với database này.

## Cho người cùng mạng xem

```bash
python3 serve.py --lan
```

Terminal sẽ in ra link dạng `http://192.168.x.x:8000` để gửi cho người cùng mạng.
