'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf, makeVideo, HAS_FFMPEG } = require('./helpers/fixtures');
const video = require('../../src/core/videoFit');

const skip = HAS_FFMPEG ? false : 'ffmpeg/ffprobe bulunamadı';
let dir, sample, silent;

test.before(() => {
  dir = tmpDir();
  if (HAS_FFMPEG) {
    // 5 sn, gürültülü (sıkıştırması zor) test videosu + ses
    sample = makeVideo(path.join(dir, 'ornek.mp4'), { seconds: 5, size: '640x360', audio: true });
    silent = makeVideo(path.join(dir, 'sessiz.mp4'), { seconds: 3, size: '320x240', audio: false });
  }
});
test.after(() => rmrf(dir));

test('bitrate hesabı: ses payı ve %3 güvenlik payı dahil', () => {
  const r = video.computeBitrates({ maxBytes: 10_000_000, durationSec: 60, hasAudio: true });
  const expectedTotal = ((10_000_000 * 0.97 - 32 * 1024) * 8) / 60 / 1000;
  assert.ok(Math.abs(r.totalKbps - expectedTotal) < 1e-6);
  assert.equal(r.audioKbps, 128);
  assert.equal(r.videoKbps, Math.floor(expectedTotal - 128));
  // Toplam bitrate × süre, güvenlik payıyla hedefin altında kalmalı
  assert.ok(((r.videoKbps + r.audioKbps) * 1000 * 60) / 8 <= 10_000_000 * 0.97);

  const muted = video.computeBitrates({ maxBytes: 10_000_000, durationSec: 60, hasAudio: true, mute: true });
  assert.equal(muted.audioKbps, 0);
  assert.equal(muted.videoKbps, Math.floor(expectedTotal));
  // Düşük bitrate'te ses payı küçülür
  assert.equal(video.computeBitrates({ maxBytes: 10_000_000, durationSec: 300 }).audioKbps, 64);
  // İmkânsız hedef
  assert.throws(() => video.computeBitrates({ maxBytes: 1_000_000, durationSec: 3600 }), { code: 'too_small' });
});

test('9:16 ortadan kırpma ve çözünürlük sınırı', () => {
  const v = video.planFilters({ srcW: 1920, srcH: 1080, vertical: true, videoKbps: 5000, fps: 30 });
  assert.match(v.filters, /^crop=606:1080:\(iw-606\)\/2:\(ih-1080\)\/2/);
  assert.equal(v.width, 606);
  assert.equal(v.height, 1080);
  const low = video.planFilters({ srcW: 1920, srcH: 1080, vertical: false, videoKbps: 600, fps: 60 });
  assert.deepEqual([low.width, low.height], [852, 480]);
  assert.match(low.filters, /fps=30/);
  const keep = video.planFilters({ srcW: 640, srcH: 360, vertical: false, videoKbps: 5000, fps: 25 });
  assert.deepEqual([keep.width, keep.height], [640, 360]);
  assert.equal(keep.filters, 'setsar=1,format=yuv420p');
});

test('ffmpeg bulunamazsa uygulama çökmez, ffmpeg_missing döner', async () => {
  const old = process.env.SIGDIR_FFMPEG;
  process.env.SIGDIR_FFMPEG = 'none';
  try {
    assert.equal(video.findFfmpeg({ refresh: true }), null);
    const r = await video.fitVideo({ file: path.join(dir, 'x.mp4'), maxBytes: 1_000_000 });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'ffmpeg_missing');
    assert.match(r.message, /ffmpeg/);
  } finally {
    if (old === undefined) delete process.env.SIGDIR_FFMPEG; else process.env.SIGDIR_FFMPEG = old;
    video.findFfmpeg({ refresh: true });
  }
});

test('ffprobe: süre, ölçü, ses', { skip }, async () => {
  const p = await video.probe(sample);
  assert.ok(Math.abs(p.durationSec - 5) < 0.2, String(p.durationSec));
  assert.deepEqual([p.width, p.height, p.hasAudio, p.hasVideo], [640, 360, true, true]);
  const s = await video.probe(silent);
  assert.equal(s.hasAudio, false);
});

test('video hedef boyutu asla aşılmaz', { skip }, async () => {
  const before = fs.readFileSync(sample);
  for (const maxBytes of [400_000, 150_000]) {
    const progress = [];
    const r = await video.fitVideo({ file: sample, maxBytes }, { outputDir: dir, onProgress: (p) => progress.push(p) });
    assert.equal(r.ok, true, `${maxBytes}: ${r.error} ${r.message}`);
    const size = fs.statSync(r.output).size;
    assert.equal(size, r.afterBytes);
    assert.ok(size <= maxBytes, `${size} > ${maxBytes}`);
    // Hedefin makul bir kısmını kullanmalı (gereksiz düşük kalite olmasın)
    assert.ok(size > maxBytes * 0.5, `çok küçük: ${size}`);
    const p = await video.probe(r.output);
    assert.ok(Math.abs(p.durationSec - 5) < 0.3);
    assert.equal(p.hasAudio, true);
    assert.ok(progress.length > 2 && progress[progress.length - 1] === 100);
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i] >= 0 && progress[i] <= 100);
  }
  assert.ok(before.equals(fs.readFileSync(sample)), 'kaynak değişmemeli');
});

test('başlangıç/bitiş, 9:16 dikey ve sesi kapat', { skip }, async () => {
  const r = await video.fitVideo({ file: sample, maxBytes: 200_000, start: 1, end: 3.5, vertical: true, mute: true }, { outputDir: dir });
  assert.equal(r.ok, true, r.message);
  assert.ok(fs.statSync(r.output).size <= 200_000);
  const p = await video.probe(r.output);
  assert.ok(Math.abs(p.durationSec - 2.5) < 0.3, String(p.durationSec));
  assert.equal(p.hasAudio, false);
  assert.ok(Math.abs(p.width / p.height - 9 / 16) < 0.02, `${p.width}x${p.height}`);
  assert.equal(p.height, 360);
});

test('sessiz video ve hatalı aralık', { skip }, async () => {
  const r = await video.fitVideo({ file: silent, maxBytes: 100_000 }, { outputDir: dir });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.audioKbps, 0);
  const bad = await video.fitVideo({ file: sample, maxBytes: 100_000, start: 4, end: 2 }, { outputDir: dir });
  assert.equal(bad.error, 'bad_range');
  const tiny = await video.fitVideo({ file: sample, maxBytes: 20_000 }, { outputDir: dir });
  assert.equal(tiny.ok, false);
  assert.equal(tiny.error, 'too_small');
  const missing = await video.fitVideo({ file: path.join(dir, 'yok.mp4'), maxBytes: 100_000 });
  assert.equal(missing.error, 'not_found');
});

test('iptal: ffmpeg durdurulur, yarım dosya kalmaz', { skip }, async () => {
  const d = tmpDir();
  try {
    const big = makeVideo(path.join(d, 'uzun.mp4'), { seconds: 20, size: '1280x720', audio: true });
    const ac = new AbortController();
    const started = Date.now();
    const promise = video.fitVideo({ file: big, maxBytes: 3_000_000 }, { signal: ac.signal });
    setTimeout(() => ac.abort(), 700);
    const r = await promise;
    assert.equal(r.ok, false);
    assert.equal(r.error, 'cancelled');
    assert.ok(Date.now() - started < 15000);
    assert.deepEqual(fs.readdirSync(d), ['uzun.mp4']);
  } finally {
    rmrf(d);
  }
});
