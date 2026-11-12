'use strict';

/**
 * Güvenlik: renderer yalıtımı, CSP, IPC yüzeyi (preload ↔ sözleşme birebir), gezinme/pencere engeli,
 * izin istekleri, sürüm bilgisi.
 */
const fs = require('fs');
const path = require('path');
const { test, expect, _electron } = require('@playwright/test');
const H = require('./helpers');

// docs/SPEC.md "IPC sözleşmesi — window.sigdir"
const CONTRACT = [
  'getAppInfo', 'getSettings', 'setSettings', 'getProfiles', 'pickFiles', 'pickOutputDir', 'inspect',
  'fitImages', 'mergePdf', 'splitPdf', 'fitVideo', 'cancel', 'onProgress', 'onFilesFromOS', 'revealInFolder', 'setContextMenu',
];
// docs/NOTES.md'de belgelenmiş sözleşme eki
const DOCUMENTED_EXTRA = ['getPathForFile'];

let ctx;
test.beforeAll(async () => {
  ctx = await H.launchApp({ settings: { lang: 'tr' } });
});
test.afterAll(async () => {
  if (ctx) await ctx.close();
});

test('renderer: require/process/module/Buffer erişilemez; window.sigdir dondurulmuş', async () => {
  const r = await ctx.win.evaluate(() => {
    const out = {
      require: typeof window.require,
      process: typeof window.process,
      module: typeof window.module,
      Buffer: typeof window.Buffer,
      global: typeof window.global,
      electron: typeof window.electron,
      ipcRenderer: typeof window.ipcRenderer,
    };
    try { window.sigdir.fitImages = () => 'ele geçirildi'; } catch (_) { /* dondurulmuş */ }
    out.overridable = window.sigdir.fitImages.toString().includes('ele geçirildi');
    out.frozen = Object.isFrozen(window.sigdir);
    return out;
  });
  expect(r).toEqual({ require: 'undefined', process: 'undefined', module: 'undefined', Buffer: 'undefined', global: 'undefined', electron: 'undefined', ipcRenderer: 'undefined', overridable: false, frozen: true });
});

test('webPreferences: contextIsolation, sandbox açık; nodeIntegration kapalı; webSecurity açık', async () => {
  const wp = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences());
  expect(wp).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, nodeIntegrationInSubFrames: false, webSecurity: true, webviewTag: false, allowRunningInsecureContent: false });
});

