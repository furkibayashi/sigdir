'use strict';

/**
 * Görsel sığdırma — gerçek uygulama, gerçek IPC (window.sigdir) üzerinden.
 * Her profil: çıktı var mı, maxBytes altında mı, ölçü/format doğru mu, EXIF/GPS silinmiş mi,
 * kaynak değişmemiş mi (SHA-256). Toplu iş, kenar durumlar, meşgul/iptal, performans.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

// Testler sırayla (tek işçi) ama bağımsız: bir hata diğerlerini atlatmaz.

let ctx; // launchApp sonucu
let fx; // fikstür yolları
let fxDir;
const hashes = {};

test.beforeAll(async () => {
  test.setTimeout(180000);
  fxDir = H.mkTmp('fx-img-');
  fx = await H.makeImageFixtures(fxDir);
  for (const [k, v] of Object.entries(fx)) if (typeof v === 'string') hashes[v] = H.sha256(v);
  for (const b of fx.batch) hashes[b] = H.sha256(b);
  ctx = await H.launchApp();
});

test.afterAll(async () => {
  if (ctx) await ctx.close();
  // Kaynaklar hiçbir testte değişmemeli
  for (const [p, h] of Object.entries(hashes)) {
    if (fs.existsSync(p)) expect(H.sha256(p), `kaynak değişti: ${p}`).toBe(h);
  }
});

const freshOut = async () => {
  const d = H.mkTmp('out-');
  const s = await H.setOutputDir(ctx.win, d);
  expect(s.outputDir).toBe(d);
  return d;
};

async function expectFitted(r, { maxBytes, width, height, longEdge, format = 'jpg', src }) {
  expect(r.ok, JSON.stringify(r)).toBe(true);
  expect(fs.existsSync(r.output)).toBe(true);
  const rep = await H.imageReport(r.output);
  expect(rep.bytes).toBeLessThanOrEqual(maxBytes);
  expect(r.afterBytes).toBe(rep.bytes);
  expect(r.beforeBytes).toBe(fs.statSync(src).size);
  expect(rep.format).toBe(format === 'jpg' ? 'jpeg' : format);
  expect(path.extname(r.output)).toBe('.' + format);
  if (width) expect(rep.width).toBe(width);
  if (height) expect(rep.height).toBe(height);
  if (longEdge) expect(Math.max(rep.width, rep.height)).toBeLessThanOrEqual(longEdge);
  expect(r.width).toBe(rep.width);
  expect(r.height).toBe(rep.height);
  // Gizlilik: EXIF/GPS/XMP/IPTC yok, kamera/sahip bilgisi sızmıyor
  expect(rep.hasExif, 'EXIF kalmış').toBe(false);
  expect(rep.hasXmp).toBe(false);
  expect(rep.hasIptc).toBe(false);
  expect(rep.leaks).toEqual([]);
  expect(H.sha256(src)).toBe(hashes[src]);
  return rep;
}

test('getProfiles: şartnamedeki profiller ve alanlar', async () => {
  const profiles = await H.api(ctx.win, 'getProfiles');
  const ids = profiles.map((p) => p.id);
  for (const p of profiles) {
    expect(['image', 'pdf', 'video']).toContain(p.kind);
    expect(typeof p.name.tr).toBe('string');
    expect(typeof p.name.en).toBe('string');
    expect(p.maxBytes).toBeGreaterThan(0);
    expect(['jpg', 'png', 'pdf', 'mp4']).toContain(p.format);
    // Şartname: her profilde "Sınırları başvuru kılavuzundan kontrol edin." notu
    expect(p.note.tr, `${p.id} TR notu`).toContain('kılavuz');
  }
  expect(ids).toEqual(expect.arrayContaining(['osym-vesikalik', 'biyometrik', 'cv-foto']));
  H.writeEvidence('profiles.json', profiles);
});

test('her görsel profili: 12 MP ve 1600×1200 JPG → sınır altında, doğru ölçü, EXIF yok, kaynak aynı', async () => {
  test.setTimeout(240000);
  const out = await freshOut();
  const profiles = (await H.api(ctx.win, 'getProfiles')).filter((p) => p.kind === 'image');
  expect(profiles.length).toBeGreaterThanOrEqual(4);
  const log = [];
  for (const p of profiles) {
    for (const src of [fx.big, fx.jpg]) {
      const t0 = Date.now();
      const [r] = await H.api(ctx.win, 'fitImages', { files: [{ path: src }], profileId: p.id });
      const ms = Date.now() - t0;
      const rep = await expectFitted(r, { maxBytes: p.maxBytes, width: p.width, height: p.height, longEdge: p.longEdge, format: p.format, src });
      log.push({ profile: p.id, src: path.basename(src), ms, bytes: rep.bytes, max: p.maxBytes, w: rep.width, h: rep.height, q: r.quality });
    }
  }
  H.writeEvidence('profiles-fit.json', log);
  expect(H.ls(out).every((n) => /-sigdir(-\d+)?\.jpg$/.test(n))).toBe(true);
});

test('özel hedef: PNG (saydam) ≤ 300 KB ve mm+DPI (35×45 mm @300 DPI = 413×531)', async () => {
  await freshOut();
  const [png] = await H.api(ctx.win, 'fitImages', { files: [fx.png], custom: { format: 'png', maxBytes: 300000 } });
  const rep = await expectFitted(png, { maxBytes: 300000, format: 'png', src: fx.png });
  expect(rep.width / rep.height).toBeCloseTo(1000 / 800, 1);
  const [mm] = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], custom: { format: 'jpg', maxBytes: 100000, width: 413, height: 531 } });
  await expectFitted(mm, { maxBytes: 100000, width: 413, height: 531, src: fx.jpg });
});

test('EXIF yönü uygulanır (Orientation=6 → dikey, üst kırmızı) ve GPS silinir', async () => {
  await freshOut();
  const [info] = await H.api(ctx.win, 'inspect', [fx.oriented]);
  expect([info.width, info.height]).toEqual([400, 600]);
  const [r] = await H.api(ctx.win, 'fitImages', { files: [fx.oriented], custom: { format: 'jpg', maxBytes: 50000 } });
  const rep = await expectFitted(r, { maxBytes: 50000, width: 400, height: 600, src: fx.oriented });
  expect(rep.orientation || 1).toBe(1);
  expect(await H.colorAt(r.output, 0.5, 0.1)).toBe('red');
  expect(await H.colorAt(r.output, 0.5, 0.9)).toBe('blue');
});

test('HEIC, WebP ve Türkçe karakterli/boşluklu ad', async () => {
  const out = await freshOut();
  test.skip(!fx.heic, 'HEIC fikstürü üretilemedi (libx265 yok)');
  const res = await H.api(ctx.win, 'fitImages', { files: [fx.heic, fx.webp, fx.trName], profileId: 'cv-foto' });
  expect(res).toHaveLength(3);
  for (const [i, src] of [fx.heic, fx.webp, fx.trName].entries()) await expectFitted(res[i], { maxBytes: 1000000, longEdge: 1600, src });
  expect(H.ls(out)).toContain('Vesikalık Fotoğraf ğüşiöç-sigdir.jpg');
  const infos = await H.api(ctx.win, 'inspect', [fx.heic, fx.trName]);
  expect(infos[0]).toMatchObject({ kind: 'image', width: 640, height: 480 });
  expect(infos[1].name).toBe(H.TR_NAME);
  expect(infos[1].thumb).toMatch(/^data:image\/jpeg;base64,/);
});

test('varsayılan çıktı: kaynağın yanına "-sigdir" ekiyle; aynı dosya iki kez → "-sigdir-2", ilk çıktı ezilmez', async () => {
  const dir = H.mkTmp('beside-');
  const src = path.join(dir, H.TR_NAME);
  fs.copyFileSync(fx.trName, src);
  const srcHash = H.sha256(src);
  await H.api(ctx.win, 'setSettings', { outputDir: null });
  const [a] = await H.api(ctx.win, 'fitImages', { files: [src], profileId: 'osym-vesikalik' });
  expect(a.ok).toBe(true);
  expect(a.output).toBe(path.join(dir, 'Vesikalık Fotoğraf ğüşiöç-sigdir.jpg'));
  const firstHash = H.sha256(a.output);
  const [b] = await H.api(ctx.win, 'fitImages', { files: [src], profileId: 'osym-vesikalik' });
  expect(b.ok).toBe(true);
  expect(b.output).toBe(path.join(dir, 'Vesikalık Fotoğraf ğüşiöç-sigdir-2.jpg'));
  expect(H.sha256(a.output)).toBe(firstHash);
  expect(H.sha256(src)).toBe(srcHash);
  // Çıktının kendisini yeniden işlemek kaynağı ezmemeli
  const [c] = await H.api(ctx.win, 'fitImages', { files: [a.output], profileId: 'osym-vesikalik' });
  expect(c.ok).toBe(true);
  expect(c.output).not.toBe(a.output);
  expect(H.sha256(a.output)).toBe(firstHash);
});

test('çok uzun dosya adı (≈250 bayt) işlenebilmeli', async () => {
  const dir = H.mkTmp('long-');
  const longAscii = path.join(dir, 'a'.repeat(246) + '.jpg'); // 250 bayt; "-sigdir" ile 257 > 255
  const longTr = path.join(dir, 'ğ'.repeat(120) + '.jpg'); // 244 bayt (UTF-8)
  fs.copyFileSync(fx.jpg, longAscii);
  fs.copyFileSync(fx.jpg, longTr);
  await H.api(ctx.win, 'setSettings', { outputDir: null });
  const res = await H.api(ctx.win, 'fitImages', { files: [longAscii, longTr], profileId: 'osym-vesikalik' });
  H.writeEvidence('long-names.json', res);
  for (const r of res) {
    expect(r.ok, `${path.basename(r.input).length} karakterlik ad: ${r.error} — ${r.message}`).toBe(true);
    expect(fs.existsSync(r.output)).toBe(true);
  }
});

test('imkânsız hedef: 12 MP → 394×472 @ 1 KB → too_small, dosya yazılmaz; serbest ölçüde 1 KB → sınır altında', async () => {
  test.setTimeout(120000);
  const out = await freshOut();
  const [r] = await H.api(ctx.win, 'fitImages', { files: [fx.big], custom: { format: 'jpg', maxBytes: 1000, width: 394, height: 472 } });
  expect(r.ok).toBe(false);
  expect(r.error).toBe('too_small');
  expect(r.output).toBeFalsy();
  expect(r.message.length).toBeGreaterThan(10);
  expect(H.ls(out)).toEqual([]);
  const [free] = await H.api(ctx.win, 'fitImages', { files: [fx.big], custom: { format: 'jpg', maxBytes: 1000 } });
  H.writeEvidence('impossible-1kb.json', free);
  if (free.ok) {
    expect(fs.statSync(free.output).size).toBeLessThanOrEqual(1000);
  } else {
    expect(free.error).toBe('too_small');
  }
  // Geçersiz hedefler
  // SIG-008: sözleşme Result[] — geçersiz hedefte de dizi döner
  const bad = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], custom: { format: 'jpg', maxBytes: 0 } });
  H.writeEvidence('bad-target.json', bad);
  expect(Array.isArray(bad)).toBe(true);
  expect(bad[0].error).toBe('bad_target');
  const unk = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], profileId: 'yok-boyle-profil' });
  expect(unk.ok === false || (Array.isArray(unk) && unk[0].ok === false)).toBe(true);
});

test('bozuk / sıfır bayt / rastgele / desteklenmeyen / yok / klasör: anlaşılır hata, çıktı yok', async () => {
  const out = await freshOut();
  const missing = path.join(fxDir, 'olmayan.jpg');
  const inputs = [fx.corrupt, fx.zero, fx.garbageJpg, fx.docx, fx.txt, missing, fxDir];
  const infos = await H.api(ctx.win, 'inspect', inputs);
  H.writeEvidence('edge-inspect.json', infos.map(({ thumb, ...x }) => x));
  const byName = Object.fromEntries(infos.map((i) => [i.path, i]));
  expect(byName[fx.zero].error).toBeTruthy();
  expect(byName[fx.garbageJpg].error).toBeTruthy();
  expect(byName[fx.docx].error).toBe('unsupported');
  expect(byName[fx.txt].error).toBe('unsupported');
  expect(byName[missing].error).toBe('not_found');
  expect(byName[fxDir].error).toBe('unsupported');
  for (const i of infos) expect(i.message, i.path).toBeTruthy();

  const res = await H.api(ctx.win, 'fitImages', { files: inputs.map((p) => ({ path: p })), profileId: 'osym-vesikalik' });
  H.writeEvidence('edge-fit.json', res);
  expect(res).toHaveLength(inputs.length);
  const codes = Object.fromEntries(res.map((r) => [path.basename(r.input), r.error]));
  for (const r of res) {
    expect(r.ok, path.basename(r.input)).toBe(false);
    expect(r.message).toBeTruthy();
    // Türkçe/İngilizce kullanıcı mesajı; ham teknik hata sızmamalı
    expect(r.message).not.toMatch(/Error:|ENOENT|EISDIR|vips|sharp/i);
  }
  expect(codes['olmayan.jpg']).toBe('not_found');
  expect(codes['belge.docx']).toBe('unsupported');
  expect(['read_failed', 'unsupported']).toContain(codes['sifir.jpg']);
  expect(H.ls(out)).toEqual([]);
  // Bozuk JPEG: başı geçerli, gövdesi rastgele. Ya açık hata ya da gerçekten sınır altında çıktı.
  const bozuk = res.find((r) => r.input === fx.corrupt);
  expect(bozuk.error).toBe('read_failed');
});

test('çıktı klasörü yazılamaz (yol bir dosya, ENOTDIR) → write_failed ve anlaşılır mesaj', async () => {
  const file = path.join(H.mkTmp('notdir-'), 'bir-dosya');
  fs.writeFileSync(file, 'x');
  await H.api(ctx.win, 'setSettings', { outputDir: file });
  try {
    const [r1] = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], profileId: 'osym-vesikalik' });
    const m1 = await H.api(ctx.win, 'mergePdf', { files: [fx.pdf2] });
    H.writeEvidence('unwritable-enotdir.json', { fitImages: r1, mergePdf: m1 });
    expect(r1.ok).toBe(false);
    expect(fs.readFileSync(file, 'utf8')).toBe('x');
    expect.soft(r1.error, r1.message).toBe('write_failed');
    expect.soft(m1.error, m1.message).toBe('write_failed');
  } finally {
    await H.api(ctx.win, 'setSettings', { outputDir: null });
  }
});

test('çıktı klasörü salt okunur (EROFS bağlama) → write_failed', async () => {
  const ro = H.mkTmp('ro-');
  let mounted = false;
  try {
    execFileSync('mount', ['-t', 'tmpfs', '-o', 'ro,size=1m', 'tmpfs', ro], { stdio: 'ignore' });
    mounted = true;
  } catch (_) { /* yetki yok */ }
  test.skip(!mounted, 'salt okunur bağlama yapılamadı (root/CAP_SYS_ADMIN gerekir)');
  try {
    {
      await H.api(ctx.win, 'setSettings', { outputDir: ro });
      const [r2] = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], profileId: 'osym-vesikalik' });
      H.writeEvidence('unwritable-erofs.json', r2);
      expect(r2.ok).toBe(false);
      expect(r2.error).toBe('write_failed');
      const m = await H.api(ctx.win, 'mergePdf', { files: [fx.pdf2] });
      expect(m.error).toBe('write_failed');
    }
  } finally {
    if (mounted) try { execFileSync('umount', [ro]); } catch (_) { /* yoksay */ }
    await H.api(ctx.win, 'setSettings', { outputDir: null });
  }
});

