'use strict';

const sharp = require('sharp');
const { SigdirError, toErrorInfo } = require('./errors');
const { loadImage } = require('./imageLoad');
const { desiredOutputPath, writeFileUnique, fileSize, throwIfAborted } = require('./fileUtils');

const MIN_SIDE = 32; // ölçek küçültürken inilecek en kısa kenar (px)

/** Profil veya özel hedefi doğrulanmış bir hedef nesnesine çevirir. */
function resolveImageTarget({ profileId, custom } = {}, profiles = []) {
  let t;
  if (profileId) {
    const p = profiles.find((x) => x.id === profileId);
    if (!p) throw new SigdirError('bad_target', 'unknown profile ' + profileId);
    t = { format: p.format, maxBytes: p.maxBytes, width: p.width, height: p.height, longEdge: p.longEdge, aspect: p.aspect };
  } else if (custom) {
    t = { ...custom };
  } else {
    throw new SigdirError('bad_target', 'no target');
  }
  t.format = String(t.format || 'jpg').toLowerCase();
  if (t.format === 'jpeg') t.format = 'jpg';
  if (t.format !== 'jpg' && t.format !== 'png') t.format = 'jpg'; // PDF profili görsele uygulanırsa JPG üret
  const posInt = (v) => (v == null || v === '' ? undefined : Number.isFinite(+v) && +v >= 1 ? Math.round(+v) : NaN);
  t.maxBytes = Math.floor(Number(t.maxBytes));
  t.width = posInt(t.width);
  t.height = posInt(t.height);
  t.longEdge = posInt(t.longEdge);
  t.aspect = t.aspect == null ? undefined : Number(t.aspect);
  if (!Number.isFinite(t.maxBytes) || t.maxBytes < 1000) throw new SigdirError('bad_target', 'maxBytes');
  for (const k of ['width', 'height', 'longEdge']) if (Number.isNaN(t[k])) throw new SigdirError('bad_target', k);
  if (t.width > 20000 || t.height > 20000 || t.longEdge > 20000) throw new SigdirError('bad_target', 'too large');
  if (t.aspect !== undefined && !(t.aspect > 0)) t.aspect = undefined;
  return t;
}

async function toRaw(pipeline) {
  const { data, info } = await pipeline.toColourspace('srgb').raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}
const rawSharp = (r) => sharp(r.data, { raw: { width: r.width, height: r.height, channels: r.channels } });

/** Merkezden, verilen en/boy oranına kırpma kutusu. */
function centerAspectBox(w, h, aspect) {
  if (!aspect) return { left: 0, top: 0, width: w, height: h };
  if (w / h > aspect) {
    const nw = Math.max(1, Math.round(h * aspect));
    return { left: Math.floor((w - nw) / 2), top: 0, width: nw, height: h };
  }
  const nh = Math.max(1, Math.round(w / aspect));
  return { left: 0, top: Math.floor((h - nh) / 2), width: w, height: nh };
}

/**
 * Kaynağı yönlendirip döndürür, kırpar ve hedef ölçüye getirir. Ham (raw) piksel döndürür.
 * Sıra: EXIF yönü -> rotate -> crop (bu yönlendirilmiş görüntünün pikselleriyle) -> oran/ölçü.
 */
async function prepare(loaded, { rotate = 0, crop } = {}, target) {
  rotate = ((Math.round(Number(rotate) / 90) * 90) % 360 + 360) % 360;
  let raw = await toRaw(rotate ? loaded.make().rotate(rotate) : loaded.make());

  if (crop && crop.w > 0 && crop.h > 0) {
    const left = Math.max(0, Math.min(raw.width - 1, Math.round(crop.x || 0)));
    const top = Math.max(0, Math.min(raw.height - 1, Math.round(crop.y || 0)));
    const width = Math.max(1, Math.min(raw.width - left, Math.round(crop.w)));
    const height = Math.max(1, Math.min(raw.height - top, Math.round(crop.h)));
    if (left || top || width !== raw.width || height !== raw.height) {
      raw = await toRaw(rawSharp(raw).extract({ left, top, width, height }));
    }
  }

  const { width: tw, height: th, longEdge } = target;
  const aspect = tw && th ? tw / th : target.aspect;
  if (aspect) {
    const box = centerAspectBox(raw.width, raw.height, aspect);
    // Küçük yuvarlama farklarını yok say
    if (box.width < raw.width - 1 || box.height < raw.height - 1) raw = await toRaw(rawSharp(raw).extract(box));
  }
  let resize = null;
  if (tw && th) resize = { width: tw, height: th, fit: 'fill' };
  else if (tw) resize = { width: tw };
  else if (th) resize = { height: th };
  else if (longEdge && Math.max(raw.width, raw.height) > longEdge) {
    resize = { width: longEdge, height: longEdge, fit: 'inside', withoutEnlargement: true };
  }
  if (resize && !(resize.width === raw.width && resize.height === raw.height)) {
    raw = await toRaw(rawSharp(raw).resize(resize));
  }
  // Boyut kilitliyse ölçek küçültülemez (ör. vesikalık 394×472)
  raw.scalable = !(tw || th);
  return raw;
}

