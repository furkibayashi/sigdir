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

// Testler için ayar klasörünü yalıtma (ör. SIGDIR_USER_DATA=/tmp/x)
if (process.env.SIGDIR_USER_DATA) app.setPath('userData', process.env.SIGDIR_USER_DATA);

// Windows bildirim/görev çubuğu kimliği
if (process.platform === 'win32') app.setAppUserModelId('com.sigdir.app');

require('./src/main/app').start();
