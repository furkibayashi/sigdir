'use strict';

/**
 * Sığdır preload: renderer'a yalnızca `window.sigdir` API'sini açar (docs/SPEC.md "IPC sözleşmesi").
 * sandbox:true altında çalışır; burada yalnızca 'electron' modülü kullanılabilir.
 */
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (name, ...args) => ipcRenderer.invoke(`sigdir:${name}`, ...args);

function subscribe(channel, cb) {
  if (typeof cb !== 'function') return () => {};
  const listener = (_event, payload) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  getAppInfo: () => invoke('getAppInfo'),
  getSettings: () => invoke('getSettings'),
  setSettings: (partial) => invoke('setSettings', partial),
  getProfiles: () => invoke('getProfiles'),
  pickFiles: (kind) => invoke('pickFiles', kind || 'any'),
  pickOutputDir: () => invoke('pickOutputDir'),
  inspect: (paths) => invoke('inspect', paths),
  fitImages: (opts) => invoke('fitImages', opts),
  mergePdf: (opts) => invoke('mergePdf', opts),
  splitPdf: (opts) => invoke('splitPdf', opts),
  fitVideo: (opts) => invoke('fitVideo', opts),
  cancel: () => invoke('cancel'),
  onProgress: (cb) => subscribe('sigdir:progress', cb),
  onFilesFromOS: (cb) => {
    const unsubscribe = subscribe('sigdir:filesFromOS', cb);
    // Uygulama açılırken (--files / ikinci örnek) gelmiş ve bekleyen dosyaları hemen teslim et
    invoke('takePendingFiles').then((files) => {
      if (Array.isArray(files) && files.length && typeof cb === 'function') cb(files);
    });
    return unsubscribe;
  },
  revealInFolder: (p) => invoke('revealInFolder', p),
  setContextMenu: (enabled) => invoke('setContextMenu', !!enabled),

  // Sözleşmeye EK (Electron 32+ File.path kaldırıldı): sürükle-bırakta File nesnesinin mutlak yolunu verir.
  // Senkron; yol bulunamazsa '' döner.
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch (_) {
      return '';
    }
  },
};

contextBridge.exposeInMainWorld('sigdir', api);