/**
 * Kodlayıcı üretir. fast=true arama sırasında kullanılır (daha hızlı ayarlar);
 * en iyi parametreler bulununca son kodlama fast=false ile yapılır ve yalnızca
 * gerçekten sığarsa kullanılır (sığmazsa aramadaki sonuç kalır).
 */
function encoderFor(raw, format) {
  const hasAlpha = raw.channels === 2 || raw.channels === 4;
  return async (scale, q, fast = true) => {
    let s = rawSharp(raw);
    if (scale < 1) {
      s = s.resize({
        width: Math.max(1, Math.round(raw.width * scale)),
        height: Math.max(1, Math.round(raw.height * scale)),
        fit: 'fill',
      });
    }
    if (format === 'jpg') {
      if (hasAlpha) s = s.flatten({ background: '#ffffff' });
      s = fast
        ? s.jpeg({ quality: q, optimiseCoding: true, chromaSubsampling: '4:2:0' })
        : s.jpeg({ quality: q, mozjpeg: true, chromaSubsampling: '4:2:0' });
    } else if (q >= 100) {
      s = s.png({ compressionLevel: fast ? 6 : 9, adaptiveFiltering: true, palette: false });
    } else {
      s = s.png({ compressionLevel: fast ? 6 : 9, palette: true, quality: q, effort: fast ? 1 : 7, dither: 1 });
    }
    // sharp varsayılan olarak EXIF/GPS/XMP meta verisini YAZMAZ (gizlilik).
    const { data, info } = await s.toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, q, scale };
  };
}

/**
 * Kalite (ve gerekirse ölçek) üzerinde ikili aramayla maxBytes altına inen en iyi kodlamayı bulur.
 * Dönen sonuç her zaman <= maxBytes'tır; bulunamazsa 'too_small' fırlatır.
 */
async function searchEncoding(raw, format, maxBytes, signal) {
  const enc = encoderFor(raw, format);
  const fits = (r) => r && r.data.length <= maxBytes;
  const Q = format === 'jpg' ? { hi: 92, lo: 65, floor: 10 } : { hi: 100, lo: 60, floor: 10 };

  // [lo, hi] aralığında sığan en yüksek kalite
  async function bestQuality(scale, lo, hi, knownLo) {
    throwIfAborted(signal);
    const rLo = knownLo || (await enc(scale, lo));
    if (!fits(rLo)) return null;
    if (hi <= lo) return rLo;
    throwIfAborted(signal);
    const rHi = await enc(scale, hi);
    if (fits(rHi)) return rHi;
    let best = rLo;
    let L = lo + 1, H = hi - 1;
    while (L <= H) {
      throwIfAborted(signal);
      const mid = (L + H) >> 1;
      const r = await enc(scale, mid);
      if (fits(r)) { best = r; L = mid + 1; } else H = mid - 1;
    }
    return best;
  }

  // 1) Tam ölçekte
  const first = await enc(1, Q.lo);
  if (fits(first)) return bestQuality(1, Q.lo, Q.hi, first);

  const minScale = raw.scalable ? Math.min(1, MIN_SIDE / Math.min(raw.width, raw.height)) : 1;

  // 2) Ölçek küçült (boyut kilitli değilse)
  if (minScale < 1) {
    let lo = minScale, hi = 1, loRes = null;
    // Boyut ~ piksel sayısıyla orantılı varsayımıyla ilk tahmin
    const guess = Math.max(minScale, Math.min(0.999, Math.sqrt(maxBytes / first.data.length) * 0.97));
    throwIfAborted(signal);
    let r = await enc(guess, Q.lo);
    if (fits(r)) { lo = guess; loRes = r; } else hi = guess;
    if (!loRes && guess > minScale) {
      throwIfAborted(signal);
      r = await enc(minScale, Q.lo);
      if (fits(r)) loRes = r;
    }
    if (loRes) {
      // Sığan en büyük ölçeği daralt (%1,5 hassasiyet)
      for (let i = 0; i < 12 && (hi - lo) / hi > 0.015; i++) {
        throwIfAborted(signal);
        const mid = (lo + hi) / 2;
        r = await enc(mid, Q.lo);
        if (fits(r)) { lo = mid; loRes = r; } else hi = mid;
      }
    }
    if (loRes) return bestQuality(loRes.scale, Q.lo, Q.hi, loRes);
  }

  // 3) Son çare: en küçük ölçekte kaliteyi düşür
  const last = await bestQuality(minScale, Q.floor, Q.lo - 1);
  if (last) return last;
  throw new SigdirError('too_small', `cannot reach ${maxBytes} bytes`);
}

