'use strict';

const path = require('path');

/**
 * mergePdf'in "output" yolunu doğrular (SIG-009). Renderer'dan gelen yola körü körüne güvenilmez:
 * yalnızca ana süreçte onaylanmış bir yol (approved; ör. kayıt diyaloğu sonucu) ya da kullanıcının
 * seçtiği çıktı klasörünün doğrudan içindeki bir dosya kabul edilir. Aksi halde undefined döner ve
 * çağıran varsayılan adlandırmaya düşer.
 */
function trustedOutputPath(output, { outputDir = null, approved = new Set() } = {}) {
  if (typeof output !== 'string' || !output || output.includes('\0')) return undefined;
  if (!path.isAbsolute(output)) return undefined;
  const resolved = path.resolve(output);
  if (approved.has(resolved)) return resolved;
  if (!outputDir || !path.isAbsolute(outputDir)) return undefined;
  const rel = path.relative(path.resolve(outputDir), resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep) || rel.includes('/')) return undefined;
  return resolved;
}

/**
 * Oturum izinleri (SIG-007): uygulama hiçbir tarayıcı iznine (bildirim, konum, kamera, mikrofon,
 * pano, MIDI, HID/USB/seri…) ihtiyaç duymaz; hepsi varsayılan olarak reddedilir.
 */
function denyAllPermissions(session) {
  session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  session.setPermissionCheckHandler(() => false);
  if (typeof session.setDevicePermissionHandler === 'function') session.setDevicePermissionHandler(() => false);
  if (typeof session.setDisplayMediaRequestHandler === 'function') {
    session.setDisplayMediaRequestHandler((_req, callback) => callback({}));
  }
}

module.exports = { trustedOutputPath, denyAllPermissions };
