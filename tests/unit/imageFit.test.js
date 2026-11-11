'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { tmpDir, rmrf, makeImage, makeBmp, makeHeic } = require('./helpers/fixtures');
const { fitImage, fitImages, resolveImageTarget } = require('../../src/core/imageFit');
const { loadImage } = require('../../src/core/imageLoad');
const { loadProfiles } = require('../../src/core/profiles');

const profiles = loadProfiles();
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');

let dir;
const src = {};

test.before(async () => {
  dir = tmpDir();
  src.noisy = await makeImage(path.join(dir, 'noisy.jpg'), 1800, 1200, { noise: 1, quality: 98 });
  src.photo = await makeImage(path.join(dir, 'photo.jpg'), 2400, 1600, { noise: 0.25, quality: 95, seed: 3 });
  src.alpha = await makeImage(path.join(dir, 'alpha.png'), 1200, 800, { format: 'png', channels: 4, noise: 0.5 });
  src.small = await makeImage(path.join(dir, 'small.webp'), 300, 200, { format: 'webp', noise: 0.4 });
  src.tiff = await makeImage(path.join(dir, 'scan.tiff'), 1000, 1400, { format: 'tiff', noise: 0.2 });
});
test.after(() => rmrf(dir));

test('hedef boyut asla aşılmaz (farklı görseller × hedefler)', async () => {
  const targets = [
    { profileId: 'osym-vesikalik' },
    { profileId: 'biyometrik' },
    { profileId: 'eposta' },
    { profileId: 'cv-foto' },
    { custom: { format: 'jpg', maxBytes: 30000 } },
    { custom: { format: 'jpg', maxBytes: 120000, width: 800 } },
    { custom: { format: 'jpg', maxBytes: 500000, longEdge: 2000 } },
    { custom: { format: 'png', maxBytes: 80000 } },
  ];
  const out = tmpDir();
  try {
    for (const input of [src.noisy, src.photo, src.alpha, src.small, src.tiff]) {
      for (const t of targets) {
        const target = resolveImageTarget(t, profiles);
        const r = await fitImage(input, target, { outputDir: out });
        const label = `${path.basename(input)} → ${JSON.stringify(t)}`;
        assert.equal(r.ok, true, `${label}: ${r.error} ${r.message}`);
        const real = fs.statSync(r.output).size;
        assert.equal(real, r.afterBytes, label);
        assert.ok(real <= target.maxBytes, `${label}: ${real} > ${target.maxBytes}`);
        const meta = await sharp(r.output).metadata();
        assert.equal(meta.format, target.format === 'jpg' ? 'jpeg' : 'png', label);
        assert.equal(meta.width, r.width, label);
        assert.equal(meta.height, r.height, label);
        if (target.width && target.height) {
          assert.deepEqual([meta.width, meta.height], [target.width, target.height], label);
        }
        if (target.longEdge) assert.ok(Math.max(meta.width, meta.height) <= target.longEdge, label);
      }
    }
  } finally {
    rmrf(out);
  }
});

test('sığdırılamayan hedefte açık hata döner ve dosya yazılmaz', async () => {
  const out = tmpDir();
  try {
    const target = resolveImageTarget({ custom: { format: 'jpg', maxBytes: 1000, width: 1800, height: 1200 } }, profiles);
    const r = await fitImage(src.noisy, target, { outputDir: out });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'too_small');
    assert.match(r.message, /sığdırılamadı/);
    assert.equal(r.output, null);
    assert.deepEqual(fs.readdirSync(out), []);
  } finally {
    rmrf(out);
  }
});

test('kaynağın üzerine asla yazılmaz; çıktı "-sigdir" ekiyle kaynağın yanına gider', async () => {
  const d = tmpDir();
  try {
    const input = await makeImage(path.join(d, 'foto.jpg'), 800, 600);
    const before = sha(input);
    const t = resolveImageTarget({ custom: { format: 'jpg', maxBytes: 50000 } }, profiles);
    const r1 = await fitImage(input, t);
    const r2 = await fitImage(input, t);
    const r3 = await fitImage(input, t);
    assert.equal(sha(input), before);
    assert.equal(r1.output, path.join(d, 'foto-sigdir.jpg'));
    assert.equal(r2.output, path.join(d, 'foto-sigdir-2.jpg'));
    assert.equal(r3.output, path.join(d, 'foto-sigdir-3.jpg'));
  } finally {
    rmrf(d);
  }
});

