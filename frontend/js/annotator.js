/* ==========================================================
   annotator.js — vẽ và chỉnh sửa annotation trên ảnh
   ----------------------------------------------------------
   File này chỉ lo phần VẼ (SVG), chọn, kéo, thu phóng, undo.
   Nó KHÔNG biết gì về API hay database: dữ liệu vào bằng load(),
   thay đổi được báo ra ngoài qua các callback. Phần nối với server
   nằm ở initLabelPage() trong app.js.

   Toạ độ của mọi annotation là CHUẨN HOÁ 0..1 theo kích thước ảnh
   (0,0 = góc trên trái, 1,1 = góc dưới phải), nên đúng ở mọi mức zoom.
     bbox    : { x, y, w, h }
     polygon : { points: [[x, y], ...] }

   Mục lục:
     1. Khởi tạo & trạng thái
     2. Chuyển đổi toạ độ, khung nhìn (zoom/pan)
     3. Vẽ ra SVG
     4. Thêm / sửa / xoá / undo
     5. Thao tác chuột (hộp, đa giác, chọn, kéo)
     6. Phím tắt
     7. Các hàm công khai
   ========================================================== */

function createAnnotator(options) {
  const { area, stage, svg, getClass, onChange, onSelect, onViewChange, onNeedClass, onMessage } = options;


  /* ========================================================
     1. KHỞI TẠO & TRẠNG THÁI
     ======================================================== */

  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 32;
  const MIN_BOX = 0.004;       // hộp nhỏ hơn 0,4% cạnh ảnh coi như bấm nhầm, không tạo
  const MIN_POLYGON_AREA = 1e-6;   // đa giác nhỏ hơn (hoặc các điểm thẳng hàng) bị từ chối
  const CLOSE_RADIUS = 10;     // bấm cách điểm đầu tối đa 10px trên màn hình thì coi là "đóng đa giác"
  const MAX_UNDO = 100;

  let tool = 'select';
  let annotations = [];        // [{ uid, class_id, type, data }]
  let nextUid = 1;
  let selectedUid = null;
  let hoverUid = null;
  let currentClassId = null;   // class dùng cho hình sắp vẽ
  let view = { zoom: 1, x: 0, y: 0 };
  let gesture = null;          // thao tác chuột đang diễn ra (kéo, vẽ, di chuyển...)
  let draft = null;            // hình đang vẽ dở
  let panOverride = false;     // đang giữ phím Space để kéo ảnh
  let undoStack = [];          // các bản chụp (JSON) của danh sách annotation
  let redoStack = [];
  let size = { w: 1, h: 1 };   // kích thước khung ảnh theo pixel (chưa zoom) = hệ toạ độ của SVG
  let renderQueued = false;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const clone = value => JSON.parse(JSON.stringify(value));
  const snapshot = () => JSON.stringify(annotations);
  const findAnnotation = uid => annotations.find(a => a.uid === uid) || null;
  const say = text => { if (onMessage) onMessage(text); };

  // Diện tích đa giác (công thức Gauss), toạ độ chuẩn hoá. Điểm thẳng hàng thì ra ~0.
  function polygonArea(points) {
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const [x1, y1] = points[i];
      const [x2, y2] = points[(i + 1) % points.length];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum) / 2;
  }

  // Chặn ký tự đặc biệt trước khi nhét tên class vào SVG
  function escapeText(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }


  /* ========================================================
     2. CHUYỂN ĐỔI TOẠ ĐỘ, KHUNG NHÌN (ZOOM / PAN)
     ======================================================== */

  // Vị trí chuột → toạ độ chuẩn hoá trên ảnh. getBoundingClientRect đã tính cả zoom và pan.
  function pointerToNorm(event, limit = true) {
    const rect = stage.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    return limit ? { x: clamp(x, 0, 1), y: clamp(y, 0, 1) } : { x, y };
  }

  function applyView() {
    stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`;
    if (onViewChange) onViewChange(view.zoom);
    scheduleRender();   // nét vẽ và núm kéo phải to/nhỏ theo zoom để trên màn hình luôn cùng cỡ
  }

  // Zoom tới mức newZoom sao cho điểm ảnh dưới con trỏ (cx, cy) đứng yên
  function zoomAt(cx, cy, newZoom) {
    const next = clamp(newZoom, MIN_ZOOM, MAX_ZOOM);
    if (next === view.zoom) return;
    const rect = stage.getBoundingClientRect();
    const originLeft = rect.left - view.x;        // vị trí khung ảnh khi chưa dịch/zoom
    const originTop = rect.top - view.y;
    const localX = (cx - rect.left) / view.zoom;  // điểm dưới con trỏ, tính theo pixel của ảnh
    const localY = (cy - rect.top) / view.zoom;
    view = { zoom: next, x: cx - localX * next - originLeft, y: cy - localY * next - originTop };
    applyView();
  }

  function zoomBy(factor) {
    const rect = area.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, view.zoom * factor);
  }

  function resetView() {
    view = { zoom: 1, x: 0, y: 0 };
    applyView();
  }

  // Gọi sau khi khung ảnh đổi kích thước (đổi ảnh, đổi cỡ cửa sổ)
  function resize() {
    size = { w: Math.max(stage.offsetWidth, 1), h: Math.max(stage.offsetHeight, 1) };
    svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
    render();
  }


  /* ========================================================
     3. VẼ RA SVG
     ======================================================== */

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      render();
    });
  }

  function colorOf(annotation) {
    const cls = getClass(annotation.class_id);
    return cls ? cls.color : '#6B7280';
  }

  // Hộp bao quanh (toạ độ chuẩn hoá) của 1 annotation
  function boundsOf(a) {
    if (a.type === 'bbox') return { x1: a.data.x, y1: a.data.y, x2: a.data.x + a.data.w, y2: a.data.y + a.data.h };
    const xs = a.data.points.map(p => p[0]);
    const ys = a.data.points.map(p => p[1]);
    return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
  }

  function shapeSvg(a, k) {
    const color = colorOf(a);
    const selected = a.uid === selectedUid;
    const hovered = a.uid === hoverUid;
    const strokeWidth = (selected ? 3 : hovered ? 2.5 : 2) * k;
    const style = `fill="${color}" fill-opacity="${selected ? 0.28 : hovered ? 0.22 : 0.14}" stroke="${color}" stroke-width="${strokeWidth}"`;
    const b = boundsOf(a);

    let shape;
    if (a.type === 'bbox') {
      shape = `<rect x="${a.data.x * size.w}" y="${a.data.y * size.h}" width="${a.data.w * size.w}" height="${a.data.h * size.h}" ${style}/>`;
    } else {
      const points = a.data.points.map(p => `${p[0] * size.w},${p[1] * size.h}`).join(' ');
      shape = `<polygon points="${points}" stroke-linejoin="round" ${style}/>`;
    }

    // Nhãn tên class: nằm ngay trên góc trên trái, nếu hết chỗ thì nằm trong hình
    const cls = getClass(a.class_id);
    const name = escapeText(cls ? cls.name : 'class?');
    const labelH = 18 * k;
    const labelW = (name.length * 7 + 12) * k;
    const lx = b.x1 * size.w;
    const ly = b.y1 * size.h - labelH >= 0 ? b.y1 * size.h - labelH : b.y1 * size.h;
    const label = `<rect x="${lx}" y="${ly}" width="${labelW}" height="${labelH}" fill="${color}" pointer-events="none"/>
      <text x="${lx + 6 * k}" y="${ly + 13 * k}" font-size="${12 * k}" fill="#fff" pointer-events="none">${name}</text>`;

    return `<g data-uid="${a.uid}" style="cursor:${tool === 'select' ? 'move' : 'inherit'}">${shape}${label}</g>`;
  }

  // 8 núm kéo quanh hộp được chọn, hoặc các đỉnh của đa giác được chọn
  function handlesSvg(a, k) {
    const color = colorOf(a);
    const style = `r="${5 * k}" fill="#fff" stroke="${color}" stroke-width="${2 * k}"`;
    if (a.type === 'bbox') {
      const { x, y, w, h } = a.data;
      const xs = { w: x, '': x + w / 2, e: x + w };
      const ys = { n: y, '': y + h / 2, s: y + h };
      const cursors = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
      return ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(handle => {
        const vertical = handle.includes('n') ? 'n' : handle.includes('s') ? 's' : '';
        const horizontal = handle.includes('w') ? 'w' : handle.includes('e') ? 'e' : '';
        return `<circle data-handle="${handle}" cx="${xs[horizontal] * size.w}" cy="${ys[vertical] * size.h}" ${style} style="cursor:${cursors[handle]}-resize"/>`;
      }).join('');
    }
    return a.data.points.map((p, i) =>
      `<circle data-vertex="${i}" cx="${p[0] * size.w}" cy="${p[1] * size.h}" ${style} style="cursor:move"/>`).join('');
  }

  function draftSvg(k) {
    const cls = getClass(currentClassId);
    const color = cls ? cls.color : '#10B981';
    if (draft.type === 'bbox') {
      return `<rect x="${draft.x * size.w}" y="${draft.y * size.h}" width="${draft.w * size.w}" height="${draft.h * size.h}"
        fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="${2 * k}" stroke-dasharray="${6 * k} ${4 * k}" pointer-events="none"/>`;
    }

    // Đa giác đang dở: các cạnh đã đặt (nét liền), cạnh nối tới con trỏ (nét đứt), các điểm
    const px = p => `${p[0] * size.w},${p[1] * size.h}`;
    const placed = draft.points.map(px).join(' ');
    const rubber = draft.points.length && draft.cursor
      ? `<polyline points="${px(draft.points[draft.points.length - 1])} ${px([draft.cursor.x, draft.cursor.y])} ${px(draft.points[0])}"
          fill="none" stroke="${color}" stroke-width="${1.5 * k}" stroke-dasharray="${6 * k} ${4 * k}" opacity="0.8"/>`
      : '';
    const dots = draft.points.map((p, i) => {
      const closable = i === 0 && draft.points.length >= 3;   // điểm đầu to hơn: bấm vào để đóng đa giác
      return `<circle cx="${p[0] * size.w}" cy="${p[1] * size.h}" r="${(closable ? 7 : 4) * k}" fill="${closable ? '#fff' : color}" stroke="${color}" stroke-width="${2 * k}"/>`;
    }).join('');
    return `<g pointer-events="none">
      <polyline points="${placed}" fill="none" stroke="${color}" stroke-width="${2 * k}" stroke-linejoin="round"/>${rubber}${dots}</g>`;
  }

  function render() {
    const k = 1 / view.zoom;
    const selected = findAnnotation(selectedUid);
    svg.innerHTML =
      annotations.map(a => shapeSvg(a, k)).join('') +
      (selected ? handlesSvg(selected, k) : '') +
      (draft ? draftSvg(k) : '');
  }


  /* ========================================================
     4. THÊM / SỬA / XOÁ / UNDO
     ======================================================== */

  function pushUndo(before) {
    undoStack.push(before);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    redoStack = [];
  }

  function changed(reason) {
    if (onChange) onChange(reason);
  }

  function select(uid) {
    if (selectedUid === uid) return;
    selectedUid = uid;
    render();
    if (onSelect) onSelect(uid);
  }

  function addAnnotation(item) {
    pushUndo(snapshot());
    const annotation = { uid: nextUid++, class_id: item.class_id, type: item.type, data: item.data };
    annotations.push(annotation);
    selectedUid = annotation.uid;
    render();
    if (onSelect) onSelect(annotation.uid);
    changed('create');
    return annotation.uid;
  }

  function deleteAnnotation(uid) {
    if (!findAnnotation(uid)) return;
    pushUndo(snapshot());
    annotations = annotations.filter(a => a.uid !== uid);
    if (selectedUid === uid) {
      selectedUid = null;
      if (onSelect) onSelect(null);
    }
    render();
    changed('delete');
  }

  function setClassOf(uid, classId) {
    const a = findAnnotation(uid);
    if (!a || a.class_id === classId) return;
    pushUndo(snapshot());
    a.class_id = classId;
    render();
    changed('class');
  }

  // Quay về 1 bản chụp (dùng cho undo / redo)
  function restore(json) {
    annotations = JSON.parse(json);
    if (selectedUid !== null && !findAnnotation(selectedUid)) {
      selectedUid = null;
      if (onSelect) onSelect(null);
    }
    render();
  }

  function undo() {
    if (!undoStack.length) return false;
    redoStack.push(snapshot());
    restore(undoStack.pop());
    changed('undo');
    return true;
  }

  function redo() {
    if (!redoStack.length) return false;
    undoStack.push(snapshot());
    restore(redoStack.pop());
    changed('redo');
    return true;
  }


  /* ========================================================
     5. THAO TÁC CHUỘT
     ======================================================== */

  function startPan(event) {
    gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, viewX: view.x, viewY: view.y };
    area.classList.add('panning');
  }

  function startBox(event) {
    if (currentClassId === null) {
      if (onNeedClass) onNeedClass();
      return;
    }
    const p = pointerToNorm(event);
    gesture = { type: 'box', start: p };
    draft = { type: 'bbox', x: p.x, y: p.y, w: 0, h: 0 };
  }

  // Đa giác: mỗi lần bấm thêm 1 điểm. Đóng bằng: bấm lại điểm đầu, bấm đúp, hoặc Enter.
  function addPolygonPoint(event) {
    if (currentClassId === null) {
      if (onNeedClass) onNeedClass();
      return;
    }
    const p = pointerToNorm(event);
    if (!draft) draft = { type: 'polygon', points: [], cursor: p };

    const near = (a, b, pixels) => Math.hypot((a[0] - b[0]) * size.w, (a[1] - b[1]) * size.h) * view.zoom <= pixels;
    if (draft.points.length >= 3 && near([p.x, p.y], draft.points[0], CLOSE_RADIUS)) {
      finishPolygon();
      return;
    }
    const last = draft.points[draft.points.length - 1];
    if (last && near([p.x, p.y], last, 2)) return;   // cú bấm thứ 2 của bấm đúp rơi trùng điểm vừa đặt
    draft.points.push([p.x, p.y]);
    render();
  }

  function finishPolygon() {
    if (!draft || draft.type !== 'polygon') return;
    const points = draft.points;
    if (points.length < 3) {
      say('A polygon needs at least 3 points');
      return;
    }
    draft = null;
    if (polygonArea(points) < MIN_POLYGON_AREA) {
      say('That polygon is too small or flat. Try again.');
      render();
      return;
    }
    addAnnotation({ class_id: currentClassId, type: 'polygon', data: { points } });
  }

  // Tự nhận biết "bấm đúp" từ 2 lần nhấn chuột liên tiếp (gần nhau về thời gian và vị trí).
  // Không dùng sự kiện dblclick của trình duyệt vì ta vẽ lại SVG ngay khi nhấn chuột, nên trình duyệt không ghép được thành 1 cú bấm.
  let lastDown = { time: 0, x: 0, y: 0 };
  function isDoubleClick(event) {
    const quick = event.timeStamp - lastDown.time < 400;
    const close = Math.hypot(event.clientX - lastDown.x, event.clientY - lastDown.y) < 6;
    lastDown = quick && close ? { time: 0, x: 0, y: 0 } : { time: event.timeStamp, x: event.clientX, y: event.clientY };
    return quick && close;
  }

  // Xử lý bấm đúp. Trả về true nếu đã dùng cú bấm đó.
  //   công cụ Polygon: đóng đa giác
  //   công cụ Select, đang chọn đa giác: bấm đúp vào đỉnh = xoá đỉnh, vào cạnh = thêm đỉnh tại đó
  function handleDoubleClick(event) {
    if (tool === 'polygon') {
      if (!draft) return false;
      finishPolygon();
      return true;
    }
    const selected = findAnnotation(selectedUid);
    const target = document.elementFromPoint(event.clientX, event.clientY) || event.target;   // phần tử nằm dưới con trỏ
    if (tool !== 'select' || !selected || selected.type !== 'polygon' || !svg.contains(target)) return false;

    const vertex = target.closest('[data-vertex]');
    if (vertex) {
      if (selected.data.points.length <= 3) {
        say('A polygon needs at least 3 points');
        return true;
      }
      pushUndo(snapshot());
      selected.data.points.splice(Number(vertex.dataset.vertex), 1);
      render();
      changed('edit');
      return true;
    }
    if (target.closest('[data-uid]')) {
      // Tìm cạnh gần chỗ bấm nhất rồi chèn 1 đỉnh mới vào đúng điểm gần nhất trên cạnh đó
      const p = pointerToNorm(event);
      const pts = selected.data.points;
      let best = { distance: Infinity, index: 0, point: null };
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const abx = (b[0] - a[0]) * size.w, aby = (b[1] - a[1]) * size.h;
        const apx = (p.x - a[0]) * size.w, apy = (p.y - a[1]) * size.h;
        const t = clamp((apx * abx + apy * aby) / ((abx * abx + aby * aby) || 1), 0, 1);
        const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const distance = Math.hypot((p.x - point[0]) * size.w, (p.y - point[1]) * size.h);
        if (distance < best.distance) best = { distance, index: i, point };
      }
      pushUndo(snapshot());
      pts.splice(best.index + 1, 0, best.point);
      render();
      changed('edit');
      return true;
    }
    return false;
  }

  function startSelect(event) {
    const handle = event.target.closest('[data-handle]');
    const vertex = event.target.closest('[data-vertex]');
    const shape = event.target.closest('[data-uid]');
    const selected = findAnnotation(selectedUid);

    if (vertex && selected && selected.type === 'polygon') {        // kéo 1 đỉnh của đa giác
      gesture = { type: 'vertex', uid: selected.uid, index: Number(vertex.dataset.vertex), before: snapshot(), original: clone(selected.data) };
    } else if (handle && selected && selected.type === 'bbox') {    // kéo núm để đổi kích thước hộp
      gesture = { type: 'resize', uid: selected.uid, handle: handle.dataset.handle, original: clone(selected.data), before: snapshot() };
    } else if (shape) {                                              // bấm vào hình: chọn rồi sẵn sàng kéo đi
      const uid = Number(shape.dataset.uid);
      select(uid);
      gesture = { type: 'move', uid, start: pointerToNorm(event, false), original: clone(findAnnotation(uid).data), before: snapshot() };
    } else {                                                         // bấm chỗ trống: bỏ chọn, kéo thì cuộn ảnh
      select(null);
      startPan(event);
    }
  }

  function onPointerDown(event) {
    if (event.target.closest('.canvas-hint, .zoom-control')) return;   // các nút nổi trên canvas tự xử lý
    if (event.button === 2) return;

    const onImage = svg.contains(event.target);
    if (event.button === 0 && onImage && isDoubleClick(event) && handleDoubleClick(event)) {
      event.preventDefault();
      return;
    }
    if (event.button === 1 || panOverride || tool === 'pan') {
      startPan(event);
    } else if (tool === 'zoom') {
      zoomAt(event.clientX, event.clientY, view.zoom * (event.shiftKey || event.altKey ? 1 / 1.5 : 1.5));
      return;
    } else if (!onImage) {
      if (tool === 'select') startPan(event);
    } else if (tool === 'bbox') {
      startBox(event);
    } else if (tool === 'polygon') {
      addPolygonPoint(event);
    } else if (tool === 'select') {
      startSelect(event);
    }

    if (gesture) {
      event.preventDefault();
      area.setPointerCapture(event.pointerId);   // vẫn nhận chuột khi kéo ra ngoài khung ảnh
      render();
    }
  }

  // Dịch chuyển hình theo (dx, dy) nhưng không để lọt ra ngoài ảnh
  function moveShape(gestureData, dx, dy) {
    const a = findAnnotation(gestureData.uid);
    const original = gestureData.original;
    const b = boundsOf({ type: a.type, data: original });
    dx = clamp(dx, -b.x1, 1 - b.x2);
    dy = clamp(dy, -b.y1, 1 - b.y2);
    if (a.type === 'bbox') {
      a.data = { ...original, x: original.x + dx, y: original.y + dy };
    } else {
      a.data = { points: original.points.map(p => [p[0] + dx, p[1] + dy]) };
    }
  }

  // Kéo 1 núm của hộp: cạnh được kéo đi theo con trỏ, cạnh đối diện đứng yên (kéo qua thì hộp lật lại)
  function resizeBox(gestureData, p) {
    const o = gestureData.original;
    let x1 = o.x, y1 = o.y, x2 = o.x + o.w, y2 = o.y + o.h;
    if (gestureData.handle.includes('w')) x1 = p.x;
    if (gestureData.handle.includes('e')) x2 = p.x;
    if (gestureData.handle.includes('n')) y1 = p.y;
    if (gestureData.handle.includes('s')) y2 = p.y;
    const x = Math.min(x1, x2), y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
    if (w < MIN_BOX || h < MIN_BOX) return;   // quá nhỏ: giữ nguyên kích thước hợp lệ gần nhất
    findAnnotation(gestureData.uid).data = { x, y, w, h };
  }

  function onPointerMove(event) {
    if (!gesture) {
      if (draft && draft.type === 'polygon') {     // đang vẽ đa giác: cạnh nét đứt chạy theo con trỏ
        draft.cursor = pointerToNorm(event);
        scheduleRender();
      }
      return;
    }
    if (gesture.type === 'pan') {
      view.x = gesture.viewX + (event.clientX - gesture.startX);
      view.y = gesture.viewY + (event.clientY - gesture.startY);
      applyView();
      return;
    }
    const p = pointerToNorm(event);
    if (gesture.type === 'box') {
      draft = { type: 'bbox', x: Math.min(gesture.start.x, p.x), y: Math.min(gesture.start.y, p.y),
                w: Math.abs(p.x - gesture.start.x), h: Math.abs(p.y - gesture.start.y) };
    } else if (gesture.type === 'move') {
      const q = pointerToNorm(event, false);
      moveShape(gesture, q.x - gesture.start.x, q.y - gesture.start.y);
    } else if (gesture.type === 'resize') {
      resizeBox(gesture, p);
    } else if (gesture.type === 'vertex') {
      findAnnotation(gesture.uid).data.points[gesture.index] = [p.x, p.y];
    }
    render();
  }

  function onPointerUp(event) {
    if (!gesture) return;
    const finished = gesture;
    gesture = null;
    area.classList.remove('panning');
    try { area.releasePointerCapture(event.pointerId); } catch (e) { /* đã được trả rồi */ }

    if (finished.type === 'box') {
      const box = draft;
      draft = null;
      if (box.w >= MIN_BOX && box.h >= MIN_BOX) {
        addAnnotation({ class_id: currentClassId, type: 'bbox', data: { x: box.x, y: box.y, w: box.w, h: box.h } });
      } else {
        render();
      }
    } else if (finished.type === 'move' || finished.type === 'resize' || finished.type === 'vertex') {
      const a = findAnnotation(finished.uid);
      if (finished.type === 'vertex' && polygonArea(a.data.points) < MIN_POLYGON_AREA) {
        a.data = finished.original;              // kéo đỉnh làm đa giác bẹp dí: trả về như cũ
        say('That would flatten the polygon, so the point went back');
      }
      if (snapshot() !== finished.before) {        // chỉ tính là 1 lần sửa nếu hình thật sự đổi
        pushUndo(finished.before);
        changed('edit');
      }
      render();
    }
  }

  function onWheel(event) {
    event.preventDefault();   // không cho trang cuộn, dùng con lăn để zoom
    const speed = event.ctrlKey ? 0.01 : 0.0015;   // chụm 2 ngón trên touchpad gửi wheel kèm Ctrl
    zoomAt(event.clientX, event.clientY, view.zoom * Math.exp(-event.deltaY * speed));
  }

  area.addEventListener('pointerdown', onPointerDown);
  area.addEventListener('pointermove', onPointerMove);
  area.addEventListener('pointerup', onPointerUp);
  area.addEventListener('pointercancel', onPointerUp);
  area.addEventListener('wheel', onWheel, { passive: false });


  /* ========================================================
     6. PHÍM TẮT
     ======================================================== */

  // Trả về true nếu phím đã được xử lý ở đây (bên ngoài nên preventDefault)
  function handleKey(event) {
    const key = event.key;
    const mod = event.ctrlKey || event.metaKey;

    if (mod && key.toLowerCase() === 'z') {
      if (event.shiftKey) redo(); else undo();
      return true;
    }
    if (mod && key.toLowerCase() === 'y') {
      redo();
      return true;
    }
    if (mod || event.altKey) return false;

    if (key === ' ') {                       // giữ Space + kéo chuột = cuộn ảnh
      panOverride = true;
      area.classList.add('pan-ready');
      return true;
    }
    if (key === 'Escape') {
      if (draft || gesture) {
        gesture = null;
        draft = null;
        area.classList.remove('panning');
        render();
      } else {
        select(null);
      }
      return true;
    }
    if (key === 'Enter' && draft && draft.type === 'polygon') {
      finishPolygon();
      return true;
    }
    if (key === 'Backspace' && draft && draft.type === 'polygon') {   // bỏ điểm vừa đặt
      draft.points.pop();
      if (draft.points.length === 0) draft = null;
      render();
      return true;
    }
    if ((key === 'Delete' || key === 'Backspace') && selectedUid !== null) {
      deleteAnnotation(selectedUid);
      return true;
    }
    return false;
  }

  function handleKeyUp(event) {
    if (event.key === ' ') releasePanOverride();
  }

  function releasePanOverride() {
    panOverride = false;
    area.classList.remove('pan-ready');
  }


  /* ========================================================
     7. CÁC HÀM CÔNG KHAI
     ======================================================== */

  function setTool(name) {
    tool = name;
    gesture = null;
    draft = null;
    area.classList.remove('panning', 'tool-select', 'tool-bbox', 'tool-polygon', 'tool-pan', 'tool-zoom');
    area.classList.add(`tool-${name}`);
    render();
  }
  setTool('select');

  return {
    // Dữ liệu
    load(list) {                               // nạp danh sách annotation của 1 ảnh (xoá lịch sử undo)
      annotations = list.map(item => ({ uid: nextUid++, class_id: item.class_id, type: item.type, data: clone(item.data) }));
      selectedUid = null;
      draft = null;
      gesture = null;
      undoStack = [];
      redoStack = [];
      render();
      if (onSelect) onSelect(null);
    },
    list: () => clone(annotations),             // có uid, để vẽ danh sách bên phải
    toPayload: () => annotations.map(({ class_id, type, data }) => clone({ class_id, type, data })),   // để gửi lên server
    // Chọn & sửa
    select,
    getSelected: () => selectedUid,
    setHover(uid) { hoverUid = uid; render(); },
    deleteAnnotation,
    setClassOf,
    undo,
    redo,
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    // Công cụ & class
    setTool,
    getTool: () => tool,
    setCurrentClass(id) { currentClassId = id; },
    // Khung nhìn
    zoomBy,
    resetView,
    resize,
    getZoom: () => view.zoom,
    // Phím
    handleKey,
    handleKeyUp,
    releasePanOverride,
  };
}
