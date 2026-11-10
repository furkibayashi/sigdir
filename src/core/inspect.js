'use strict';

const path = require('path');
const { SigdirError, toErrorInfo } = require('./errors');
const { sniff, readHead, loadImage } = require('./imageLoad');
const { fileSize } = require('./fileUtils');
const { pdfInfo } = require('./pdfTools');
const { findFfmpeg, probe, videoThumb } = require('./videoFit');

const THUMB = 256;

async function imageThumb(loaded) {
  const buf = await loaded
    .make()
    .resize({ width: THUMB, height: THUMB, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .jpeg({ quality: 75 })
    .toBuffer();
  return 'data:image/jpeg;base64,' + buf.toString('base64');
}

/** Tek dosya için FileInfo. Hata olursa reject etmez, error alanı doldurulur. */
async function inspectOne(p, { lang = 'tr', thumbs = true } = {}) {
  const info = { path: p, name: path.basename(p), sizeBytes: 0, kind: 'unknown' };
  try {
    info.sizeBytes = await fileSize(p);
    const head = await readHead(p);
    const { kind } = sniff(head, p);
    info.kind = kind;
    if (kind === 'image') {
      const loaded = await loadImage(p);
      info.width = loaded.width;
      info.height = loaded.height;
      info.format = loaded.format;
      if (thumbs) info.thumb = await imageThumb(loaded);
    } else if (kind === 'pdf') {
      const pi = await pdfInfo(p);
      info.pages = pi.pages;
      info.width = pi.width; // pt
      info.height = pi.height;
    } else if (kind === 'video') {
      if (!findFfmpeg()) throw new SigdirError('ffmpeg_missing');
      const v = await probe(p);
      if (!v.hasVideo) throw new SigdirError('no_video');
      info.durationSec = v.durationSec;
      info.width = v.width;
      info.height = v.height;
      info.hasAudio = v.hasAudio;
      if (thumbs) {
        try {
          const jpg = await videoThumb(p, { durationSec: v.durationSec, size: THUMB });
          info.thumb = 'data:image/jpeg;base64,' + jpg.toString('base64');
        } catch (_) { /* küçük resim olmadan da devam */ }
      }
    } else {
      throw new SigdirError('unsupported', path.extname(p));
    }
  } catch (err) {
    const e = toErrorInfo(err, lang);
    info.error = e.error;
    info.message = e.message;
  }
  return info;
}

async function inspect(paths, opts = {}) {
  const out = [];
  for (const p of Array.isArray(paths) ? paths : []) out.push(await inspectOne(String(p), opts));
  return out;
}

module.exports = { inspect, inspectOne };
