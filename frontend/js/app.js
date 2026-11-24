/* ==========================================================
   app.js — JavaScript dùng chung cho tất cả các page
   ----------------------------------------------------------
   Mỗi file .html có <body data-page="..."> (vd: data-page="projects").
   Cuối file sẽ đọc data-page để chạy đúng hàm của trang đó.

   Mục lục:
   1. Mock data (dữ liệu giả)
   2. Hàm tiện ích (helper)
   3. Tương tác chung: sidebar, modal, tab, toast, search
   4. Code riêng từng page
   5. Khởi chạy
   ========================================================== */


/* ==========================================================
   1. MOCK DATA — dữ liệu mẫu (mặc định đang TẮT, xem USE_DEMO_DATA)
   ========================================================== */

// Danh sách project (trang projects.html)
// cover: từ khoá để lấy ảnh ngẫu nhiên cố định từ picsum.photos
const DEMO_PROJECTS = [
  { id: 1, name: 'Street Traffic Detection', description: 'Cars, buses and pedestrians at city intersections.', type: 'Bounding box', totalImages: 1240, labeledImages: 868, classes: 6, members: 4, updatedAt: '2 hours ago', cover: 'traffic' },
  { id: 2, name: 'Retail Shelf Products', description: 'Detect packaged products on supermarket shelves.', type: 'Bounding box', totalImages: 860, labeledImages: 344, classes: 12, members: 3, updatedAt: 'Yesterday', cover: 'shelf' },
  { id: 3, name: 'Warehouse Safety (PPE)', description: 'Helmets, vests and gloves on warehouse workers.', type: 'Bounding box', totalImages: 2150, labeledImages: 1935, classes: 5, members: 5, updatedAt: '3 days ago', cover: 'warehouse' },
  { id: 4, name: 'Crop Disease Leaves', description: 'Segment diseased areas on plant leaves.', type: 'Polygon', totalImages: 540, labeledImages: 108, classes: 4, members: 2, updatedAt: '1 week ago', cover: 'leaves' },
  { id: 5, name: 'Parking Lot Occupancy', description: 'Free and occupied parking spots from CCTV cameras.', type: 'Bounding box', totalImages: 980, labeledImages: 980, classes: 2, members: 3, updatedAt: '2 weeks ago', cover: 'parking' },
  { id: 6, name: 'Drone Solar Panels', description: 'Find cracked or dirty panels in drone footage.', type: 'Polygon', totalImages: 320, labeledImages: 0, classes: 3, members: 1, updatedAt: 'Just now', cover: 'solar' },
];

// Danh sách class (nhãn) — dùng chung cho mọi project để đơn giản
const DEMO_CLASSES = [
  { id: 1, name: 'car', color: '#3B82F6', count: 1842 },
  { id: 2, name: 'person', color: '#F59E0B', count: 1210 },
  { id: 3, name: 'bicycle', color: '#8B5CF6', count: 342 },
  { id: 4, name: 'truck', color: '#EF4444', count: 518 },
  { id: 5, name: 'bus', color: '#EC4899', count: 207 },
  { id: 6, name: 'traffic light', color: '#14B8A6', count: 655 },
];

// Danh sách ảnh — status: 'labeled' | 'unlabeled' | 'review'
// boxes: bounding box giả, toạ độ tính bằng % so với ảnh (x, y = góc trên trái)
const DEMO_IMAGES = [
  { id: 1, name: 'img_0001.jpg', seed: 'street-1', status: 'labeled', size: '1600 × 1200', annotator: 'Linh Tran',
    boxes: [{ classId: 1, x: 10, y: 52, w: 30, h: 28 }, { classId: 2, x: 52, y: 30, w: 12, h: 46 }, { classId: 6, x: 80, y: 8, w: 8, h: 22 }] },
  { id: 2, name: 'img_0002.jpg', seed: 'street-2', status: 'labeled', size: '1600 × 1200', annotator: 'Minh Pham',
    boxes: [{ classId: 5, x: 18, y: 28, w: 46, h: 40 }, { classId: 2, x: 70, y: 44, w: 10, h: 36 }] },
  { id: 3, name: 'img_0003.jpg', seed: 'street-3', status: 'review', size: '1600 × 1200', annotator: 'Linh Tran',
    boxes: [{ classId: 4, x: 8, y: 34, w: 40, h: 42 }, { classId: 1, x: 56, y: 56, w: 26, h: 22 }, { classId: 3, x: 40, y: 64, w: 12, h: 20 }] },
  { id: 4, name: 'img_0004.jpg', seed: 'street-4', status: 'labeled', size: '1600 × 1200', annotator: 'Alex Nguyen',
    boxes: [{ classId: 2, x: 30, y: 22, w: 14, h: 56 }, { classId: 2, x: 50, y: 26, w: 13, h: 52 }] },
  { id: 5, name: 'img_0005.jpg', seed: 'street-5', status: 'labeled', size: '1600 × 1200', annotator: 'Minh Pham',
    boxes: [{ classId: 1, x: 22, y: 48, w: 34, h: 30 }, { classId: 6, x: 68, y: 12, w: 7, h: 20 }] },
  { id: 6, name: 'img_0006.jpg', seed: 'street-6', status: 'unlabeled', size: '1600 × 1200', annotator: '—', boxes: [] },
  { id: 7, name: 'img_0007.jpg', seed: 'street-7', status: 'labeled', size: '1600 × 1200', annotator: 'Linh Tran',
    boxes: [{ classId: 3, x: 34, y: 40, w: 24, h: 34 }, { classId: 2, x: 38, y: 18, w: 14, h: 36 }] },
  { id: 8, name: 'img_0008.jpg', seed: 'street-8', status: 'review', size: '1600 × 1200', annotator: 'Alex Nguyen',
    boxes: [{ classId: 1, x: 6, y: 58, w: 28, h: 24 }, { classId: 1, x: 40, y: 54, w: 26, h: 26 }, { classId: 4, x: 70, y: 40, w: 26, h: 40 }] },
  { id: 9, name: 'img_0009.jpg', seed: 'street-9', status: 'unlabeled', size: '1600 × 1200', annotator: '—', boxes: [] },
  { id: 10, name: 'img_0010.jpg', seed: 'street-10', status: 'labeled', size: '1600 × 1200', annotator: 'Minh Pham',
    boxes: [{ classId: 5, x: 26, y: 30, w: 50, h: 44 }] },
  { id: 11, name: 'img_0011.jpg', seed: 'street-11', status: 'review', size: '1600 × 1200', annotator: 'Linh Tran',
    boxes: [{ classId: 2, x: 60, y: 30, w: 12, h: 48 }, { classId: 6, x: 14, y: 10, w: 8, h: 22 }] },
  { id: 12, name: 'img_0012.jpg', seed: 'street-12', status: 'unlabeled', size: '1600 × 1200', annotator: '—', boxes: [] },
];

// Thành viên trong project (tab Members)
const DEMO_MEMBERS = [
  { name: 'Alex Nguyen', email: 'alex@example.com', role: 'Owner', labeled: 412, color: '#10B981' },
  { name: 'Linh Tran', email: 'linh@example.com', role: 'Annotator', labeled: 298, color: '#3B82F6' },
  { name: 'Minh Pham', email: 'minh@example.com', role: 'Annotator', labeled: 158, color: '#F59E0B' },
  { name: 'Sara Kim', email: 'sara@example.com', role: 'Reviewer', labeled: 0, color: '#8B5CF6' },
  { name: 'Tom Le', email: 'tom@example.com', role: 'Viewer', labeled: 0, color: '#EC4899' },
];

// ----- Hai chế độ chạy -----
// 1) Có backend (python3 backend/app.py): dữ liệu lấy từ DATABASE qua /api, công tắc dưới đây bị bỏ qua.
// 2) Không có backend (mở file trực tiếp hoặc serve.py): dùng công tắc USE_DEMO_DATA.
//    false = trống (như chưa upload gì), true = hiện dữ liệu mẫu ở trên để xem giao diện đầy đủ.
const USE_DEMO_DATA = false;

// Các mảng mà toàn bộ code bên dưới sử dụng.
// Dùng "let" vì ở chế độ có backend, dữ liệu thật sẽ được nạp vào thay thế (xem loadData).
let PROJECTS = (USE_DEMO_DATA ? DEMO_PROJECTS : []).map(mockProject);
let CLASSES = USE_DEMO_DATA ? DEMO_CLASSES : [];      // ở chế độ có backend: class của project đang xem (nạp theo từng trang)
let IMAGES = (USE_DEMO_DATA ? DEMO_IMAGES : []).map(mockImage);
const MEMBERS = USE_DEMO_DATA ? DEMO_MEMBERS : [];   // chưa có trong database

let API_MODE = false;     // true khi tìm thấy backend (loadData sẽ quyết định)
let CURRENT_USER = null;  // người đang đăng nhập: { id, username, is_admin } (chỉ có khi có backend)

// Chữ hiển thị cho từng trạng thái ảnh
const STATUS_TEXT = { labeled: 'Labeled', unlabeled: 'Unlabeled', review: 'In review' };

// Bảng màu để chọn khi thêm/sửa class
const COLOR_OPTIONS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#6B7280'];


/* ==========================================================
   2. HÀM TIỆN ÍCH (HELPER)
   ========================================================== */

// Vẽ lại icon Lucide. Gọi sau mỗi lần chèn HTML mới có <i data-lucide="...">
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

