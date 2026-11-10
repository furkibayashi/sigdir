'use strict';

/**
 * Küçük, bağımlılıksız BMP çözücü (sharp'ın hazır derlemesi BMP okuyamıyor).
 * Desteklenen: 1/4/8 bit paletli, 16/24/32 bit, BI_RGB, BI_BITFIELDS, BI_ALPHABITFIELDS, RLE8, RLE4;
 * aşağıdan yukarı ve yukarıdan aşağı satır düzeni. Çıktı: RGBA (4 kanal).
 */

function isBmp(buf) {
  return buf.length > 26 && buf[0] === 0x42 && buf[1] === 0x4d;
}

function maskInfo(mask) {
  if (!mask) return { shift: 0, max: 0 };
  let shift = 0;
  while (((mask >>> shift) & 1) === 0 && shift < 32) shift++;
  let bits = 0;
  while (((mask >>> (shift + bits)) & 1) === 1 && shift + bits < 32) bits++;
  return { shift, max: bits >= 32 ? 0xffffffff : (1 << bits) - 1 };
}

function decodeBmp(buf) {
  if (!isBmp(buf)) throw new Error('not a BMP');
  const dataOffset = buf.readUInt32LE(10);
  const hdrSize = buf.readUInt32LE(14);
  let width, height, bpp, compression = 0, colorsUsed = 0;
  let topDown = false;
  let palEntrySize = 4;
  if (hdrSize === 12) {
    width = buf.readUInt16LE(18);
    height = buf.readInt16LE(20);
    bpp = buf.readUInt16LE(24);
    palEntrySize = 3;
  } else {
    width = buf.readInt32LE(18);
    height = buf.readInt32LE(22);
    bpp = buf.readUInt16LE(28);
    compression = buf.readUInt32LE(30);
    colorsUsed = buf.readUInt32LE(46);
  }
  if (height < 0) {
    topDown = true;
    height = -height;
  }
  if (width <= 0 || height <= 0 || width > 30000 || height > 30000) throw new Error('bad BMP size');

  // Renk maskeleri
  let rMask = 0, gMask = 0, bMask = 0, aMask = 0;
  if (compression === 3 || compression === 6) {
    if (hdrSize >= 52) {
      rMask = buf.readUInt32LE(54); gMask = buf.readUInt32LE(58); bMask = buf.readUInt32LE(62);
      if (hdrSize >= 56 || compression === 6) aMask = buf.readUInt32LE(66);
    } else {
      // BITMAPINFOHEADER + ayrı maske dizisi
      rMask = buf.readUInt32LE(14 + hdrSize);
      gMask = buf.readUInt32LE(18 + hdrSize);
      bMask = buf.readUInt32LE(22 + hdrSize);
      if (compression === 6) aMask = buf.readUInt32LE(26 + hdrSize);
    }
  } else if (bpp === 16) {
    rMask = 0x7c00; gMask = 0x03e0; bMask = 0x001f;
  } else if (bpp === 32) {
    rMask = 0x00ff0000; gMask = 0x0000ff00; bMask = 0x000000ff;
  }
  if (compression !== 0 && compression !== 1 && compression !== 2 && compression !== 3 && compression !== 6) {
    throw new Error('unsupported BMP compression ' + compression);
  }

  // Palet
  let palette = null;
  if (bpp <= 8) {
    const n = colorsUsed || (1 << bpp);
    const palStart = 14 + hdrSize + (compression === 3 ? 12 : compression === 6 ? 16 : 0);
    palette = [];
    for (let i = 0; i < n; i++) {
      const o = palStart + i * palEntrySize;
      if (o + 2 >= buf.length) break;
      palette.push([buf[o + 2], buf[o + 1], buf[o]]);
    }
  }

  const out = Buffer.alloc(width * height * 4);
  const setPx = (x, y, r, g, b, a = 255) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const row = topDown ? y : height - 1 - y;
    const o = (row * width + x) * 4;
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
  };
  const pal = (i) => (palette && palette[i]) || [0, 0, 0];

  if (compression === 1 || compression === 2) {
    // RLE8 / RLE4 (satırlar her zaman aşağıdan yukarı)
    const is4 = compression === 2;
    let x = 0, y = 0, p = dataOffset;
    while (p + 1 < buf.length && y < height) {
      const count = buf[p++], val = buf[p++];
      if (count > 0) {
        for (let i = 0; i < count; i++) {
          const idx = is4 ? (i % 2 === 0 ? val >> 4 : val & 0x0f) : val;
          const c = pal(idx);
          setPx(x++, y, c[0], c[1], c[2]);
        }
      } else if (val === 0) { x = 0; y++; }
      else if (val === 1) break;
      else if (val === 2) { x += buf[p++]; y += buf[p++]; }
      else {
        const n = val;
        for (let i = 0; i < n; i++) {
          let idx;
          if (is4) { const byte = buf[p + (i >> 1)]; idx = i % 2 === 0 ? byte >> 4 : byte & 0x0f; }
          else idx = buf[p + i];
          const c = pal(idx);
          setPx(x++, y, c[0], c[1], c[2]);
        }
        const used = is4 ? Math.ceil(n / 2) : n;
        p += used + (used % 2);
      }
    }
    return { width, height, channels: 4, data: out };
  }

  const stride = Math.floor((bpp * width + 31) / 32) * 4;
  if (dataOffset + stride * (height - 1) + Math.ceil((bpp * width) / 8) > buf.length) {
    throw new Error('truncated BMP');
  }
  const mr = maskInfo(rMask), mg = maskInfo(gMask), mb = maskInfo(bMask), ma = maskInfo(aMask);
  const scale = (v, m) => (m.max ? Math.round((((v >>> m.shift) & m.max) * 255) / m.max) : 0);
  let anyAlpha = false;

  for (let y = 0; y < height; y++) {
    const rowStart = dataOffset + y * stride;
    const outRow = topDown ? y : height - 1 - y;
    for (let x = 0; x < width; x++) {
      const o = (outRow * width + x) * 4;
      let r, g, b, a = 255;
      if (bpp === 24) {
        const s = rowStart + x * 3;
        b = buf[s]; g = buf[s + 1]; r = buf[s + 2];
      } else if (bpp === 32 || bpp === 16) {
        const v = bpp === 32 ? buf.readUInt32LE(rowStart + x * 4) : buf.readUInt16LE(rowStart + x * 2);
        r = scale(v, mr); g = scale(v, mg); b = scale(v, mb);
        if (aMask) { a = scale(v, ma); if (a) anyAlpha = true; }
      } else if (bpp <= 8) {
        const bitPos = x * bpp;
        const byte = buf[rowStart + (bitPos >> 3)];
        const idx = (byte >> (8 - bpp - (bitPos & 7))) & ((1 << bpp) - 1);
        [r, g, b] = pal(idx);
      } else {
        throw new Error('unsupported BMP bit depth ' + bpp);
      }
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = a;
    }
  }
  // Alfa maskesi var ama tüm pikseller 0 ise (yaygın), opak kabul et.
  if (aMask && !anyAlpha) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { width, height, channels: 4, data: out };
}

module.exports = { isBmp, decodeBmp };
