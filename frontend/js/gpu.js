/* ==========================================================
   gpu.js — phát hiện GPU của máy đang mở web
   ----------------------------------------------------------
   Chạy HOÀN TOÀN trong trình duyệt, không gửi gì lên server.
   Dùng để biết máy có chạy được model AI ngay trong trình duyệt không
   (WebGPU nhanh, WebGL chậm hơn, render bằng phần mềm thì rất chậm).

   Có 3 phần:
     1. detectGpu()     đọc thông tin từ trình duyệt (WebGL, WebGPU, CPU, RAM)
     2. classifyGpu()   từ thông tin đó kết luận: webgpu / webgl / software / none
     3. cleanRenderer() làm gọn tên card, vd "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 ...)"

   Phần 2 và 3 là hàm thuần (không đụng trình duyệt) nên test được bằng Node:
     node frontend/tests/test_gpu.js
   File này cố ý viết bằng cú pháp đơn giản (không dùng ?. và ??) để chạy được cả trên Node cũ.
   ========================================================== */

// Chuỗi tên GPU cho thấy đang render bằng CPU chứ không phải card thật
var SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|microsoft basic|\bwarp\b/i;


/* ----------------------------------------------------------
   3. Làm gọn tên card
   ---------------------------------------------------------- */

// Trình duyệt hay trả về dạng dài "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)".
// Hàm này giữ lại phần tên card: "NVIDIA GeForce RTX 3060".
function cleanRenderer(raw) {
  if (!raw) return '';
  var text = String(raw).trim();
  var angle = text.match(/^ANGLE \((.*)\)$/);
  if (angle) {
    var parts = angle[1].split(', ');
    text = parts.length > 1 ? parts[1] : parts[0];   // [hãng, tên card, backend]
  }
  return text
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')                       // mã thiết bị
    .replace(/\s+Direct3D\w*/gi, '')
    .replace(/\s+(vs|ps)_\d_\d/gi, '')
    .replace(/\s+OpenGL( ES)?[\d. ]*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


/* ----------------------------------------------------------
   2. Kết luận
   ---------------------------------------------------------- */

// info có dạng: { webgl: {version, renderer, ...} | null, webgpu: {supported, fallback, ...} | null }
// Trả về { level, title, detail }
function classifyGpu(info) {
  var webgl = info && info.webgl;
  var webgpu = info && info.webgpu;
  var webgpuReal = !!(webgpu && webgpu.supported && !webgpu.fallback);
  var software = !!(webgl && SOFTWARE_RENDERER.test(String(webgl.renderer || ''))) ||
                 !!(webgpu && webgpu.supported && webgpu.fallback);

  if (webgpuReal) {
    return {
      level: 'webgpu',
      title: 'Ready for in-browser models',
      detail: 'WebGPU is available, so AI models can run on your GPU inside the browser.',
    };
  }
  if (software) {
    return {
      level: 'software',
      title: 'No hardware GPU in use',
      detail: 'The browser is drawing with software rendering (on the CPU). In-browser models would be very slow. ' +
              'Check your graphics driver and that hardware acceleration is turned on in the browser settings.',
    };
  }
  if (webgl) {
    return {
      level: 'webgl',
      title: 'GPU available through WebGL',
      detail: 'Models can run through WebGL, which is slower than WebGPU. A newer browser may add WebGPU.',
    };
  }
  return {
    level: 'none',
    title: 'No GPU acceleration',
    detail: 'This browser offers neither WebGL nor WebGPU.',
  };
}

// Tên card để hiển thị: ưu tiên mô tả của WebGPU, rồi tới tên WebGL, không có thì báo bị ẩn
function gpuDisplayName(info) {
  var webgpu = info && info.webgpu;
  var webgl = info && info.webgl;
  var fromWebgpu = webgpu && webgpu.supported ? (webgpu.description || [webgpu.vendor, webgpu.architecture].filter(Boolean).join(' ')) : '';
  if (fromWebgpu && !webgpu.fallback) return fromWebgpu;
  if (webgl && webgl.renderer) return cleanRenderer(webgl.renderer);
  if (webgl && webgl.hidden) return 'Hidden by your browser';
  return 'Not detected';
}


/* ----------------------------------------------------------
   1. Đọc thông tin từ trình duyệt
   ---------------------------------------------------------- */

function readWebgl() {
  try {
    var canvas = document.createElement('canvas');
    var gl2 = canvas.getContext('webgl2');
    var gl = gl2 || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return null;
    // Tên card thật nằm trong extension này; một số trình duyệt (Firefox bật chống theo dõi, Brave) chặn nó
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      version: gl2 ? 2 : 1,
      vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
      renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
      hidden: !ext,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    };
  } catch (e) {
    return null;
  }
}

async function readWebgpu() {
  if (!navigator.gpu) return { supported: false, reason: 'This browser has no WebGPU' };
  try {
    // Có máy treo mãi khi xin adapter, nên giới hạn 3 giây
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve('timeout'); }, 3000); });
    var adapter = await Promise.race([navigator.gpu.requestAdapter(), timeout]);
    if (adapter === 'timeout') return { supported: false, reason: 'The browser took too long to answer' };
    if (!adapter) return { supported: false, reason: 'No WebGPU adapter was found' };

    var details = adapter.info || null;                              // cách mới
    if (!details && adapter.requestAdapterInfo) details = await adapter.requestAdapterInfo();   // cách cũ
    details = details || {};
    return {
      supported: true,
      fallback: !!adapter.isFallbackAdapter,    // true = card "giả" chạy bằng CPU
      vendor: details.vendor || '',
      architecture: details.architecture || '',
      description: details.description || details.device || '',
      maxBufferMb: adapter.limits && adapter.limits.maxBufferSize ? Math.round(adapter.limits.maxBufferSize / 1048576) : null,
    };
  } catch (e) {
    return { supported: false, reason: String(e && e.message ? e.message : e) };
  }
}

// Gom mọi thông tin. Không bao giờ ném lỗi: cái gì không đọc được thì để trống.
async function detectGpu() {
  var info = {
    webgl: readWebgl(),
    webgpu: await readWebgpu(),
    threads: navigator.hardwareConcurrency || null,
    memoryGb: navigator.deviceMemory || null,   // chỉ Chrome / Edge có, và là số làm tròn
  };
  info.verdict = classifyGpu(info);
  info.name = gpuDisplayName(info);
  return info;
}

// Để test bằng Node (trình duyệt không có "module" nên dòng này bị bỏ qua)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanRenderer: cleanRenderer, classifyGpu: classifyGpu, gpuDisplayName: gpuDisplayName };
}