test('EXIF yönü uygulanır ve EXIF/GPS meta verisi silinir', async () => {
  const d = tmpDir();
  try {
    const input = await makeImage(path.join(d, 'rotated.jpg'), 400, 200, {
      orientation: 6,
      exif: { IFD0: { Make: 'GizliMarka', Model: 'GizliModel', Copyright: 'Gizli' } },
    });
    const inMeta = await sharp(input).metadata();
    assert.equal(inMeta.orientation, 6);
    assert.ok(inMeta.exif && inMeta.exif.includes(Buffer.from('GizliMarka')));
    const loaded = await loadImage(input);
    assert.deepEqual([loaded.width, loaded.height], [200, 400]);

    const r = await fitImage(input, resolveImageTarget({ custom: { format: 'jpg', maxBytes: 100000 } }, profiles));
    assert.equal(r.ok, true);
    const meta = await sharp(r.output).metadata();
    assert.deepEqual([meta.width, meta.height], [200, 400]);
    assert.equal(meta.exif, undefined);
    assert.equal(meta.orientation, undefined);
    assert.equal(fs.readFileSync(r.output).includes(Buffer.from('GizliMarka')), false);
  } finally {
    rmrf(d);
  }
});

test('döndür + kırp (döndürülmüş görüntünün pikselleriyle) ve oran kilidi', async () => {
  const d = tmpDir();
  try {
    const input = await makeImage(path.join(d, 'wide.png'), 400, 200, { format: 'png', noise: 0 });
    const t = resolveImageTarget({ custom: { format: 'png', maxBytes: 500000 } }, profiles);
    const rot = await fitImage({ path: input, rotate: 90 }, t);
    assert.deepEqual([rot.width, rot.height], [200, 400]);
    const neg = await fitImage({ path: input, rotate: -90 }, t);
    assert.deepEqual([neg.width, neg.height], [200, 400]);
    const crop = await fitImage({ path: input, rotate: 90, crop: { x: 10, y: 20, w: 150, h: 300 } }, t);
    assert.deepEqual([crop.width, crop.height], [150, 300]);
    // Kırpma sınır dışına taşarsa kırpılır, hata vermez
    const over = await fitImage({ path: input, crop: { x: 300, y: 100, w: 500, h: 500 } }, t);
    assert.deepEqual([over.width, over.height], [100, 100]);
    // Vesikalık profili: 50×60 oran, 394×472 piksel
    const id = await fitImage(input, resolveImageTarget({ profileId: 'osym-vesikalik' }, profiles));
    assert.deepEqual([id.width, id.height], [394, 472]);
  } finally {
    rmrf(d);
  }
});

test('uzun kenar sınırı (e-posta profili) büyütme yapmaz', async () => {
  const d = tmpDir();
  try {
    const big = await makeImage(path.join(d, 'pano.jpg'), 3000, 1000);
    const r = await fitImage(big, resolveImageTarget({ profileId: 'eposta' }, profiles));
    assert.deepEqual([r.width, r.height], [1920, 640]);
    const small = await makeImage(path.join(d, 'kucuk.jpg'), 640, 480);
    const r2 = await fitImage(small, resolveImageTarget({ profileId: 'eposta' }, profiles));
    assert.deepEqual([r2.width, r2.height], [640, 480]);
  } finally {
    rmrf(d);
  }
});

test('BMP okunur (sharp desteklemediği için yerleşik çözücü)', async () => {
  const d = tmpDir();
  try {
    const input = makeBmp(path.join(d, 'tarama.bmp'), 101, 50); // satır dolgusu olan genişlik
    const loaded = await loadImage(input);
    assert.deepEqual([loaded.width, loaded.height], [101, 50]);
    const px = await loaded.make().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    assert.deepEqual([...px.subarray(0, 3)], [255, 0, 0]);
    const r = await fitImage(input, resolveImageTarget({ custom: { format: 'png', maxBytes: 20000 } }, profiles));
    assert.equal(r.ok, true, r.message);
    assert.ok(r.afterBytes <= 20000);
  } finally {
    rmrf(d);
  }
});

test('HEIC okunur ve JPG\'ye sığdırılır', async (t) => {
  const d = tmpDir();
  try {
    const input = makeHeic(path.join(d, 'iphone.heic'), 320, 240);
    if (!input) {
      t.skip('HEIC örneği üretilemedi (ffmpeg/libx265 yok)');
      return;
    }
    const loaded = await loadImage(input);
    assert.deepEqual([loaded.width, loaded.height], [320, 240]);
    assert.equal(loaded.format, 'heic');
    const r = await fitImage(input, resolveImageTarget({ custom: { format: 'jpg', maxBytes: 15000 } }, profiles));
    assert.equal(r.ok, true, r.message);
    assert.equal(r.output, path.join(d, 'iphone-sigdir.jpg'));
    assert.ok(fs.statSync(r.output).size <= 15000);
    const meta = await sharp(r.output).metadata();
    assert.equal(meta.format, 'jpeg');
  } finally {
    rmrf(d);
  }
});

