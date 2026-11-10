'use strict';

/**
 * Test fikstürleri: hepsi test sırasında geçici klasörde üretilir (depoda ikili dosya yok).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const sharp = require('sharp');

function tmpDir(prefix = 'sigdir-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) { /* yoksay */ }
}

/** Tekrarlanabilir sözde rastgele sayı üreteci */
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Fotoğrafa benzeyen (degrade + gürültü) ham RGB(A) görüntü.
 * noise: 0..1 (1 = tamamen gürültü; sıkıştırması en zor durum)
 */
function rawImage(w, h, { noise = 0.3, channels = 3, seed = 7 } = {}) {
  const r = rng(seed);
  const data = Buffer.alloc(w * h * channels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * channels;
      const base = [(x / w) * 255, (y / h) * 255, ((x + y) / (w + h)) * 255];
      for (let c = 0; c < 3; c++) {
        const v = base[c] * (1 - noise) + r() * 255 * noise;
        data[o + c] = Math.max(0, Math.min(255, v | 0));
      }
      if (channels === 4) data[o + 3] = x < w / 4 ? 0 : 255;
    }
  }
  return { data, raw: { width: w, height: h, channels } };
}

async function makeImage(file, w, h, { format = 'jpeg', noise = 0.3, channels = 3, quality = 95, seed, orientation, exif } = {}) {
  const { data, raw } = rawImage(w, h, { noise, channels, seed });
  let s = sharp(data, { raw });
  if (format === 'jpeg') s = s.jpeg({ quality });
  else if (format === 'png') s = s.png();
  else if (format === 'webp') s = s.webp({ quality });
  else if (format === 'tiff') s = s.tiff();
  if (orientation || exif) {
    s = s.withMetadata(orientation ? { orientation } : {});
    if (exif) s = s.withExif(exif);
  }
  await s.toFile(file);
  return file;
}

/** 24 bit, aşağıdan yukarı BMP (sol yarı kırmızı, sağ yarı mavi). */
function makeBmp(file, w, h) {
  const stride = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + stride * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0, 'latin1');
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(stride * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = 54 + y * stride + x * 3;
      if (x < w / 2) { b[o] = 0; b[o + 1] = 0; b[o + 2] = 255; } else { b[o] = 255; b[o + 1] = 0; b[o + 2] = 0; }
    }
  }
  fs.writeFileSync(file, b);
  return file;
}

// ------------------------------------------------------------------ ffmpeg
function hasBin(bin) {
  try { return spawnSync(bin, ['-version'], { stdio: 'ignore' }).status === 0; } catch (_) { return false; }
}
const HAS_FFMPEG = hasBin('ffmpeg') && hasBin('ffprobe');

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
}

