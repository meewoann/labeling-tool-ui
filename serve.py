"""
serve.py — chạy web server nhỏ để xem prototype trên trình duyệt.

Cách dùng:
    python3 serve.py              # chỉ máy này xem được, cổng 8000
    python3 serve.py --lan        # cho cả máy khác CÙNG MẠNG xem được
    python3 serve.py 9000         # đổi cổng
    python3 serve.py 9000 --lan   # kết hợp

Nhấn Ctrl+C để tắt server.
"""

import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

# Đọc tham số dòng lệnh: một số = cổng, "--lan" = mở cho cả mạng nội bộ
args = sys.argv[1:]
LAN = "--lan" in args
numbers = [a for a in args if a.isdigit()]
PORT = int(numbers[0]) if numbers else 8000

# Luôn phục vụ thư mục chứa file serve.py này, dù chạy lệnh từ đâu
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Bảo trình duyệt không lưu cache, để sửa file xong chỉ cần F5 là thấy bản mới."""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def get_lan_ip():
    """Lấy IP của máy này trong mạng nội bộ (không gửi dữ liệu ra ngoài)."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
    except OSError:
        return None


# Cho phép chạy lại ngay sau khi tắt mà không bị lỗi "Address already in use"
socketserver.TCPServer.allow_reuse_address = True

# "127.0.0.1" = chỉ máy này truy cập được; "0.0.0.0" = mọi máy trong mạng đều vào được
host = "0.0.0.0" if LAN else "127.0.0.1"

with socketserver.TCPServer((host, PORT), NoCacheHandler) as server:
    url = f"http://localhost:{PORT}"
    print(f"Server đang chạy tại {url}  (Ctrl+C để tắt)")

    if LAN:
        ip = get_lan_ip()
        if ip:
            print(f"Người cùng mạng mở: http://{ip}:{PORT}")
        print("Lưu ý: bất kỳ ai trong mạng này đều xem được. Chỉ dùng ở mạng bạn tin tưởng.")

    # Tự mở trình duyệt sau 0.5 giây (đợi server sẵn sàng)
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã tắt server.")
