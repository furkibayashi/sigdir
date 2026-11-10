'use strict';

/**
 * Sığdır — ana süreç giriş noktası.
 * Fotoğraf, belge ve videoları internete yüklemeden hedef boyuta sığdırır.
 */
const { app } = require('electron');

// Linux'ta root olarak (ör. konteyner/CI) çalışırken Chromium sandbox açılamaz.
if (process.platform === 'linux' && process.getuid && process.getuid() === 0) {
  app.commandLine.appendSwitch('no-sandbox');
}

// Windows bildirim/görev çubuğu kimliği
if (process.platform === 'win32') app.setAppUserModelId('com.sigdir.app');

require('./src/main/app').start();
