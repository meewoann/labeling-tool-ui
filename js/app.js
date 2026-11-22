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
   1. MOCK DATA — sửa ở đây để đổi nội dung hiển thị
   ========================================================== */

// Danh sách project (trang projects.html)
// cover: từ khoá để lấy ảnh ngẫu nhiên cố định từ picsum.photos
const PROJECTS = [
  { id: 1, name: 'Street Traffic Detection', description: 'Cars, buses and pedestrians at city intersections.', type: 'Bounding box', totalImages: 1240, labeledImages: 868, classes: 6, members: 4, updatedAt: '2 hours ago', cover: 'traffic' },
  { id: 2, name: 'Retail Shelf Products', description: 'Detect packaged products on supermarket shelves.', type: 'Bounding box', totalImages: 860, labeledImages: 344, classes: 12, members: 3, updatedAt: 'Yesterday', cover: 'shelf' },
  { id: 3, name: 'Warehouse Safety (PPE)', description: 'Helmets, vests and gloves on warehouse workers.', type: 'Bounding box', totalImages: 2150, labeledImages: 1935, classes: 5, members: 5, updatedAt: '3 days ago', cover: 'warehouse' },
  { id: 4, name: 'Crop Disease Leaves', description: 'Segment diseased areas on plant leaves.', type: 'Polygon', totalImages: 540, labeledImages: 108, classes: 4, members: 2, updatedAt: '1 week ago', cover: 'leaves' },
  { id: 5, name: 'Parking Lot Occupancy', description: 'Free and occupied parking spots from CCTV cameras.', type: 'Bounding box', totalImages: 980, labeledImages: 980, classes: 2, members: 3, updatedAt: '2 weeks ago', cover: 'parking' },
  { id: 6, name: 'Drone Solar Panels', description: 'Find cracked or dirty panels in drone footage.', type: 'Polygon', totalImages: 320, labeledImages: 0, classes: 3, members: 1, updatedAt: 'Just now', cover: 'solar' },
];

// Danh sách class (nhãn) — dùng chung cho mọi project để đơn giản
const CLASSES = [
  { id: 1, name: 'car', color: '#3B82F6', count: 1842 },
  { id: 2, name: 'person', color: '#F59E0B', count: 1210 },
  { id: 3, name: 'bicycle', color: '#8B5CF6', count: 342 },
  { id: 4, name: 'truck', color: '#EF4444', count: 518 },
  { id: 5, name: 'bus', color: '#EC4899', count: 207 },
  { id: 6, name: 'traffic light', color: '#14B8A6', count: 655 },
];

