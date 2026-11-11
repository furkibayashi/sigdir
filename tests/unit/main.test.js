'use strict';

// src/main içindeki Electron'a bağlı olmayan yardımcılar
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers/fixtures');
const { parseFilesFromArgv } = require('../../src/main/argv');
const { SettingsStore } = require('../../src/main/settings');
const contextMenu = require('../../src/main/contextMenu');

test('--files argümanı: göreli yollar, bayraklar ve olmayan dosyalar', () => {
  const d = tmpDir();
  try {
    fs.writeFileSync(path.join(d, 'a.jpg'), 'x');
    fs.writeFileSync(path.join(d, 'b c.pdf'), 'x');
    fs.mkdirSync(path.join(d, 'klasor'));
    const argv = ['/app/Sigdir.exe', '--allow-file-access-from-files', '--files', 'a.jpg', path.join(d, 'b c.pdf'), 'yok.png', 'klasor', 'a.jpg'];
    assert.deepEqual(parseFilesFromArgv(argv, { cwd: d }), [path.join(d, 'a.jpg'), path.join(d, 'b c.pdf')]);
    // Chromium anahtarları dosyaların önüne alınmış olabilir
    assert.deepEqual(parseFilesFromArgv(['exe', 'a.jpg', '--files', '--original-process-start-time=1'], { cwd: d }), [path.join(d, 'a.jpg')]);
    assert.deepEqual(parseFilesFromArgv(['exe', `--files=${path.join(d, 'a.jpg')}`], { cwd: d }), [path.join(d, 'a.jpg')]);
    // Geliştirmede --files yoksa hiçbir şey alınmaz (ör. "electron ." veya main.js)
    assert.deepEqual(parseFilesFromArgv(['electron', 'a.jpg'], { cwd: d }), []);
    // Paketlenmişte exe'ye sürüklenen dosyalar alınır, uygulama yolu atlanır
    assert.deepEqual(parseFilesFromArgv(['exe', 'a.jpg'], { cwd: d, packaged: true, skip: [path.join(d, 'a.jpg')] }), []);
    assert.deepEqual(parseFilesFromArgv(['exe', 'a.jpg'], { cwd: d, packaged: true }), [path.join(d, 'a.jpg')]);
    assert.deepEqual(parseFilesFromArgv(null), []);
  } finally {
    rmrf(d);
  }
});

test('ayarlar JSON dosyasında saklanır ve doğrulanır', () => {
  const d = tmpDir();
  try {
    const file = path.join(d, 'alt', 'settings.json');
    const s = new SettingsStore(file, { defaultLang: 'en' });
    assert.deepEqual(s.get(), { lang: 'en', theme: 'system', outputDir: null, openFolderAfter: false });
    const outDir = path.join(d, 'cikti');
    s.set({ lang: 'tr', theme: 'dark', outputDir: outDir, openFolderAfter: true, contextMenuInstalled: true, x: 1 });
    s.set({ lang: 'de', theme: 'neon', outputDir: 'goreli/yol', openFolderAfter: 'evet' }); // geçersizler yok sayılır
    const again = new SettingsStore(file);
    assert.deepEqual(again.get(), { lang: 'tr', theme: 'dark', outputDir: outDir, openFolderAfter: true });
    again.set({ outputDir: null });
    assert.equal(new SettingsStore(file).get().outputDir, null);
    fs.writeFileSync(file, '{bozuk json');
    assert.equal(new SettingsStore(file).get().theme, 'system');
  } finally {
    rmrf(d);
  }
});

test('sağ tık menüsü: komut satırı ve Windows dışı platform', async () => {
  assert.equal(
    contextMenu.commandLine({ execPath: 'C:\\Temp\\x\\Sığdır.exe', packaged: true, portableFile: 'D:\\Araçlar\\Sigdir.exe' }),
    '"D:\\Araçlar\\Sigdir.exe" --files "%1"',
  );
  assert.equal(
    contextMenu.commandLine({ execPath: 'C:\\e\\electron.exe', appPath: 'C:\\src\\sigdir', packaged: false }),
    '"C:\\e\\electron.exe" "C:\\src\\sigdir" --files "%1"',
  );
  assert.equal(contextMenu.KEY('image'), 'HKCU\\Software\\Classes\\SystemFileAssociations\\image\\shell\\Sigdir');
  assert.ok(contextMenu.TYPES.includes('.pdf') && contextMenu.TYPES.includes('video'));
  assert.equal(await contextMenu.isInstalled('linux'), false);
});

