'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { spawn, spawnSync } = require('child_process');
const { SigdirError, toErrorInfo } = require('./errors');
const { desiredOutputPath, commitFileUnique, fileSize, throwIfAborted } = require('./fileUtils');

const SAFETY = 0.97; // %3 güvenlik payı
const CONTAINER_RESERVE_BYTES = 32 * 1024; // MP4 başlıkları vb. için pay (küçük hedeflerde orantılı küçülür)
const MIN_VIDEO_KBPS = 40;
const MAX_RETRIES = 2;

// ---------------------------------------------------------------- ffmpeg bulma
let cachedTools; // undefined = henüz aranmadı, null = yok

function works(bin) {
  try {
    const r = spawnSync(bin, ['-version'], { stdio: 'ignore', windowsHide: true, timeout: 15000 });
    return r.status === 0;
  } catch (_) {
    return false;
  }
}

function staticPath(mod) {
  try {
    let p = mod === 'ffmpeg-static' ? require('ffmpeg-static') : require('ffprobe-static').path;
    if (!p) return null;
    // electron-builder paketinde ikili dosyalar asar dışına açılır
    p = p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
    return fs.existsSync(p) ? p : null;
  } catch (_) {
    return null;
  }
}

/**
 * ffmpeg/ffprobe'u bulur: önce SIGDIR_FFMPEG/SIGDIR_FFPROBE ortam değişkenleri
 * ("none" = yokmuş gibi davran), sonra PATH, sonra ffmpeg-static/ffprobe-static.
 * Dönüş: { ffmpeg, ffprobe } veya null.
 */
function findFfmpeg({ refresh = false } = {}) {
  if (cachedTools !== undefined && !refresh) return cachedTools;
  const envF = process.env.SIGDIR_FFMPEG, envP = process.env.SIGDIR_FFPROBE;
  if (envF === 'none' || envP === 'none') return (cachedTools = null);
  const pick = (env, name, mod) => {
    if (env && works(env)) return env;
    if (works(name)) return name;
    const s = staticPath(mod);
    return s && works(s) ? s : null;
  };
  const ffmpeg = pick(envF, 'ffmpeg', 'ffmpeg-static');
  const ffprobe = ffmpeg ? pick(envP, 'ffprobe', 'ffprobe-static') : null;
  cachedTools = ffmpeg && ffprobe ? { ffmpeg, ffprobe } : null;
  return cachedTools;
}

function requireTools() {
  const t = findFfmpeg();
  if (!t) throw new SigdirError('ffmpeg_missing');
  return t;
}

// ---------------------------------------------------------------- süreç çalıştırma
function run(bin, args, { signal, onStdoutLine, collectStdout = false } = {}) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(new SigdirError('cancelled'));
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const chunks = [];
    let lineBuf = '';
    let killedByAbort = false;
    const onAbort = () => {
      killedByAbort = true;
      try { child.kill('SIGKILL'); } catch (_) { /* yoksay */ }
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => {
      if (collectStdout) chunks.push(d);
      if (onStdoutLine) {
        lineBuf += d.toString();
        let i;
        while ((i = lineBuf.indexOf('\n')) >= 0) {
          onStdoutLine(lineBuf.slice(0, i).trim());
          lineBuf = lineBuf.slice(i + 1);
        }
      }
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 8192) stderr = stderr.slice(-8192);
    });
    child.on('error', (err) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      reject(new SigdirError('encode_failed', err.message));
    });
    child.on('close', (code) => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (killedByAbort) return reject(new SigdirError('cancelled'));
      resolve({ code, stderr, stdout: collectStdout ? Buffer.concat(chunks) : null });
    });
  });
}

// ---------------------------------------------------------------- inceleme
/** ffprobe ile süre, ölçü (döndürme uygulanmış), ses varlığı, fps. */
async function probe(file, { signal } = {}) {
  const { ffprobe } = requireTools();
  await fileSize(file); // yoksa not_found
  const r = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { signal, collectStdout: true });
  if (r.code !== 0) throw new SigdirError('read_failed', r.stderr.trim());
  let j;
  try { j = JSON.parse(r.stdout.toString()); } catch (e) { throw new SigdirError('read_failed', e.message); }
  const streams = j.streams || [];
  const v = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const a = streams.find((s) => s.codec_type === 'audio');
  let duration = parseFloat(j.format && j.format.duration);
  if (!Number.isFinite(duration) && v) duration = parseFloat(v.duration);
  let rotation = 0;
  if (v) {
    if (v.tags && v.tags.rotate) rotation = parseInt(v.tags.rotate, 10) || 0;
    for (const sd of v.side_data_list || []) if (sd.rotation != null) rotation = parseInt(sd.rotation, 10) || 0;
  }
  const swap = Math.abs(rotation) % 180 === 90;
  let fps = 0;
  if (v && v.avg_frame_rate && v.avg_frame_rate.includes('/')) {
    const [n, d] = v.avg_frame_rate.split('/').map(Number);
    if (d) fps = n / d;
  }
  return {
    durationSec: Number.isFinite(duration) ? duration : 0,
    hasVideo: !!v,
    hasAudio: !!a,
    width: v ? (swap ? v.height : v.width) : 0,
    height: v ? (swap ? v.width : v.height) : 0,
    fps,
    formatName: j.format && j.format.format_name,
  };
}

