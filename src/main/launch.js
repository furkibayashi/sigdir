'use strict';

/**
 * `npm start` başlatıcısı: Electron'u bu depo ile açar.
 * Linux'ta root olarak (konteyner/CI) Chromium sandbox'ı açılamadığı için --no-sandbox eklenir;
 * bu kontrol Electron içinden (app.commandLine) yapılamayacak kadar erken gerçekleşir.
 * Ek argümanlar aktarılır: npm start -- --files foto.jpg
 */
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron'); // Node'dan çağrılınca ikili dosyanın yolunu verir

const args = [path.join(__dirname, '..', '..')];
if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
args.push(...process.argv.slice(2));

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, args, { stdio: 'inherit', env, windowsHide: false });
child.on('close', (code, signal) => process.exit(code == null ? (signal ? 1 : 0) : code));
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
