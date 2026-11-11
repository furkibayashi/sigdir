'use strict';

const path = require('path');
const { app, ipcMain, dialog, shell, nativeTheme } = require('electron');
const core = require('../core');
const contextMenu = require('./contextMenu');
const { trustedOutputPath } = require('./guards');
const { runFitImages } = require('./imageJob');

const IMAGE_EXT = ['jpg', 'jpeg', 'jfif', 'png', 'webp', 'heic', 'heif', 'avif', 'bmp', 'tif', 'tiff', 'gif'];
const VIDEO_EXT = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'wmv', 'flv', '3gp', 'mts', 'm2ts', 'ts', 'mpg', 'mpeg'];

/**
 * Tüm `window.sigdir` IPC işleyicilerini kaydeder.
 * ctx: { settings: SettingsStore, getWindow(), profilesFile, takePendingFiles(), setContextMenuState(bool), getContextMenuState() }
 */
function registerIpc(ctx) {
  const { settings } = ctx;
  let job = null; // { controller, kind }
  // Ana süreçteki bir kayıt diyaloğundan gelen (renderer'ın uyduramayacağı) çıktı yolları
  const approvedOutputs = ctx.approvedOutputs || new Set();
  const lang = () => settings.get().lang;

  const fail = (err) => ({ ok: false, ...core.toErrorInfo(err, lang()) });

  function handle(name, fn) {
    ipcMain.handle(`sigdir:${name}`, async (event, ...args) => {
      // Yalnızca kendi penceremizin yerel sayfasından gelen istekleri kabul et
      const url = (event.senderFrame && event.senderFrame.url) || '';
      if (!url.startsWith('file://')) return fail(new core.SigdirError('unknown', 'untrusted sender'));
      try {
        return await fn(...args);
      } catch (err) {
        console.error(`[sigdir] ${name}:`, err);
        return fail(err);
      }
    });
  }

  function sendProgress(p) {
    const win = ctx.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('sigdir:progress', p);
  }

  async function runJob(kind, fn) {
    if (job) return fail(new core.SigdirError('busy'));
    const controller = new AbortController();
    job = { controller, kind };
    try {
      return await fn(controller.signal);
    } finally {
      job = null;
    }
  }

  function afterDone(outputs) {
    const first = outputs.find(Boolean);
    if (first && settings.get().openFolderAfter) shell.showItemInFolder(first);
  }

  const outputDir = () => settings.get().outputDir || null;
  const strList = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : []);

  handle('getAppInfo', async () => ({
    version: app.getVersion(),
    platform: process.platform,
    ffmpegAvailable: !!core.findFfmpeg(),
  }));

  handle('getSettings', async () => ({ ...settings.get(), contextMenuInstalled: ctx.getContextMenuState() }));

  handle('setSettings', async (partial) => {
    const before = settings.get();
    const next = settings.set(partial || {});
    if (next.theme !== before.theme) nativeTheme.themeSource = next.theme;
    // Sağ tık menüsü kuruluysa etiketini yeni dile göre güncelle
    if (next.lang !== before.lang && process.platform === 'win32' && ctx.getContextMenuState()) {
      await contextMenu.install({ lang: next.lang, ...ctx.exeInfo() }).catch(() => {});
    }
    return { ...next, contextMenuInstalled: ctx.getContextMenuState() };
  });

  handle('getProfiles', async () => core.loadProfiles(ctx.profilesFile));

  handle('pickFiles', async (kind = 'any') => {
    const tr = lang() === 'tr';
    const filters = {
      image: [{ name: tr ? 'Görseller' : 'Images', extensions: IMAGE_EXT }],
      pdf: [{ name: tr ? 'Görseller ve PDF' : 'Images and PDF', extensions: ['pdf', ...IMAGE_EXT] }],
      video: [{ name: tr ? 'Videolar' : 'Videos', extensions: VIDEO_EXT }],
      any: [{ name: tr ? 'Desteklenen dosyalar' : 'Supported files', extensions: [...IMAGE_EXT, 'pdf', ...VIDEO_EXT] }],
    }[kind] || [];
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: tr ? 'Dosya seç' : 'Choose files',
      properties: ['openFile', 'multiSelections'],
      filters: [...filters, { name: tr ? 'Tüm dosyalar' : 'All files', extensions: ['*'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });

  handle('pickOutputDir', async () => {
    const r = await dialog.showOpenDialog(ctx.getWindow(), {
      title: lang() === 'tr' ? 'Çıktı klasörünü seç' : 'Choose output folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled || !r.filePaths.length ? null : r.filePaths[0];
  });

  handle('inspect', async (paths) => core.inspect(strList(paths), { lang: lang() }));

  // SIG-008: sözleşme gereği her zaman Result[] (geçersiz hedef/meşgul/boş liste dahil)
  handle('fitImages', async (opts = {}) =>
    runFitImages(opts, {
      profiles: core.loadProfiles(ctx.profilesFile),
      outputDir: outputDir(),
      lang: lang(),
      runJob,
      onProgress: (p) => sendProgress({ job: 'images', ...p }),
      afterDone,
    }));

  handle('mergePdf', async (opts = {}) =>
    runJob('pdf', async (signal) => {
      const r = await core.mergePdf(
        { files: strList(opts.files), output: trustedOutputPath(opts.output, { outputDir: settings.get().outputDir, approved: approvedOutputs }), maxBytes: opts.maxBytes || undefined },
        { outputDir: outputDir(), lang: lang(), signal, onProgress: (p) => sendProgress({ job: 'pdf', ...p }) },
      );
      if (r.ok) afterDone([r.output]);
      return r;
    }));

  handle('splitPdf', async (opts = {}) =>
    runJob('pdf', async (signal) => {
      const r = await core.splitPdf(
        { file: typeof opts.file === 'string' ? opts.file : null },
        { outputDir: outputDir(), lang: lang(), signal, onProgress: (p) => sendProgress({ job: 'pdf', ...p }) },
      );
      if (r.ok) afterDone(r.outputs);
      return r;
    }));

  handle('fitVideo', async (opts = {}) =>
    runJob('video', async (signal) => {
      const file = typeof opts.file === 'string' ? opts.file : null;
      sendProgress({ job: 'video', index: 0, total: 1, file, percent: 0, status: 'working' });
      const r = await core.fitVideo(
        { file, maxBytes: opts.maxBytes, start: opts.start, end: opts.end, vertical: !!opts.vertical, mute: !!opts.mute },
        {
          outputDir: outputDir(),
          lang: lang(),
          signal,
          onProgress: (percent) => sendProgress({ job: 'video', index: 0, total: 1, file, percent, status: 'working' }),
        },
      );
      sendProgress({ job: 'video', index: 0, total: 1, file, percent: 100, status: r.ok ? 'done' : 'error' });
      if (r.ok) afterDone([r.output]);
      return r;
    }));

  handle('cancel', async () => {
    if (job) job.controller.abort();
    return { ok: true };
  });

  handle('revealInFolder', async (p) => {
    if (typeof p === 'string' && p) shell.showItemInFolder(path.normalize(p));
    return undefined;
  });

  handle('setContextMenu', async (enabled) => {
    if (process.platform !== 'win32') {
      return { ok: false, error: 'unsupported', message: core.messageFor('unsupported_platform', lang()) };
    }
    const r = enabled ? await contextMenu.install({ lang: lang(), ...ctx.exeInfo() }) : await contextMenu.uninstall();
    ctx.setContextMenuState(await contextMenu.isInstalled());
    if (!r.ok) return { ok: false, error: r.error || 'write_failed', message: core.messageFor(r.error || 'write_failed', lang()) };
    return { ok: true };
  });

  // Dahili: preload, onFilesFromOS aboneliği kurulunca bekleyen dosyaları alır.
  handle('takePendingFiles', async () => ctx.takePendingFiles());

  return { isBusy: () => !!job, cancel: () => job && job.controller.abort() };
}

module.exports = { registerIpc };
