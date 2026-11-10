'use strict';

const fs = require('fs');
const path = require('path');

const BUILTIN_PATH = path.join(__dirname, 'profiles.json');

function validProfile(p) {
  return p && typeof p.id === 'string' && ['image', 'pdf', 'video'].includes(p.kind) &&
    p.name && typeof p.name === 'object' && Number(p.maxBytes) > 0 &&
    ['jpg', 'png', 'pdf', 'mp4'].includes(p.format);
}

function normalize(p) {
  const name = typeof p.name === 'string' ? { tr: p.name, en: p.name } : { tr: p.name.tr || p.name.en, en: p.name.en || p.name.tr };
  const note = !p.note ? { tr: '', en: '' } : typeof p.note === 'string' ? { tr: p.note, en: p.note } : { tr: p.note.tr || '', en: p.note.en || '' };
  return { ...p, name, note, maxBytes: Math.floor(Number(p.maxBytes)) };
}

/**
 * Profilleri yükler. userFile (ör. userData/profiles.json) varsa ve geçerliyse onu kullanır;
 * böylece kullanıcı profilleri paketlenmiş uygulamada da düzenleyebilir.
 */
function loadProfiles(userFile) {
  const builtin = JSON.parse(fs.readFileSync(BUILTIN_PATH, 'utf8')).map(normalize);
  if (userFile && fs.existsSync(userFile)) {
    try {
      const list = JSON.parse(fs.readFileSync(userFile, 'utf8'));
      if (Array.isArray(list)) {
        const ok = list.filter(validProfile).map(normalize);
        if (ok.length) return ok;
      }
    } catch (_) { /* bozuk dosya: yerleşik profillere dön */ }
  }
  return builtin;
}

module.exports = { loadProfiles, BUILTIN_PATH };
