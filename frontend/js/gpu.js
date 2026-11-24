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

// Các trình duyệt chống theo dõi cố ý báo tên card CHUNG CHUNG, không phải card thật của người dùng:
//   Firefox: "NVIDIA GeForce GTX 980, or similar" (dù máy thật là RTX 3060)
//   Brave:   "Brave"            (Brave Shields)
//   Safari:  "Apple GPU"
// Tên kiểu này không được hiện như thật.
var GENERIC_RENDERER = /^(brave|apple gpu)$/i;
function isFirefoxMasked(raw) { return /, or similar$/i.test(String(raw || '').trim()); }
function isMaskedRenderer(raw) {
  return isFirefoxMasked(raw) || GENERIC_RENDERER.test(String(raw || '').trim());
}

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
    .replace(/^Vulkan [\d.]+ \((.*)\)$/, '$1')                   // "Vulkan 1.3.0 (Tên card)" → "Tên card"
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')                       // mã thiết bị
    .replace(/\/(PCIe|PCI|SSE2)\b/gi, '')                      // "…RTX 3060/PCIe/SSE2" (driver NVIDIA trên Linux)
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

var VENDOR_NAMES = { nvidia: 'NVIDIA', amd: 'AMD', intel: 'Intel', apple: 'Apple', arm: 'Arm', qualcomm: 'Qualcomm' };
var MASKED_SUFFIX = ' (exact model hidden by the browser)';

// Tên card để hiển thị. Thứ tự ưu tiên (tên đầy đủ nhất trước):
//   1. tên WebGL của card thật, vd "NVIDIA GeForce RTX 3060"
//   2. mô tả của WebGPU, nếu có (trình duyệt thật thường để trống)
//   3. hãng + kiến trúc của WebGPU, vd "NVIDIA (ampere)"  (WebGPU thường chỉ cho thông tin này, không có tên model)
//   4. nếu trình duyệt báo tên chung chung (Firefox): chỉ nói hãng và rằng model bị giấu
//   5. tên WebGL của card "phần mềm", vd SwiftShader
function gpuDisplayName(info) {
  var webgpu = info && info.webgpu;
  var webgl = info && info.webgl;
  var rawName = webgl && webgl.renderer ? webgl.renderer : '';
  var webglName = rawName ? cleanRenderer(rawName) : '';
  var masked = isMaskedRenderer(rawName);
  var realWebgl = webglName && !masked && !SOFTWARE_RENDERER.test(webglName);
  var realWebgpu = webgpu && webgpu.supported && !webgpu.fallback;

  if (realWebgl) return webglName;
  if (realWebgpu && webgpu.description) return webgpu.description;
  if (realWebgpu && (webgpu.vendor || webgpu.architecture)) {
    var vendor = VENDOR_NAMES[String(webgpu.vendor).toLowerCase()] || webgpu.vendor;
    return vendor && webgpu.architecture ? vendor + ' (' + webgpu.architecture + ')' : (vendor || webgpu.architecture);
  }
  if (masked && isFirefoxMasked(rawName)) return webglName.split(' ')[0] + MASKED_SUFFIX;   // chỉ chắc chắn về hãng (chữ đầu của tên)
  if (masked) return 'Hidden by your browser';                                                // Brave, Safari: tên chẳng nói gì
  if (webglName) return webglName;
  if (webgl && webgl.hidden) return 'Hidden by your browser';
  return 'Not detected';
}

// Câu giải thích hiện dưới dòng GPU khi tên card không đáng tin (rỗng nếu không cần)
function gpuNameNote(info) {
  var name = gpuDisplayName(info);
  var raw = info && info.webgl && info.webgl.renderer ? String(info.webgl.renderer).trim() : '';
  var general = 'Your browser hides the exact GPU model from websites on purpose, as a privacy protection. ';
  if (name.slice(-MASKED_SUFFIX.length) === MASKED_SUFFIX) {        // Firefox
    return general + 'Chrome and Edge show it by default. In Firefox this is the webgl.sanitize-unmasked-renderer setting in about:config.';
  }
  if (/^brave$/i.test(raw)) {
    return general + 'In Brave this comes from Shields: lowering the fingerprinting protection for this site should reveal it. Chrome and Edge show it by default.';
  }
  if (name === 'Hidden by your browser') {
    return general + 'Chrome and Edge show it by default.';
  }
  return '';
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
      masked: !!ext && isMaskedRenderer(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)),
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
  info.nameNote = gpuNameNote(info);
  return info;
}

// Để test bằng Node (trình duyệt không có "module" nên dòng này bị bỏ qua)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { cleanRenderer: cleanRenderer, classifyGpu: classifyGpu, gpuDisplayName: gpuDisplayName,
                     isMaskedRenderer: isMaskedRenderer, gpuNameNote: gpuNameNote };
}
