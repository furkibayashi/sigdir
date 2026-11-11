/*
 * Sığdır — sahte (mock) window.sigdir API'si.
 *
 * Gerçek uygulamada preload.js `window.sigdir`'i tanımlar ve bu dosya HİÇBİR ŞEY yapmaz.
 * Tarayıcıda (ör. Playwright ile) arayüzü tek başına önizlemek için SPEC.md'deki IPC
 * sözleşmesinin tamamını gerçekçi gecikmeler, ilerleme olayları ve bir hata örneğiyle taklit eder.
 *
 * URL parametreleri (yalnızca mock):
 *   ?lang=tr|en  ?theme=system|light|dark  ?platform=win32|linux  ?ffmpeg=0
 *   ?fast=1     (gecikmeleri 10 kat kısaltır)
 *   ?errors=1   (görsel seçiminde bozuk bir dosya da döner → hata durumu)
 */
(function () {
  'use strict';
  if (window.sigdir) return; // Gerçek preload API'si var: dokunma.

  const q = new URLSearchParams(location.search);
  const SPEED = q.get('fast') ? 0.1 : 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * SPEED));
  const KB = 1000;
  const MB = 1000 * 1000;

  const platform = q.get('platform') || 'win32';
  const sep = platform === 'win32' ? '\\' : '/';
  const home = platform === 'win32' ? 'C:\\Users\\Ayse' : '/home/ayse';
  const p = (...parts) => [home, ...parts].join(sep);

  const info = { version: '0.1.0', platform, ffmpegAvailable: q.get('ffmpeg') !== '0' };

  let settings = {
    lang: 'tr', theme: 'system', outputDir: null, openFolderAfter: false, contextMenuInstalled: false,
  };
  try {
    const saved = JSON.parse(localStorage.getItem('sigdir-mock-settings') || 'null');
    if (saved) settings = Object.assign(settings, saved);
  } catch (_) { /* depolama yok: varsayılanlar */ }
  if (q.get('lang')) settings.lang = q.get('lang');
  if (q.get('theme')) settings.theme = q.get('theme');

  // src/core/profiles.json ile aynı (sizeLabel: arayüz isteği, bkz. docs/NOTES.md).
  const chk = { tr: 'Sınırları başvuru kılavuzundan kontrol edin.', en: 'Check the limits in the official guidelines.' };
  const n = (tr, en) => ({ tr: tr + ' ' + chk.tr, en: en + ' ' + chk.en });
  const profiles = [
    { id: 'osym-vesikalik', kind: 'image', name: { tr: 'ÖSYM / e-Devlet vesikalık', en: 'ÖSYM / e-Devlet ID photo' },
      note: n('Beyaz/açık arka plan önerilir.', 'Plain light background recommended.'), format: 'jpg', maxBytes: 200 * KB,
      width: 394, height: 472, aspect: 50 / 60, sizeLabel: '50×60 mm' },
    { id: 'biyometrik', kind: 'image', name: { tr: 'Biyometrik / pasaport fotoğrafı', en: 'Biometric / passport photo' },
      note: chk, format: 'jpg', maxBytes: 500 * KB, width: 591, height: 709, aspect: 50 / 60, sizeLabel: '50×60 mm' },
    { id: 'edevlet-belge-jpg', kind: 'image', name: { tr: 'e-Devlet belge yükleme (JPG)', en: 'e-Devlet document upload (JPG)' },
      note: n('Genel belge yükleme sınırı.', 'General document upload limit.'), format: 'jpg', maxBytes: 2 * MB, longEdge: 2480 },
    { id: 'edevlet-belge-pdf', kind: 'pdf', name: { tr: 'e-Devlet belge yükleme (PDF)', en: 'e-Devlet document upload (PDF)' },
      note: n('Genel belge yükleme sınırı.', 'General document upload limit.'), format: 'pdf', maxBytes: 2 * MB },
    { id: 'cv-foto', kind: 'image', name: { tr: 'CV / iş başvurusu fotoğrafı', en: 'CV / job application photo' },
      note: chk, format: 'jpg', maxBytes: 1 * MB, longEdge: 1600 },
    { id: 'eposta', kind: 'image', name: { tr: 'E-posta eki (küçült)', en: 'Email attachment (shrink)' },
      note: n('Uzun kenar 1920 piksele indirilir.', 'Long edge is reduced to 1920 pixels.'), format: 'jpg', maxBytes: 1 * MB, longEdge: 1920 },
    { id: 'discord-video', kind: 'video', name: { tr: 'Discord', en: 'Discord' },
      note: n('Ücretsiz hesap yükleme sınırı.', 'Free account upload limit.'), format: 'mp4', maxBytes: 10 * MB },
    { id: 'whatsapp-video', kind: 'video', name: { tr: 'WhatsApp', en: 'WhatsApp' }, note: chk, format: 'mp4', maxBytes: 64 * MB },
    { id: 'whatsapp-video-16', kind: 'video', name: { tr: 'WhatsApp (durum / eski sürüm)', en: 'WhatsApp (status / older apps)' },
      note: n('Eski sürümler ve durum paylaşımı için daha güvenli.', 'Safer for status updates and older versions.'), format: 'mp4', maxBytes: 16 * MB },
    { id: 'shorts-dikey', kind: 'video', name: { tr: 'Shorts / TikTok / Reels (dikey)', en: 'Shorts / TikTok / Reels (vertical)' },
      note: n('Görüntü ortadan 9:16 kırpılır.', 'The picture is cropped to 9:16 from the middle.'), format: 'mp4', maxBytes: 50 * MB, aspect: 9 / 16, vertical: true },
  ];

  // Bilinen örnek dosyalar (dosya seç diyaloğu bunları döndürür).
  const samples = {
    [p('Pictures', 'vesikalik-2024.jpg')]: { kind: 'image', sizeBytes: 3.4 * MB, width: 3024, height: 4032, scene: 'portrait' },
    [p('Pictures', 'IMG_4127.HEIC')]: { kind: 'image', sizeBytes: 2.1 * MB, width: 3024, height: 4032, scene: 'selfie' },
    [p('Pictures', 'tatil-manzara.png')]: { kind: 'image', sizeBytes: 8.7 * MB, width: 4000, height: 2250, scene: 'landscape' },
    [p('Downloads', 'tarama-bozuk.jpg')]: { kind: 'image', sizeBytes: 912 * KB, width: 1240, height: 1754, scene: 'scan', broken: true },
    [p('Documents', 'diploma.pdf')]: { kind: 'pdf', sizeBytes: 4.6 * MB, width: 595, height: 842, pages: 2, scene: 'doc' },
    [p('Documents', 'kimlik-on-yuz.jpg')]: { kind: 'image', sizeBytes: 1.8 * MB, width: 1600, height: 1010, scene: 'card' },
    [p('Documents', 'transkript.pdf')]: { kind: 'pdf', sizeBytes: 1.2 * MB, width: 595, height: 842, pages: 5, scene: 'doc' },
    [p('Videos', 'clutch-ace.mp4')]: { kind: 'video', sizeBytes: 148 * MB, width: 1920, height: 1080, durationSec: 47.3, scene: 'game' },
  };
  const pickSets = {
    image: [p('Pictures', 'vesikalik-2024.jpg'), p('Pictures', 'IMG_4127.HEIC'), p('Pictures', 'tatil-manzara.png')],
    pdf: [p('Documents', 'diploma.pdf'), p('Documents', 'kimlik-on-yuz.jpg'), p('Documents', 'transkript.pdf')],
    video: [p('Videos', 'clutch-ace.mp4')],
  };
  if (q.get('errors')) pickSets.image.push(p('Downloads', 'tarama-bozuk.jpg'));
  pickSets.any = pickSets.image;

  const EXT = {
    image: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff'],
    pdf: ['pdf'],
    video: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'],
  };
  const baseName = (s) => s.split(/[\\/]/).pop();
  const dirName = (s) => s.slice(0, s.length - baseName(s).length - 1);
  const ext = (s) => (baseName(s).split('.').pop() || '').toLowerCase();
  const kindOf = (s) => Object.keys(EXT).find((k) => EXT[k].includes(ext(s))) || 'unknown';
  const hash = (s) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

  // --- Sahte küçük resimler (canvas ile çizilir) ---
  const thumbCache = new Map();
  function makeThumb(scene, w, h, seed) {
    const key = scene + w + 'x' + h + seed;
    if (thumbCache.has(key)) return thumbCache.get(key);
    const s = 256 / Math.max(w, h);
    const cw = Math.max(1, Math.round(w * s)), ch = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    const hue = seed % 360;
    if (scene === 'portrait' || scene === 'selfie') {
      const bg = g.createLinearGradient(0, 0, 0, ch);
      bg.addColorStop(0, scene === 'portrait' ? '#dfe7ef' : '#f3d9c4'); bg.addColorStop(1, scene === 'portrait' ? '#b9c8d8' : '#e2a98a');
      g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
      g.fillStyle = scene === 'portrait' ? '#24324a' : '#6b3a5a';
      g.beginPath(); g.ellipse(cw / 2, ch * 1.02, cw * 0.46, ch * 0.32, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e9b99a'; g.fillRect(cw * 0.44, ch * 0.5, cw * 0.12, ch * 0.16);
      g.beginPath(); g.ellipse(cw / 2, ch * 0.42, cw * 0.17, ch * 0.15, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#3a2a22';
      g.beginPath(); g.ellipse(cw / 2, ch * 0.33, cw * 0.19, ch * 0.09, 0, Math.PI, 0); g.fill();
      g.fillRect(cw * 0.31, ch * 0.32, cw * 0.05, ch * 0.12); g.fillRect(cw * 0.64, ch * 0.32, cw * 0.05, ch * 0.12);
    } else if (scene === 'landscape') {
      const sky = g.createLinearGradient(0, 0, 0, ch);
      sky.addColorStop(0, '#7fb6e6'); sky.addColorStop(1, '#f6d7a8');
      g.fillStyle = sky; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#ffe9a6'; g.beginPath(); g.arc(cw * 0.75, ch * 0.32, ch * 0.12, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5b7a8f'; g.beginPath(); g.moveTo(0, ch * 0.7); g.lineTo(cw * 0.25, ch * 0.35); g.lineTo(cw * 0.5, ch * 0.7); g.fill();
      g.fillStyle = '#41606f'; g.beginPath(); g.moveTo(cw * 0.3, ch * 0.72); g.lineTo(cw * 0.6, ch * 0.3); g.lineTo(cw, ch * 0.72); g.fill();
      g.fillStyle = '#2f7d88'; g.fillRect(0, ch * 0.7, cw, ch * 0.3);
    } else if (scene === 'doc' || scene === 'scan') {
      g.fillStyle = scene === 'scan' ? '#e9e6df' : '#ffffff'; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#2b3a67'; g.fillRect(cw * 0.12, ch * 0.08, cw * 0.5, ch * 0.04);
      g.fillStyle = '#9aa1ad';
      for (let i = 0; i < 12; i++) g.fillRect(cw * 0.12, ch * (0.18 + i * 0.055), cw * (0.6 + ((seed >> i) & 3) * 0.06), ch * 0.018);
      g.strokeStyle = '#b4362c'; g.lineWidth = 2; g.beginPath(); g.arc(cw * 0.74, ch * 0.86, cw * 0.1, 0, Math.PI * 2); g.stroke();
    } else if (scene === 'card') {
      g.fillStyle = '#d5e4ef'; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#c0392b'; g.fillRect(0, 0, cw, ch * 0.16);
      g.fillStyle = '#9fb3c4'; g.fillRect(cw * 0.06, ch * 0.26, cw * 0.26, ch * 0.6);
      g.fillStyle = '#6d7f8f';
      for (let i = 0; i < 5; i++) g.fillRect(cw * 0.38, ch * (0.3 + i * 0.11), cw * 0.5, ch * 0.04);
    } else if (scene === 'game') {
      const bg = g.createLinearGradient(0, 0, cw, ch);
      bg.addColorStop(0, '#1b1036'); bg.addColorStop(1, '#3a1d5c'); g.fillStyle = bg; g.fillRect(0, 0, cw, ch);
      g.fillStyle = '#ff5e7a'; g.fillRect(cw * 0.1, ch * 0.62, cw * 0.3, ch * 0.3);
      g.fillStyle = '#3fd3c4'; g.fillRect(cw * 0.55, ch * 0.4, cw * 0.35, ch * 0.52);
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cw / 2 - 8, ch / 2); g.lineTo(cw / 2 + 8, ch / 2); g.moveTo(cw / 2, ch / 2 - 8); g.lineTo(cw / 2, ch / 2 + 8); g.stroke();
    } else {
      g.fillStyle = `hsl(${hue} 45% 70%)`; g.fillRect(0, 0, cw, ch);
      g.fillStyle = `hsl(${(hue + 40) % 360} 50% 45%)`; g.beginPath(); g.arc(cw / 2, ch / 2, Math.min(cw, ch) / 3, 0, Math.PI * 2); g.fill();
    }
    const url = c.toDataURL('image/jpeg', 0.82);
    thumbCache.set(key, url);
    return url;
  }

  function describe(path) {
    const known = samples[path];
    const h = hash(path);
    const kind = known ? known.kind : kindOf(path);
    const base = { path, name: baseName(path) };
    if (kind === 'unknown') {
      return Object.assign(base, { sizeBytes: 40 * KB + (h % 400) * KB, kind, error: 'unsupported' });
    }
    const d = known || {
      kind,
      sizeBytes: kind === 'video' ? (20 + (h % 180)) * MB : kind === 'pdf' ? (300 + (h % 4000)) * KB : (600 + (h % 6000)) * KB,
      width: kind === 'video' ? 1920 : kind === 'pdf' ? 595 : (h & 1 ? 4032 : 3024),
      height: kind === 'video' ? 1080 : kind === 'pdf' ? 842 : (h & 1 ? 3024 : 4032),
      pages: kind === 'pdf' ? 1 + (h % 6) : undefined,
      durationSec: kind === 'video' ? 15 + (h % 90) : undefined,
      scene: kind === 'video' ? 'game' : kind === 'pdf' ? 'doc' : 'other',
    };
    return Object.assign(base, {
      kind: d.kind,
      sizeBytes: Math.round(d.sizeBytes),
      width: d.width, height: d.height, pages: d.pages, durationSec: d.durationSec,
      thumb: makeThumb(d.scene, d.width, d.height, h),
    });
  }

  // --- Olaylar ---
  const progressCbs = new Set();
  const osCbs = new Set();
  const emit = (ev) => progressCbs.forEach((cb) => { try { cb(ev); } catch (e) { console.error(e); } });
  let cancelled = false;

  function outPath(input, newExt) {
    const dir = settings.outputDir || dirName(input);
    const stem = baseName(input).replace(/\.[^.]+$/, '');
    return dir + sep + stem + '-sigdir.' + newExt;
  }

  // percent = TÜM işin yüzdesi (ana süreçle aynı); status dosya bazında.
  async function animate(job, index, total, file, ms) {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      if (cancelled) return false;
      emit({ job, index, total, file, percent: Math.round(((index + i / steps) / total) * 100), status: 'working' });
      await wait(ms / steps);
    }
    return !cancelled;
  }
  const pctDone = (index, total) => Math.round(((index + 1) / total) * 100);

  const api = {
    async getAppInfo() { await wait(40); return Object.assign({}, info); },
    async getSettings() { await wait(30); return Object.assign({}, settings); },
    async setSettings(partial) {
      await wait(30);
      settings = Object.assign({}, settings, partial || {});
      try { localStorage.setItem('sigdir-mock-settings', JSON.stringify(settings)); } catch (_) { /* yok say */ }
      return Object.assign({}, settings);
    },
    async getProfiles() { await wait(40); return JSON.parse(JSON.stringify(profiles)); },
    async pickFiles(kind) { await wait(250); return (pickSets[kind] || pickSets.any).slice(); },
    async pickOutputDir() { await wait(250); return p('Desktop', 'Sigdir'); },
    async inspect(paths) {
      await wait(250 + 60 * (paths || []).length);
      return (paths || []).map(describe);
    },

    async fitImages(opts) {
      cancelled = false;
      const files = (opts && opts.files) || [];
      const prof = profiles.find((x) => x.id === opts.profileId);
      const target = prof || Object.assign({ format: 'jpg' }, opts.custom || {});
      if (!target.maxBytes) return { ok: false, error: 'bad_request', message: 'Hedef boyut eksik.' };
      const results = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const d = describe(f.path);
        const ok = await animate('images', i, files.length, f.path, 900);
        if (!ok) {
          results.push({ input: f.path, output: null, ok: false, beforeBytes: d.sizeBytes, afterBytes: 0, width: 0, height: 0,
            error: 'cancelled', message: 'İşlem iptal edildi.' });
          continue;
        }
        if ((samples[f.path] || {}).broken) {
          emit({ job: 'images', index: i, total: files.length, file: f.path, percent: pctDone(i, files.length), status: 'error' });
          results.push({ input: f.path, output: null, ok: false, beforeBytes: d.sizeBytes, afterBytes: 0, width: 0, height: 0,
            error: 'read_failed', message: 'Dosya okunamadı. Dosya bozuk olabilir.' });
          continue;
        }
        let w = d.width, h = d.height;
        if (f.rotate === 90 || f.rotate === 270) [w, h] = [h, w];
        if (f.crop) { w = f.crop.w; h = f.crop.h; }
        if (target.width && target.height) { w = target.width; h = target.height; }
        else if (target.longEdge && Math.max(w, h) > target.longEdge) {
          const s = target.longEdge / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s);
        }
        const ratio = 0.84 + (hash(f.path) % 13) / 100;
        const after = Math.min(d.sizeBytes, Math.round(target.maxBytes * ratio));
        emit({ job: 'images', index: i, total: files.length, file: f.path, percent: pctDone(i, files.length), status: 'done' });
        results.push({ input: f.path, output: outPath(f.path, target.format === 'png' ? 'png' : 'jpg'), ok: true,
          beforeBytes: d.sizeBytes, afterBytes: after, width: w, height: h, quality: target.format === 'png' ? undefined : 70 + (hash(f.path) % 20) });
      }
      return results;
    },

    async mergePdf(opts) {
      cancelled = false;
      const files = (opts && opts.files) || [];
      if (files.length === 0) return { ok: false, error: 'no_files', message: 'Birleştirilecek dosya yok.' };
      let before = 0;
      for (let i = 0; i < files.length; i++) {
        before += describe(files[i]).sizeBytes;
        if (!(await animate('pdf', i, files.length, files[i], 500))) {
          return { input: files[0], output: null, ok: false, beforeBytes: before, afterBytes: 0, error: 'cancelled', message: 'İşlem iptal edildi.' };
        }
        emit({ job: 'pdf', index: i, total: files.length, file: files[i], percent: pctDone(i, files.length), status: i === files.length - 1 ? 'done' : 'working' });
      }
      const after = opts.maxBytes ? Math.min(before, Math.round(opts.maxBytes * 0.91)) : Math.round(before * 0.96);
      const dir = settings.outputDir || dirName(files[0]);
      const pages = files.reduce((a, f) => a + (describe(f).pages || 1), 0);
      return { input: files[0], output: opts.output || dir + sep + 'birlesik-sigdir.pdf', ok: true, beforeBytes: before, afterBytes: after, width: 595, height: 842, pages, inputs: files.length };
    },

    async splitPdf(opts) {
      cancelled = false;
      const d = describe(opts.file);
      await animate('pdf', 0, 1, opts.file, 700);
      const n = d.pages || 1;
      const stem = d.name.replace(/\.[^.]+$/, '');
      const dir = settings.outputDir || dirName(opts.file);
      return { ok: true, outputs: Array.from({ length: n }, (_, i) => `${dir}${sep}${stem}-sayfa-${i + 1}.pdf`) };
    },

    async fitVideo(opts) {
      cancelled = false;
      const d = describe(opts.file);
      const steps = 40;
      for (let i = 0; i <= steps; i++) {
        if (cancelled) {
          emit({ job: 'video', index: 0, total: 1, file: opts.file, percent: Math.round((i / steps) * 100), status: 'error' });
          return { input: opts.file, output: null, ok: false, beforeBytes: d.sizeBytes, afterBytes: 0, error: 'cancelled', message: 'İşlem iptal edildi.' };
        }
        emit({ job: 'video', index: 0, total: 1, file: opts.file, percent: Math.round((i / steps) * 100), status: 'working' });
        await wait(110);
      }
      emit({ job: 'video', index: 0, total: 1, file: opts.file, percent: 100, status: 'done' });
      const vertical = !!opts.vertical;
      return { input: opts.file, output: outPath(opts.file, 'mp4'), ok: true, beforeBytes: d.sizeBytes,
        afterBytes: Math.round(opts.maxBytes * 0.93), width: vertical ? 608 : 1280, height: vertical ? 1080 : 720 };
    },

    async cancel() { cancelled = true; return { ok: true }; },
    onProgress(cb) { progressCbs.add(cb); return () => progressCbs.delete(cb); },
    onFilesFromOS(cb) { osCbs.add(cb); return () => osCbs.delete(cb); },
    async revealInFolder(path) { console.info('[mock] klasörde göster:', path); window.__sigdirMock.revealed.push(path); },
    async setContextMenu(enabled) {
      await wait(200);
      if (info.platform !== 'win32') return { ok: false, error: 'unsupported_platform' };
      settings.contextMenuInstalled = !!enabled;
      return { ok: true };
    },
    // İsteğe bağlı (bkz. docs/NOTES.md): sürükle-bırakta File → mutlak yol.
    getPathForFile(file) { return p('Downloads', file && file.name ? file.name : 'dosya'); },
  };

  window.sigdir = api;
  window.__sigdirMock = {
    revealed: [],
    samples: pickSets,
    /** Sağ tık menüsünden / ikinci örnekten dosya gelmiş gibi yap. */
    emitFilesFromOS(paths) { osCbs.forEach((cb) => cb(paths.slice())); },
  };
})();
