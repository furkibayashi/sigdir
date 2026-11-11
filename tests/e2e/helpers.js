'use strict';

/**
 * Uçtan uca test yardımcıları (Playwright `_electron`).
 *
 * Çalıştırma (Linux/ekransız):  xvfb-run -a npm run test:e2e
 * Önerilen (performans ölçümleri paralel işlerden etkilenmesin): xvfb-run -a npm run test:e2e -- --workers=1
 *
 * Ortam değişkenleri:
 *   SIGDIR_E2E_TMP  geçici fikstür/çıktı klasörlerinin kökü (varsayılan: os.tmpdir())
 *   SIGDIR_E2E_OUT  ekran görüntüleri ve ölçüm JSON'larının yazılacağı klasör (varsayılan: <tmp>/sigdir-e2e-out)
 *
 * Tüm fikstürler test sırasında üretilir; depoya ikili dosya konmaz.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { _electron } = require('@playwright/test');

const ROOT = path.resolve(__dirname, '..', '..');
const sharp = require(path.join(ROOT, 'node_modules', 'sharp'));
const { PDFDocument, StandardFonts, rgb } = require(path.join(ROOT, 'node_modules', 'pdf-lib'));

const TMP_ROOT = process.env.SIGDIR_E2E_TMP || os.tmpdir();
const OUT_DIR = process.env.SIGDIR_E2E_OUT || path.join(TMP_ROOT, 'sigdir-e2e-out');
fs.mkdirSync(TMP_ROOT, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const TR_NAME = 'Vesikalık Fotoğraf ğüşiöç.jpg';

function mkTmp(prefix = 'sigdir-e2e-') {
  return fs.mkdtempSync(path.join(TMP_ROOT, prefix));
}

function rmrf(p) {
  try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) { /* yoksay */ }
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeEvidence(name, data) {
  const f = path.join(OUT_DIR, name);
  fs.writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  return f;
}

// ------------------------------------------------------------------ uygulamayı başlatma

/**
 * Sığdır'ı gerçek haliyle başlatır.
 * opts: { userData?, env?, args?, cwd?, appTmp? }
 * Dönüş: { app, win, userData, appTmp, consoleErrors, consoleWarnings, close() }
 */
async function launchApp(opts = {}) {
  const userData = opts.userData || mkTmp('ud-');
  // opts.settings: açılıştan önce settings.json'a yazılacak ayarlar (ör. { lang:'tr', outputDir })
  if (opts.settings) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(opts.settings));
  // Uygulamanın kendi TMPDIR'i: Chromium buraya Unix soketi açar; soket yolu ≤ 107 bayt olmalı,
  // bu yüzden kısa bir sistem geçici klasörü kullanılır (kapanışta silinir).
  const appTmp = opts.appTmp || fs.mkdtempSync(path.join(os.tmpdir(), 'sgd-'));
  const args = ['--no-sandbox', ROOT, ...(opts.args || [])];
  const env = { ...process.env, SIGDIR_USER_DATA: userData, TMPDIR: appTmp, ...(opts.env || {}) };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args, env, cwd: opts.cwd || ROOT, timeout: 60000 });
  const win = await app.firstWindow();
  const consoleErrors = [];
  const consoleWarnings = [];
  win.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
    else if (m.type() === 'warning') consoleWarnings.push(m.text());
  });
  win.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  await win.waitForSelector('body.is-ready', { timeout: 30000 });
  // Gerçek dosya yöneticisi açılmasın; çağrıları kaydet
  await app.evaluate(({ shell }) => {
    global.__revealed = [];
    shell.showItemInFolder = (p) => { global.__revealed.push(p); };
    shell.openPath = async (p) => { global.__revealed.push(p); return ''; };
  });
  return {
    app,
    win,
    userData,
    appTmp,
    consoleErrors,
    consoleWarnings,
    async close() {
      try { await app.close(); } catch (_) { /* zaten kapalı */ }
      if (!opts.appTmp) rmrf(appTmp);
    },
  };
}

/** Yerel dosya seçme diyaloğunu taklit eder (ana süreçte dialog.showOpenDialog'u değiştirir). */
async function stubOpenDialog(app, filePaths) {
  await app.evaluate(({ dialog }, fp) => {
    dialog.showOpenDialog = async () => ({ canceled: !fp.length, filePaths: fp });
  }, filePaths);
}

/** Renderer'da window.sigdir çağrısı. */
function api(win, name, ...args) {
  return win.evaluate(([n, a]) => window.sigdir[n](...a), [name, args]);
}

async function setOutputDir(win, dir) {
  return api(win, 'setSettings', { outputDir: dir });
}

// ------------------------------------------------------------------ fikstürler