// Tạo link ảnh giả từ picsum.photos (cùng seed thì luôn ra cùng 1 ảnh)
function imageUrl(seed, width, height) {
  return `https://picsum.photos/seed/${seed}/${width}/${height}`;
}

// Lấy tham số trên URL. Ví dụ project.html?id=2 → getQueryParam('id') trả về '2'
function getQueryParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// Tính phần trăm, làm tròn
function percent(part, total) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

// 1240 → "1,240"
function formatNumber(n) {
  return n.toLocaleString('en-US');
}

// "Alex Nguyen" → "AN"
function getInitials(name) {
  return name.split(' ').map(word => word[0]).join('').toUpperCase();
}

// Chống chèn HTML: mọi chữ do người dùng đặt (tên project, tên file...) phải qua hàm này
// trước khi nhét vào innerHTML, nếu không tên file như <img onerror=...> sẽ chạy được code.
function esc(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// "2026-11-23 13:00:08" (giờ UTC trong database) → "5 min ago"
function timeAgo(sqlDate) {
  const seconds = Math.max(0, (Date.now() - new Date(sqlDate.replace(' ', 'T') + 'Z')) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return 'just now';
  if (hours < 1) return `${minutes} min ago`;
  if (days < 1) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

// Tìm class theo id
function findClass(id) {
  return CLASSES.find(c => c.id === id);
}

/* ----- Chuyển dữ liệu về 1 dạng chung -----
   Dù dữ liệu đến từ mock hay từ API, phần vẽ giao diện chỉ làm việc với các object
   có cùng tên trường (name, totalImages, thumbUrl...). Các hàm dưới đây làm việc chuyển đổi đó. */

function mockProject(p) {
  return { ...p, coverUrl: imageUrl(p.cover, 600, 280) };
}

function mockImage(img) {
  return {
    ...img,
    thumbUrl: imageUrl(img.seed, 320, 240),
    fileUrl: imageUrl(img.seed, 800, 600),
    ratio: 4 / 3,
    width: Number(img.size.split(' × ')[0]),
    height: Number(img.size.split(' × ')[1]),
    meta: `${img.boxes.length} ${img.boxes.length === 1 ? 'box' : 'boxes'}`,
  };
}

function projectFromApi(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    type: '',
    totalImages: p.total,
    labeledImages: p.labeled,
    unlabeledImages: p.unlabeled,
    reviewImages: p.review,
    classes: p.class_count,
    members: 0,
    updatedAt: timeAgo(p.updated_at),
    coverUrl: p.cover_image_id ? `/api/images/${p.cover_image_id}/thumb` : null,
  };
}

function imageFromApi(i) {
  return {
    id: i.id,
    name: i.filename,
    status: i.status,
    size: `${i.width} × ${i.height}`,
    format: i.filename.split('.').pop().toUpperCase(),
    folder: i.folder_name,
    annotator: '—',
    boxes: [],            // chưa có annotation trong database
    thumbUrl: i.thumb_url,
    fileUrl: i.file_url,
    ratio: i.width / i.height,   // tỉ lệ rộng / cao của ảnh
    width: i.width,
    height: i.height,
    meta: i.annotation_count ? `${i.annotation_count} ${i.annotation_count === 1 ? 'object' : 'objects'}` : `${i.width} × ${i.height}`,
  };
}

/* ----- Gọi API ----- */

// Đọc lỗi mà server trả về (FastAPI để chữ lỗi trong "detail")
async function errorMessage(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') return body.detail;
  } catch (e) { /* không phải JSON, dùng chữ mặc định bên dưới */ }
  return `Request failed (${response.status})`;
}

// Chuyển về trang đăng nhập, nhớ trang đang xem để đăng nhập xong quay lại đúng chỗ
function redirectToLogin() {
  const here = window.location.pathname.split('/').pop() + window.location.search;
  window.location.href = `index.html?next=${encodeURIComponent(here)}`;
}

// Gọi API và trả về JSON. Lỗi thì throw Error có chữ dễ hiểu.
async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (response.status === 401 && currentPage !== 'login') {
    // Chưa đăng nhập hoặc phiên đã hết hạn → về trang đăng nhập.
    // Trả về promise không bao giờ xong để code phía sau đứng im, không hiện lỗi chớp nhoáng khi trang đang chuyển.
    redirectToLogin();
    return new Promise(() => {});
  }
  if (!response.ok) {
    const error = new Error(await errorMessage(response));
    error.status = response.status;   // để nơi gọi phân biệt được lỗi (vd: 409 = xung đột khi lưu)
    throw error;
  }
  return response.json();
}

// Gửi JSON bằng phương thức bất kỳ (POST, PUT, PATCH...)
function apiSend(method, path, body) {
  return api(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function apiPost(path, body) {
  return apiSend('POST', path, body);
}

// Có backend không? Mở file trực tiếp (file://) hoặc server chỉ có file tĩnh thì không có /api
async function detectApi() {
  if (window.location.protocol === 'file:') return false;
  try {
    const response = await fetch('/api/health');
    if (!response.ok) return false;
    return (await response.json()).ok === true; // server file tĩnh (serve.py) trả {"ok": false}
  } catch (e) {
    return false;
  }
}

// Chạy 1 lần khi mở trang: nếu có backend thì xác nhận đã đăng nhập, rồi nạp danh sách project từ database
async function loadData() {
  API_MODE = await detectApi();
  if (API_MODE && currentPage !== 'login') {
    // Hỏi /api/auth/status (công khai) thay vì /api/auth/me để chưa đăng nhập không sinh lỗi 401 đỏ trong console
    const status = await api('/api/auth/status');
    if (!status.user) {
      redirectToLogin();
      return new Promise(() => {});  // đứng im chờ trình duyệt chuyển trang
    }
    CURRENT_USER = status.user;
    PROJECTS = (await api('/api/projects')).map(projectFromApi);
  }
}

// HTML cho trạng thái trống (chưa có dữ liệu). buttonHTML có thể để trống
function emptyStateHTML(icon, title, text, buttonHTML = '') {
  return `
    <div class="empty-state">
      <div class="empty-icon"><i data-lucide="${icon}"></i></div>
      <h3>${title}</h3>
      <p>${text}</p>
      ${buttonHTML}
    </div>`;
}

// Nhóm "chọn 1": click phần tử nào thì phần tử đó có class "active",
// các phần tử còn lại bị bỏ "active". onSelect (nếu có) được gọi sau khi chọn.
// Dùng cho: tool, class, filter chip, format card, theme...
function makeSelectable(items, onSelect) {
  items.forEach(item => {
    item.addEventListener('click', () => {
      items.forEach(other => other.classList.remove('active'));
      item.classList.add('active');
      if (onSelect) onSelect(item);
    });
  });
}

// Hiện toast (thông báo nhỏ góc dưới phải), tự tắt sau 3 giây
// type: 'success' | 'info' | 'error'
function showToast(message, type = 'success') {
  // Tạo hộp chứa toast nếu trang chưa có
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icons = { success: 'circle-check', info: 'info', error: 'circle-alert' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type]}"></i><span></span>`;
  toast.querySelector('span').textContent = message; // textContent: an toàn dù message có ký tự lạ
  container.appendChild(toast);
  refreshIcons();

  // Sau 3 giây: thêm class "hide" để mờ dần, 0.3 giây sau thì xoá hẳn
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Mở / đóng modal
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(overlay) {
  overlay.classList.remove('open');
}


/* ==========================================================
   3. TƯƠNG TÁC CHUNG (chạy ở mọi page)
   ========================================================== */

// Highlight mục đang ở trên sidebar
function highlightSidebar() {
  // Trang nào thuộc mục nào trên sidebar (project.html thuộc mục Projects)
  const NAV_OF_PAGE = {
    projects: 'projects',
    project: 'projects',
    label: 'label',
    export: 'export',
    settings: 'settings',
  };
  const current = NAV_OF_PAGE[document.body.dataset.page];

  document.querySelectorAll('.nav-link').forEach(link => {
    if (link.dataset.nav === current) link.classList.add('active');
  });
}

// Có đăng nhập: avatar hiện chữ cái đầu của username, và hiện nút Sign out trên sidebar
function initUser() {
  if (!API_MODE || !CURRENT_USER) return;

  document.querySelectorAll('.topbar .avatar').forEach(avatar => {
    avatar.textContent = CURRENT_USER.username.slice(0, 2).toUpperCase();
    avatar.title = `${CURRENT_USER.username} · Settings`;
  });

  const logout = document.getElementById('btn-logout');
  if (!logout) return;
  logout.hidden = false;
  logout.addEventListener('click', async event => {
    event.preventDefault();
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* mất mạng thì vẫn quay về trang đăng nhập */ }
    window.location.href = 'index.html';
  });
}

// Modal: nút có data-open-modal="id" để mở,
// nút có data-close-modal (nút X, Cancel) hoặc click ra ngoài để đóng
function initModals() {
  // Lắng nghe click trên cả trang: nút nào có data-open-modal đều mở được,
  // kể cả nút được JS tạo ra sau này (vd: nút Upload trong khối "chưa có ảnh")
  document.addEventListener('click', event => {
    const btn = event.target.closest('[data-open-modal]');
    if (btn) openModal(btn.dataset.openModal);
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    // Click vào lớp nền mờ (không phải vào hộp modal) → đóng
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeModal(overlay);
    });

    overlay.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => closeModal(overlay));
    });
  });

  // Nhấn Esc → đóng mọi modal đang mở
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach(overlay => closeModal(overlay));
    }
  });
}