/** Videonun bir karesinden küçük JPEG (data URL için Buffer). */
async function videoThumb(file, { durationSec = 0, size = 256, signal } = {}) {
  const { ffmpeg } = requireTools();
  const t = durationSec > 2 ? Math.min(1, durationSec / 3) : 0;
  const r = await run(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-nostdin', '-ss', String(t), '-i', file, '-frames:v', '1',
      '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease`, '-f', 'image2pipe', '-c:v', 'mjpeg', '-q:v', '5', 'pipe:1'],
    { signal, collectStdout: true },
  );
  if (r.code !== 0 || !r.stdout.length) throw new SigdirError('read_failed', r.stderr.trim());
  return r.stdout;
}

// ---------------------------------------------------------------- plan
const even = (n) => Math.max(2, Math.floor(n / 2) * 2);

/** Hedef bitrate hesabı (kbit/s). Ses payı ve %3 güvenlik payı dahil. */
function computeBitrates({ maxBytes, durationSec, hasAudio = true, mute = false }) {
  if (!(durationSec > 0)) throw new SigdirError('read_failed', 'no duration');
  const reserve = Math.min(CONTAINER_RESERVE_BYTES, Math.max(4096, maxBytes * 0.02));
  const usableBits = (maxBytes * SAFETY - reserve) * 8;
  const totalKbps = usableBits / durationSec / 1000;
  let audioKbps = 0;
  if (hasAudio && !mute) audioKbps = totalKbps >= 1000 ? 128 : totalKbps >= 500 ? 96 : totalKbps >= 250 ? 64 : 32;
  const videoKbps = Math.floor(totalKbps - audioKbps);
  if (videoKbps < MIN_VIDEO_KBPS) throw new SigdirError('too_small', `video ${videoKbps} kbps`);
  return { totalKbps, audioKbps, videoKbps };
}

/** Bitrate'e göre makul en kısa kenar sınırı. */
function shortSideCap(videoKbps) {
  if (videoKbps >= 8000) return 2160;
  if (videoKbps >= 4000) return 1080;
  if (videoKbps >= 2000) return 720;
  if (videoKbps >= 1000) return 540;
  if (videoKbps >= 500) return 480;
  if (videoKbps >= 250) return 360;
  return 240;
}

/** Kırpma/ölçek filtreleri ve çıkış ölçüsü. */
function planFilters({ srcW, srcH, vertical, videoKbps, fps }) {
  const filters = [];
  let w = srcW, h = srcH;
  if (vertical) {
    // Ortadan 9:16 kırp
    const target = 9 / 16;
    if (w / h > target) w = even(h * target); else h = even(w / target);
    w = even(w); h = even(h);
    if (w !== srcW || h !== srcH) filters.push(`crop=${w}:${h}:(iw-${w})/2:(ih-${h})/2`);
  }
  const cap = shortSideCap(videoKbps);
  const short = Math.min(w, h);
  let ow = w, oh = h;
  if (short > cap) {
    const k = cap / short;
    ow = even(w * k); oh = even(h * k);
  } else {
    ow = even(w); oh = even(h);
  }
  if (ow !== w || oh !== h) filters.push(`scale=${ow}:${oh}:flags=lanczos`);
  if (fps > 31 && videoKbps < 1500) filters.push('fps=30');
  filters.push('setsar=1', 'format=yuv420p');
  return { filters: filters.join(','), width: ow, height: oh };
}

// ---------------------------------------------------------------- kodlama
/**
 * Videoyu hedef boyuta sığdırır (2 geçişli x264). Sonuç asla maxBytes'ı aşmaz.
 * opts: { outputDir?, signal?, lang?, onProgress?(percent, info) }
 */