// Danh sách ảnh — status: 'labeled' | 'unlabeled' | 'review'
// boxes: bounding box giả, toạ độ tính bằng % so với ảnh (x, y = góc trên trái)
const IMAGES = [
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
const MEMBERS = [
  { name: 'Alex Nguyen', email: 'alex@example.com', role: 'Owner', labeled: 412, color: '#10B981' },
  { name: 'Linh Tran', email: 'linh@example.com', role: 'Annotator', labeled: 298, color: '#3B82F6' },
  { name: 'Minh Pham', email: 'minh@example.com', role: 'Annotator', labeled: 158, color: '#F59E0B' },
  { name: 'Sara Kim', email: 'sara@example.com', role: 'Reviewer', labeled: 0, color: '#8B5CF6' },
  { name: 'Tom Le', email: 'tom@example.com', role: 'Viewer', labeled: 0, color: '#EC4899' },
];

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

// Tìm class theo id
function findClass(id) {
  return CLASSES.find(c => c.id === id);
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
  toast.innerHTML = `<i data-lucide="${icons[type]}"></i><span>${message}</span>`;
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

// Modal: nút có data-open-modal="id" để mở,
// nút có data-close-modal (nút X, Cancel) hoặc click ra ngoài để đóng
function initModals() {
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.dataset.openModal));
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
function initLoginPage() {
  document.getElementById('login-form').addEventListener('submit', event => {
    event.preventDefault(); // chặn form gửi đi thật
    window.location.href = 'projects.html';
  });
}


/* ---------- projects.html: Danh sách project ---------- */
function initProjectsPage() {
  // Thẻ thống kê tổng quan
  const totalImages = PROJECTS.reduce((sum, p) => sum + p.totalImages, 0);
  const totalLabeled = PROJECTS.reduce((sum, p) => sum + p.labeledImages, 0);
  document.getElementById('overview-projects').textContent = PROJECTS.length;
  document.getElementById('overview-images').textContent = formatNumber(totalImages);
  document.getElementById('overview-labeled').textContent = percent(totalLabeled, totalImages) + '%';
  document.getElementById('overview-members').textContent = MEMBERS.length;

  const grid = document.getElementById('project-grid');

  // Tạo HTML cho 1 project card
  function projectCardHTML(p) {
    const pct = percent(p.labeledImages, p.totalImages);

    // Hiện tối đa 3 avatar thành viên, còn lại ghi "+N"
    const avatars = MEMBERS.slice(0, Math.min(p.members, 3))
      .map(m => `<span class="avatar avatar-xs" style="background:${m.color}">${getInitials(m.name)}</span>`)
      .join('');
    const more = p.members > 3 ? `<span class="avatar-more">+${p.members - 3}</span>` : '';

    return `
      <a href="project.html?id=${p.id}" class="card project-card">
        <div class="project-cover">
          <img src="${imageUrl(p.cover, 600, 280)}" alt="" loading="lazy">
          <span class="badge">${p.type}</span>
        </div>
        <div class="project-body">
          <h3>${p.name}</h3>
          <p class="project-desc">${p.description}</p>
          <div class="project-meta">
            <span><i data-lucide="image"></i>${formatNumber(p.totalImages)} images</span>
            <span><i data-lucide="tag"></i>${p.classes} classes</span>
          </div>
          <div class="progress-row">
            <div class="progress"><div class="progress-fill" style="width:${pct}%"></div></div>
            <span class="progress-value">${pct}%</span>
          </div>
          <div class="project-footer">
            <span class="updated"><i data-lucide="clock"></i>Updated ${p.updatedAt}</span>
            <span class="avatar-stack">${avatars}${more}</span>
          </div>
        </div>
      </a>`;
  }

  // Vẽ danh sách project ra lưới
  function render(list) {
    if (list.length === 0) {
      grid.innerHTML = '<p class="empty-state">No projects match your search.</p>';
    } else {
      grid.innerHTML = list.map(projectCardHTML).join('');
    }
    document.getElementById('project-count').textContent = `${list.length} projects`;
    refreshIcons();
  }

  render(PROJECTS);

  // Gõ vào ô search trên top bar → lọc project theo tên
  const search = document.getElementById('global-search');
  search.addEventListener('input', () => {
    const keyword = search.value.trim().toLowerCase();
    render(PROJECTS.filter(p => p.name.toLowerCase().includes(keyword)));
  });

  // Form "New Project": chỉ đóng modal + hiện toast, không lưu gì
  document.getElementById('new-project-form').addEventListener('submit', event => {
    event.preventDefault();
    closeModal(document.getElementById('modal-new-project'));
    event.target.reset();
    showToast('Project created (demo only, nothing was saved)');
  });
}


/* ---------- project.html: Tổng quan 1 project ---------- */
function initProjectPage() {
  // Lấy project theo ?id=..., không có thì dùng project đầu tiên
  const id = Number(getQueryParam('id'));
  const project = PROJECTS.find(p => p.id === id) || PROJECTS[0];

  // Tên, mô tả
  document.title = `${project.name} · LabelKit`;
  document.getElementById('breadcrumb-name').textContent = project.name;
  document.getElementById('project-name').textContent = project.name;
  document.getElementById('project-desc').textContent = project.description;

  // 4 thẻ thống kê
  const unlabeled = project.totalImages - project.labeledImages;
  document.getElementById('stat-total').textContent = formatNumber(project.totalImages);
  document.getElementById('stat-labeled').textContent = formatNumber(project.labeledImages);
  document.getElementById('stat-labeled-sub').textContent = `${percent(project.labeledImages, project.totalImages)}% of dataset`;
  document.getElementById('stat-unlabeled').textContent = formatNumber(unlabeled);
  document.getElementById('stat-unlabeled-sub').textContent = `${percent(unlabeled, project.totalImages)}% remaining`;
  document.getElementById('stat-classes').textContent = project.classes;
  document.getElementById('tab-count-images').textContent = formatNumber(project.totalImages);
  document.getElementById('images-showing').textContent = `Showing ${IMAGES.length} of ${formatNumber(project.totalImages)} images`;

  // ----- Tab Images -----
  const grid = document.getElementById('image-grid');

  function renderImages(filter) {
    const list = filter === 'all' ? IMAGES : IMAGES.filter(img => img.status === filter);
    grid.innerHTML = list.map(img => `
      <a href="label.html?image=${img.id}" class="image-card">
        <img src="${imageUrl(img.seed, 320, 240)}" alt="${img.name}" loading="lazy">
        <span class="status-badge status-${img.status}">${STATUS_TEXT[img.status]}</span>
        <div class="image-card-footer">
          <b>${img.name}</b>
          <span>${img.boxes.length} ${img.boxes.length === 1 ? 'box' : 'boxes'}</span>
        </div>
      </a>`).join('');
  }
  renderImages('all');

  // Ghi số lượng lên từng chip lọc, rồi cho click để lọc
  const chips = document.querySelectorAll('.chip[data-filter]');
  chips.forEach(chip => {
    const filter = chip.dataset.filter;
    const count = filter === 'all' ? IMAGES.length : IMAGES.filter(img => img.status === filter).length;
    chip.querySelector('.chip-count').textContent = count;
  });
  makeSelectable(chips, chip => renderImages(chip.dataset.filter));

  // ----- Tab Classes -----
  const classList = document.getElementById('class-list');
  classList.innerHTML = CLASSES.map(c => `
    <div class="list-row">
      <span class="color-swatch" style="background:${c.color}"></span>
      <div class="list-row-main">
        <p class="list-row-title">${c.name}</p>
        <p class="text-small text-muted">ID ${c.id}</p>
      </div>
      <span class="list-row-stat">${formatNumber(c.count)} annotations</span>
      <code class="color-code">${c.color}</code>
      <button class="btn btn-ghost btn-sm" data-edit-class="${c.id}"><i data-lucide="pencil"></i>Edit</button>
    </div>`).join('');

  // Các ô màu trong modal class
  const colorBox = document.getElementById('color-options');
  colorBox.innerHTML = COLOR_OPTIONS.map(color =>
    `<button type="button" class="color-option" data-color="${color}" style="background:${color}" title="${color}"></button>`
  ).join('');
  const colorButtons = colorBox.querySelectorAll('.color-option');
  makeSelectable(colorButtons);

  // Mở modal class: không truyền gì = Add, truyền class = Edit (điền sẵn dữ liệu)
  function openClassModal(cls) {
    document.getElementById('class-modal-title').textContent = cls ? 'Edit class' : 'Add class';
    document.getElementById('class-name-input').value = cls ? cls.name : '';
    const color = cls ? cls.color : COLOR_OPTIONS[0];
    colorButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.color === color));
    openModal('modal-class');
  }

  document.getElementById('btn-add-class').addEventListener('click', () => openClassModal());
  classList.querySelectorAll('[data-edit-class]').forEach(btn => {
    btn.addEventListener('click', () => openClassModal(findClass(Number(btn.dataset.editClass))));
  });

  // ----- Tab Members -----
  document.getElementById('tab-count-members').textContent = MEMBERS.length;
  document.getElementById('member-list').innerHTML = MEMBERS.map(m => `
    <div class="list-row">
      <span class="avatar" style="background:${m.color}">${getInitials(m.name)}</span>
      <div class="list-row-main">
        <p class="list-row-title">${m.name}</p>
        <p class="text-small text-muted">${m.email}</p>
      </div>
      <span class="list-row-stat">${formatNumber(m.labeled)} images labeled</span>
      <span class="badge ${m.role === 'Owner' ? 'badge-green' : ''}">${m.role}</span>
    </div>`).join('');

  refreshIcons();
}