// Tab: nút .tab có data-tab="images" sẽ hiện panel có id="tab-images"
function initTabs() {
  document.querySelectorAll('.tabs').forEach(tabBar => {
    const buttons = tabBar.querySelectorAll('.tab');

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });

    // Link kiểu project.html?id=1&tab=classes mở sẵn đúng tab
    const wanted = getQueryParam('tab');
    const target = Array.from(buttons).find(btn => btn.dataset.tab === wanted);
    if (target) target.click();
  });
}

// Nút có data-toast="nội dung" → click thì hiện toast đó
// (thêm data-toast-type="success" để đổi icon)
function initToastButtons() {
  document.querySelectorAll('[data-toast]').forEach(btn => {
    btn.addEventListener('click', () => {
      showToast(btn.dataset.toast, btn.dataset.toastType || 'info');
    });
  });
}

// Ô search trên top bar
function initSearch() {
  const input = document.getElementById('global-search');
  if (!input) return;

  // Nhấn phím "/" để nhảy vào ô search
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !event.target.matches('input, textarea, select')) {
      event.preventDefault();
      input.focus();
    }
  });

  // Trang projects tự lọc khi gõ (xem initProjectsPage).
  // Các trang khác: nhấn Enter chỉ hiện thông báo
  if (document.body.dataset.page !== 'projects') {
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') showToast('Search is not available in this prototype', 'info');
    });
  }
}


/* ==========================================================
   4. CODE RIÊNG TỪNG PAGE
   ========================================================== */

/* ---------- index.html: Đăng nhập ---------- */
async function initLoginPage() {
  // Không có backend (mở file trực tiếp) thì không có đăng nhập: vào thẳng danh sách project
  if (!API_MODE) {
    window.location.replace('projects.html');
    return;
  }

  // Chỉ cho quay lại các trang .html của mình, không cho nhảy sang web khác
  // (nếu không, link "index.html?next=https://web-xau.com" sẽ đưa người dùng đi đâu cũng được)
  function goNext() {
    const next = getQueryParam('next') || '';
    const safe = /^[A-Za-z0-9_-]+\.html(\?[^#]*)?$/.test(next);
    window.location.replace(safe ? next : 'projects.html');
  }

  const status = await api('/api/auth/status');
  if (status.user) {            // đã đăng nhập rồi thì khỏi nhập lại
    goNext();
    return;
  }

  // Database chưa có tài khoản nào → biến form thành "tạo tài khoản admin đầu tiên"
  const setup = status.needs_setup;
  if (setup) {
    document.getElementById('login-title').textContent = 'Create the first account';
    document.getElementById('login-sub').textContent = 'This account becomes the admin. You can add teammates later.';
    document.getElementById('confirm-group').hidden = false;
    document.getElementById('password').autocomplete = 'new-password';
    document.getElementById('login-submit').textContent = 'Create account';
    document.getElementById('login-footer').hidden = true;
  }

  const error = document.getElementById('login-error');
  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  document.getElementById('login-form').addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
      showError('Enter your username and password.');
      return;
    }
    if (setup && password !== document.getElementById('password2').value) {
      showError('The two passwords do not match.');
      return;
    }

    const button = document.getElementById('login-submit');
    button.disabled = true;
    try {
      await apiPost(setup ? '/api/auth/setup' : '/api/auth/login', { username, password });
      goNext();
    } catch (e) {
      showError(e.message);
      document.getElementById('password').value = '';
      button.disabled = false;
    }
  });
}


