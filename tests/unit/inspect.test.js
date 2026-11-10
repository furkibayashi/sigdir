'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const { tmpDir, rmrf, makeImage, makeBmp, makeHeic, makeVideo, HAS_FFMPEG } = require('./helpers/fixtures');
const { inspect } = require('../../src/core/inspect');
const { sniff } = require('../../src/core/imageLoad');

let dir;
test.before(() => { dir = tmpDir(); });
test.after(() => rmrf(dir));

async function thumbSize(dataUrl) {
  assert.match(dataUrl, /^data:image\/jpeg;base64,/);
  const m = await sharp(Buffer.from(dataUrl.split(',')[1], 'base64')).metadata();
  return [m.width, m.height];
}

test('görsel: tür, boyut, çözünürlük (EXIF yönüyle), ≤256 px küçük resim', async () => {
  const jpg = await makeImage(path.join(dir, 'yan.jpg'), 1200, 600, { orientation: 8 });
  const png = await makeImage(path.join(dir, 'kucuk.png'), 100, 80, { format: 'png' });
  const bmp = makeBmp(path.join(dir, 'b.bmp'), 64, 32);
  const [a, b, c] = await inspect([jpg, png, bmp]);
  assert.equal(a.kind, 'image');
  assert.equal(a.name, 'yan.jpg');
  assert.equal(a.sizeBytes, fs.statSync(jpg).size);
  assert.deepEqual([a.width, a.height], [600, 1200]);
  assert.deepEqual(await thumbSize(a.thumb), [128, 256]);
  assert.deepEqual(await thumbSize(b.thumb), [100, 80]); // büyütülmez
  assert.deepEqual([c.kind, c.width, c.height], ['image', 64, 32]);
});

test('HEIC inceleme', async (t) => {
  const heic = makeHeic(path.join(dir, 'h.heic'), 320, 240);
  if (!heic) return t.skip('HEIC örneği üretilemedi');
  const [i] = await inspect([heic]);
  assert.deepEqual([i.kind, i.width, i.height, i.error], ['image', 320, 240, undefined]);
  assert.ok(i.thumb);
});

test('PDF: sayfa sayısı', async () => {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]); doc.addPage(); doc.addPage();
  const p = path.join(dir, 'uc-sayfa.pdf');
  fs.writeFileSync(p, await doc.save());
  const [i] = await inspect([p]);
  assert.equal(i.kind, 'pdf');
  assert.equal(i.pages, 3);
});

test('video: süre, ölçü ve ffmpeg ile alınmış kare', { skip: !HAS_FFMPEG && 'ffmpeg yok' }, async () => {
  const v = makeVideo(path.join(dir, 'v.mp4'), { seconds: 3, size: '640x360', noise: false });
  const [i] = await inspect([v]);
  assert.equal(i.kind, 'video');
  assert.ok(Math.abs(i.durationSec - 3) < 0.2);
  assert.deepEqual([i.width, i.height], [640, 360]);
  assert.deepEqual(await thumbSize(i.thumb), [256, 144]);
});

test('bilinmeyen, eksik ve uzantısı yanlış dosyalar', async () => {
  const txt = path.join(dir, 'not.txt');
  fs.writeFileSync(txt, 'merhaba dünya');
  const disguised = path.join(dir, 'aslinda-png.jpg');
  fs.copyFileSync(await makeImage(path.join(dir, 'gercek.png'), 40, 30, { format: 'png' }), disguised);
  const res = await inspect([txt, path.join(dir, 'yok.jpg'), disguised]);
  assert.deepEqual(res.map((r) => [r.kind, r.error || null]), [['unknown', 'unsupported'], ['unknown', 'not_found'], ['image', null]]);
  assert.ok(res[0].message && res[1].message);
  assert.deepEqual(await inspect('bozuk-girdi'), []);
});

test('imza ile tür tanıma', () => {
  const b = (s) => Buffer.from(s, 'latin1');
  assert.equal(sniff(b('%PDF-1.4 ...'), 'x.bin').kind, 'pdf');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 24]), b('ftypheic'), Buffer.alloc(4), b('mif1heic')]), 'x').type, 'heic');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 28]), b('ftypavif'), Buffer.alloc(4), b('avifmif1miaf')]), 'x').type, 'avif');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 24]), b('ftypisom'), Buffer.alloc(4), b('isomavc1')]), 'x').kind, 'video');
  assert.equal(sniff(Buffer.concat([Buffer.from([0, 0, 0, 20]), b('ftypqt  '), Buffer.alloc(8)]), 'x.mov').kind, 'video');
  assert.equal(sniff(Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0]), 'x.webm').kind, 'video');
  assert.equal(sniff(b('merhaba'), 'x.txt').kind, 'unknown');
});