/** Aramayı yapar, sonra aynı parametrelerle daha iyi (yavaş) kodlamayı dener. */
async function encodeBest(raw, format, maxBytes, signal) {
  const found = await searchEncoding(raw, format, maxBytes, signal);
  throwIfAborted(signal);
  const enc = encoderFor(raw, format);
  let best = found;
  try {
    const fin = await enc(found.scale, found.q, false);
    if (fin.data.length <= maxBytes) {
      best = fin;
      // mozjpeg aynı kalitede belirgin şekilde küçükse, artan payı kaliteye harca
      const qHi = format === 'jpg' ? 92 : 99;
      if (format === 'jpg' && fin.data.length < maxBytes * 0.9 && found.q < qHi) {
        let L = found.q + 1, H = qHi;
        for (let i = 0; i < 4 && L <= H; i++) {
          throwIfAborted(signal);
          const mid = (L + H) >> 1;
          const r = await enc(found.scale, mid, false);
          if (r.data.length <= maxBytes) { best = r; L = mid + 1; } else H = mid - 1;
        }
      }
    }
  } catch (err) {
    if (err instanceof SigdirError) throw err; // iptal
    /* aksi halde arama sonucu zaten geçerli */
  }
  return best;
}

/**
 * Tek bir görseli hedefe sığdırır.
 * file: { path, rotate?, crop? }, target: resolveImageTarget() çıktısı
 * opts: { outputDir?, signal?, lang? }
 */
async function fitImage(file, target, opts = {}) {
  const input = typeof file === 'string' ? file : file.path;
  const { outputDir = null, signal, lang = 'tr' } = opts;
  let beforeBytes = 0;
  try {
    beforeBytes = await fileSize(input);
    throwIfAborted(signal);
    const loaded = await loadImage(input);
    throwIfAborted(signal);
    const raw = await prepare(loaded, typeof file === 'string' ? {} : file, target);
    const best = await encodeBest(raw, target.format, target.maxBytes, signal);
    if (best.data.length > target.maxBytes) throw new SigdirError('too_small'); // savunma amaçlı
    throwIfAborted(signal);
    const output = await writeFileUnique(desiredOutputPath(input, { outputDir, ext: target.format }), best.data);
    return {
      input,
      output,
      ok: true,
      beforeBytes,
      afterBytes: best.data.length,
      width: best.width,
      height: best.height,
      quality: best.q,
    };
  } catch (err) {
    return { input, output: null, ok: false, beforeBytes, afterBytes: 0, width: 0, height: 0, ...toErrorInfo(err, lang) };
  }
}

/** Toplu işlem. onProgress({ index, total, file, percent, status }) */
async function fitImages(files, target, opts = {}) {
  const { onProgress = () => {}, signal } = opts;
  const results = [];
  const total = files.length;
  for (let i = 0; i < total; i++) {
    const f = files[i];
    const p = typeof f === 'string' ? f : f.path;
    if (signal && signal.aborted) {
      results.push({ input: p, output: null, ok: false, beforeBytes: 0, afterBytes: 0, width: 0, height: 0, ...toErrorInfo(new SigdirError('cancelled'), opts.lang) });
      continue;
    }
    onProgress({ index: i, total, file: p, percent: Math.round((i / total) * 100), status: 'working' });
    const r = await fitImage(f, target, opts);
    results.push(r);
    onProgress({ index: i, total, file: p, percent: Math.round(((i + 1) / total) * 100), status: r.ok ? 'done' : 'error' });
  }
  return results;
}

module.exports = { resolveImageTarget, prepare, searchEncoding, encodeBest, fitImage, fitImages, centerAspectBox };
