'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Komut satırından gelen dosya yollarını çıkarır.
 * - "--files a.jpg b.pdf" (sağ tık menüsü) veya "--files=a.jpg"
 * - Paketlenmiş uygulamada --files olmadan verilen dosya yolları (exe'ye sürükle-bırak)
 * Chromium anahtarları (--xyz) argümanların arasına/önüne karışabildiği için
 * bayrak olmayan ve gerçekten var olan dosyalar alınır.
 */
function parseFilesFromArgv(argv, { cwd = process.cwd(), packaged = false, skip = [] } = {}) {
  const args = Array.isArray(argv) ? argv.slice(1) : [];
  const hasFiles = args.some((a) => a === '--files' || a.startsWith('--files='));
  if (!hasFiles && !packaged) return [];
  const skipSet = new Set(skip.filter(Boolean).map((p) => path.resolve(p)));
  const out = [];
  for (const a of args) {
    let candidate = null;
    if (a.startsWith('--files=')) candidate = a.slice('--files='.length);
    else if (a.startsWith('-')) continue;
    else candidate = a;
    if (!candidate) continue;
    const abs = path.resolve(cwd, candidate);
    if (skipSet.has(abs)) continue;
    try {
      if (fs.statSync(abs).isFile() && !out.includes(abs)) out.push(abs);
    } catch (_) { /* yok say */ }
  }
  return out;
}

module.exports = { parseFilesFromArgv };
