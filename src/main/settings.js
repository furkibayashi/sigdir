'use strict';

const fs = require('fs');
const path = require('path');

const LANGS = ['tr', 'en'];
const THEMES = ['system', 'light', 'dark'];

/** Ayarları userData/settings.json içinde saklar. contextMenuInstalled burada tutulmaz (kayıt defterinden okunur). */
class SettingsStore {
  constructor(file, { defaultLang = 'tr' } = {}) {
    this.file = file;
    this.defaults = { lang: LANGS.includes(defaultLang) ? defaultLang : 'tr', theme: 'system', outputDir: null, openFolderAfter: false };
    this.data = { ...this.defaults };
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { ...this.defaults, ...this.sanitize(raw) };
    } catch (_) {
      this.data = { ...this.defaults };
    }
    return this.data;
  }

  sanitize(partial) {
    const out = {};
    if (!partial || typeof partial !== 'object') return out;
    if (LANGS.includes(partial.lang)) out.lang = partial.lang;
    if (THEMES.includes(partial.theme)) out.theme = partial.theme;
    if (partial.outputDir === null || partial.outputDir === '') out.outputDir = null;
    else if (typeof partial.outputDir === 'string' && path.isAbsolute(partial.outputDir)) out.outputDir = partial.outputDir;
    if (typeof partial.openFolderAfter === 'boolean') out.openFolderAfter = partial.openFolderAfter;
    return out;
  }

  get() {
    return { ...this.data };
  }

  set(partial) {
    this.data = { ...this.data, ...this.sanitize(partial) };
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[sigdir] ayarlar kaydedilemedi:', err.message);
    }
    return this.get();
  }
}

module.exports = { SettingsStore, LANGS, THEMES };