test('desteklenmeyen / eksik dosyada Türkçe hata', async () => {
  const d = tmpDir();
  try {
    const txt = path.join(d, 'not.txt');
    fs.writeFileSync(txt, 'merhaba');
    const t = resolveImageTarget({ custom: { format: 'jpg', maxBytes: 50000 } }, profiles);
    const r1 = await fitImage(txt, t);
    assert.equal(r1.ok, false);
    assert.equal(r1.error, 'unsupported');
    const r2 = await fitImage(path.join(d, 'yok.jpg'), t);
    assert.equal(r2.error, 'not_found');
    assert.match(r2.message, /bulunamadı/);
    const bad = path.join(d, 'bozuk.jpg');
    fs.writeFileSync(bad, Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]));
    const r3 = await fitImage(bad, t);
    assert.equal(r3.error, 'read_failed');
    const r4 = await fitImage(txt, t, { lang: 'en' });
    assert.match(r4.message, /not supported/);
  } finally {
    rmrf(d);
  }
});

test('hedef doğrulama', () => {
  assert.throws(() => resolveImageTarget({}, profiles), { code: 'bad_target' });
  assert.throws(() => resolveImageTarget({ profileId: 'yok' }, profiles), { code: 'bad_target' });
  assert.throws(() => resolveImageTarget({ custom: { format: 'jpg', maxBytes: 0 } }, profiles), { code: 'bad_target' });
  assert.throws(() => resolveImageTarget({ custom: { format: 'jpg', maxBytes: 5000, width: -3 } }, profiles), { code: 'bad_target' });
  const t = resolveImageTarget({ custom: { format: 'JPEG', maxBytes: '204800', width: '394', height: 472 } }, profiles);
  assert.deepEqual([t.format, t.maxBytes, t.width, t.height], ['jpg', 204800, 394, 472]);
  // PDF profili görsele uygulanırsa JPG üretilir
  assert.equal(resolveImageTarget({ profileId: 'edevlet-belge-pdf' }, profiles).format, 'jpg');
});

test('toplu işlem: ilerleme olayları ve iptal', async () => {
  const d = tmpDir();
  try {
    const t = resolveImageTarget({ custom: { format: 'jpg', maxBytes: 40000 } }, profiles);
    const events = [];
    const res = await fitImages([src.small, { path: src.photo }, path.join(d, 'yok.png')], t, {
      outputDir: d,
      onProgress: (p) => events.push(`${p.index}:${p.status}:${p.percent}`),
    });
    assert.deepEqual(res.map((r) => r.ok), [true, true, false]);
    assert.deepEqual(events, ['0:working:0', '0:done:33', '1:working:33', '1:done:67', '2:working:67', '2:error:100']);

    const ac = new AbortController();
    ac.abort();
    const cancelled = await fitImages([src.small, src.photo], t, { outputDir: d, signal: ac.signal });
    assert.deepEqual(cancelled.map((r) => r.error), ['cancelled', 'cancelled']);
  } finally {
    rmrf(d);
  }
});

test('SIG-001/002: uzun adlı görsel sığdırılır; çıktı klasörü bir dosyaysa write_failed', async () => {
  const d = tmpDir();
  try {
    const longIn = path.join(d, 'a'.repeat(246) + '.jpg');
    fs.copyFileSync(src.small, longIn);
    const t = resolveImageTarget({ profileId: 'osym-vesikalik' }, profiles);
    const r = await fitImage(longIn, t);
    assert.equal(r.ok, true, `${r.error} ${r.message}`);
    assert.ok(fs.existsSync(r.output));
    assert.ok(Buffer.byteLength(path.basename(r.output)) <= 255);

    const notDir = path.join(d, 'dosya');
    fs.writeFileSync(notDir, 'x');
    const bad = await fitImage(src.small, t, { outputDir: notDir });
    assert.equal(bad.ok, false);
    assert.equal(bad.error, 'write_failed');
    assert.match(bad.message, /Çıktı klasörü kullanılamıyor/);
  } finally {
    rmrf(d);
  }
});
