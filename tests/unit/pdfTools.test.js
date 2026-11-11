'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { tmpDir, rmrf, makeImage, makeHeic } = require('./helpers/fixtures');
const { mergePdf, splitPdf, pdfInfo } = require('../../src/core/pdfTools');

async function makePdf(file, sizes, text = 'Sigdir') {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  sizes.forEach(([w, h], i) => {
    const p = doc.addPage([w, h]);
    p.drawText(`${text} ${i + 1}`, { x: 20, y: h - 40, size: 18, font });
  });
  fs.writeFileSync(file, await doc.save());
  return file;
}

let dir;
test.before(() => { dir = tmpDir(); });
test.after(() => rmrf(dir));

test('görsel + PDF birleştirme verilen sırayı korur', async () => {
  const img1 = await makeImage(path.join(dir, 'dikey.jpg'), 600, 900);
  const img2 = await makeImage(path.join(dir, 'yatay.png'), 900, 600, { format: 'png' });
  const pdf = await makePdf(path.join(dir, 'belge.pdf'), [[300, 300], [400, 200]]);
  const r = await mergePdf({ files: [img1, pdf, img2] }, { outputDir: dir });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.output, path.join(dir, 'dikey-sigdir.pdf'));
  assert.equal(r.pages, 4);
  assert.equal(r.afterBytes, fs.statSync(r.output).size);
  const doc = await PDFDocument.load(fs.readFileSync(r.output), { updateMetadata: false });
  const sizes = doc.getPages().map((p) => p.getSize()).map((s) => [Math.round(s.width), Math.round(s.height)]);
  assert.deepEqual(sizes, [[595, 842], [300, 300], [400, 200], [842, 595]]); // A4 dikey, PDF, PDF, A4 yatay
  assert.equal(doc.getProducer(), 'Sığdır');
});

test('birleştirmede maxBytes asla aşılmaz (görseller yeniden sıkıştırılır)', async () => {
  const files = [];
  for (let i = 0; i < 3; i++) files.push(await makeImage(path.join(dir, `tarama${i}.jpg`), 2000, 2800, { noise: 0.6, seed: i + 1, quality: 95 }));
  const full = await mergePdf({ files }, { outputDir: dir });
  assert.equal(full.ok, true);
  for (const maxBytes of [1500000, 600000, 250000]) {
    assert.ok(full.afterBytes > maxBytes, 'test anlamlı olsun diye ilk sonuç hedefin üstünde olmalı');
    const r = await mergePdf({ files, maxBytes, output: path.join(dir, `hedef-${maxBytes}.pdf`) });
    assert.equal(r.ok, true, `${maxBytes}: ${r.message}`);
    assert.equal(r.output, path.join(dir, `hedef-${maxBytes}.pdf`));
    assert.ok(fs.statSync(r.output).size <= maxBytes, `${fs.statSync(r.output).size} > ${maxBytes}`);
    assert.equal(r.pages, 3);
  }
  // Sığmazsa açık hata, dosya yok
  const before = fs.readdirSync(dir).length;
  const bad = await mergePdf({ files, maxBytes: 5000 }, { outputDir: dir });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'too_small');
  assert.equal(fs.readdirSync(dir).length, before);
});

test('yalnızca PDF içeren birleştirme hedefe sığmazsa too_small', async () => {
  const pdf = await makePdf(path.join(dir, 'kalin.pdf'), Array.from({ length: 30 }, () => [595, 842]));
  const r = await mergePdf({ files: [pdf], maxBytes: 1000 }, { outputDir: dir });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'too_small');
});

test('HEIC görseller de PDF\'e eklenebilir', async (t) => {
  const heic = makeHeic(path.join(dir, 'tel.heic'), 320, 240);
  if (!heic) return t.skip('HEIC örneği üretilemedi');
  const r = await mergePdf({ files: [heic] }, { outputDir: dir });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.pages, 1);
});

test('PDF sayfalara ayrılır', async () => {
  const pdf = await makePdf(path.join(dir, 'rapor.pdf'), [[595, 842], [842, 595], [300, 400]]);
  const r = await splitPdf({ file: pdf }, { outputDir: dir });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.outputs.map((p) => path.basename(p)), ['rapor-sayfa-01.pdf', 'rapor-sayfa-02.pdf', 'rapor-sayfa-03.pdf']);
  const infos = await Promise.all(r.outputs.map((p) => pdfInfo(p)));
  assert.deepEqual(infos.map((i) => [i.pages, i.width, i.height]), [[1, 595, 842], [1, 842, 595], [1, 300, 400]]);
  // Tekrar ayırınca var olanlar ezilmez
  const again = await splitPdf({ file: pdf }, { outputDir: dir, lang: 'en' });
  assert.equal(path.basename(again.outputs[0]), 'rapor-page-01.pdf');
  const third = await splitPdf({ file: pdf }, { outputDir: dir });
  assert.equal(path.basename(third.outputs[0]), 'rapor-sayfa-01-2.pdf');
});

test('PDF araçlarında hatalar reject etmez, kod + mesaj döner', async () => {
  const notPdf = await makeImage(path.join(dir, 'resim.jpg'), 50, 50);
  const s1 = await splitPdf({ file: notPdf });
  assert.equal(s1.ok, false);
  assert.equal(s1.error, 'unsupported');
  const broken = path.join(dir, 'bozuk.pdf');
  fs.writeFileSync(broken, '%PDF-1.7\nbozuk');
  const s2 = await splitPdf({ file: broken });
  assert.equal(s2.ok, false);
  assert.equal(s2.error, 'read_failed');
  const m1 = await mergePdf({ files: [] });
  assert.equal(m1.error, 'no_files');
  const m2 = await mergePdf({ files: [path.join(dir, 'yok.pdf')] });
  assert.equal(m2.error, 'not_found');
  assert.ok(m2.message.length > 10);
});

test('SIG-002: PDF birleştirmede çıktı klasörü kullanılamazsa write_failed', async () => {
  const pdf = await makePdf(path.join(dir, 'tek.pdf'), [[200, 200]]);
  const notDir = path.join(dir, 'klasor-degil');
  fs.writeFileSync(notDir, 'x');
  const r = await mergePdf({ files: [pdf] }, { outputDir: notDir });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'write_failed');
  assert.match(r.message, /Çıktı klasörü/);
  const s = await splitPdf({ file: pdf }, { outputDir: notDir, lang: 'en' });
  assert.equal(s.error, 'write_failed');
  assert.match(s.message, /output folder/);
});