test('toplu işlem: 10 dosya → hepsi sınır altında, ilerleme olayları sıralı; süre ölçümü; arayüz donmuyor', async () => {
  test.setTimeout(240000);
  const out = await freshOut();
  await ctx.win.evaluate(() => {
    window.__ev = [];
    window.__unsub = window.sigdir.onProgress((e) => window.__ev.push(e));
    // Arayüz donma ölçümü: rAF kareleri arasındaki en uzun boşluk
    window.__gap = 0; window.__run = true; let last = performance.now();
    const tick = (t) => { window.__gap = Math.max(window.__gap, t - last); last = t; if (window.__run) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  const t0 = Date.now();
  const res = await H.api(ctx.win, 'fitImages', { files: fx.batch.map((p) => ({ path: p })), profileId: 'osym-vesikalik' });
  const ms = Date.now() - t0;
  const { ev, gap } = await ctx.win.evaluate(() => { window.__run = false; window.__unsub(); return { ev: window.__ev, gap: window.__gap }; });
  expect(res).toHaveLength(10);
  for (const [i, r] of res.entries()) await expectFitted(r, { maxBytes: 200000, width: 394, height: 472, src: fx.batch[i] });
  expect(H.ls(out)).toHaveLength(10);
  const done = ev.filter((e) => e.job === 'images' && e.status === 'done');
  expect(done).toHaveLength(10);
  expect(ev[ev.length - 1].percent).toBe(100);
  for (let i = 1; i < ev.length; i++) expect(ev[i].percent).toBeGreaterThanOrEqual(ev[i - 1].percent);
  H.writeEvidence('perf-batch10.json', { ms, maxFrameGapMs: Math.round(gap), events: ev.length });
  expect(gap, 'arayüz 1 sn’den uzun dondu').toBeLessThan(1000);
});

test('performans: 12 MP fotoğrafı 200 KB’a (ölçü serbest) sığdırma süresi', async () => {
  test.setTimeout(180000);
  await freshOut();
  const t0 = Date.now();
  const [r] = await H.api(ctx.win, 'fitImages', { files: [fx.big], custom: { format: 'jpg', maxBytes: 200000 } });
  const ms = Date.now() - t0;
  const rep = await expectFitted(r, { maxBytes: 200000, src: fx.big });
  const t1 = Date.now();
  const [r2] = await H.api(ctx.win, 'fitImages', { files: [fx.big], profileId: 'osym-vesikalik' });
  const msOsym = Date.now() - t1;
  expect(r2.ok).toBe(true);
  // Dosya ekleme (inspect + küçük resim) süresi: 12 MP ve 10 × 4,3 MP
  const t2 = Date.now();
  await H.api(ctx.win, 'inspect', [fx.big]);
  const msInspect12 = Date.now() - t2;
  const t3 = Date.now();
  await H.api(ctx.win, 'inspect', fx.batch);
  const msInspect10 = Date.now() - t3;
  H.writeEvidence('perf-12mp.json', { customKeepSize200KB: { ms, w: rep.width, h: rep.height, bytes: rep.bytes, q: r.quality }, osym: { ms: msOsym }, inspect12mp: msInspect12, inspect10: msInspect10 });
  expect(ms, '12 MP → 200 KB 15 sn içinde bitmeli').toBeLessThan(15000);
});

test('meşgul: süren iş varken ikinci fitImages/mergePdf/splitPdf/fitVideo → {ok:false, error:"busy"}', async () => {
  test.setTimeout(120000);
  await freshOut();
  const r = await ctx.win.evaluate(async (files) => {
    const first = window.sigdir.fitImages({ files, profileId: 'osym-vesikalik' });
    await new Promise((res) => setTimeout(res, 50));
    const second = await window.sigdir.fitImages({ files: [files[0]], profileId: 'osym-vesikalik' });
    const merge = await window.sigdir.mergePdf({ files: [files[0]] });
    const split = await window.sigdir.splitPdf({ file: files[0] });
    const video = await window.sigdir.fitVideo({ file: files[0], maxBytes: 10e6 });
    const firstRes = await first;
    return { second, merge, split, video, firstOk: firstRes.every((x) => x.ok) };
  }, fx.batch);
  // SIG-008 sonrası fitImages her zaman dizi döndürür
  expect(Array.isArray(r.second)).toBe(true);
  expect(r.second[0]).toMatchObject({ ok: false, error: 'busy' });
  expect(r.merge).toMatchObject({ ok: false, error: 'busy' });
  expect(r.split).toMatchObject({ ok: false, error: 'busy' });
  expect(r.video).toMatchObject({ ok: false, error: 'busy' });
  expect(r.firstOk).toBe(true);
});

test('toplu iptal: ilk dosya bitince cancel() → kalanlar "cancelled", yarım dosya yok', async () => {
  test.setTimeout(120000);
  const out = await freshOut();
  const res = await ctx.win.evaluate(async (files) => {
    let unsub;
    const firstDone = new Promise((resolve) => {
      unsub = window.sigdir.onProgress((e) => { if (e.status === 'done') resolve(); });
    });
    const p = window.sigdir.fitImages({ files, custom: { format: 'jpg', maxBytes: 150000 } });
    await firstDone;
    await window.sigdir.cancel();
    unsub();
    return p;
  }, fx.batch);
  const ok = res.filter((r) => r.ok);
  const cancelled = res.filter((r) => r.error === 'cancelled');
  expect(ok.length).toBeGreaterThanOrEqual(1);
  expect(cancelled.length).toBeGreaterThanOrEqual(5);
  expect(ok.length + cancelled.length).toBe(10);
  expect(H.ls(out)).toHaveLength(ok.length);
  // İptal sonrası yeni iş kabul edilir (busy kalmamalı)
  const [again] = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], profileId: 'osym-vesikalik' });
  expect(again.ok).toBe(true);
});

