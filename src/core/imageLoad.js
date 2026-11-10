'use strict';

const path = require('path');
const fsp = require('fs').promises;
const sharp = require('sharp');
const { SigdirError } = require('./errors');
const { readFileSafe } = require('./fileUtils');
const { isBmp, decodeBmp } = require('./bmp');

sharp.cache(false);

const IMAGE_EXTS = ['.jpg', '.jpeg', '.jfif', '.png', '.webp', '.heic', '.heif', '.hif', '.avif', '.bmp', '.dib', '.tif', '.tiff', '.gif'];
const VIDEO_EXTS = ['.mp4', '.m4v', '.mov', '.mkv', '.webm', '.avi', '.wmv', '.flv', '.3gp', '.mts', '.m2ts', '.ts', '.mpg', '.mpeg'];
const PDF_EXTS = ['.pdf'];

const HEIC_BRANDS = ['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2'];
const VIDEO_BRANDS = ['isom', 'iso2', 'iso4', 'iso5', 'iso6', 'mp41', 'mp42', 'avc1', 'qt  ', 'M4V ', 'M4VH', 'M4VP', 'dash', 'mmp4', 'MSNV', 'NDAS', 'f4v ', '3gp4', '3gp5', '3gp6', '3g2a', 'XAVC', 'crx '];

/**
 * Dosyanın ilk baytlarına (ve gerekirse uzantısına) bakarak türünü tahmin eder.
 * Dönüş: { kind:'image'|'pdf'|'video'|'unknown', type }
 */
function sniff(head, filePath = '') {
  const ext = path.extname(filePath).toLowerCase();
  const str = (a, b) => head.slice(a, b).toString('latin1');
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return { kind: 'image', type: 'jpeg' };
  if (head.length >= 8 && head.readUInt32BE(0) === 0x89504e47) return { kind: 'image', type: 'png' };
  if (str(0, 4) === 'GIF8') return { kind: 'image', type: 'gif' };
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return { kind: 'image', type: 'webp' };
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'AVI ') return { kind: 'video', type: 'avi' };
  if (str(0, 4) === 'II*\0' || str(0, 4) === 'MM\0*') return { kind: 'image', type: 'tiff' };
  if (isBmp(head)) return { kind: 'image', type: 'bmp' };
  if (str(0, 5) === '%PDF-') return { kind: 'pdf', type: 'pdf' };
  // PDF başlığı ilk 1 KB içinde herhangi bir yerde olabilir
  if (head.indexOf('%PDF-') >= 0 && head.indexOf('%PDF-') < 1024) return { kind: 'pdf', type: 'pdf' };
  if (head.length >= 12 && str(4, 8) === 'ftyp') {
    const boxSize = head.readUInt32BE(0);
    const major = str(8, 12);
    const brands = [major];
    for (let o = 16; o + 4 <= Math.min(boxSize, head.length); o += 4) brands.push(str(o, o + 4));
    if (brands.includes('avif') || brands.includes('avis')) return { kind: 'image', type: 'avif' };
    if (HEIC_BRANDS.includes(major)) return { kind: 'image', type: 'heic' };
    if (VIDEO_BRANDS.includes(major) || brands.some((b) => VIDEO_BRANDS.includes(b))) return { kind: 'video', type: 'mp4' };
    if (brands.some((b) => HEIC_BRANDS.includes(b))) return { kind: 'image', type: 'heic' };
  }
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return { kind: 'video', type: 'mkv' };
  if (head.length >= 4 && head.readUInt32BE(0) === 0x3026b275) return { kind: 'video', type: 'wmv' };
  if (str(0, 3) === 'FLV') return { kind: 'video', type: 'flv' };
  if (head.length >= 4 && head.readUInt32BE(0) === 0x000001ba) return { kind: 'video', type: 'mpeg' };
  // Uzantıya göre son tahmin
  if (VIDEO_EXTS.includes(ext)) return { kind: 'video', type: ext.slice(1) };
  if (PDF_EXTS.includes(ext)) return { kind: 'pdf', type: 'pdf' };
  if (IMAGE_EXTS.includes(ext)) return { kind: 'image', type: ext.slice(1) };
  return { kind: 'unknown', type: null };
}

async function readHead(filePath, n = 4096) {
  let fh;
  try {
    fh = await fsp.open(filePath, 'r');
    const st = await fh.stat();
    if (st.isDirectory()) throw new SigdirError('unsupported', 'directory');
    const buf = Buffer.alloc(Math.min(n, st.size));
    await fh.read(buf, 0, buf.length, 0);
    return buf;
  } catch (err) {
    if (err instanceof SigdirError) throw err;
    if (err.code === 'ENOENT') throw new SigdirError('not_found', filePath);
    if (err.code === 'EISDIR') throw new SigdirError('unsupported', 'directory');
    throw new SigdirError('read_failed', err.message);
  } finally {
    if (fh) await fh.close().catch(() => {});
  }
}

async function decodeHeic(buf) {
  const decode = require('heic-decode');
  const { width, height, data } = await decode({ buffer: buf });
  return { width, height, channels: 4, data: Buffer.from(data.buffer, data.byteOffset, data.byteLength) };
}

/**
 * Görseli okur. Dönüş:
 *  { width, height (EXIF yönü uygulanmış), format, hasAlpha, make() }
 * make(): EXIF yönü uygulanmış yeni bir sharp örneği.
 */
async function loadImage(filePath) {
  const buf = await readFileSafe(filePath);
  const { kind, type } = sniff(buf.subarray(0, 4096), filePath);
  if (kind !== 'image') throw new SigdirError('unsupported', type || path.extname(filePath));

  const fromRaw = (raw, format) => ({
    width: raw.width,
    height: raw.height,
    format,
    hasAlpha: raw.channels === 4,
    make: () => sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: raw.channels } }),
  });

  if (type === 'bmp') {
    try {
      return fromRaw(decodeBmp(buf), 'bmp');
    } catch (err) {
      throw new SigdirError('read_failed', err.message);
    }
  }

  let heicErr = null;
  if (type === 'heic') {
    // sharp'ın hazır derlemesi HEVC (HEIC) çözemez; saf JS/WASM çözücüyü kullan.
    try {
      return fromRaw(await decodeHeic(buf), 'heic');
    } catch (err) {
      heicErr = err; // AVIF benzeri olabilir, sharp ile dene
    }
  }

  let meta;
  try {
    meta = await sharp(buf, { failOn: 'none' }).metadata();
    // Gerçekten çözülebildiğini doğrula (ör. desteklenmeyen sıkıştırma)
    await sharp(buf, { failOn: 'none' }).resize(8, 8, { fit: 'inside' }).raw().toBuffer();
  } catch (err) {
    throw new SigdirError('read_failed', (heicErr ? heicErr.message + ' / ' : '') + err.message);
  }
  const swap = meta.orientation && meta.orientation >= 5;
  return {
    width: swap ? meta.height : meta.width,
    height: swap ? meta.width : meta.height,
    format: meta.format,
    hasAlpha: !!meta.hasAlpha,
    make: () => sharp(buf, { failOn: 'none' }).autoOrient(),
  };
}

module.exports = { sniff, readHead, loadImage, IMAGE_EXTS, VIDEO_EXTS, PDF_EXTS };