test('CSP meta etiketi var ve etkin: satır içi betik/olay işleyici ve dış kaynak engelli', async () => {
  // Not: Playwright evaluate() DevTools bağlamında çalıştığı için eval() denetimi burada ölçülemez;
  // CSP'de 'unsafe-eval' olmadığı metinden doğrulanır.
  const r = await ctx.win.evaluate(async () => {
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    const violations = [];
    document.addEventListener('securitypolicyviolation', (e) => violations.push(e.violatedDirective));
    window.__inline = false;
    const s = document.createElement('script');
    s.textContent = 'window.__inline = true';
    document.head.appendChild(s);
    window.__attr = false;
    const d = document.createElement('div');
    d.innerHTML = '<img src="data:x" onerror="window.__attr=true">';
    document.body.appendChild(d);
    const ext = document.createElement('img');
    ext.src = 'https://example.com/izleme.png';
    document.body.appendChild(ext);
    await new Promise((res) => setTimeout(res, 400));
    d.remove(); ext.remove(); s.remove();
    return { csp: meta && meta.content, inlineRan: window.__inline, attrRan: window.__attr, violations };
  });
  expect(r.csp).toContain("default-src 'self'");
  expect(r.csp).not.toMatch(/unsafe-eval/);
  expect(r.csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(r.inlineRan).toBe(false);
  expect(r.attrRan).toBe(false);
  expect(r.violations).toEqual(expect.arrayContaining(['script-src-elem', 'script-src-attr', 'img-src']));
});

test('preload API sözleşmeyle birebir (eksik yok; fazlası yalnızca belgelenmiş ek)', async () => {
  const keys = await ctx.win.evaluate(() => Object.keys(window.sigdir).sort());
  const missing = CONTRACT.filter((k) => !keys.includes(k));
  const extra = keys.filter((k) => !CONTRACT.includes(k));
  H.writeEvidence('preload-keys.json', { keys, missing, extra });
  expect(missing).toEqual([]);
  expect(extra).toEqual(DOCUMENTED_EXTRA);
  const types = await ctx.win.evaluate(() => Object.values(window.sigdir).map((f) => typeof f));
  expect(new Set(types)).toEqual(new Set(['function']));
  // Hepsi Promise döner (abonelikler ve getPathForFile hariç)
  const promises = await ctx.win.evaluate(() => ['getAppInfo', 'getSettings', 'getProfiles', 'cancel'].map((k) => window.sigdir[k]() instanceof Promise));
  expect(promises).toEqual([true, true, true, true]);
  const unsub = await ctx.win.evaluate(() => { const u = window.sigdir.onProgress(() => {}); const u2 = window.sigdir.onFilesFromOS(() => {}); return [typeof u, typeof u2]; });
  expect(unsub).toEqual(['function', 'function']);
  expect(await ctx.win.evaluate(() => window.sigdir.getPathForFile({}))).toBe('');
});

test('ana süreç IPC yüzeyi: Electron iç kanalları (boş uygulama taban çizgisi) hariç yalnızca sözleşme kanalları (+ dahili takePendingFiles); senkron dinleyici yok', async () => {
  // Taban çizgisi: aynı Electron sürümüyle boş bir uygulama (Electron 45 kendi iç invoke kanallarını kaydeder)
  const empty = H.mkTmp('bos-electron-');
  fs.writeFileSync(path.join(empty, 'package.json'), JSON.stringify({ name: 'bos', main: 'main.js' }));
  fs.writeFileSync(path.join(empty, 'main.js'), "const { app, BrowserWindow } = require('electron'); app.whenReady().then(() => { new BrowserWindow({ show: false }).loadURL('about:blank'); });");
  const appTmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'sgd-'));
  const env = { ...process.env, TMPDIR: appTmp };
  delete env.ELECTRON_RUN_AS_NODE;
  const base = await _electron.launch({ executablePath: require(path.join(H.ROOT, 'node_modules', 'electron')), args: ['--no-sandbox', empty], env });
  let baseline;
  try {
    await base.firstWindow();
    baseline = await base.evaluate(({ ipcMain }) => ({ invoke: [...ipcMain._invokeHandlers.keys()], on: ipcMain.eventNames().map(String) }));
  } finally {
    await base.close();
    fs.rmSync(appTmp, { recursive: true, force: true });
  }
  const r = await ctx.app.evaluate(({ ipcMain }) => ({
    invoke: [...(ipcMain._invokeHandlers ? ipcMain._invokeHandlers.keys() : [])].sort(),
    on: ipcMain.eventNames().map(String),
  }));
  const own = r.invoke.filter((c) => !baseline.invoke.includes(c)).sort();
  const expected = CONTRACT.filter((k) => !k.startsWith('on')).map((k) => 'sigdir:' + k).concat('sigdir:takePendingFiles').sort();
  H.writeEvidence('ipc-channels.json', { baseline, app: r });
  expect(own).toEqual(expected);
  expect(r.on.filter((e) => !baseline.on.includes(e))).toEqual([]);
});

test('gezinme ve yeni pencere engelli; sayfa file:// üzerinde kalır', async () => {
  const before = ctx.win.url();
  await ctx.win.evaluate(() => { try { window.location.href = 'https://example.com/'; } catch (_) { /* */ } });
  await ctx.win.waitForTimeout(500);
  expect(ctx.win.url()).toBe(before);
  const opened = await ctx.win.evaluate(() => window.open('https://example.com/') === null);
  expect(opened).toBe(true);
  const count = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
  expect(count).toBe(1);
  expect(before.startsWith('file://')).toBe(true);
});

