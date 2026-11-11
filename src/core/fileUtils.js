'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { SigdirError } = require('./errors');

const SUFFIX = '-sigdir';
const MAX_NAME_BYTES = 255; // çoğu dosya sisteminde ad sınırı (NTFS: 255 UTF-16, ext4: 255 bayt)
const COUNTER_RESERVE = '-9999'.length; // çakışma eki için pay
const WIN_MAX_PATH = 259; // Gezgin ve birçok Windows programı için tam yol sınırı

/** Dizgiyi, kod noktalarını bölmeden en fazla maxBytes UTF-8 bayta kısaltır. */
function truncateBytes(str, maxBytes) {
  let out = '';
  let bytes = 0;
  for (const ch of str) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > maxBytes) break;
    out += ch;
    bytes += b;
  }
  return out;
}

/** Dizgiyi, vekil çiftleri bölmeden en fazla n UTF-16 birimine kısaltır. */
function truncateUnits(str, n) {
  let out = '';
  for (const ch of str) {
    if (out.length + ch.length > n) break;
    out += ch;
  }
  return out;
}

/**
 * Çıktı adının gövdesini, ek + uzantı + olası "-N" çakışma ekiyle birlikte dosya sistemi sınırlarına
 * (255 bayt; Windows'ta ayrıca 259 karakterlik tam yol) sığacak şekilde kısaltır.
 */
function safeBaseName(base, { dir = '', suffix = '', ext = '', platform = process.platform } = {}) {
  const tail = suffix + ext;
  let name = truncateBytes(base, Math.max(1, MAX_NAME_BYTES - Buffer.byteLength(tail) - COUNTER_RESERVE));
  if (platform === 'win32') {
    const room = WIN_MAX_PATH - (dir.length + 1) - tail.length - COUNTER_RESERVE;
    name = truncateUnits(name, Math.max(8, room));
  }
  if (platform === 'win32' || name.length < base.length) name = name.replace(/[ .]+$/, ''); // Windows sondaki boşluk/noktayı sevmez
  return name || 'dosya';
}

/**
 * Çıktı için istenen yolu hesaplar (henüz benzersiz değil).
 * Varsayılan: kaynağın yanına "<ad>-sigdir.<uzantı>". Çok uzun adlar güvenli uzunluğa kısaltılır.
 */
function desiredOutputPath(input, { outputDir = null, ext, suffix = SUFFIX, platform = process.platform } = {}) {
  const parsed = path.parse(input);
  const dir = outputDir || parsed.dir;
  const e = ext ? (ext.startsWith('.') ? ext : '.' + ext) : parsed.ext;
  const name = safeBaseName(parsed.name, { dir, suffix, ext: e, platform });
  return path.join(dir, `${name}${suffix}${e}`);
}

/** Çıktı yazarken/klasör oluştururken oluşan sistem hatasını anlaşılır bir SigdirError'a çevirir. */
function outputError(err) {
  if (err instanceof SigdirError) return err;
  const code = err && err.code;
  if (code === 'ENAMETOOLONG') return new SigdirError('name_too_long', err.message);
  if (code === 'ENOSPC') return new SigdirError('write_failed', err.message, { messageKey: 'disk_full' });
  if (['ENOENT', 'ENOTDIR', 'EEXIST', 'EISDIR', 'ENODEV', 'ENXIO', 'EIO'].includes(code)) {
    return new SigdirError('write_failed', err.message, { messageKey: 'output_dir_unavailable' });
  }
  return new SigdirError('write_failed', err && err.message);
}

/** Çıktı klasörünü hazırlar; kullanılamıyorsa write_failed (+ açıklayıcı mesaj) fırlatır. */
async function ensureOutputDir(dir) {
  try {
    await fsp.mkdir(dir, { recursive: true });
    const st = await fsp.stat(dir);
    if (!st.isDirectory()) throw Object.assign(new Error('not a directory'), { code: 'ENOTDIR' });
  } catch (err) {
    throw outputError(err);
  }
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
  await ensureOutputDir(path.dirname(desired));
  for (let n = 1; n < 10000; n++) {
    const c = candidatePath(desired, n);
    try {
      await fsp.writeFile(c, data, { flag: 'wx' });
      return c;
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw outputError(err);
    }
  }
  throw new SigdirError('write_failed', 'no free name');
}

/**
 * Geçici bir dosyayı, var olan hiçbir dosyanın üzerine yazmadan hedef ada taşır.
 * (COPYFILE_EXCL atomik "yoksa oluştur" garantisi verir; FAT/exFAT sürücülerde de çalışır.)
 */
async function commitFileUnique(tmpPath, desired) {
  await ensureOutputDir(path.dirname(desired));
  for (let n = 1; n < 10000; n++) {
    const c = candidatePath(desired, n);
    try {
      await fsp.copyFile(tmpPath, c, fs.constants.COPYFILE_EXCL);
      await fsp.unlink(tmpPath).catch(() => {});
      return c;
    } catch (err) {
      if (err.code === 'EEXIST') continue;
      throw outputError(err);
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
  MAX_NAME_BYTES,
  safeBaseName,
  truncateBytes,
  outputError,
  ensureOutputDir,
  desiredOutputPath,
  candidatePath,
  uniquePathSync,
  writeFileUnique,
  commitFileUnique,
  fileSize,
  readFileSafe,
  throwIfAborted,
};
