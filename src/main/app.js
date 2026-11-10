'use strict';

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, Menu, nativeTheme, shell } = require('electron');
const { SettingsStore } = require('./settings');
const { registerIpc } = require('./ipc');
const { parseFilesFromArgv } = require('./argv');
const contextMenu = require('./contextMenu');

const ROOT = path.join(__dirname, '..', '..');
const RENDERER_INDEX = path.join(ROOT, 'src', 'renderer', 'index.html');
const PRELOAD = path.join(ROOT, 'preload.js');

let win = null;
let settings = null;
let pendingFiles = [];
let rendererListening = false;
let flushTimer = null;
let contextMenuInstalled = false;

function exeInfo() {
  return {
    execPath: process.execPath,
    appPath: app.getAppPath(),
    packaged: app.isPackaged,
    portableFile: process.env.PORTABLE_EXECUTABLE_FILE || null,
  };
}

function filesFromArgv(argv, cwd) {
  return parseFilesFromArgv(argv, { cwd, packaged: app.isPackaged, skip: [process.execPath, app.getAppPath()] });
}

/** Sağ tık / ikinci örnek / argümanla gelen dosyaları renderer'a iletir (kısa bir gecikmeyle toplar). */
function deliverFiles(files) {
  if (!files || !files.length) return;
  for (const f of files) if (!pendingFiles.includes(f)) pendingFiles.push(f);
  if (!rendererListening) return; // renderer abone olunca takePendingFiles ile alacak
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    if (!win || win.isDestroyed() || !pendingFiles.length) return;
    const batch = pendingFiles;
    pendingFiles = [];
    win.webContents.send('sigdir:filesFromOS', batch);
  }, 250);
}

function takePendingFiles() {
  rendererListening = true;
  clearTimeout(flushTimer);
  const batch = pendingFiles;
  pendingFiles = [];
  return batch;
}

function focusWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function backgroundFor(theme) {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#121117' : '#F3F1EC'; // arayüz tema zeminleriyle aynı (açılışta yanıp sönmesin)
}

function createWindow() {
  const s = settings.get();
  nativeTheme.themeSource = s.theme;
  const iconPath = path.join(ROOT, 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 560,
    title: 'Sığdır',
    show: false,
    backgroundColor: backgroundFor(s.theme),
    autoHideMenuBar: true,
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // Uygulama dışına gezinmeyi engelle; http(s) bağlantıları varsayılan tarayıcıda açılsın.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
  // Sayfa yeniden yüklenirse renderer yeniden abone olana kadar dosyaları beklet
  win.webContents.on('did-start-navigation', (details) => {
    if (details && details.isMainFrame && !details.isSameDocument) rendererListening = false;
  });

  win.once('ready-to-show', () => win.show());
  win.on('closed', () => {
    win = null;
  });

  if (fs.existsSync(RENDERER_INDEX)) {
    win.loadFile(RENDERER_INDEX);
  } else {
    // Arayüz henüz yoksa boş ama çalışan bir sayfa göster (geliştirme sırasında)
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><title>Sığdır</title><p style="font-family:sans-serif">src/renderer/index.html bulunamadı.</p>'));
  }
  return win;
}

function start() {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', (_e, argv, cwd) => {
    deliverFiles(filesFromArgv(argv, cwd));
    focusWindow();
  });

  // macOS: Finder'dan "Birlikte aç"
  app.on('open-file', (e, p) => {
    e.preventDefault();
    deliverFiles([p]);
  });

  deliverFiles(filesFromArgv(process.argv, process.cwd()));

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    const sysLang = (app.getPreferredSystemLanguages()[0] || app.getLocale() || 'tr').toLowerCase().startsWith('tr') ? 'tr' : 'en';
    settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'), { defaultLang: sysLang });
    contextMenuInstalled = await contextMenu.isInstalled().catch(() => false);

    registerIpc({
      settings,
      getWindow: () => win,
      profilesFile: path.join(app.getPath('userData'), 'profiles.json'),
      takePendingFiles,
      exeInfo,
      getContextMenuState: () => contextMenuInstalled,
      setContextMenuState: (v) => {
        contextMenuInstalled = !!v;
      },
    });

    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

module.exports = { start, RENDERER_INDEX };
