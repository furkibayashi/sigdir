'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { SigdirError } = require('./errors');

const SUFFIX = '-sigdir';

/**
 * Çıktı için istenen yolu hesaplar (henüz benzersiz değil).
 * Varsayılan: kaynağın yanına "<ad>-sigdir.<uzantı>".
 */
function desiredOutputPath(input, { outputDir = null, ext, suffix = SUFFIX } = {}) {
  const parsed = path.parse(input);
  const dir = outputDir || parsed.dir;
  const e = ext ? (ext.startsWith('.') ? ext : '.' + ext) : parsed.ext;
  return path.join(dir, `${parsed.name}${suffix}${e}`);
}

/** "ad.jpg" -> "ad.jpg", "ad-2.jpg", "ad-3.jpg" ... */
function candidatePath(desired, n) {
  if (n <= 1) return desired;
  const p = path.parse(desired);
  return path.join(p.dir, `${p.name}-${n}${p.ext}`);
}

/** Var olan dosyalarla çakışmayan ilk yolu döndürür (yalnızca kontrol, rezervasyon yapmaz). */
function uniquePathSync(desired) {
  for (let n = 1; n < 10000; n++) {
    const c = candidatePath(desired, n);
    if (!fs.existsSync(c)) return c;
  }
  throw new SigdirError('write_failed', 'no free name');
}

/**
 * Buffer'ı, hiçbir mevcut dosyanın üzerine yazmadan kaydeder.
 * 'wx' bayrağı sayesinde yarış durumunda bile var olan dosya ezilmez.
 * Çakışmada -2, -3 ... eklenir. Gerçek yolu döndürür.
 */
async function writeFileUnique(desired, data) {
  await fsp.mkdir(path.dirname(desired), { recursive: true });
  for (let n = 1; n < 10000; n++) {
    const c = candidatePath(desired, n);
    try {
      await fsp.writeFile(c, data, { flag: 'wx' });
      return c;
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw new SigdirError('write_failed', err.message);
    }
  }
  throw new SigdirError('write_failed', 'no free name');
}

/**
 * Geçici bir dosyayı, var olan hiçbir dosyanın üzerine yazmadan hedef ada taşır.
 * (COPYFILE_EXCL atomik "yoksa oluştur" garantisi verir; FAT/exFAT sürücülerde de çalışır.)
 */
async function commitFileUnique(tmpPath, desired) {
  await fsp.mkdir(path.dirname(desired), { recursive: true });
  for (let n = 1; n < 10000; n++) {
    const c = candidatePath(desired, n);
    try {
      await fsp.copyFile(tmpPath, c, fs.constants.COPYFILE_EXCL);
      await fsp.unlink(tmpPath).catch(() => {});
      return c;
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw new SigdirError('write_failed', err.message);
    }
  }
  throw new SigdirError('write_failed', 'no free name');
}

async function fileSize(p) {
  try {
    return (await fsp.stat(p)).size;
  } catch (err) {
    if (err.code === 'ENOENT') throw new SigdirError('not_found', p);
    throw new SigdirError('read_failed', err.message);
  }
}

async function readFileSafe(p) {
  try {
    return await fsp.readFile(p);
  } catch (err) {
    if (err.code === 'ENOENT') throw new SigdirError('not_found', p);
    if (err.code === 'EISDIR') throw new SigdirError('unsupported', p);
    throw new SigdirError('read_failed', err.message);
  }
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) throw new SigdirError('cancelled');
}

module.exports = {
  SUFFIX,
  desiredOutputPath,
  candidatePath,
  uniquePathSync,
  writeFileUnique,
  commitFileUnique,
  fileSize,
  readFileSafe,
  throwIfAborted,
};