test('fitImages: boş liste → no_files; rotate/crop kaynak pikselinde uygulanır', async () => {
  await freshOut();
  const empty = await H.api(ctx.win, 'fitImages', { files: [], profileId: 'osym-vesikalik' });
  expect(Array.isArray(empty)).toBe(true);
  expect(empty[0]).toMatchObject({ ok: false, error: 'no_files' });
  // Sol kırmızı/sağ mavi 1200×800; rotate 90 → 800×1200, üst kırmızı. Üst yarıyı kırp → tamamen kırmızı.
  const [r] = await H.api(ctx.win, 'fitImages', {
    files: [{ path: fx.leftRight, rotate: 90, crop: { x: 0, y: 0, w: 800, h: 600 } }],
    custom: { format: 'jpg', maxBytes: 100000 },
  });
  expect(r.ok).toBe(true);
  expect([r.width, r.height]).toEqual([800, 600]);
  expect(await H.colorAt(r.output, 0.5, 0.5)).toBe('red');
  expect(await H.colorAt(r.output, 0.05, 0.95)).toBe('red');
});

test('kullanıcı profilleri: userData/profiles.json geçerliyse kullanılır, bozuksa yerleşiklere dönülür', async () => {
  const file = path.join(ctx.userData, 'profiles.json');
  try {
    fs.writeFileSync(file, JSON.stringify([{ id: 'ozel-test', kind: 'image', name: 'Test profili', format: 'jpg', maxBytes: 50000, width: 300, height: 300 }]));
    const p = await H.api(ctx.win, 'getProfiles');
    expect(p.map((x) => x.id)).toEqual(['ozel-test']);
    expect(p[0].name).toEqual({ tr: 'Test profili', en: 'Test profili' });
    await freshOut();
    const [r] = await H.api(ctx.win, 'fitImages', { files: [fx.jpg], profileId: 'ozel-test' });
    await expectFitted(r, { maxBytes: 50000, width: 300, height: 300, src: fx.jpg });
    fs.writeFileSync(file, '[{bozuk');
    const b = await H.api(ctx.win, 'getProfiles');
    expect(b.map((x) => x.id)).toContain('osym-vesikalik');
  } finally {
    fs.rmSync(file, { force: true });
  }
});