// ---------------------------------------------------------------- SIG-007 / 008 / 009
const { trustedOutputPath, denyAllPermissions } = require('../../src/main/guards');
const { runFitImages } = require('../../src/main/imageJob');
const { loadProfiles } = require('../../src/core/profiles');

test('SIG-009: mergePdf output yalnızca onaylı yol ya da çıktı klasörünün doğrudan içi olabilir', () => {
  const outDir = path.resolve('/kullanici/cikti');
  assert.equal(trustedOutputPath(path.join(outDir, 'birlesik.pdf'), { outputDir: outDir }), path.join(outDir, 'birlesik.pdf'));
  const bad = [
    path.resolve('/baska/yer/alt/klasor/gizli'),
    path.join(outDir, 'alt', 'x.pdf'),
    path.join(outDir, '..', 'kacis.pdf'),
    outDir,
    'goreli.pdf',
    path.join(outDir, 'a\0b.pdf'),
    42,
    null,
  ];
  for (const o of bad) assert.equal(trustedOutputPath(o, { outputDir: outDir }), undefined, String(o));
  // Çıktı klasörü seçilmemişse hiçbir renderer yolu kabul edilmez
  assert.equal(trustedOutputPath(path.join(outDir, 'x.pdf'), { outputDir: null }), undefined);
  // Ana süreç diyaloğunun onayladığı yol kabul edilir
  const approved = new Set([path.resolve('/masaustu/kayit.pdf')]);
  assert.equal(trustedOutputPath(path.resolve('/masaustu/kayit.pdf'), { approved }), path.resolve('/masaustu/kayit.pdf'));
});

test('SIG-007: tüm izin istekleri ve kontrolleri reddedilir', () => {
  const s = {};
  const fake = {
    setPermissionRequestHandler: (fn) => { s.req = fn; },
    setPermissionCheckHandler: (fn) => { s.check = fn; },
    setDevicePermissionHandler: (fn) => { s.device = fn; },
    setDisplayMediaRequestHandler: (fn) => { s.display = fn; },
  };
  denyAllPermissions(fake);
  for (const perm of ['notifications', 'geolocation', 'media', 'clipboard-read', 'midi', 'openExternal', 'fullscreen']) {
    let answer = 'yok';
    s.req(null, perm, (v) => { answer = v; });
    assert.equal(answer, false, perm);
    assert.equal(s.check(null, perm, 'file://'), false, perm);
  }
  assert.equal(s.device({ deviceType: 'usb' }), false);
  let media = null;
  s.display({}, (v) => { media = v; });
  assert.deepEqual(media, {});
});

test('SIG-008: fitImages her durumda dizi döndürür (geçersiz hedef, bilinmeyen profil, boş liste, meşgul)', async () => {
  const profiles = loadProfiles();
  const runJob = async (_k, fn) => fn(new AbortController().signal);
  const busyJob = async () => ({ ok: false, error: 'busy' });
  const files = ['/x/a.jpg', { path: '/x/b.png' }];
  const cases = [
    [{ files, custom: { format: 'jpg', maxBytes: 0 } }, runJob, 'bad_target', 2],
    [{ files, profileId: 'yok-boyle-profil' }, runJob, 'bad_target', 2],
    [{ files: [] }, runJob, 'no_files', 1],
    [undefined, runJob, 'no_files', 1],
    [{ files, profileId: 'osym-vesikalik' }, busyJob, 'busy', 2],
  ];
  for (const [opts, job, code, n] of cases) {
    const res = await runFitImages(opts, { profiles, runJob: job, lang: 'tr' });
    assert.ok(Array.isArray(res), code);
    assert.equal(res.length, n, code);
    for (const r of res) {
      assert.equal(r.ok, false);
      assert.equal(r.error, code);
      assert.ok(r.message);
      assert.equal(r.output, null);
    }
    if (n === 2) assert.deepEqual(res.map((r) => r.input), ['/x/a.jpg', '/x/b.png']);
  }
  // Normal yol: dosya başına sonuç (olmayan dosya → not_found satırı)
  const ok = await runFitImages({ files: ['/yok/c.jpg'], profileId: 'osym-vesikalik' }, { profiles, runJob });
  assert.deepEqual(ok.map((r) => [r.input, r.error]), [['/yok/c.jpg', 'not_found']]);
});
