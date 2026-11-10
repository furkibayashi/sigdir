'use strict';

const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { SigdirError, toErrorInfo } = require('./errors');
const { sniff, readHead, loadImage } = require('./imageLoad');
const { desiredOutputPath, writeFileUnique, fileSize, readFileSafe, throwIfAborted } = require('./fileUtils');

const A4 = { w: 595.28, h: 841.89 };
/** Görselleri yeniden sıkıştırma kademeleri (uzun kenar px, JPEG kalitesi). İlk kademe ≈ A4 @ 300 DPI. */
const LEVELS = [
  { edge: 3508, q: 90 }, { edge: 2480, q: 85 }, { edge: 2480, q: 75 }, { edge: 2000, q: 70 },
  { edge: 1754, q: 65 }, { edge: 1600, q: 60 }, { edge: 1400, q: 55 }, { edge: 1240, q: 50 },
  { edge: 1000, q: 45 }, { edge: 800, q: 40 }, { edge: 640, q: 35 }, { edge: 500, q: 30 },
];

async function loadPdf(bytes) {
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (err) {
    if (/encrypt/i.test(err.message)) throw new SigdirError('encrypted');
    throw new SigdirError('read_failed', err.message);
  }
}

function newDoc() {
  return PDFDocument.create().then((doc) => {
    doc.setProducer('Sığdır');
    doc.setCreator('Sığdır');
    return doc;
  });
}

async function readSource(file) {
  const head = await readHead(file);
  const { kind } = sniff(head, file);
  if (kind === 'pdf') return { file, kind, bytes: await readFileSafe(file) };
  if (kind === 'image') return { file, kind, image: await loadImage(file), cache: new Map() };
  throw new SigdirError('unsupported', path.extname(file));
}

async function imageJpeg(src, levelIdx) {
  if (src.cache.has(levelIdx)) return src.cache.get(levelIdx);
  const { edge, q } = LEVELS[levelIdx];
  const { data, info } = await src.image
    .make()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: q, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  const out = { data, width: info.width, height: info.height };
  src.cache.set(levelIdx, out);
  return out;
}

async function buildMerged(sources, levelIdx, signal) {
  const doc = await newDoc();
  for (const src of sources) {
    throwIfAborted(signal);
    if (src.kind === 'pdf') {
      if (!src.doc) src.doc = await loadPdf(src.bytes);
      const pages = await doc.copyPages(src.doc, src.doc.getPageIndices());
      pages.forEach((p) => doc.addPage(p));
    } else {
      const img = await imageJpeg(src, levelIdx);
      const embedded = await doc.embedJpg(img.data);
      const landscape = img.width > img.height;
      const pw = landscape ? A4.h : A4.w, ph = landscape ? A4.w : A4.h;
      const k = Math.min(pw / img.width, ph / img.height);
      const w = img.width * k, h = img.height * k;
      const page = doc.addPage([pw, ph]);
      page.drawImage(embedded, { x: (pw - w) / 2, y: (ph - h) / 2, width: w, height: h });
    }
  }
  const bytes = await doc.save({ useObjectStreams: true });
  const first = doc.getPage(0).getSize();
  return { bytes: Buffer.from(bytes), pages: doc.getPageCount(), width: Math.round(first.width), height: Math.round(first.height) };
}

/**
 * Görselleri ve PDF'leri verilen sırayla tek PDF'te birleştirir.
 * maxBytes verilirse görseller kademeli olarak yeniden sıkıştırılır; sonuç asla maxBytes'ı aşmaz.
 */
