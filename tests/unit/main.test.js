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