/* ---------- projects.html: Danh sách project ---------- */
function initProjectsPage() {
  const grid = document.getElementById('project-grid');

  // Thẻ thống kê tổng quan
  function renderStats() {
    const totalImages = PROJECTS.reduce((sum, p) => sum + p.totalImages, 0);
    const totalLabeled = PROJECTS.reduce((sum, p) => sum + p.labeledImages, 0);
    document.getElementById('overview-projects').textContent = PROJECTS.length;
    document.getElementById('overview-images').textContent = formatNumber(totalImages);
    document.getElementById('overview-labeled').textContent = percent(totalLabeled, totalImages) + '%';
    document.getElementById('overview-members').textContent = MEMBERS.length;
  }

  // Tạo HTML cho 1 project card
  function projectCardHTML(p) {
    const pct = percent(p.labeledImages, p.totalImages);

    // Hiện tối đa 3 avatar thành viên, còn lại ghi "+N"
    const avatars = MEMBERS.slice(0, Math.min(p.members, 3))
      .map(m => `<span class="avatar avatar-xs" style="background:${m.color}">${getInitials(m.name)}</span>`)
      .join('');
    const more = p.members > 3 ? `<span class="avatar-more">+${p.members - 3}</span>` : '';

    // Project chưa có ảnh thì không có ảnh bìa
    const cover = p.coverUrl
      ? `<img src="${p.coverUrl}" alt="" loading="lazy">`
      : '<div class="cover-empty"><i data-lucide="images"></i></div>';
    const typeBadge = p.type ? `<span class="badge">${esc(p.type)}</span>` : '';

    return `
      <a href="project.html?id=${p.id}" class="card project-card">
        <div class="project-cover">
          ${cover}
          ${typeBadge}
        </div>
        <div class="project-body">
          <h3>${esc(p.name)}</h3>
          <p class="project-desc">${esc(p.description) || '&nbsp;'}</p>
          <div class="project-meta">
            <span><i data-lucide="image"></i>${formatNumber(p.totalImages)} images</span>
            <span><i data-lucide="tag"></i>${p.classes} classes</span>
          </div>
          <div class="progress-row">
            <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
            <span class="progress-value">${pct}%</span>
          </div>
          <div class="project-footer">
            <span class="updated"><i data-lucide="clock"></i>Updated ${esc(p.updatedAt)}</span>
            <span class="avatar-stack">${avatars}${more}</span>
          </div>
        </div>
      </a>`;
  }

  // Vẽ danh sách project ra lưới
  function render(list) {
    if (PROJECTS.length === 0) {
      // Chưa có project nào
      grid.innerHTML = emptyStateHTML('folder-kanban', 'No projects yet',
        'Create your first project to start uploading and labeling images.',
        '<button class="btn btn-primary" data-open-modal="modal-new-project"><i data-lucide="plus"></i>New Project</button>');
    } else if (list.length === 0) {
      // Có project nhưng không khớp ô search
      grid.innerHTML = emptyStateHTML('search', 'No matching projects', 'Try a different search term.');
    } else {
      grid.innerHTML = list.map(projectCardHTML).join('');
    }
    document.getElementById('project-count').textContent = `${list.length} ${list.length === 1 ? 'project' : 'projects'}`;
    refreshIcons();
  }

  renderStats();
  render(PROJECTS);

  // Gõ vào ô search trên top bar → lọc project theo tên
  const search = document.getElementById('global-search');
  search.addEventListener('input', () => {
    const keyword = search.value.trim().toLowerCase();
    render(PROJECTS.filter(p => p.name.toLowerCase().includes(keyword)));
  });

  // Form "New Project"
  document.getElementById('new-project-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;

    // Không có backend: chỉ đóng modal + hiện toast, không lưu gì
    if (!API_MODE) {
      closeModal(document.getElementById('modal-new-project'));
      form.reset();
      showToast('Project created (demo only, nothing was saved)');
      return;
    }

    // Có backend: lưu vào database rồi mở luôn project mới để upload ảnh
    try {
      const created = await apiPost('/api/projects', {
        name: document.getElementById('np-name').value,
        description: document.getElementById('np-desc').value,
      });
      window.location.href = `project.html?id=${created.id}`;
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
}


/* ---------- project.html: Tổng quan 1 project ---------- */
async function initProjectPage() {
  // Lấy project theo ?id=..., không có thì dùng project đầu tiên
  const id = Number(getQueryParam('id'));
  let project = PROJECTS.find(p => p.id === id) || PROJECTS[0];

  // Chưa có project nào (hoặc id sai) → báo trống rồi dừng
  if (!project) {
    document.querySelector('.content').innerHTML = emptyStateHTML('folder-kanban', 'Project not found',
      'There are no projects yet. Create one from the projects page.',
      '<a href="projects.html" class="btn btn-primary"><i data-lucide="arrow-left"></i>Back to projects</a>');
    refreshIcons();
    return;
  }

  // Tên, mô tả và 4 thẻ thống kê (gọi lại sau khi upload để cập nhật số)
  function renderHeader() {
    const unlabeled = project.unlabeledImages !== undefined
      ? project.unlabeledImages
      : project.totalImages - project.labeledImages;
    document.title = `${project.name} · LabelKit`;
    document.getElementById('breadcrumb-name').textContent = project.name;
    document.getElementById('project-name').textContent = project.name;
    document.getElementById('project-desc').textContent = project.description;
    document.getElementById('stat-total').textContent = formatNumber(project.totalImages);
    document.getElementById('stat-labeled').textContent = formatNumber(project.labeledImages);
    document.getElementById('stat-labeled-sub').textContent = `${percent(project.labeledImages, project.totalImages)}% of dataset`;
    document.getElementById('stat-unlabeled').textContent = formatNumber(unlabeled);
    document.getElementById('stat-unlabeled-sub').textContent = `${percent(unlabeled, project.totalImages)}% remaining`;
    document.getElementById('stat-classes').textContent = project.classes;
    document.getElementById('tab-count-classes').textContent = CLASSES.length;
    document.getElementById('tab-count-images').textContent = formatNumber(project.totalImages);
  }
  // Có backend: nạp class của project này (không thì dùng CLASSES mẫu)
  if (API_MODE) CLASSES = await api(`/api/projects/${project.id}/classes`);
  renderHeader();

  // ----- Tab Images -----
  const PAGE_SIZE = 60;                 // mỗi lần tải 60 ảnh, bấm "Load more" để tải tiếp
  const grid = document.getElementById('image-grid');
  const loadMore = document.getElementById('load-more');
  const chips = document.querySelectorAll('.chip[data-filter]');
  let filter = 'all';                   // bộ lọc đang chọn: all | labeled | unlabeled | review
  let shown = 0;                        // đã hiển thị bao nhiêu ảnh
  let loadToken = 0;                    // để bỏ qua kết quả cũ nếu bấm đổi bộ lọc nhanh

  // Số ảnh ghi trên từng chip lọc
  function renderChipCounts() {
    const count = status => IMAGES.filter(img => img.status === status).length;
    const counts = API_MODE
      ? { all: project.totalImages, labeled: project.labeledImages, unlabeled: project.unlabeledImages, review: project.reviewImages }
      : { all: IMAGES.length, labeled: count('labeled'), unlabeled: count('unlabeled'), review: count('review') };
    chips.forEach(chip => {
      chip.querySelector('.chip-count').textContent = counts[chip.dataset.filter];
    });
  }

  // Lấy 1 trang ảnh: từ API (có backend) hoặc từ mảng IMAGES (dữ liệu mẫu)
  async function fetchImages(offset) {
    if (API_MODE) {
      const statusParam = filter === 'all' ? '' : `&status=${filter}`;
      const data = await api(`/api/projects/${project.id}/images?limit=${PAGE_SIZE}&offset=${offset}${statusParam}`);
      return { items: data.items.map(imageFromApi), total: data.total };
    }
    const list = filter === 'all' ? IMAGES : IMAGES.filter(img => img.status === filter);
    return { items: list.slice(offset, offset + PAGE_SIZE), total: list.length };
  }

  function imageCardHTML(img) {
    return `
      <a href="label.html?project=${project.id}&image=${img.id}" class="image-card">
        <img src="${img.thumbUrl}" alt="${esc(img.name)}" loading="lazy">
        <span class="status-badge status-${img.status}">${STATUS_TEXT[img.status]}</span>
        <div class="image-card-footer">
          <b>${esc(img.name)}</b>
          <span>${esc(img.meta)}</span>
        </div>
      </a>`;
  }

  // append = false: tải lại từ đầu (đổi bộ lọc); true: nối thêm (nút Load more)
  async function loadImages(append) {
    const token = ++loadToken;
    const offset = append ? shown : 0;
    const { items, total } = await fetchImages(offset);
    if (token !== loadToken) return; // đã có lần tải mới hơn, bỏ kết quả này

    if (total === 0) {
      grid.innerHTML = filter === 'all'
        ? emptyStateHTML('images', 'No images yet', 'Upload a folder of images to get started.',
            '<button class="btn btn-primary" data-open-modal="modal-upload"><i data-lucide="upload"></i>Upload</button>')
        : emptyStateHTML('images', 'No images here', 'No images have this status.');
    } else if (append) {
      grid.insertAdjacentHTML('beforeend', items.map(imageCardHTML).join(''));
    } else {
      grid.innerHTML = items.map(imageCardHTML).join('');
    }

    shown = offset + items.length;
    loadMore.hidden = shown >= total;
    document.getElementById('images-showing').textContent =
      total === 0 ? '' : `Showing ${formatNumber(shown)} of ${formatNumber(total)} images`;
    refreshIcons();
  }

  renderChipCounts();
  await loadImages(false);
  makeSelectable(chips, chip => {
    filter = chip.dataset.filter;
    loadImages(false);
  });
  document.getElementById('btn-load-more').addEventListener('click', () => loadImages(true));

  // Làm mới số liệu + danh sách ảnh (sau khi upload / import xong)
  async function refreshAll() {
    if (API_MODE) project = projectFromApi(await api(`/api/projects/${project.id}`));
    renderHeader();
    renderChipCounts();
    await loadImages(false);
  }

  // ----- Upload folder ảnh / import từ đường dẫn trên máy chủ -----
  initUpload(project.id, refreshAll);

  // ----- Tab Classes -----
  const classList = document.getElementById('class-list');
  const classForm = document.getElementById('class-form');
  const classError = document.getElementById('class-error');
  const deleteClassBtn = document.getElementById('btn-delete-class');
  let editingClass = null;          // class đang sửa (null = đang thêm mới)
  let deleteArmed = false;          // đã bấm "Delete" 1 lần, chờ bấm lần 2 để xác nhận

  // Số annotation của 1 class: từ database (annotation_count) hoặc từ dữ liệu mẫu (count)
  function classStat(c) {
    const n = c.annotation_count !== undefined ? c.annotation_count : c.count;
    return n === undefined ? '' : `<span class="list-row-stat">${formatNumber(n)} ${n === 1 ? 'annotation' : 'annotations'}</span>`;
  }

  // Vẽ danh sách class. Thứ tự trong danh sách cũng là phím tắt 1, 2, 3... ở trang Annotate
  function renderClasses() {
    classList.innerHTML = CLASSES.length ? CLASSES.map((c, i) => `
      <div class="list-row">
        <span class="color-swatch" style="background:${c.color}"></span>
        <div class="list-row-main">
          <p class="list-row-title">${esc(c.name)}</p>
          <p class="text-small text-muted">${i < 9 ? `Shortcut key <kbd>${i + 1}</kbd>` : 'No shortcut'}</p>
        </div>
        ${classStat(c)}
        <code class="color-code">${c.color}</code>
        <button class="btn btn-ghost btn-sm" data-edit-class="${c.id}"><i data-lucide="pencil"></i>Edit</button>
      </div>`).join('')
      : emptyStateHTML('tag', 'No classes yet', 'Add the labels you want to draw, for example "car" or "person".',
          '<button class="btn btn-primary" data-add-class><i data-lucide="plus"></i>Add class</button>');
    project.classes = CLASSES.length;
    renderHeader();
    refreshIcons();
  }
  renderClasses();

  // Các ô màu trong modal class
  const colorBox = document.getElementById('color-options');
  colorBox.innerHTML = COLOR_OPTIONS.map(color =>
    `<button type="button" class="color-option" data-color="${color}" style="background:${color}" title="${color}"></button>`
  ).join('');
  const colorButtons = colorBox.querySelectorAll('.color-option');
  makeSelectable(colorButtons);

  // Mở modal class: không truyền gì = Add, truyền class = Edit (điền sẵn dữ liệu)
  function openClassModal(cls) {
    editingClass = cls || null;
    deleteArmed = false;
    classError.hidden = true;
    document.getElementById('class-modal-title').textContent = cls ? 'Edit class' : 'Add class';
    document.getElementById('class-name-input').value = cls ? cls.name : '';
    // Class mới: chọn sẵn màu đầu tiên chưa class nào dùng, để các class khác màu nhau
    const used = CLASSES.map(c => c.color.toUpperCase());
    const color = cls ? cls.color : (COLOR_OPTIONS.find(c => !used.includes(c)) || COLOR_OPTIONS[0]);
    colorButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.color.toUpperCase() === color.toUpperCase()));
    deleteClassBtn.hidden = !(cls && API_MODE);
    deleteClassBtn.querySelector('span').textContent = 'Delete class';
    openModal('modal-class');
    document.getElementById('class-name-input').focus();
  }

  // Bấm nút Add / Edit (gắn ở khung ngoài để nút được vẽ lại vẫn chạy)
  document.getElementById('btn-add-class').addEventListener('click', () => openClassModal());
  classList.addEventListener('click', event => {
    if (event.target.closest('[data-add-class]')) return openClassModal();
    const btn = event.target.closest('[data-edit-class]');
    if (btn) openClassModal(findClass(Number(btn.dataset.editClass)));
  });

  // Lưu (thêm mới hoặc sửa)
  classForm.addEventListener('submit', async event => {
    event.preventDefault();
    classError.hidden = true;
    const name = document.getElementById('class-name-input').value;
    const active = colorBox.querySelector('.color-option.active');
    const color = active ? active.dataset.color : COLOR_OPTIONS[0];

    if (!API_MODE) {   // dữ liệu mẫu: không lưu gì
      closeModal(document.getElementById('modal-class'));
      showToast('Class saved (demo only)');
      return;
    }
    try {
      if (editingClass) {
        await api(`/api/classes/${editingClass.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, color }),
        });
      } else {
        await apiPost(`/api/projects/${project.id}/classes`, { name, color });
      }
      CLASSES = await api(`/api/projects/${project.id}/classes`);
      renderClasses();
      closeModal(document.getElementById('modal-class'));
      showToast(editingClass ? 'Class updated' : 'Class added');
    } catch (e) {
      classError.textContent = e.message;
      classError.hidden = false;
    }
  });

  // Xoá: bấm lần 1 đổi chữ nút để hỏi lại, bấm lần 2 mới xoá thật
  deleteClassBtn.addEventListener('click', async () => {
    if (!deleteArmed) {
      deleteArmed = true;
      deleteClassBtn.querySelector('span').textContent = 'Click again to delete';
      return;
    }
    try {
      await api(`/api/classes/${editingClass.id}`, { method: 'DELETE' });
      CLASSES = await api(`/api/projects/${project.id}/classes`);
      renderClasses();
      closeModal(document.getElementById('modal-class'));
      showToast('Class deleted');
    } catch (e) {
      classError.textContent = e.message;
      classError.hidden = false;
    }
  });

  // ----- Tab Members -----
  document.getElementById('tab-count-members').textContent = MEMBERS.length;
  document.getElementById('member-list').innerHTML = MEMBERS.length ? MEMBERS.map(m => `
    <div class="list-row">
      <span class="avatar" style="background:${m.color}">${getInitials(m.name)}</span>
      <div class="list-row-main">
        <p class="list-row-title">${esc(m.name)}</p>
        <p class="text-small text-muted">${esc(m.email)}</p>
      </div>
      <span class="list-row-stat">${formatNumber(m.labeled)} images labeled</span>
      <span class="badge ${m.role === 'Owner' ? 'badge-green' : ''}">${m.role}</span>
    </div>`).join('') : emptyStateHTML('users', 'No members yet', 'Members are not stored in the database yet.');

  refreshIcons();
}


// Upload folder ảnh từ trình duyệt lên server, hoặc import 1 folder đã nằm sẵn trên server.
// onDone() được gọi sau khi xong để trang vẽ lại số liệu và danh sách ảnh.
function initUpload(projectId, onDone) {
  const IMAGE_FILE = /\.(jpe?g|png|bmp|webp|tiff?)$/i;
  const MAX_FILES_PER_BATCH = 20;              // mỗi request gửi tối đa 20 ảnh...
  const MAX_BYTES_PER_BATCH = 25 * 1024 * 1024; // ...hoặc tối đa 25 MB

  const folderInput = document.getElementById('input-folder');
  const filesInput = document.getElementById('input-files');
  const pathInput = document.getElementById('import-path');
  const progressBox = document.getElementById('upload-progress');
  const buttons = ['btn-pick-folder', 'btn-pick-files', 'btn-import-path'].map(id => document.getElementById(id));
  let busy = false;

  // Khoá/mở các nút trong lúc đang upload để không bấm chồng
  function setBusy(value) {
    busy = value;
    buttons.forEach(btn => { btn.disabled = value; });
  }

  function setProgress(done, total) {
    const pct = percent(done, total);
    progressBox.hidden = false;
    document.getElementById('upload-bar').style.width = pct + '%';
    document.getElementById('upload-percent').textContent = pct + '%';
    document.getElementById('upload-text').textContent = `Uploading ${formatNumber(done)} / ${formatNumber(total)} images…`;
  }

  // Chia danh sách file thành từng lô nhỏ
  function makeBatches(entries) {
    const batches = [];
    let batch = [];
    let bytes = 0;
    entries.forEach(entry => {
      const full = batch.length >= MAX_FILES_PER_BATCH || bytes + entry.file.size > MAX_BYTES_PER_BATCH;
      if (batch.length && full) {
        batches.push(batch);
        batch = [];
        bytes = 0;
      }
      batch.push(entry);
      bytes += entry.file.size;
    });
    if (batch.length) batches.push(batch);
    return batches;
  }

  // entries: [{ file, rel }]  (rel = đường dẫn của ảnh bên trong folder, vd "day1/a.jpg")
  async function upload(entries, folderName) {
    if (entries.length === 0) {
      showToast('No images found in your selection', 'error');
      return;
    }
    setBusy(true);
    try {
      let done = 0;
      setProgress(0, entries.length);
      for (const batch of makeBatches(entries)) {
        const form = new FormData();
        form.append('folder', folderName);
        batch.forEach(entry => {
          form.append('paths', entry.rel);
          form.append('files', entry.file, entry.file.name);
        });
        const response = await fetch(`/api/projects/${projectId}/upload`, { method: 'POST', body: form });
        if (!response.ok) throw new Error(await errorMessage(response));
        done += batch.length;
        setProgress(done, entries.length);
      }
      // Gửi hết rồi → bảo server ghi các ảnh này vào database
      const result = await apiPost(`/api/projects/${projectId}/upload/finish`, { folder: folderName });
      reportImport(result);
    } catch (error) {
      showToast(error.message, 'error');
    }
    progressBox.hidden = true;
    setBusy(false);
  }

  function reportImport(result) {
    let message = `Added ${formatNumber(result.added)} images`;
    if (result.existing) message += `, ${formatNumber(result.existing)} were already there`;
    if (result.skipped.length) message += `, ${result.skipped.length} unreadable files skipped`;
    closeModal(document.getElementById('modal-upload'));
    showToast(message);
    onDone();
  }

  // Không có backend thì các nút chỉ báo là chưa dùng được
  function needsBackend() {
    if (API_MODE) return false;
    showToast('Uploading needs the backend. Run: python3 backend/app.py', 'info');
    return true;
  }

  document.getElementById('btn-pick-folder').addEventListener('click', () => {
    if (!needsBackend()) folderInput.click();
  });
  document.getElementById('btn-pick-files').addEventListener('click', () => {
    if (!needsBackend()) filesInput.click();
  });

  // Chọn cả folder: webkitRelativePath = "tenfolder/sub/a.jpg"
  folderInput.addEventListener('change', () => {
    const files = Array.from(folderInput.files);
    if (files.length === 0 || busy) return;
    const folderName = files[0].webkitRelativePath.split('/')[0];
    const entries = files
      .filter(file => IMAGE_FILE.test(file.name))
      .map(file => ({ file, rel: file.webkitRelativePath.split('/').slice(1).join('/') }));
    folderInput.value = ''; // cho phép chọn lại đúng folder đó lần sau
    upload(entries, folderName);
  });

  // Chọn vài ảnh lẻ: gom vào 1 folder đặt tên theo giờ upload
  filesInput.addEventListener('change', () => {
    const files = Array.from(filesInput.files);
    if (files.length === 0 || busy) return;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    const entries = files.filter(file => IMAGE_FILE.test(file.name)).map(file => ({ file, rel: file.name }));
    filesInput.value = '';
    upload(entries, `upload-${stamp}`);
  });

  // Import folder đã nằm sẵn trên máy chủ (không copy ảnh, chỉ ghi đường dẫn)
  document.getElementById('btn-import-path').addEventListener('click', async () => {
    if (needsBackend()) return;
    const path = pathInput.value.trim();
    if (!path) {
      showToast('Enter a folder path on the server', 'error');
      return;
    }
    setBusy(true);
    try {
      reportImport(await apiPost(`/api/projects/${projectId}/import`, { path }));
      pathInput.value = '';
    } catch (error) {
      showToast(error.message, 'error');
    }
    setBusy(false);
  });
}


/* ---------- label.html: Workspace gán nhãn ---------- */
async function initLabelPage() {
  // ----- 1. Nạp ảnh và class -----
  // Có backend: nạp 1 "cửa sổ" tối đa 200 ảnh của project từ database, ảnh được bấm nằm ở giữa
  let projectName = 'Street Traffic Detection'; // chỉ dùng cho dữ liệu mẫu
  let projectId = 0;
  let windowOffset = 0;            // ảnh đầu tiên của cửa sổ là ảnh thứ mấy trong project
  let windowTotal = IMAGES.length; // tổng số ảnh của project
  if (API_MODE) {
    IMAGES = [];
    projectId = Number(getQueryParam('project'));
    if (!projectId) {
      // Bấm "Annotate" trên sidebar (không có project) → lấy project đầu tiên có ảnh
      const first = PROJECTS.find(p => p.totalImages > 0);
      projectId = first ? first.id : 0;
    }
    if (projectId) {
      const imageParam = Number(getQueryParam('image'));
      const around = imageParam ? `&around=${imageParam}` : '';
      try {
        const data = await api(`/api/projects/${projectId}/images?limit=200${around}`);
        IMAGES = data.items.map(imageFromApi);
        windowOffset = data.offset;
        windowTotal = data.total;
        CLASSES = await api(`/api/projects/${projectId}/classes`);
        const project = PROJECTS.find(p => p.id === projectId);
        if (project) projectName = project.name;
      } catch (error) {
        showToast(error.message, 'error'); // project không tồn tại → rơi xuống màn hình "No images"
      }
    }
  }

  // Chưa có ảnh nào → hiện trạng thái trống thay cho cả workspace rồi dừng
  if (IMAGES.length === 0) {
    document.querySelector('.workspace').innerHTML = emptyStateHTML('images', 'No images to label',
      'Upload images to a project first, then come back here to annotate them.',
      '<a href="projects.html" class="btn btn-primary"><i data-lucide="folder-kanban"></i>Go to projects</a>');
    refreshIcons();
    return;
  }

  // ----- 2. Trạng thái của trang -----
  const startId = Number(getQueryParam('image'));
  let currentIndex = Math.max(0, IMAGES.findIndex(img => img.id === startId)); // không tìm thấy (-1) → 0
  let currentTool = 'select';
  let currentClassId = CLASSES.length ? CLASSES[0].id : null;   // class dùng cho hình sắp vẽ
  let version = 0;          // phiên bản annotation của ảnh đang mở (gửi kèm khi lưu để phát hiện xung đột)
  let dirty = false;        // có thay đổi chưa lưu không
  let editCount = 0;        // đếm số lần sửa, để biết có ai sửa thêm trong lúc đang lưu không
  let saving = false;
  let loadFailed = false;   // không tải được annotation của ảnh: cấm lưu để khỏi ghi đè dữ liệu có sẵn
  let openToken = 0;        // đánh số mỗi lần mở ảnh, để bỏ kết quả của lần mở đã cũ
  let navigating = false;

  const TOOL_NAMES = { select: 'Select', bbox: 'Bounding box', polygon: 'Polygon', pan: 'Pan', zoom: 'Zoom' };
  const stage = document.getElementById('canvas-stage');
  const area = document.querySelector('.canvas-area');
  const strip = document.getElementById('thumb-strip');
  const list = document.getElementById('annotation-list');
  const classPicker = document.getElementById('class-picker');

  document.getElementById('label-project-name').textContent = projectName;
  if (projectId) {
    document.getElementById('btn-back').href = `project.html?id=${projectId}`;
    document.getElementById('link-manage-classes').href = `project.html?id=${projectId}&tab=classes`;
  }

  // ----- 3. Nơi lưu annotation -----
  // Có backend: gọi API. Không có backend: giữ trong bộ nhớ (tải lại trang là mất), để vẫn thử vẽ được.
  const annotationStore = API_MODE ? {
    load: img => api(`/api/images/${img.id}/annotations`),
    save: (img, baseVersion, annotations) =>
      apiSend('PUT', `/api/images/${img.id}/annotations`, { base_version: baseVersion, annotations }),
  } : {
    async load(img) {
      if (!img.annotations) {   // dữ liệu mẫu cũ dùng % → đổi sang toạ độ 0..1
        img.annotations = img.boxes.map(b => ({
          class_id: b.classId, type: 'bbox', data: { x: b.x / 100, y: b.y / 100, w: b.w / 100, h: b.h / 100 },
        }));
      }
      return { version: 0, status: img.status, annotations: img.annotations };
    },
    async save(img, baseVersion, annotations) {
      img.annotations = annotations;
      return { version: baseVersion + 1, status: img.status, annotations };
    },
  };

  // ----- 4. Bộ vẽ -----
  const annotator = createAnnotator({
    area, stage,
    svg: document.getElementById('annotation-svg'),
    getClass: findClass,
    onChange: () => {            // vẽ / sửa / xoá / undo đều đi qua đây
      dirty = true;
      editCount++;
      renderAnnotationList();
      updateToolbarState();
    },
    onSelect: () => renderAnnotationList(),
    onViewChange: zoom => { document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%'; },
    onNeedClass: () => showToast('Add a class first: open the project page and use the Classes tab', 'info'),
    onMessage: text => showToast(text, 'info'),
  });
  annotator.setCurrentClass(currentClassId);

  // ----- 5. Vẽ các phần của giao diện -----
  function renderClassPicker() {
    classPicker.innerHTML = CLASSES.length ? CLASSES.map((c, i) => `
      <button class="class-item ${c.id === currentClassId ? 'active' : ''}" data-class-id="${c.id}">
        <span class="class-dot" style="background:${c.color}"></span>
        <span>${esc(c.name)}</span>
        ${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}
      </button>`).join('') : '<p class="empty-text">No classes yet. Use <b>Manage</b> to add some.</p>';
  }

  function renderAnnotationList() {
    const items = annotator.list();
    const selected = annotator.getSelected();
    const img = IMAGES[currentIndex];
    document.getElementById('annotation-count').textContent = items.length;
    if (items.length === 0) {
      list.innerHTML = '<p class="empty-text">No annotations yet. Use <b>Bounding box</b> (B) and drag, or <b>Polygon</b> (P) and click the outline.</p>';
      return;
    }
    list.innerHTML = items.map((a, i) => {
      const cls = findClass(a.class_id);
      const detail = a.type === 'bbox'
        ? `Box · ${Math.round(a.data.w * img.width)} × ${Math.round(a.data.h * img.height)} px`
        : `Polygon · ${a.data.points.length} points`;
      return `
        <div class="annotation-item ${a.uid === selected ? 'active' : ''}" data-uid="${a.uid}">
          <span class="class-dot" style="background:${cls ? cls.color : '#6B7280'}"></span>
          <div class="annotation-item-main">
            <p>${esc(cls ? cls.name : 'Unknown class')}</p>
            <p class="text-small text-muted">${detail}</p>
          </div>
          <span class="annotation-id">#${i + 1}</span>
          <button class="icon-btn annotation-delete" data-delete-uid="${a.uid}" title="Delete (Del)"><i data-lucide="trash-2"></i></button>
        </div>`;
    }).join('');
    refreshIcons();
  }

  // Dòng gợi ý trên canvas: tool + class đang chọn
  function updateHint() {
    const cls = findClass(currentClassId);
    const classText = cls
      ? `Class: <span class="class-dot" style="background:${cls.color}"></span><b>${esc(cls.name)}</b>`
      : 'No classes yet';
    document.getElementById('canvas-hint').innerHTML = `
      <i data-lucide="info"></i>
      Tool: <b>${TOOL_NAMES[currentTool]}</b> · ${classText}`;
    refreshIcons();
  }

  function updateToolbarState() {
    document.getElementById('unsaved').hidden = !dirty;
    document.getElementById('btn-undo').disabled = !annotator.canUndo();
    document.getElementById('btn-redo').disabled = !annotator.canRedo();
  }

  // Cập nhật mọi chỗ đang hiện trạng thái của ảnh (huy hiệu, ô chọn, chấm ở thumbnail)
  function syncStatus(img, status) {
    img.status = status;
    const index = IMAGES.indexOf(img);
    if (strip.querySelectorAll('.thumb-dot')[index]) strip.querySelectorAll('.thumb-dot')[index].className = `thumb-dot dot-${status}`;
    if (IMAGES[currentIndex] !== img) return;
    const badge = document.getElementById('image-status');
    badge.className = `status-badge status-${status}`;
    badge.textContent = STATUS_TEXT[status];
    const select = document.getElementById('status-select');
    if (select) select.value = status;
  }

  // Phần đầu trang và bảng thông tin của ảnh đang mở
  function renderImageHeader(img) {
    document.getElementById('image-title').textContent = img.name;
    document.getElementById('image-counter').textContent = `${windowOffset + currentIndex + 1} / ${formatNumber(windowTotal)}`;
    const badge = document.getElementById('image-status');
    badge.className = `status-badge status-${img.status}`;
    badge.textContent = STATUS_TEXT[img.status];

    // Có backend: trạng thái là ô chọn để đổi được; dữ liệu mẫu: chỉ là nhãn hiển thị
    const statusCell = API_MODE
      ? `<select class="select select-sm" id="status-select">${Object.keys(STATUS_TEXT).map(key =>
          `<option value="${key}" ${key === img.status ? 'selected' : ''}>${STATUS_TEXT[key]}</option>`).join('')}</select>`
      : `<span class="status-badge status-${img.status}">${STATUS_TEXT[img.status]}</span>`;
    const lastRow = img.folder
      ? `<div class="info-row"><span>Folder</span><span>${esc(img.folder)}</span></div>`
      : `<div class="info-row"><span>Annotator</span><span>${esc(img.annotator)}</span></div>`;
    document.getElementById('image-info').innerHTML = `
      <div class="info-row"><span>File name</span><span class="info-value">${esc(img.name)}</span></div>
      <div class="info-row"><span>Dimensions</span><span>${esc(img.size)}</span></div>
      <div class="info-row"><span>Format</span><span>${esc(img.format || 'JPEG')}</span></div>
      <div class="info-row"><span>Status</span>${statusCell}</div>
      ${lastRow}`;
    const statusSelect = document.getElementById('status-select');
    if (statusSelect) statusSelect.addEventListener('change', () => changeStatus(statusSelect.value));

    // Highlight thumbnail đang xem và cuộn dải thumbnail tới đó
    const thumbs = strip.querySelectorAll('.thumb');
    thumbs.forEach((thumb, i) => thumb.classList.toggle('active', i === currentIndex));
    const active = thumbs[currentIndex];
    strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2, behavior: 'smooth' });

    // Cập nhật URL (?image=...) để F5 vẫn ở đúng ảnh
    history.replaceState(null, '', API_MODE ? `?project=${projectId}&image=${img.id}` : `?image=${img.id}`);
    refreshIcons();
  }

  // ----- 6. Khung ảnh -----
  // Khung ảnh luôn có ĐÚNG tỉ lệ của ảnh và to nhất có thể trong vùng canvas
  let stageRatio = 4 / 3;
  function fitStage() {
    const maxWidth = area.clientWidth - 64;
    const maxHeight = area.clientHeight - 96;
    const width = Math.min(maxWidth, maxHeight * stageRatio);
    stage.style.width = width + 'px';
    stage.style.height = (width / stageRatio) + 'px';
    annotator.resize();
  }
  window.addEventListener('resize', fitStage);

  // ----- 7. Mở ảnh, lưu, chuyển ảnh -----
  async function openImage(index) {
    currentIndex = index;
    const img = IMAGES[index];
    const token = ++openToken;

    stageRatio = img.ratio || 4 / 3;
    fitStage();
    annotator.resetView();
    document.getElementById('canvas-image').src = img.fileUrl;
    renderImageHeader(img);

    annotator.load([]);          // xoá hình của ảnh trước trong lúc chờ tải
    version = 0;
    dirty = false;
    loadFailed = false;
    renderAnnotationList();
    updateToolbarState();

    try {
      const data = await annotationStore.load(img);
      if (token !== openToken) return;   // trong lúc chờ, người dùng đã chuyển sang ảnh khác
      version = data.version;
      annotator.load(data.annotations);
      if (data.status && data.status !== img.status) syncStatus(img, data.status);
    } catch (error) {
      if (token !== openToken) return;
      loadFailed = true;
      showToast(`Could not load the annotations: ${error.message}`, 'error');
    }
    renderAnnotationList();
    updateToolbarState();
  }

  // Lưu annotation của ảnh đang mở. Trả về true nếu đã lưu xong (hoặc không có gì để lưu).
  async function save({ silent = false } = {}) {
    if (!dirty) {
      if (!silent) showToast('Nothing to save', 'info');
      return true;
    }
    if (loadFailed) {
      showToast('This image\'s annotations did not load, so saving is disabled. Reload the page.', 'error');
      return false;
    }
    if (saving) return false;
    saving = true;
    const img = IMAGES[currentIndex];
    const editsAtStart = editCount;
    try {
      const result = await annotationStore.save(img, version, annotator.toPayload());
      version = result.version;
      if (editCount === editsAtStart) dirty = false;   // nếu trong lúc lưu lại có sửa thêm thì vẫn còn "chưa lưu"
      if (result.status && result.status !== img.status) syncStatus(img, result.status);
      if (!silent) showToast(API_MODE ? 'Saved' : 'Saved (demo: kept in memory only)');
      return true;
    } catch (error) {
      if (error.status === 409) {
        await resolveConflict();
      } else {
        showToast(error.message, 'error');
      }
      return false;
    } finally {
      saving = false;
      updateToolbarState();
    }
  }

  // Người khác đã lưu ảnh này trong lúc bạn sửa
  async function resolveConflict() {
    const discard = window.confirm(
      'Someone else changed this image while you were editing it.\n\n' +
      'OK: discard your changes and load their version.\n' +
      'Cancel: keep your drawing on screen (you will not be able to save it).');
    if (discard) await openImage(currentIndex);
  }

  // Chuyển ảnh. Có thay đổi chưa lưu thì lưu trước; lưu không được thì ở lại để không mất công
  async function showImage(index) {
    if (index < 0) index = IMAGES.length - 1;   // đi quá đầu/cuối thì vòng lại
    if (index >= IMAGES.length) index = 0;
    if (index === currentIndex || navigating) return;
    navigating = true;
    try {
      if (dirty && !(await save({ silent: true }))) return;
      await openImage(index);
    } finally {
      navigating = false;
    }
  }

  // Đổi trạng thái của ảnh đang xem và lưu vào database
  async function changeStatus(status) {
    const img = IMAGES[currentIndex];
    if (img.status === status) return;
    try {
      await apiSend('PATCH', `/api/images/${img.id}`, { status });
    } catch (error) {
      showToast(error.message, 'error');
      syncStatus(img, img.status);   // đưa ô chọn trạng thái về giá trị cũ
      return;
    }
    syncStatus(img, status);
    showToast(`Marked as ${STATUS_TEXT[status].toLowerCase()}`);
  }

  // ----- 8. Gắn các nút -----
  // Thanh công cụ bên trái
  function setTool(name) {
    currentTool = name;
    annotator.setTool(name);
    updateHint();
  }
  makeSelectable(document.querySelectorAll('.tool-btn'), btn => setTool(btn.dataset.tool));

  // Chọn class: dùng cho hình sắp vẽ, và đổi class của hình đang chọn (nếu có)
  function chooseClass(id) {
    if (!findClass(id)) return;
    currentClassId = id;
    annotator.setCurrentClass(id);
    if (annotator.getSelected() !== null) annotator.setClassOf(annotator.getSelected(), id);
    renderClassPicker();
    updateHint();
  }
  classPicker.addEventListener('click', event => {
    const btn = event.target.closest('[data-class-id]');
    if (btn) chooseClass(Number(btn.dataset.classId));
  });

  // Danh sách annotation bên phải: bấm để chọn, rê chuột để làm nổi hình trên ảnh, nút thùng rác để xoá
  let hoveredUid = null;
  list.addEventListener('click', event => {
    const del = event.target.closest('[data-delete-uid]');
    if (del) return annotator.deleteAnnotation(Number(del.dataset.deleteUid));
    const row = event.target.closest('[data-uid]');
    if (row) annotator.select(Number(row.dataset.uid));
  });
  list.addEventListener('mouseover', event => {
    const row = event.target.closest('[data-uid]');
    const uid = row ? Number(row.dataset.uid) : null;
    if (uid !== hoveredUid) { hoveredUid = uid; annotator.setHover(uid); }
  });
  list.addEventListener('mouseleave', () => { hoveredUid = null; annotator.setHover(null); });

  // Dải thumbnail và các nút phía trên / dưới
  strip.innerHTML = IMAGES.map((img, i) => `
    <button class="thumb" data-index="${i}" title="${esc(img.name)}">
      <img src="${img.thumbUrl}" alt="${esc(img.name)}" loading="lazy">
      <span class="thumb-dot dot-${img.status}"></span>
    </button>`).join('');
  strip.querySelectorAll('.thumb').forEach(thumb => {
    thumb.addEventListener('click', () => showImage(Number(thumb.dataset.index)));
  });
  document.getElementById('btn-prev').addEventListener('click', () => showImage(currentIndex - 1));
  document.getElementById('btn-next').addEventListener('click', () => showImage(currentIndex + 1));
  document.getElementById('btn-save').addEventListener('click', () => save());
  document.getElementById('btn-undo').addEventListener('click', () => annotator.undo());
  document.getElementById('btn-redo').addEventListener('click', () => annotator.redo());

  // "Submit for review": có backend thì lưu hình rồi đổi trạng thái ảnh thành review
  document.getElementById('btn-submit-review').addEventListener('click', async () => {
    if (!API_MODE) return showToast('Image sent for review (demo only)');
    if (dirty && !(await save({ silent: true }))) return;
    changeStatus('review');
  });

  // Zoom
  document.getElementById('btn-zoom-in').addEventListener('click', () => annotator.zoomBy(1.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => annotator.zoomBy(1 / 1.25));
  document.getElementById('zoom-level').addEventListener('click', () => annotator.resetView()); // click số % để về 100%

  // Đóng tab khi còn thay đổi chưa lưu thì trình duyệt sẽ hỏi lại
  window.addEventListener('beforeunload', event => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  // ----- 9. Phím tắt -----
  document.addEventListener('keydown', event => {
    // Đang gõ trong ô nhập liệu, hoặc đang mở hộp thoại thì bỏ qua
    if (event.target.matches('input, textarea, select')) return;
    if (document.querySelector('.modal-overlay.open')) return;

    // Các phím liên quan tới hình vẽ (xoá, undo, Esc, Space...) do annotator xử lý
    if (annotator.handleKey(event)) {
      event.preventDefault();
      return;
    }

    // Ctrl+S / Cmd+S → Save
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const TOOL_KEYS = { v: 'select', b: 'bbox', p: 'polygon', h: 'pan', z: 'zoom' };
    const key = event.key.toLowerCase();

    if (TOOL_KEYS[key]) {
      document.querySelector(`.tool-btn[data-tool="${TOOL_KEYS[key]}"]`).click();
    } else if (event.key === 'ArrowLeft') {
      showImage(currentIndex - 1);
    } else if (event.key === 'ArrowRight') {
      showImage(currentIndex + 1);
    } else if (event.key === '?') {
      openModal('modal-shortcuts');
    } else if (event.key >= '1' && event.key <= '9' && CLASSES[Number(event.key) - 1]) {
      chooseClass(CLASSES[Number(event.key) - 1].id);
    }
  });
  document.addEventListener('keyup', event => annotator.handleKeyUp(event));
  window.addEventListener('blur', () => annotator.releasePanOverride());   // đổi cửa sổ khi đang giữ Space

  // ----- 10. Hiển thị lần đầu -----
  renderClassPicker();
  updateHint();
  updateToolbarState();
  await openImage(currentIndex);
}


/* ---------- export.html: Xuất dataset ---------- */
function initExportPage() {
  const FORMAT_NAMES = { yolo: 'YOLO', coco: 'COCO JSON', voc: 'Pascal VOC' };
  let selectedFormat = 'yolo';

  // Đổ danh sách project vào ô chọn (?project=2 thì chọn sẵn project 2)
  const select = document.getElementById('export-project');
  select.innerHTML = PROJECTS.length
    ? PROJECTS.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
    : '<option>No projects yet</option>';
  select.disabled = PROJECTS.length === 0;
  if (getQueryParam('project')) select.value = getQueryParam('project');

  // Chọn định dạng
  makeSelectable(document.querySelectorAll('.format-card'), card => {
    selectedFormat = card.dataset.format;
    updateSummary();
  });

  // 2 thanh trượt: train và val. Test = phần còn lại (100 - train - val)
  const trainRange = document.getElementById('range-train');
  const valRange = document.getElementById('range-val');

  function onSliderChange() {
    // Không cho train + val vượt quá 100%
    if (Number(trainRange.value) + Number(valRange.value) > 100) {
      valRange.value = 100 - Number(trainRange.value);
    }
    updateSummary();
  }
  trainRange.addEventListener('input', onSliderChange);
  valRange.addEventListener('input', onSliderChange);
  select.addEventListener('change', updateSummary);

  // Cập nhật số %, thanh màu và khung tóm tắt bên phải
  function updateSummary() {
    const train = Number(trainRange.value);
    const val = Number(valRange.value);
    const test = 100 - train - val;

    document.getElementById('train-value').textContent = train + '%';
    document.getElementById('val-value').textContent = val + '%';
    document.getElementById('test-value').textContent = test + '%';
    document.getElementById('bar-train').style.width = train + '%';
    document.getElementById('bar-val').style.width = val + '%';
    document.getElementById('bar-test').style.width = test + '%';

    // Chỉ xuất ảnh đã gán nhãn
    const project = PROJECTS.find(p => p.id === Number(select.value));
    const total = project ? project.labeledImages : 0; // chưa có project → 0 ảnh
    const nTrain = Math.round((total * train) / 100);
    const nVal = Math.round((total * val) / 100);
    const nTest = total - nTrain - nVal;

    document.getElementById('sum-project').textContent = project ? project.name : '—';
    document.getElementById('sum-format').textContent = FORMAT_NAMES[selectedFormat];
    document.getElementById('sum-images').textContent = formatNumber(total);
    document.getElementById('sum-train').textContent = formatNumber(nTrain);
    document.getElementById('sum-val').textContent = formatNumber(nVal);
    document.getElementById('sum-test').textContent = formatNumber(nTest);
  }
  updateSummary();

  // Nút Export: giả vờ chạy 1.2 giây rồi báo thành công
  const exportBtn = document.getElementById('btn-export');
  const originalHTML = exportBtn.innerHTML;
  exportBtn.disabled = PROJECTS.length === 0; // không có project thì không export được
  exportBtn.addEventListener('click', () => {
    exportBtn.disabled = true;
    exportBtn.textContent = 'Exporting…';

    setTimeout(() => {
      exportBtn.disabled = false;
      exportBtn.innerHTML = originalHTML;
      refreshIcons();
      const images = document.getElementById('sum-images').textContent;
      showToast(`Exported ${images} images as ${FORMAT_NAMES[selectedFormat]}`);
    }, 1200);
  });
}


/* ---------- settings.html: Cài đặt ---------- */
function initSettingsPage() {
  // Chọn theme (chỉ đổi highlight, không đổi giao diện thật)
  makeSelectable(document.querySelectorAll('.theme-option'));

  document.getElementById('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    showToast('Settings saved');
  });

  // Hồ sơ: người đang đăng nhập (không có backend thì hiện tài khoản mẫu "demo")
  const username = CURRENT_USER ? CURRENT_USER.username : 'demo';
  const isAdmin = CURRENT_USER ? CURRENT_USER.is_admin : true;
  document.getElementById('profile-avatar').textContent = username.slice(0, 2).toUpperCase();
  document.getElementById('profile-name').textContent = username;
  document.getElementById('profile-role').textContent = isAdmin ? 'Admin' : 'Member';
  document.getElementById('s-username').value = username;

  initDeviceCard();   // chạy nền, không chặn phần còn lại của trang

  // Đổi mật khẩu và quản lý người dùng cần backend
  if (!API_MODE) return;
  document.getElementById('account-settings').hidden = false;
  initPasswordForm();
  if (CURRENT_USER.is_admin) return initUserAdmin();
}

// Hiện GPU của máy đang mở web. Phát hiện trong trình duyệt (gpu.js), không gửi gì lên server.
async function initDeviceCard() {
  const box = document.getElementById('device-info');
  if (!box || typeof detectGpu !== 'function') return;

  let info;
  try {
    info = await detectGpu();
  } catch (e) {
    box.innerHTML = '<p class="text-muted">Could not check this device.</p>';
    return;
  }

  // Mọi chuỗi lấy từ trình duyệt đều qua esc() trước khi đưa vào HTML
  const webgpu = info.webgpu;
  const webgpuText = webgpu.supported
    ? 'Yes' + (webgpu.fallback ? ' (software fallback)' : '') + (webgpu.architecture ? ` · ${webgpu.architecture}` : '')
    : `No${webgpu.reason ? ` · ${webgpu.reason}` : ''}`;
  const webglText = info.webgl ? `WebGL ${info.webgl.version}` : 'No';
  const memoryText = info.memoryGb ? `${info.memoryGb} GB${info.memoryGb >= 8 ? ' or more' : ''}` : 'Unknown';
  const rows = [
    ['GPU', info.name],
    ['WebGPU', webgpuText],
    ['WebGL', webglText],
    ['CPU threads', info.threads || 'Unknown'],
    ['Memory', memoryText],
  ];

  box.innerHTML = `
    <div class="device-verdict">
      <span class="verdict verdict-${info.verdict.level}">${esc(info.verdict.title)}</span>
      <p class="text-small text-muted">${esc(info.verdict.detail)}</p>
    </div>
    ${rows.map(([label, value]) => `
      <div class="info-row"><span>${label}</span><span class="device-value">${esc(value)}</span></div>`).join('')}`;
}

// Đổi mật khẩu của chính mình
function initPasswordForm() {
  const form = document.getElementById('password-form');
  const error = document.getElementById('pw-error');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const current = document.getElementById('pw-current').value;
    const next = document.getElementById('pw-new').value;

    let problem = '';
    if (!current || !next) problem = 'Fill in all the fields.';
    else if (next !== document.getElementById('pw-confirm').value) problem = 'The new passwords do not match.';
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    try {
      await apiPost('/api/auth/password', { current_password: current, new_password: next });
      form.reset();
      showToast('Password updated. Your other devices were signed out.');
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });
}

// Chỉ admin: xem danh sách, thêm người, đặt lại mật khẩu, xoá
async function initUserAdmin() {
  document.getElementById('section-users').hidden = false;
  const list = document.getElementById('user-list');
  let target = null; // người đang được đặt lại mật khẩu / chuẩn bị xoá: { id, name }

  async function render() {
    const users = await api('/api/users');
    list.innerHTML = users.map(u => {
      const isMe = u.id === CURRENT_USER.id;
      // Không cho tự xoá mình hay tự reset ở đây (đổi mật khẩu của mình dùng mục Password bên trên)
      const actions = isMe ? '<span class="badge">You</span>' : `
        <span class="list-row-actions">
          <button class="btn btn-ghost btn-sm" data-action="reset" data-id="${u.id}" data-name="${esc(u.username)}">
            <i data-lucide="key-round"></i>Reset password</button>
          <button class="btn btn-ghost btn-sm" data-action="delete" data-id="${u.id}" data-name="${esc(u.username)}">
            <i data-lucide="trash-2"></i>Delete</button>
        </span>`;
      return `
        <div class="list-row">
          <span class="avatar">${esc(u.username.slice(0, 2).toUpperCase())}</span>
          <div class="list-row-main">
            <p class="list-row-title">${esc(u.username)}</p>
            <p class="text-small text-muted">Added ${esc(timeAgo(u.created_at))}</p>
          </div>
          <span class="badge ${u.is_admin ? 'badge-green' : ''}">${u.is_admin ? 'Admin' : 'Member'}</span>
          ${actions}
        </div>`;
    }).join('');
    refreshIcons();
  }

  // Bấm nút trong danh sách (gắn 1 lần ở khung ngoài, nút nào được vẽ lại cũng chạy)
  list.addEventListener('click', event => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    target = { id: Number(btn.dataset.id), name: btn.dataset.name };
    if (btn.dataset.action === 'reset') {
      document.getElementById('reset-password-for').textContent = `Set a new password for ${target.name}.`;
      document.getElementById('reset-new-password').value = '';
      document.getElementById('reset-error').hidden = true;
      openModal('modal-reset-password');
    } else {
      document.getElementById('delete-user-text').textContent =
        `${target.name} will be signed out and cannot sign in again. The projects and images stay.`;
      openModal('modal-delete-user');
    }
  });

  // Đặt lại mật khẩu
  document.getElementById('reset-password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const error = document.getElementById('reset-error');
    try {
      await apiPost(`/api/users/${target.id}/password`, { new_password: document.getElementById('reset-new-password').value });
      closeModal(document.getElementById('modal-reset-password'));
      showToast(`Password reset for ${target.name}`);
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });

  // Xoá tài khoản
  document.getElementById('btn-confirm-delete-user').addEventListener('click', async () => {
    try {
      await api(`/api/users/${target.id}`, { method: 'DELETE' });
      closeModal(document.getElementById('modal-delete-user'));
      showToast(`Deleted ${target.name}`);
      await render();
    } catch (e) {
      closeModal(document.getElementById('modal-delete-user'));
      showToast(e.message, 'error');
    }
  });

  // Thêm người mới
  const form = document.getElementById('add-user-form');
  const error = document.getElementById('nu-error');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.hidden = true;
    const name = document.getElementById('nu-username').value.trim();
    try {
      await apiPost('/api/users', {
        username: name,
        password: document.getElementById('nu-password').value,
        is_admin: document.getElementById('nu-admin').checked,
      });
      form.reset();
      showToast(`Added ${name}`);
      await render();
    } catch (e) {
      error.textContent = e.message;
      error.hidden = false;
    }
  });

  await render();
}


/* ==========================================================
   5. KHỞI CHẠY
   ========================================================== */

// Mỗi giá trị data-page ứng với 1 hàm khởi tạo
const PAGE_INIT = {
  login: initLoginPage,
  projects: initProjectsPage,
  project: initProjectPage,
  label: initLabelPage,
  export: initExportPage,
  settings: initSettingsPage,
};

// Thứ tự: nạp dữ liệu (từ database nếu có backend) → chạy code riêng của trang
// (tạo HTML từ dữ liệu) → rồi mới gắn các tương tác chung (để nút vừa tạo cũng được gắn)
const currentPage = document.body.dataset.page;

async function start() {
  await loadData();
  try {
    if (PAGE_INIT[currentPage]) await PAGE_INIT[currentPage]();
  } catch (error) {
    // Có lỗi ở 1 trang thì vẫn để các tương tác chung (sidebar, modal...) chạy bình thường
    console.error(error);
    showToast('Something went wrong: ' + error.message, 'error');
  }
  highlightSidebar();
  initUser();
  initModals();
  initTabs();
  initToastButtons();
  initSearch();
  refreshIcons();
}

start();
