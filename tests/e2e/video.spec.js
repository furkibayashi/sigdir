'use strict';

/**
 * Video sığdırma — gerçek uygulama + gerçek ffmpeg (PATH veya ffmpeg-static).
 * Discord 10 MB hedefi, oynatılabilirlik (ffprobe + tam çözme), iptal, kırpma/dikey/sessiz,
 * SIGDIR_FFMPEG=none ile devre dışı sekme.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

let fxDir;
let video20;
let videoHash;

test.beforeAll(async () => {
  test.setTimeout(120000);
  fxDir = H.mkTmp('fx-vid-');
  if (H.HAS_FFMPEG) {
    video20 = H.makeVideo(path.join(fxDir, 'oyun klibi 20sn.mp4'));
    videoHash = H.sha256(video20);
  }
});

test.afterAll(() => {
  if (video20) expect(H.sha256(video20), 'kaynak video değişti').toBe(videoHash);
});

const card = (win, value) => win.locator(`.pcard:has(input[name="p-video"][value="${value}"])`);

test('Discord 10 MB: arayüzden 20 sn video → ≤ 10 MB, oynatılabilir, meta veri silinmiş, ilerleme gösteriliyor', async () => {
  test.skip(!H.HAS_FFMPEG, 'ffmpeg yok');
  test.setTimeout(400000);
  const out = H.mkTmp('vid-out-');
  const ctx = await H.launchApp({ settings: { lang: 'tr', theme: 'dark', outputDir: out } });
  try {
    const { win } = ctx;
    expect(fs.statSync(video20).size).toBeGreaterThan(10e6);
    await win.locator('#tab-video').click();
    await H.stubOpenDialog(ctx.app, [video20]);
    await win.locator('#panel-video [data-action="add"]:visible').first().click();
    await expect(win.locator('#panel-video .video-editor .f-name')).toContainText('oyun klibi 20sn.mp4', { timeout: 20000 });
    await card(win, 'discord-video').click();
    const go = win.locator('#panel-video [data-fkey="go-video"]');
    await expect(go).toBeEnabled();
    const seen = new Set();
    const t0 = Date.now();
    await go.click();
    const bar = win.locator('#panel-video .progress');
    await expect(bar).toBeVisible();
    // İlerleme yüzdesi artıyor mu
    while (Date.now() - t0 < 360000) {
      if (await win.locator('#panel-video .banner').isVisible()) break;
      const v = await bar.getAttribute('aria-valuenow').catch(() => null);
      if (v != null) seen.add(Number(v));
      await win.waitForTimeout(500);
    }
    const ms = Date.now() - t0;
    await expect(win.locator('#panel-video .banner-ok')).toBeVisible();
    await win.screenshot({ path: path.join(H.OUT_DIR, 'ui-video-done-tr-dark.png') });
    const outs = H.ls(out);
    expect(outs).toEqual(['oyun klibi 20sn-sigdir.mp4']);
    const file = path.join(out, outs[0]);
    const size = fs.statSync(file).size;
    expect(size).toBeLessThanOrEqual(10000000);
    const pr = H.ffprobe(file);
    expect(pr.code).toBe(0);
    const v = pr.json.streams.find((s) => s.codec_type === 'video');
    const a = pr.json.streams.find((s) => s.codec_type === 'audio');
    expect(v.codec_name).toBe('h264');
    expect(v.pix_fmt).toBe('yuv420p');
    expect(a && a.codec_name).toBe('aac');
    expect(Math.abs(parseFloat(pr.json.format.duration) - 20)).toBeLessThan(0.5);
    const tags = JSON.stringify(pr.json.format.tags || {});
    expect(tags).not.toContain('GizliBaslik');
    expect(tags).not.toContain('GizliYorum');
    const dec = H.decodesCleanly(file);
    expect(dec.ok, dec.stderr).toBe(true);
    const pcts = [...seen].sort((x, y) => x - y);
    H.writeEvidence('video-discord.json', { ms, size, width: v.width, height: v.height, bitRate: pr.json.format.bit_rate, progressSeen: pcts });
    expect(pcts.filter((p) => p > 0 && p < 100).length, 'ara ilerleme yüzdesi görülmedi').toBeGreaterThan(2);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('video IPC: kırp (2–8 sn) + 9:16 dikey + sesi kapat → 6 sn, dikey, sessiz; hatalı aralık ve imkânsız hedef', async () => {
  test.skip(!H.HAS_FFMPEG, 'ffmpeg yok');
  test.setTimeout(300000);
  const out = H.mkTmp('vid-out2-');
  const ctx = await H.launchApp({ settings: { lang: 'tr', outputDir: out } });
  try {
    const [info] = await H.api(ctx.win, 'inspect', [video20]);
    expect(info).toMatchObject({ kind: 'video', width: 1280, height: 720, hasAudio: true });
    expect(Math.abs(info.durationSec - 20)).toBeLessThan(0.2);
    expect(info.thumb).toMatch(/^data:image\/jpeg;base64,/);

    const r = await H.api(ctx.win, 'fitVideo', { file: video20, maxBytes: 5e6, start: 2, end: 8, vertical: true, mute: true });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    expect(fs.statSync(r.output).size).toBeLessThanOrEqual(5e6);
    expect(r.afterBytes).toBe(fs.statSync(r.output).size);
    const pr = H.ffprobe(r.output);
    const v = pr.json.streams.find((s) => s.codec_type === 'video');
    expect(pr.json.streams.some((s) => s.codec_type === 'audio')).toBe(false);
    expect(v.height).toBeGreaterThan(v.width);
    expect(v.width / v.height).toBeCloseTo(9 / 16, 1);
    expect(Math.abs(parseFloat(pr.json.format.duration) - 6)).toBeLessThan(0.3);

    const bad = await H.api(ctx.win, 'fitVideo', { file: video20, maxBytes: 10e6, start: 8, end: 2 });
    expect(bad).toMatchObject({ ok: false, error: 'bad_range' });
    const past = await H.api(ctx.win, 'fitVideo', { file: video20, maxBytes: 10e6, start: 25 });
    expect(past).toMatchObject({ ok: false, error: 'bad_range' });
    const tiny = await H.api(ctx.win, 'fitVideo', { file: video20, maxBytes: 50000 });
    expect(tiny).toMatchObject({ ok: false, error: 'too_small' });
    const notVideo = await H.api(ctx.win, 'fitVideo', { file: path.join(fxDir, 'yok.mp4'), maxBytes: 10e6 });
    expect(notVideo).toMatchObject({ ok: false, error: 'not_found' });
    expect(H.ls(out)).toHaveLength(1);
  } finally {
    await ctx.close();
  }
});

test('video iptal (arayüz "İptal et"): çıktı yok, geçici dosya kalmaz, sonra yeni iş başlatılabilir', async () => {
  test.skip(!H.HAS_FFMPEG, 'ffmpeg yok');
  test.setTimeout(200000);
  const out = H.mkTmp('vid-out3-');
  const ctx = await H.launchApp({ settings: { lang: 'tr', outputDir: out } });
  try {
    const { win } = ctx;
    await win.locator('#tab-video').click();
    await H.stubOpenDialog(ctx.app, [video20]);
    await win.locator('#panel-video [data-action="add"]:visible').first().click();
    await expect(win.locator('#panel-video .video-editor .f-name')).toBeVisible({ timeout: 20000 });
    await card(win, 'whatsapp-video-16').click();
    await win.locator('#panel-video [data-fkey="go-video"]').click();
    await expect.poll(async () => Number(await win.locator('#panel-video .progress').getAttribute('aria-valuenow')), { timeout: 60000 }).toBeGreaterThan(3);
    await win.locator('#panel-video [data-fkey="cancel"]').click();
    await expect(win.locator('#panel-video .banner')).toBeVisible({ timeout: 20000 });
    await expect(win.locator('#panel-video .banner')).toContainText('İptal');
    expect(H.ls(out)).toEqual([]);
    const leftovers = H.ls(ctx.appTmp).filter((n) => n.startsWith('sigdir-'));
    expect(leftovers, 'iptal sonrası geçici klasör kaldı').toEqual([]);
    // ffmpeg süreci öldürülmüş olmalı
    const ff = require('child_process').spawnSync('pgrep', ['-f', ctx.appTmp], { encoding: 'utf8' }).stdout.trim();
    expect(ff, 'iptal sonrası ffmpeg süreci yaşıyor').toBe('');
    // Meşgul durumu temizlenmiş olmalı
    const again = await H.api(win, 'fitVideo', { file: video20, maxBytes: 20e6, start: 0, end: 2 });
    expect(again.ok, JSON.stringify(again)).toBe(true);
  } finally {
    await ctx.close();
  }
});

test('SIGDIR_FFMPEG=none: video sekmesi "ffmpeg yok" der, uygulama çökmez, IPC ffmpeg_missing döner', async () => {
  const vid = video20 || path.join(fxDir, 'sahte.mp4');
  if (!fs.existsSync(vid)) fs.writeFileSync(vid, Buffer.alloc(100));
  const ctx = await H.launchApp({ settings: { lang: 'tr', theme: 'light' }, env: { SIGDIR_FFMPEG: 'none' }, args: ['--files', vid] });
  try {
    const { win } = ctx;
    expect((await H.api(win, 'getAppInfo')).ffmpegAvailable).toBe(false);
    await expect(win.locator('#video-badge')).toBeVisible();
    await expect(win.locator('#video-badge')).toContainText('ffmpeg yok');
    // --files ile gelen video için bildirim
    await expect(win.locator('#toasts')).toContainText('ffmpeg', { timeout: 10000 });
    await win.locator('#tab-video').click();
    await expect(win.locator('#video-off')).toBeVisible();
    await expect(win.locator('#video-off')).toContainText('ffmpeg');
    await expect(win.locator('#panel-video .pane-files')).toBeHidden();
    await win.screenshot({ path: path.join(H.OUT_DIR, 'ui-video-noffmpeg-tr-light.png') });
    const r = await H.api(win, 'fitVideo', { file: vid, maxBytes: 10e6 });
    expect(r).toMatchObject({ ok: false, error: 'ffmpeg_missing' });
    const [info] = await H.api(win, 'inspect', [vid]);
    expect(info.error).toBe('ffmpeg_missing');
    // Kısayol düğmesi Görsel sekmesine götürür
    await win.locator('#video-off button').first().click();
    await expect(win.locator('#tab-image')).toHaveAttribute('aria-selected', 'true');
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});