async function mergePdf({ files, output, maxBytes } = {}, opts = {}) {
  const { outputDir = null, lang = 'tr', signal, onProgress = () => {} } = opts;
  const list = Array.isArray(files) ? files : [];
  const input = list[0] || null;
  let beforeBytes = 0;
  try {
    if (!list.length) throw new SigdirError('no_files');
    if (maxBytes != null && !(Number(maxBytes) >= 1000)) throw new SigdirError('bad_target', 'maxBytes');
    const total = list.length;
    const sources = [];
    for (let i = 0; i < total; i++) {
      throwIfAborted(signal);
      onProgress({ index: i, total, file: list[i], percent: Math.round((i / total) * 50), status: 'working' });
      beforeBytes += await fileSize(list[i]);
      sources.push(await readSource(list[i]));
    }
    const hasImages = sources.some((s) => s.kind === 'image');
    let built = await buildMerged(sources, 0, signal);
    let level = 0;
    if (maxBytes && built.bytes.length > maxBytes) {
      if (!hasImages) throw new SigdirError('too_small', 'pdf only');
      // En yüksek kaliteli, sığan kademeyi ikili aramayla bul
      let lo = 1, hi = LEVELS.length - 1, best = null;
      while (lo <= hi) {
        throwIfAborted(signal);
        const mid = (lo + hi) >> 1;
        onProgress({ index: total - 1, total, file: input, percent: 50 + Math.round((mid / LEVELS.length) * 45), status: 'working' });
        const b = await buildMerged(sources, mid, signal);
        if (b.bytes.length <= maxBytes) { best = { b, mid }; hi = mid - 1; } else lo = mid + 1;
      }
      if (!best) throw new SigdirError('too_small', 'pdf');
      built = best.b;
      level = best.mid;
    }
    if (maxBytes && built.bytes.length > maxBytes) throw new SigdirError('too_small');
    throwIfAborted(signal);
    let desired;
    if (output) {
      desired = path.extname(output).toLowerCase() === '.pdf' ? output : output + '.pdf';
    } else {
      desired = desiredOutputPath(input, { outputDir, ext: 'pdf' });
    }
    const out = await writeFileUnique(desired, built.bytes);
    onProgress({ index: total - 1, total, file: input, percent: 100, status: 'done' });
    return {
      input,
      inputs: list,
      output: out,
      ok: true,
      beforeBytes,
      afterBytes: built.bytes.length,
      width: built.width,
      height: built.height,
      pages: built.pages,
      quality: hasImages ? LEVELS[level].q : undefined,
    };
  } catch (err) {
    onProgress({ index: 0, total: list.length, file: input, percent: 100, status: 'error' });
    return { input, inputs: list, output: null, ok: false, beforeBytes, afterBytes: 0, width: 0, height: 0, ...toErrorInfo(err, lang) };
  }
}

/** PDF'i tek sayfalık PDF'lere ayırır: "<ad>-sayfa-01.pdf" ... */
async function splitPdf({ file } = {}, opts = {}) {
  const { outputDir = null, lang = 'tr', signal, onProgress = () => {} } = opts;
  const outputs = [];
  try {
    if (!file) throw new SigdirError('no_files');
    const head = await readHead(file);
    if (sniff(head, file).kind !== 'pdf') throw new SigdirError('unsupported', path.extname(file));
    const src = await loadPdf(await readFileSafe(file));
    const n = src.getPageCount();
    const width = String(n).length < 2 ? 2 : String(n).length;
    const word = lang === 'en' ? 'page' : 'sayfa';
    for (let i = 0; i < n; i++) {
      throwIfAborted(signal);
      onProgress({ index: i, total: n, file, percent: Math.round((i / n) * 100), status: 'working' });
      const doc = await newDoc();
      const [page] = await doc.copyPages(src, [i]);
      doc.addPage(page);
      const bytes = await doc.save({ useObjectStreams: true });
      const desired = desiredOutputPath(file, { outputDir, ext: 'pdf', suffix: `-${word}-${String(i + 1).padStart(width, '0')}` });
      outputs.push(await writeFileUnique(desired, Buffer.from(bytes)));
    }
    onProgress({ index: n - 1, total: n, file, percent: 100, status: 'done' });
    return { ok: true, outputs };
  } catch (err) {
    onProgress({ index: 0, total: 1, file, percent: 100, status: 'error' });
    return { ok: false, outputs, ...toErrorInfo(err, lang) };
  }
}

/** Sayfa sayısı ve ilk sayfa ölçüsü (pt). */
async function pdfInfo(file) {
  const doc = await loadPdf(await readFileSafe(file));
  const s = doc.getPageCount() ? doc.getPage(0).getSize() : { width: 0, height: 0 };
  return { pages: doc.getPageCount(), width: Math.round(s.width), height: Math.round(s.height) };
}

module.exports = { mergePdf, splitPdf, pdfInfo, LEVELS };