async function fitVideo({ file, maxBytes, start, end, vertical = false, mute = false } = {}, opts = {}) {
  const { outputDir = null, signal, lang = 'tr', onProgress = () => {} } = opts;
  let beforeBytes = 0;
  let workDir = null;
  try {
    if (!file) throw new SigdirError('no_files');
    maxBytes = Math.floor(Number(maxBytes));
    if (!(maxBytes >= 10000)) throw new SigdirError('bad_target', 'maxBytes');
    const { ffmpeg } = requireTools();
    beforeBytes = await fileSize(file);
    const info = await probe(file, { signal });
    if (!info.hasVideo) throw new SigdirError('no_video');

    const s = start == null || start === '' ? 0 : Number(start);
    let e = end == null || end === '' ? info.durationSec : Number(end);
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0) throw new SigdirError('bad_range');
    if (info.durationSec > 0) e = Math.min(e, info.durationSec);
    const clip = e - s;
    if (!(clip > 0.05)) throw new SigdirError('bad_range');

    let { audioKbps, videoKbps } = computeBitrates({ maxBytes, durationSec: clip, hasAudio: info.hasAudio, mute });
    const useAudio = info.hasAudio && !mute;

    workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'sigdir-'));
    const tmpOut = path.join(workDir, 'out.mp4');
    const logBase = path.join(workDir, 'pass');
    const nullOut = process.platform === 'win32' ? 'NUL' : '/dev/null';

    let attempt = 0;
    let size = Infinity;
    let plan;
    for (; attempt <= MAX_RETRIES; attempt++) {
      throwIfAborted(signal);
      plan = planFilters({ srcW: info.width, srcH: info.height, vertical, videoKbps, fps: info.fps });
      const common = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-nostats', '-progress', 'pipe:1'];
      const inArgs = [...(s > 0 ? ['-ss', s.toFixed(3)] : []), '-i', file, '-t', clip.toFixed(3)];
      const vArgs = ['-map', '0:v:0', '-vf', plan.filters, '-c:v', 'libx264', '-preset', 'medium', '-b:v', `${videoKbps}k`, '-passlogfile', logBase];

      for (const pass of [1, 2]) {
        const onLine = (line) => {
          const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
          if (!m) return;
          const t = Number(m[1]) / 1e6;
          const p = Math.max(0, Math.min(1, t / clip));
          onProgress(Math.min(99, Math.round((pass - 1) * 50 + p * 50)), { pass, attempt });
        };
        const args = pass === 1
          ? [...common, ...inArgs, ...vArgs, '-pass', '1', '-an', '-f', 'null', nullOut]
          : [...common, ...inArgs, ...vArgs, '-pass', '2',
            ...(useAudio ? ['-map', '0:a:0?', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-ac', '2'] : ['-an']),
            '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart', '-f', 'mp4', tmpOut];
        const r = await run(ffmpeg, args, { signal, onStdoutLine: onLine });
        if (r.code !== 0) throw new SigdirError('encode_failed', r.stderr.trim().slice(-500));
      }
      size = (await fsp.stat(tmpOut)).size;
      if (size <= maxBytes) break;
      // Aştı: bitrate'i orantılı düşürüp yeniden dene
      const totalKbps = ((videoKbps + audioKbps) * (maxBytes / size)) * 0.95;
      if (useAudio && totalKbps - audioKbps < MIN_VIDEO_KBPS * 2 && audioKbps > 32) audioKbps = 32;
      videoKbps = Math.floor(totalKbps - audioKbps);
      if (videoKbps < MIN_VIDEO_KBPS) break;
    }
    if (size > maxBytes) throw new SigdirError('too_small', `size ${size} > ${maxBytes}`);
    throwIfAborted(signal);
    const output = await commitFileUnique(tmpOut, desiredOutputPath(file, { outputDir, ext: 'mp4' }));
    onProgress(100, { done: true });
    return {
      input: file,
      output,
      ok: true,
      beforeBytes,
      afterBytes: size,
      width: plan.width,
      height: plan.height,
      durationSec: clip,
      videoKbps,
      audioKbps: useAudio ? audioKbps : 0,
      attempts: Math.min(attempt, MAX_RETRIES) + 1,
    };
  } catch (err) {
    return { input: file, output: null, ok: false, beforeBytes, afterBytes: 0, width: 0, height: 0, ...toErrorInfo(err, lang) };
  } finally {
    if (workDir) await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { findFfmpeg, probe, videoThumb, computeBitrates, planFilters, shortSideCap, fitVideo, SAFETY };