function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fotoğrafa benzeyen ham görüntü (degrade + gürültü). */
function rawPhoto(w, h, { noise = 0.25, seed = 7, channels = 3 } = {}) {
  const r = rng(seed);
  const data = Buffer.alloc(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * channels;
      const base0 = (x / w) * 255, base1 = (y / h) * 255, base2 = ((x + y) / (w + h)) * 255;
      data[o] = Math.min(255, (base0 * (1 - noise) + r() * 255 * noise) | 0);
      data[o + 1] = Math.min(255, (base1 * (1 - noise) + r() * 255 * noise) | 0);
      data[o + 2] = Math.min(255, (base2 * (1 - noise) + r() * 255 * noise) | 0);
      if (channels === 4) data[o + 3] = x < w / 4 ? 0 : 255;
    }
  }
  return sharp(data, { raw: { width: w, height: h, channels } });
}

const EXIF_GPS = {
  IFD0: { Make: 'GizliKamera', Model: 'TestModel-X1', Copyright: 'GizliSahip', Software: 'GizliYazilim' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '41/1 0/1 36/1', GPSLongitudeRef: 'E', GPSLongitude: '28/1 58/1 48/1' },
};

/**
 * Yönlü fotoğraf: dikey içerik (üst yarı KIRMIZI, alt yarı MAVİ) yatay olarak saklanır ve
 * EXIF Orientation=6 (90° saat yönünde döndür) yazılır. Doğru uygulanırsa çıktı dikeydir ve üstü kırmızıdır.
 * Saklanan piksel: 600×400 (sol yarı kırmızı → döndürülünce üst; sağ yarı mavi → alt)... aşağıdaki yorum bkz.
 */
async function makeOrientedJpeg(file) {
  // Görüntülenecek (doğru) hali: 400×600, üst yarı kırmızı, alt yarı mavi.
  const upright = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#0000ff' } })
    .composite([{ input: { create: { width: 400, height: 300, channels: 3, background: '#ff0000' } }, top: 0, left: 0 }])
    .png().toBuffer();
  // Orientation 6 = görüntülerken 90° saat yönünde döndür. Saklanan = doğru halin 90° saat yönü tersine döndürülmüşü.
  const stored = await sharp(upright).rotate(-90).raw().toBuffer({ resolveWithObject: true });
  await sharp(stored.data, { raw: stored.info })
    .jpeg({ quality: 92 })
    .withExif(EXIF_GPS)
    .withMetadata({ orientation: 6 })
    .toFile(file);
  return file;
}

/** Yön işaretli fotoğraf (kırp/döndür testi için): sol yarı KIRMIZI, sağ yarı MAVİ, 1200×800. */
async function makeLeftRightJpeg(file) {
  await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#0000ff' } })
    .composite([{ input: { create: { width: 600, height: 800, channels: 3, background: '#ff0000' } }, top: 0, left: 0 }])
    .jpeg({ quality: 92 })
    .toFile(file);
  return file;
}

async function makePdf(file, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  pages.forEach(([w, h], i) => {
    const p = doc.addPage([w, h]);
    p.drawText(`${path.basename(file)} sayfa ${i + 1}`, { x: 20, y: h - 40, size: 14, font, color: rgb(0, 0, 0) });
  });
  fs.writeFileSync(file, await doc.save());
  return file;
}

/** Trailer'ında /Encrypt bulunan (parola korumalı gibi görünen) PDF. */
async function makeEncryptedPdf(file) {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.context.trailerInfo.Encrypt = doc.context.register(doc.context.obj({ Filter: 'Standard', V: 1, R: 2, O: 'x', U: 'y', P: -4 }));
  fs.writeFileSync(file, await doc.save({ useObjectStreams: false }));
  return file;
}

function ffmpegBin(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
}

const HAS_FFMPEG = (() => {
  try { return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0 && spawnSync('ffprobe', ['-version'], { stdio: 'ignore' }).status === 0; } catch (_) { return false; }
})();