test('izin istekleri (konum, bildirim, kamera…) varsayılan olarak reddedilmeli', async () => {
  const perm = await ctx.win.evaluate(async () => {
    const r = {};
    try { r.notification = await Notification.requestPermission(); } catch (e) { r.notification = 'hata: ' + e.message; }
    try { r.geolocation = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch (e) { r.geolocation = 'hata'; }
    return r;
  });
  H.writeEvidence('permissions.json', perm);
  expect.soft(perm.notification, 'Notification izni sessizce verildi (setPermissionRequestHandler yok)').not.toBe('granted');
});

test('sender doğrulaması: file:// dışı bir kaynaktan gelen IPC reddedilir', async () => {
  // İşleyiciyi sahte bir olayla doğrudan çağır (başka kökenden gelen istek benzetimi)
  const r = await ctx.app.evaluate(async ({ ipcMain }) => {
    const h = ipcMain._invokeHandlers.get('sigdir:getSettings');
    const evil = await h({ senderFrame: { url: 'https://kotu.example/' } });
    const none = await h({ senderFrame: null });
    const good = await h({ senderFrame: { url: 'file:///x/index.html' } });
    return { evil, none, good: !!(good && good.lang) };
  });
  H.writeEvidence('sender-check.json', r);
  expect(r.evil).toMatchObject({ ok: false });
  expect(r.none).toMatchObject({ ok: false });
  expect(r.good).toBe(true);
});

test('mergePdf "output" (SIG-009): keyfi yol reddedilir, varsayılan ada yazılır; çıktı klasörünün doğrudan içi kabul edilir', async () => {
  const dir = H.mkTmp('fx-sec-');
  const pdf = await H.makePdf(path.join(dir, 'a.pdf'), [[200, 200]]);
  const elsewhereRoot = H.mkTmp('baska-yer-');
  const elsewhere = path.join(elsewhereRoot, 'alt', 'klasor', 'gizli');
  await H.api(ctx.win, 'setSettings', { outputDir: null });
  const r = await H.api(ctx.win, 'mergePdf', { files: [pdf], output: elsewhere });
  H.writeEvidence('merge-output-path.json', r);
  expect(r.ok).toBe(true);
  expect(r.output).toBe(path.join(dir, 'a-sigdir.pdf'));
  expect(fs.existsSync(r.output)).toBe(true);
  expect(fs.existsSync(elsewhere + '.pdf')).toBe(false);
  expect(fs.existsSync(path.join(elsewhereRoot, 'alt'))).toBe(false);
  // Ayarlardaki çıktı klasörünün doğrudan içindeki ad kabul edilir; alt klasör/.. kaçışı kabul edilmez
  const out = H.mkTmp('cikti-');
  await H.api(ctx.win, 'setSettings', { outputDir: out });
  try {
    const ok = await H.api(ctx.win, 'mergePdf', { files: [pdf], output: path.join(out, 'birlesik') });
    expect(ok.output).toBe(path.join(out, 'birlesik.pdf'));
    const sub = await H.api(ctx.win, 'mergePdf', { files: [pdf], output: path.join(out, 'alt', 'x') });
    expect(sub.output).toBe(path.join(out, 'a-sigdir.pdf'));
    const esc = await H.api(ctx.win, 'mergePdf', { files: [pdf], output: path.join(out, '..', 'kacis') });
    expect(path.dirname(esc.output)).toBe(out);
    expect(fs.existsSync(path.join(path.dirname(out), 'kacis.pdf'))).toBe(false);
  } finally {
    await H.api(ctx.win, 'setSettings', { outputDir: null });
  }
});

test('sürüm: Electron sürümü ve destek durumu (bilgi)', async () => {
  const v = await ctx.app.evaluate(() => ({ electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node }));
  H.writeEvidence('versions.json', v);
  expect(Number(v.electron.split('.')[0])).toBeGreaterThanOrEqual(33);
});
