/* Test cho frontend/js/gpu.js (phần phân loại, không cần trình duyệt).
   Chạy:  node frontend/tests/test_gpu.js   (thoát với mã khác 0 nếu có test hỏng) */

const assert = require('assert');
const { cleanRenderer, classifyGpu, gpuDisplayName, isMaskedRenderer, gpuNameNote } = require('../js/gpu.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok   ' + name); }
  catch (error) { console.error('FAIL ' + name + '\n     ' + error.message); process.exitCode = 1; }
}

// ---- làm gọn tên card ----
test('ANGLE + Direct3D (Windows, NVIDIA)', () => assert.strictEqual(
  cleanRenderer('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'NVIDIA GeForce RTX 3060'));
test('ANGLE + Intel với mã thiết bị', () => assert.strictEqual(
  cleanRenderer('ANGLE (Intel, Intel(R) UHD Graphics 630 (0x00003E9B) Direct3D11 vs_5_0 ps_5_0, D3D11)'), 'Intel(R) UHD Graphics 630'));
test('ANGLE + OpenGL (Linux)', () => assert.strictEqual(
  cleanRenderer('ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650/PCIe/SSE2, OpenGL 4.5.0)'), 'NVIDIA GeForce GTX 1650'));
test('driver NVIDIA trên Linux (Firefox)', () => assert.strictEqual(cleanRenderer('NVIDIA GeForce RTX 3060/PCIe/SSE2'), 'NVIDIA GeForce RTX 3060'));
test('ANGLE + Vulkan (SwiftShader)', () => assert.strictEqual(
  cleanRenderer('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), 'SwiftShader Device (Subzero)'));
test('ANGLE + Vulkan (AMD)', () => assert.strictEqual(
  cleanRenderer('ANGLE (AMD, Vulkan 1.3.255 (AMD Radeon RX 6700 XT (RADV NAVI22)), radv)'), 'AMD Radeon RX 6700 XT (RADV NAVI22)'));
test('Apple giữ nguyên', () => assert.strictEqual(cleanRenderer('Apple M2 Pro'), 'Apple M2 Pro'));
test('Mesa giữ nguyên', () => assert.strictEqual(cleanRenderer('Mesa Intel(R) Xe Graphics (TGL GT2)'), 'Mesa Intel(R) Xe Graphics (TGL GT2)'));
test('rỗng / null', () => { assert.strictEqual(cleanRenderer(''), ''); assert.strictEqual(cleanRenderer(null), ''); assert.strictEqual(cleanRenderer(undefined), ''); });
test('không bị lừa bởi chữ giống thẻ HTML (chỉ là chuỗi)', () => assert.strictEqual(cleanRenderer('<img src=x onerror=1>'), '<img src=x onerror=1>'));

// ---- kết luận ----
const gl = renderer => ({ version: 2, renderer, vendor: 'x', hidden: false });
const gpuOk = { supported: true, fallback: false, description: 'NVIDIA GeForce RTX 3060' };

test('WebGPU thật → webgpu', () => assert.strictEqual(classifyGpu({ webgl: gl('ANGLE (NVIDIA, RTX 3060, D3D11)'), webgpu: gpuOk }).level, 'webgpu'));
test('chỉ WebGL, card thật → webgl', () => assert.strictEqual(classifyGpu({ webgl: gl('Apple M2'), webgpu: { supported: false } }).level, 'webgl'));
test('không có WebGPU API (webgpu = null) → webgl', () => assert.strictEqual(classifyGpu({ webgl: gl('Apple M2'), webgpu: null }).level, 'webgl'));
test('SwiftShader → software', () => assert.strictEqual(classifyGpu({ webgl: gl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'), webgpu: { supported: false } }).level, 'software'));
test('llvmpipe → software', () => assert.strictEqual(classifyGpu({ webgl: gl('llvmpipe (LLVM 15.0.7, 256 bits)'), webgpu: null }).level, 'software'));
test('Microsoft Basic Render Driver → software', () => assert.strictEqual(classifyGpu({ webgl: gl('ANGLE (Microsoft, Microsoft Basic Render Driver Direct3D11, D3D11)'), webgpu: null }).level, 'software'));
test('adapter WebGPU "dự phòng" (chạy bằng CPU) không tính là GPU thật → software', () => assert.strictEqual(
  classifyGpu({ webgl: gl('Apple M2'), webgpu: { supported: true, fallback: true } }).level, 'software'));
test('WebGPU thật thắng cả khi WebGL báo phần mềm', () => assert.strictEqual(
  classifyGpu({ webgl: gl('llvmpipe'), webgpu: gpuOk }).level, 'webgpu'));
test('không WebGL, không WebGPU → none', () => assert.strictEqual(classifyGpu({ webgl: null, webgpu: { supported: false } }).level, 'none'));
test('thiếu dữ liệu hoàn toàn không làm hỏng', () => { assert.strictEqual(classifyGpu({}).level, 'none'); assert.strictEqual(classifyGpu(null).level, 'none'); });
test('mọi kết luận đều có tiêu đề và mô tả', () => {
  for (const info of [{ webgl: gl('Apple M2'), webgpu: gpuOk }, { webgl: gl('Apple M2') }, { webgl: gl('llvmpipe') }, {}]) {
    const v = classifyGpu(info); assert.ok(v.title && v.detail && v.level);
  }
});

// ---- tên hiển thị ----
test('tên: ưu tiên tên WebGL của card thật', () => assert.strictEqual(
  gpuDisplayName({ webgl: gl('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'), webgpu: gpuOk }), 'NVIDIA GeForce RTX 3060'));
test('tên: trình duyệt thật (WebGPU chỉ có hãng + kiến trúc) vẫn ra đúng RTX 3060', () => assert.strictEqual(
  gpuDisplayName({ webgl: gl('NVIDIA GeForce RTX 3060/PCIe/SSE2'), webgpu: { supported: true, fallback: false, vendor: 'nvidia', architecture: 'ampere', description: '' } }), 'NVIDIA GeForce RTX 3060'));
test('tên: WebGPU có mô tả mà WebGL bị ẩn', () => assert.strictEqual(
  gpuDisplayName({ webgl: { version: 2, renderer: null, hidden: true }, webgpu: gpuOk }), 'NVIDIA GeForce RTX 3060'));
test('tên: WebGL là phần mềm thì dùng WebGPU thật', () => assert.strictEqual(
  gpuDisplayName({ webgl: gl('llvmpipe (LLVM 15.0.7, 256 bits)'), webgpu: gpuOk }), 'NVIDIA GeForce RTX 3060'));
test('tên: ghép hãng + kiến trúc khi không có WebGL lẫn mô tả', () => assert.strictEqual(
  gpuDisplayName({ webgl: null, webgpu: { supported: true, fallback: false, vendor: 'nvidia', architecture: 'ampere', description: '' } }), 'NVIDIA (ampere)'));
test('tên: hãng lạ giữ nguyên', () => assert.strictEqual(
  gpuDisplayName({ webgl: null, webgpu: { supported: true, fallback: false, vendor: 'acme', architecture: '', description: '' } }), 'acme'));
test('tên: WebGL phần mềm mà không có gì khác thì vẫn hiện tên đó', () => assert.strictEqual(
  gpuDisplayName({ webgl: gl('llvmpipe (LLVM 15.0.7, 256 bits)'), webgpu: { supported: false } }), 'llvmpipe (LLVM 15.0.7, 256 bits)'));
test('tên: lấy từ WebGL khi không có WebGPU', () => assert.strictEqual(
  gpuDisplayName({ webgl: gl('ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'), webgpu: { supported: false } }), 'Intel(R) UHD Graphics 630'));
test('tên: trình duyệt ẩn thông tin', () => assert.strictEqual(
  gpuDisplayName({ webgl: { version: 1, renderer: null, hidden: true }, webgpu: null }), 'Hidden by your browser'));
test('tên: không phát hiện được', () => assert.strictEqual(gpuDisplayName({ webgl: null, webgpu: null }), 'Not detected'));

// ---- Firefox báo tên card chung chung ----
const masked = (name, extra) => Object.assign({ webgl: { version: 2, renderer: name, hidden: false }, webgpu: { supported: false } }, extra);
test('nhận ra tên bị che', () => {
  assert.ok(isMaskedRenderer('NVIDIA GeForce GTX 980, or similar'));
  assert.ok(isMaskedRenderer('Intel(R) HD Graphics, or similar'));
  assert.ok(!isMaskedRenderer('NVIDIA GeForce RTX 3060/PCIe/SSE2'));
  assert.ok(!isMaskedRenderer('') && !isMaskedRenderer(null));
});
test('tên bị che: không hiện "GTX 980" như thật mà nói model bị giấu', () => assert.strictEqual(
  gpuDisplayName(masked('NVIDIA GeForce GTX 980, or similar')), 'NVIDIA (exact model hidden by the browser)'));
test('tên bị che + WebGPU có kiến trúc → dùng thông tin thật của WebGPU', () => assert.strictEqual(
  gpuDisplayName(masked('NVIDIA GeForce GTX 980, or similar', { webgpu: { supported: true, fallback: false, vendor: 'nvidia', architecture: 'ampere', description: '' } })), 'NVIDIA (ampere)'));
test('tên bị che + WebGPU có mô tả → dùng mô tả', () => assert.strictEqual(
  gpuDisplayName(masked('NVIDIA GeForce GTX 980, or similar', { webgpu: gpuOk })), 'NVIDIA GeForce RTX 3060'));
test('tên bị che vẫn kết luận là có GPU thật (webgl)', () => assert.strictEqual(classifyGpu(masked('NVIDIA GeForce GTX 980, or similar')).level, 'webgl'));
test('ghi chú: có khi tên bị che, rỗng khi tên thật', () => {
  assert.ok(/privacy/.test(gpuNameNote(masked('NVIDIA GeForce GTX 980, or similar'))));
  assert.strictEqual(gpuNameNote(masked('NVIDIA GeForce RTX 3060/PCIe/SSE2')), '');
  assert.strictEqual(gpuNameNote(masked('NVIDIA GeForce GTX 980, or similar', { webgpu: gpuOk })), '');   // đã có tên thật từ WebGPU
  assert.ok(gpuNameNote({ webgl: { version: 1, renderer: null, hidden: true }, webgpu: null }).length > 0);
});

console.log(`\n${passed} tests passed` + (process.exitCode ? ' (có test hỏng)' : ''));