/** testsrc tabanlı örnek video. noise=true: sıkıştırması zor (bitrate denetimini gerçekten sınar). */
function makeVideo(file, { seconds = 5, size = '640x360', rate = 25, audio = true, noise = true } = {}) {
  const v = `testsrc2=size=${size}:rate=${rate}:duration=${seconds}` + (noise ? ',noise=alls=30:allf=t' : '');
  const args = ['-f', 'lavfi', '-i', v];
  if (audio) args.push('-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`);
  args.push('-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18', '-pix_fmt', 'yuv420p');
  if (audio) args.push('-c:a', 'aac', '-b:a', '128k', '-shortest');
  args.push(file);
  ffmpeg(args);
  return file;
}

// ------------------------------------------------------------------ HEIC
/**
 * Küçük bir HEIC dosyası üretir: ffmpeg/libx265 ile tek HEVC karesi kodlanır,
 * sonra minimal bir HEIF kabına (ftyp/meta/mdat) JS ile yerleştirilir.
 * Üretilemezse null döner (test atlanır).
 */
function makeHeic(file, w = 320, h = 240) {
  if (!HAS_FFMPEG) return null;
  const enc = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  if (!/libx265/.test(enc.stdout || '')) return null;
  const hevcFile = file + '.hevc';
  try {
    ffmpeg(['-f', 'lavfi', '-i', `testsrc2=size=${w}x${h}:rate=1`, '-frames:v', '1', '-pix_fmt', 'yuv420p',
      '-c:v', 'libx265', '-x265-params', 'log-level=none:info=0', '-f', 'hevc', hevcFile]);
    const es = fs.readFileSync(hevcFile);
    const nals = splitAnnexB(es);
    const byType = (t) => nals.find((n) => ((n[0] >> 1) & 0x3f) === t);
    const vps = byType(32), sps = byType(33), pps = byType(34);
    const vcl = nals.filter((n) => ((n[0] >> 1) & 0x3f) < 32);
    if (!vps || !sps || !pps || !vcl.length) return null;
    fs.writeFileSync(file, buildHeif({ w, h, vps, sps, pps, vcl }));
    return file;
  } catch (_) {
    return null;
  } finally {
    rmrf(hevcFile);
  }
}

function splitAnnexB(buf) {
  const starts = [];
  for (let i = 0; i + 3 <= buf.length; i++) {
    if (buf[i] === 0 && buf[i + 1] === 0 && buf[i + 2] === 1) {
      starts.push(i + 3);
      i += 2;
    }
  }
  const out = [];
  for (let k = 0; k < starts.length; k++) {
    let end = k + 1 < starts.length ? starts[k + 1] - 3 : buf.length;
    while (end > starts[k] && buf[end - 1] === 0) end--; // 4 baytlık başlangıç kodunun sıfırı
    out.push(buf.subarray(starts[k], end));
  }
  return out;
}

function unescapeRbsp(nal) {
  const out = [];
  for (let i = 0; i < nal.length; i++) {
    if (i >= 2 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) continue;
    out.push(nal[i]);
  }
  return Buffer.from(out);
}

const u8 = (v) => Buffer.from([v & 0xff]);
const u16 = (v) => { const b = Buffer.alloc(2); b.writeUInt16BE(v); return b; };
const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(v >>> 0); return b; };
const box = (type, ...parts) => { const body = Buffer.concat(parts); return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]); };
const fullBox = (type, version, flags, ...parts) => box(type, u8(version), u8(flags >> 16), u8(flags >> 8), u8(flags), ...parts);

function buildHvcC({ vps, sps, pps }) {
  const r = unescapeRbsp(sps);
  // r[0..1] NAL başlığı, r[2] = vps_id(4) max_sub_layers(3) nesting(1), sonra profile_tier_level
  const ptl = r.subarray(3, 3 + 12); // profil(1) + uyumluluk(4) + kısıt(6) + seviye(1)
  const arrays = [vps, sps, pps].map((n) => Buffer.concat([u8(0x80 | ((n[0] >> 1) & 0x3f)), u16(1), u16(n.length), n]));
  return box('hvcC',
    u8(1), ptl.subarray(0, 1), ptl.subarray(1, 5), ptl.subarray(5, 11), ptl.subarray(11, 12),
    u16(0xf000), u8(0xfc), u8(0xfd), u8(0xf8), u8(0xf8), u16(0), u8(0x0f), u8(3), ...arrays);
}

function buildHeif({ w, h, vps, sps, pps, vcl }) {
  const data = Buffer.concat(vcl.map((n) => Buffer.concat([u32(n.length), n])));
  const ftyp = box('ftyp', Buffer.from('heic', 'latin1'), u32(0), Buffer.from('mif1heic', 'latin1'));
  const hdlr = fullBox('hdlr', 0, 0, u32(0), Buffer.from('pict', 'latin1'), u32(0), u32(0), u32(0), u8(0));
  const pitm = fullBox('pitm', 0, 0, u16(1));
  const infe = fullBox('infe', 2, 0, u16(1), u16(0), Buffer.from('hvc1', 'latin1'), u8(0));
  const iinf = fullBox('iinf', 0, 0, u16(1), infe);
  const ipco = box('ipco', buildHvcC({ vps, sps, pps }), fullBox('ispe', 0, 0, u32(w), u32(h)));
  const ipma = fullBox('ipma', 0, 0, u32(1), u16(1), u8(2), u8(0x81), u8(0x02));
  const iprp = box('iprp', ipco, ipma);
  const makeMeta = (offset) => fullBox('meta', 0, 0, hdlr, pitm,
    fullBox('iloc', 0, 0, u8(0x44), u8(0x00), u16(1), u16(1), u16(0), u16(1), u32(offset), u32(data.length)),
    iinf, iprp);
  const metaLen = makeMeta(0).length;
  const offset = ftyp.length + metaLen + 8; // mdat başlığından sonra
  return Buffer.concat([ftyp, makeMeta(offset), box('mdat', data)]);
}

module.exports = { tmpDir, rmrf, rawImage, makeImage, makeBmp, makeVideo, makeHeic, HAS_FFMPEG, ffmpeg };