/** 20 sn testsrc videosu (gürültülü: sıkıştırması zor, kaynak > 10 MB). */
function makeVideo(file, { seconds = 20, size = '1280x720', rate = 30, audio = true, noise = true } = {}) {
  const v = `testsrc=size=${size}:rate=${rate}:duration=${seconds}` + (noise ? ',noise=alls=25:allf=t' : '');
  const args = ['-f', 'lavfi', '-i', v];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`);
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push('-metadata', 'title=GizliBaslik', '-metadata', 'comment=GizliYorum', file);
  ffmpegBin(args);
  return file;
}

function ffprobe(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  return { code: r.status, json: r.status === 0 ? JSON.parse(r.stdout) : null, stderr: r.stderr };
}

/** Videonun tamamı hatasız çözülebiliyor mu (oynatılabilirlik). */
function decodesCleanly(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  return { ok: r.status === 0 && !r.stderr.trim(), stderr: r.stderr };
}

let heicMaker = null;
function makeHeic(file, w = 640, h = 480) {
  // Birim test yardımcısındaki HEIC üreticisini yeniden kullan (ffmpeg/libx265 + elle HEIF kabı)
  if (!heicMaker) heicMaker = require(path.join(ROOT, 'tests', 'unit', 'helpers', 'fixtures.js')).makeHeic;
  return heicMaker(file, w, h);
}

/**
 * Tüm görsel/PDF fikstürlerini bir klasöre üretir.
 */
async function makeImageFixtures(dir) {
  const f = (n) => path.join(dir, n);
  const out = {};
  out.jpg = f('foto.jpg');
  await rawPhoto(1600, 1200, { seed: 1 }).jpeg({ quality: 95 }).withExif(EXIF_GPS).toFile(out.jpg);
  out.png = f('ekran.png');
  await rawPhoto(1000, 800, { seed: 2, channels: 4 }).png().toFile(out.png);
  out.big = f('buyuk-12mp.jpg');
  await rawPhoto(4000, 3000, { seed: 3, noise: 0.2 }).jpeg({ quality: 95 }).withExif(EXIF_GPS).toFile(out.big);
  out.oriented = f('yonlu-exif6.jpg');
  await makeOrientedJpeg(out.oriented);
  out.leftRight = f('sol-kirmizi-sag-mavi.jpg');
  await makeLeftRightJpeg(out.leftRight);
  out.webp = f('foto.webp');
  await rawPhoto(800, 600, { seed: 4 }).webp({ quality: 90 }).toFile(out.webp);
  out.trName = f(TR_NAME);
  await rawPhoto(1200, 1500, { seed: 5 }).jpeg({ quality: 95 }).withExif(EXIF_GPS).toFile(out.trName);
  out.heic = makeHeic(f('iphone.heic'));
  out.corrupt = f('bozuk.jpg');
  {
    const good = fs.readFileSync(out.jpg);
    const bad = Buffer.concat([good.subarray(0, 600), crypto.randomBytes(4000)]);
    fs.writeFileSync(out.corrupt, bad);
  }
  out.garbageJpg = f('rastgele.jpg');
  fs.writeFileSync(out.garbageJpg, crypto.randomBytes(5000));
  out.zero = f('sifir.jpg');
  fs.writeFileSync(out.zero, Buffer.alloc(0));
  out.docx = f('belge.docx');
  fs.writeFileSync(out.docx, Buffer.concat([Buffer.from('PK\x03\x04', 'latin1'), crypto.randomBytes(2000)]));
  out.txt = f('not.txt');
  fs.writeFileSync(out.txt, 'merhaba dünya\n');
  out.pdf5 = f('cok-sayfali.pdf');
  await makePdf(out.pdf5, [[300, 400], [400, 300], [500, 500], [300, 400], [612, 792]]);
  out.pdf2 = f('ikinci.pdf');
  await makePdf(out.pdf2, [[200, 200], [250, 250]]);
  // 10 dosyalık toplu iş
  out.batch = [];
  for (let i = 0; i < 10; i++) {
    const p = f(`toplu-${String(i + 1).padStart(2, '0')}.jpg`);
    await rawPhoto(2400, 1800, { seed: 100 + i }).jpeg({ quality: 92 }).toFile(p);
    out.batch.push(p);
  }
  return out;
}

/** Çıktı görselinin meta verisi + gizlilik kontrolü. */
async function imageReport(file) {
  const buf = fs.readFileSync(file);
  const m = await sharp(buf).metadata();
  const latin = buf.toString('latin1');
  return {
    bytes: buf.length,
    format: m.format,
    width: m.width,
    height: m.height,
    orientation: m.orientation,
    hasExif: !!m.exif,
    hasXmp: !!m.xmp,
    hasIptc: !!m.iptc,
    leaks: ['GizliKamera', 'TestModel-X1', 'GizliSahip', 'GizliYazilim', 'Exif\0\0'].filter((s) => latin.includes(s)),
  };
}

/** Görüntüde (x,y) oranındaki pikselin baskın rengi: 'red' | 'blue' | 'other' */
async function colorAt(file, fx, fy) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const x = Math.min(info.width - 1, Math.floor(info.width * fx));
  const y = Math.min(info.height - 1, Math.floor(info.height * fy));
  const o = (y * info.width + x) * info.channels;
  const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
  if (r > 180 && b < 80 && g < 80) return 'red';
  if (b > 180 && r < 80 && g < 80) return 'blue';
  return `other(${r},${g},${b})`;
}

async function pdfPages(file) {
  const doc = await PDFDocument.load(fs.readFileSync(file));
  return doc.getPages().map((p) => {
    const s = p.getSize();
    return [Math.round(s.width), Math.round(s.height)];
  });
}

/** Bir klasördeki dosyaları (alt klasörsüz) listeler. */
function ls(dir) {
  try { return fs.readdirSync(dir).sort(); } catch (_) { return []; }
}

module.exports = {
  ROOT,
  TMP_ROOT,
  OUT_DIR,
  TR_NAME,
  HAS_FFMPEG,
  mkTmp,
  rmrf,
  sha256,
  writeEvidence,
  launchApp,
  stubOpenDialog,
  api,
  setOutputDir,
  rawPhoto,
  makeImageFixtures,
  makeOrientedJpeg,
  makeLeftRightJpeg,
  makePdf,
  makeEncryptedPdf,
  makeVideo,
  makeHeic,
  ffprobe,
  decodesCleanly,
  imageReport,
  colorAt,
  pdfPages,
  ls,
  sharp,
};
