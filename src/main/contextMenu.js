'use strict';

const { execFile } = require('child_process');

/**
 * Windows Gezgini sağ tık menüsü: "Sığdır ile küçült".
 * HKCU altına yazılır, yönetici izni gerekmez.
 */
const TYPES = ['image', 'video', '.pdf', '.heic', '.heif'];
const KEY = (t) => `HKCU\\Software\\Classes\\SystemFileAssociations\\${t}\\shell\\Sigdir`;
const LABEL = { tr: 'Sığdır ile küçült', en: 'Shrink with Sığdır' };

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg.exe', args, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? err.code : 0, stdout, stderr });
    });
  });
}

/** Menüden çalıştırılacak komut satırı. */
function commandLine({ execPath, appPath, packaged, portableFile }) {
  if (packaged) return `"${portableFile || execPath}" --files "%1"`;
  return `"${execPath}" "${appPath}" --files "%1"`;
}

async function isInstalled(platform = process.platform) {
  if (platform !== 'win32') return false;
  const r = await reg(['query', `${KEY('image')}\\command`, '/ve']);
  return r.ok;
}

async function install({ lang = 'tr', execPath, appPath, packaged, portableFile }) {
  const cmd = commandLine({ execPath, appPath, packaged, portableFile });
  const icon = `"${portableFile || execPath}",0`;
  for (const t of TYPES) {
    const k = KEY(t);
    const steps = [
      ['add', k, '/ve', '/d', LABEL[lang] || LABEL.tr, '/f'],
      ['add', k, '/v', 'Icon', '/d', icon, '/f'],
      ['add', k, '/v', 'MultiSelectModel', '/d', 'Player', '/f'],
      ['add', `${k}\\command`, '/ve', '/d', cmd, '/f'],
    ];
    for (const s of steps) {
      const r = await reg(s);
      if (!r.ok) {
        await uninstall();
        return { ok: false, error: 'write_failed', detail: (r.stderr || '').trim() };
      }
    }
  }
  return { ok: true };
}

async function uninstall() {
  for (const t of TYPES) await reg(['delete', KEY(t), '/f']);
  return { ok: true };
}

module.exports = { install, uninstall, isInstalled, commandLine, TYPES, KEY, LABEL };
