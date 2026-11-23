"""
serve.py — chạy web server nhỏ để xem prototype trên trình duyệt.

Cách dùng:
    python3 serve.py          # chạy ở cổng 8000
    python3 serve.py 9000     # chạy ở cổng khác

Nhấn Ctrl+C để tắt server.
"""

import http.server
import os
import socketserver
import sys
import threading
import webbrowser

# Cổng mặc định là 8000, có thể truyền cổng khác qua tham số dòng lệnh
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000

# Luôn phục vụ thư mục chứa file serve.py này, dù chạy lệnh từ đâu
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Bảo trình duyệt không lưu cache, để sửa file xong chỉ cần F5 là thấy bản mới."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


# Cho phép chạy lại ngay sau khi tắt mà không bị lỗi "Address already in use"
socketserver.TCPServer.allow_reuse_address = True

# "127.0.0.1" = chỉ máy này truy cập được. Đổi thành "" nếu muốn máy khác trong mạng LAN vào xem
with socketserver.TCPServer(("127.0.0.1", PORT), NoCacheHandler) as server:
    url = f"http://localhost:{PORT}"
    print(f"Server đang chạy tại {url}  (Ctrl+C để tắt)")

    # Tự mở trình duyệt sau 0.5 giây (đợi server sẵn sàng)
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt server.")