/* ---------- label.html: Workspace gán nhãn ---------- */
function initLabelPage() {
  // Trạng thái hiện tại của trang
  const startId = Number(getQueryParam('image'));
  let currentIndex = Math.max(0, IMAGES.findIndex(img => img.id === startId)); // không tìm thấy (-1) → 0
  let currentTool = 'select';
  let selectedClassId = CLASSES[0].id;
  let zoom = 1;

  const TOOL_NAMES = { select: 'Select', bbox: 'Bounding box', polygon: 'Polygon', pan: 'Pan', zoom: 'Zoom' };

  // ----- Thanh công cụ bên trái -----
  const toolButtons = document.querySelectorAll('.tool-btn');
  makeSelectable(toolButtons, btn => {
    currentTool = btn.dataset.tool;
    updateHint();
  });

  // ----- Danh sách class bên phải -----
  const classPicker = document.getElementById('class-picker');
  classPicker.innerHTML = CLASSES.map((c, i) => `
    <button class="class-item ${c.id === selectedClassId ? 'active' : ''}" data-class-id="${c.id}">
      <span class="class-dot" style="background:${c.color}"></span>
      <span>${c.name}</span>
      <kbd>${i + 1}</kbd>
    </button>`).join('');
  const classButtons = classPicker.querySelectorAll('.class-item');
  makeSelectable(classButtons, btn => {
    selectedClassId = Number(btn.dataset.classId);
    updateHint();
  });

  // ----- Dải thumbnail phía dưới -----
  const strip = document.getElementById('thumb-strip');
  strip.innerHTML = IMAGES.map((img, i) => `
    <button class="thumb" data-index="${i}" title="${img.name}">
      <img src="${imageUrl(img.seed, 160, 120)}" alt="${img.name}">
      <span class="thumb-dot dot-${img.status}"></span>
    </button>`).join('');
  strip.querySelectorAll('.thumb').forEach(thumb => {
    thumb.addEventListener('click', () => showImage(Number(thumb.dataset.index)));
  });

  // ----- Các nút -----
  document.getElementById('btn-prev').addEventListener('click', () => showImage(currentIndex - 1));
  document.getElementById('btn-next').addEventListener('click', () => showImage(currentIndex + 1));
  document.getElementById('btn-save').addEventListener('click', () => showToast('Saved'));

  // Zoom: chỉ phóng to/thu nhỏ khung ảnh bằng CSS transform
  const stage = document.getElementById('canvas-stage');
  function setZoom(value) {
    zoom = Math.min(3, Math.max(0.5, value)); // giới hạn 50% – 300%
    stage.style.transform = `scale(${zoom})`;
    document.getElementById('zoom-level').textContent = Math.round(zoom * 100) + '%';
  }
  document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(zoom + 0.25));
  document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoom - 0.25));
  document.getElementById('zoom-level').addEventListener('click', () => setZoom(1)); // click số % để về 100%

  // Dòng gợi ý trên canvas: tool + class đang chọn
  function updateHint() {
    const cls = findClass(selectedClassId);
    document.getElementById('canvas-hint').innerHTML = `
      <i data-lucide="info"></i>
      Tool: <b>${TOOL_NAMES[currentTool]}</b> ·
      Class: <span class="class-dot" style="background:${cls.color}"></span><b>${cls.name}</b>`;
    refreshIcons();
  }

  // Chọn 1 annotation: highlight box trên ảnh + dòng trong danh sách
  function selectBox(index) {
    document.querySelectorAll('.bbox').forEach(box => {
      box.classList.toggle('selected', Number(box.dataset.index) === index);
    });
    document.querySelectorAll('.annotation-item').forEach(item => {
      item.classList.toggle('active', Number(item.dataset.index) === index);
    });
  }

  // Hiển thị ảnh thứ "index" trong mảng IMAGES
  function showImage(index) {
    // Đi quá đầu/cuối thì vòng lại
    if (index < 0) index = IMAGES.length - 1;
    if (index >= IMAGES.length) index = 0;
    currentIndex = index;
    const img = IMAGES[index];

    // Ảnh + tiêu đề
    document.getElementById('canvas-image').src = imageUrl(img.seed, 800, 600);
    document.getElementById('image-title').textContent = img.name;
    document.getElementById('image-counter').textContent = `${index + 1} / ${IMAGES.length}`;
    const statusEl = document.getElementById('image-status');
    statusEl.className = `status-badge status-${img.status}`;
    statusEl.textContent = STATUS_TEXT[img.status];

    // Vẽ bounding box giả bằng div (vị trí theo %)
    document.getElementById('box-layer').innerHTML = img.boxes.map((box, i) => {
      const cls = findClass(box.classId);
      return `
        <div class="bbox" data-index="${i}"
             style="left:${box.x}%; top:${box.y}%; width:${box.w}%; height:${box.h}%; color:${cls.color}; background:${cls.color}1f;">
          <span class="bbox-label" style="background:${cls.color}">${cls.name}</span>
        </div>`;
    }).join('');

    // Danh sách annotation bên phải
    const list = document.getElementById('annotation-list');
    document.getElementById('annotation-count').textContent = img.boxes.length;
    if (img.boxes.length === 0) {
      list.innerHTML = '<p class="empty-text">No annotations yet. Pick the <b>Bounding box</b> tool (B) to start.</p>';
    } else {
      list.innerHTML = img.boxes.map((box, i) => {
        const cls = findClass(box.classId);
        return `
          <button class="annotation-item" data-index="${i}">
            <span class="class-dot" style="background:${cls.color}"></span>
            <div class="annotation-item-main">
              <p>${cls.name}</p>
              <p class="text-small text-muted">x ${box.x}% · y ${box.y}% · ${box.w}×${box.h}%</p>
            </div>
            <span class="annotation-id">#${i + 1}</span>
          </button>`;
      }).join('');
    }

    // Click vào box hoặc dòng annotation → chọn annotation đó
    document.querySelectorAll('.bbox, .annotation-item').forEach(el => {
      el.addEventListener('click', () => selectBox(Number(el.dataset.index)));
    });

    // Thông tin ảnh
    document.getElementById('image-info').innerHTML = `
      <div class="info-row"><span>File name</span><span>${img.name}</span></div>
      <div class="info-row"><span>Dimensions</span><span>${img.size}</span></div>
      <div class="info-row"><span>Format</span><span>JPEG</span></div>
      <div class="info-row"><span>Status</span><span class="status-badge status-${img.status}">${STATUS_TEXT[img.status]}</span></div>
      <div class="info-row"><span>Annotator</span><span>${img.annotator}</span></div>`;

    // Highlight thumbnail đang xem và cuộn dải thumbnail tới đó
    const thumbs = strip.querySelectorAll('.thumb');
    thumbs.forEach((thumb, i) => thumb.classList.toggle('active', i === index));
    const active = thumbs[index];
    strip.scrollTo({ left: active.offsetLeft - strip.clientWidth / 2 + active.offsetWidth / 2, behavior: 'smooth' });

    // Cập nhật URL (?image=...) để F5 vẫn ở đúng ảnh
    history.replaceState(null, '', `?image=${img.id}`);
    refreshIcons();
  }

  // ----- Phím tắt -----
  document.addEventListener('keydown', event => {
    // Đang gõ trong ô nhập liệu thì bỏ qua
    if (event.target.matches('input, textarea, select')) return;

    // Ctrl+S / Cmd+S → Save
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      showToast('Saved');
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
    } else if (event.key >= '1' && event.key <= '9') {
      const btn = classButtons[Number(event.key) - 1];
      if (btn) btn.click();
    }
  });

  // Hiển thị lần đầu
  updateHint();
  showImage(currentIndex);
}


/* ---------- export.html: Xuất dataset ---------- */
function initExportPage() {
  const FORMAT_NAMES = { yolo: 'YOLO', coco: 'COCO JSON', voc: 'Pascal VOC' };
  let selectedFormat = 'yolo';

  // Đổ danh sách project vào ô chọn (?project=2 thì chọn sẵn project 2)
  const select = document.getElementById('export-project');
  select.innerHTML = PROJECTS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
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
    const total = project.labeledImages;
    const nTrain = Math.round((total * train) / 100);
    const nVal = Math.round((total * val) / 100);
    const nTest = total - nTrain - nVal;

    document.getElementById('sum-project').textContent = project.name;
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

// Chạy code riêng của trang trước (để tạo HTML từ mock data)...
const currentPage = document.body.dataset.page;
if (PAGE_INIT[currentPage]) PAGE_INIT[currentPage]();

// ...rồi mới gắn các tương tác chung (để nút vừa tạo cũng được gắn)
highlightSidebar();
initModals();
initTabs();
initToastButtons();
initSearch();
refreshIcons();
