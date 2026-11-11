/*
 * Sığdır — arayüz mantığı (vanilla JS, framework yok).
 * Sadece window.sigdir (preload) ve window.SigdirI18n kullanır. Sözleşme: docs/SPEC.md.
 */
(function () {
  'use strict';

  const api = window.sigdir;
  const L = window.SigdirI18n;
  const t = (k, v) => L.t(k, v);
  const TABS = ['image', 'pdf', 'video'];
  // Ondalık taban: profiller de 200 KB = 200000 bayt olarak tanımlı.
  const KB = 1000;
  const MB = 1000 * 1000;

  // ---------------------------------------------------------------- yardımcılar
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const SVGNS = 'http://www.w3.org/2000/svg';
  const baseName = (s) => String(s || '').split(/[\\/]/).pop();
  const dirOf = (s) => { const b = baseName(s); return String(s).slice(0, Math.max(0, String(s).length - b.length - 1)); };
  const isErr = (r) => !!r && !Array.isArray(r) && r.ok === false;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let uid = 0;

  function icon(name, extra) {
    const s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('class', 'ic' + (extra ? ' ' + extra : ''));
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(SVGNS, 'use');
    u.setAttribute('href', '#i-' + name);
    s.appendChild(u);
    return s;
  }

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'checked' || k === 'disabled' || k === 'value') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'object' ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  /** Yeniden çizimden sonra odağı aynı data-fkey'e geri koyar. */
  function keepFocus(fn) {
    const a = document.activeElement;
    const key = a && a.dataset ? a.dataset.fkey : null;
    fn();
    if (key) {
      const el = document.querySelector(`[data-fkey="${CSS.escape(key)}"]`);
      if (el && el !== document.activeElement && !el.disabled) el.focus({ preventScroll: true });
    }
  }

  function announce(msg, assertive) {
    const el = $(assertive ? '#live-assertive' : '#live-polite');
    el.textContent = '';
    setTimeout(() => { el.textContent = msg; }, 40);
  }

  function toast(msg, type = 'info') {
    const box = $('#toasts');
    const el = h('div', { class: 'toast toast-' + type },
      icon(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info'),
      h('span', { class: 'toast-msg' }, msg),
      h('button', { class: 'icon-btn icon-btn-sm', type: 'button', 'aria-label': t('common.close'), onclick: () => el.remove() }, icon('x')));
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.remove(), type === 'error' ? 9000 : 5000);
    announce(msg, type === 'error');
  }

  function errText(code, message) {
    if (code && L.has('err.' + code)) return t('err.' + code);
    return message || t('err.generic');
  }

  /** Değer ya da tembel metin (dil değişince yeniden çevrilsin diye fonksiyon saklanır). */
  const txt = (x) => (typeof x === 'function' ? x() : x);
  const loc = (x) => (x && typeof x === 'object' ? (x[L.lang()] || x.tr || x.en || '') : (x || ''));

  // ---------------------------------------------------------------- durum
  const S = {
    info: { version: '', platform: 'win32', ffmpegAvailable: true },
    settings: { lang: 'tr', theme: 'system', outputDir: null, openFolderAfter: false, contextMenuInstalled: false },
    profiles: [],
    tab: 'image',
    busy: null, // 'images' | 'pdf' | 'video'
    cancelling: false,
    image: {
      items: [], profileId: null, summary: null,
      custom: { format: 'jpg', maxValue: 200, unit: 'KB', sizeMode: 'keep', longEdge: 1920, pxW: 600, pxH: 800, mmW: 50, mmH: 60, dpi: 300 },
    },
    pdf: { items: [], mode: 'merge', target: 'none', customMB: 2, summary: null, progress: 0 },
    video: { item: null, profileId: null, customMB: 10, start: 0, end: 0, vertical: false, verticalAuto: false, mute: false, summary: null, percent: 0 },
  };

  function mkItem(info) {
    return { id: 'f' + (++uid), path: info.path, info, status: 'ready', percent: 0, result: null, rotate: 0, crop: null, preview: null };
  }

  const profilesFor = (kind) => S.profiles.filter((p) => p.kind === kind);
  const profileById = (id) => S.profiles.find((p) => p.id === id) || null;

  function profileAspect(p) {
    if (!p) return null;
    if (p.aspect) return p.aspect;
    if (p.width && p.height) return p.width / p.height;
    return null;
  }

  function profileSummary(p) {
    const parts = ['≤ ' + L.bytes(p.maxBytes), String(p.format || '').toUpperCase()];
    if (p.sizeLabel) parts.push(loc(p.sizeLabel));
    else if (p.width && p.height) parts.push(`${p.width}×${p.height} px`);
    else if (p.longEdge) parts.push(t('profile.longEdge', { n: p.longEdge }));
    if (p.vertical) parts.push(t('profile.vertical'));
    return parts.filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------- görsel hedefi
  function customImageSpec() {
    const c = S.image.custom;
    const max = Number(c.maxValue);
    if (!(max > 0)) return null;
    const spec = { format: c.format, maxBytes: Math.floor(max * (c.unit === 'MB' ? MB : KB)) };
    let aspect = null; let dims = null;
    if (c.sizeMode === 'long') {
      if (!(c.longEdge >= 16)) return null;
      spec.longEdge = Math.round(c.longEdge);
      dims = t('profile.longEdge', { n: spec.longEdge });
    } else if (c.sizeMode === 'px') {
      if (!(c.pxW >= 16 && c.pxH >= 16)) return null;
      spec.width = Math.round(c.pxW); spec.height = Math.round(c.pxH);
      aspect = spec.width / spec.height; dims = `${spec.width}×${spec.height} px`;
    } else if (c.sizeMode === 'mm') {
      if (!(c.mmW > 0 && c.mmH > 0 && c.dpi >= 50)) return null;
      spec.width = Math.round((c.mmW / 25.4) * c.dpi); spec.height = Math.round((c.mmH / 25.4) * c.dpi);
      aspect = c.mmW / c.mmH; dims = `${L.num(c.mmW)}×${L.num(c.mmH)} mm`;
    }
    return { spec, aspect, dims };
  }

  /** Seçili görsel hedefi: { maxBytes, aspect, label, payload } ya da null. */
  function imageTarget() {
    const id = S.image.profileId;
    if (!id) return null;
    if (id === 'custom') {
      const c = customImageSpec();
      if (!c) return { invalid: true };
      return { maxBytes: c.spec.maxBytes, aspect: c.aspect, label: t('profile.custom'), aspectLabel: c.dims, payload: { custom: c.spec } };
    }
    const p = profileById(id);
    if (!p) return null;
    return { maxBytes: p.maxBytes, aspect: profileAspect(p), label: loc(p.name), aspectLabel: loc(p.sizeLabel) || (p.width && p.height ? `${p.width}×${p.height} px` : ''), payload: { profileId: p.id } };
  }

  function customImageSummary() {
    const c = customImageSpec();
    if (!c) return t('custom.invalid');
    return ['≤ ' + L.bytes(c.spec.maxBytes), c.spec.format.toUpperCase(), c.dims || t('profile.keepSize')].join(' · ');
  }

  // ---------------------------------------------------------------- tema & dil
  const mqDark = window.matchMedia('(prefers-color-scheme: dark)');
  function applyTheme() {
    const th = S.settings.theme;
    const dark = th === 'dark' || (th !== 'light' && mqDark.matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  mqDark.addEventListener('change', applyTheme);

  function applyLang() {
    L.setLang(S.settings.lang);
    document.documentElement.lang = L.lang();
    L.apply(document);
    renderAll();
    $$('#toasts .icon-btn').forEach((b) => b.setAttribute('aria-label', t('common.close')));
  }

  async function saveSettings(partial) {
    const res = await api.setSettings(partial);
    if (isErr(res)) { toast(errText(res.error, res.message), 'error'); return; }
    S.settings = Object.assign({}, S.settings, res);
  }

  // ---------------------------------------------------------------- sekmeler
  function switchTab(tab, focus) {
    if (!TABS.includes(tab)) return;
    S.tab = tab;
    for (const k of TABS) {
      const b = $('#tab-' + k);
      const on = k === tab;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      $('#panel-' + k).hidden = !on;
    }
    if (focus) $('#tab-' + tab).focus();
  }

  $('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[role=tab]');
    if (b) switchTab(b.dataset.tab);
  });
  $('.tabs').addEventListener('keydown', (e) => {
    const i = TABS.indexOf(S.tab);
    let n = null;
    if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = TABS.length - 1;
    if (n != null) { e.preventDefault(); switchTab(TABS[n], true); }
  });

  // ---------------------------------------------------------------- dosya ekleme
  async function pickForTab() {
    if (S.busy) { toast(t('toast.busy'), 'warn'); return; }
    if (S.tab === 'video' && !S.info.ffmpegAvailable) return;
    // 'pdf' filtresi görselleri de içermeli (bkz. docs/NOTES.md)
    const res = await api.pickFiles(S.tab);
    if (isErr(res)) { toast(errText(res.error, res.message), 'error'); return; }
    if (Array.isArray(res) && res.length) addPaths(res, 'pick');
  }

  /** İş sürerken (sağ tık / ikinci örnek / bırakma) gelen dosyalar; iş bitince eklenir. */
  const queued = [];
  function flushQueue() {
    if (S.busy || !queued.length) return;
    const paths = queued.splice(0);
    addPaths(paths, 'queued');
  }

  async function addPaths(paths, origin) {
    paths = Array.from(new Set((paths || []).filter(Boolean)));
    if (!paths.length) return;
    if (S.busy) {
      paths.forEach((p) => { if (!queued.includes(p)) queued.push(p); });
      toast(t('toast.queued', { n: queued.length }), 'info');
      return;
    }
    document.body.classList.add('is-loading');
    let infos;
    try { infos = await api.inspect(paths); } finally { document.body.classList.remove('is-loading'); }
    if (isErr(infos) || !Array.isArray(infos)) { toast(errText(infos && infos.error, infos && infos.message), 'error'); return; }

    const added = { image: 0, pdf: 0, video: 0 };
    const problems = [];
    for (const info of infos) {
      if (!info || info.error || info.kind === 'unknown') {
        const name = (info && info.name) || baseName(info && info.path);
        problems.push(!info || info.kind === 'unknown' || info.error === 'unsupported'
          ? t('toast.unsupported', { name }) : `${name}: ${errText(info.error, info.message)}`);
        continue;
      }
      let dest = info.kind;
      if (dest === 'image' && S.tab === 'pdf') dest = 'pdf';
      if (dest === 'video') {
        if (!S.info.ffmpegAvailable) { problems.push(t('toast.videoNoFfmpeg', { name: info.name })); continue; }
        S.video.item = mkItem(info);
        S.video.start = 0; S.video.end = info.durationSec || 0; S.video.summary = null; S.video.result = null;
        added.video++;
        continue;
      }
      const list = S[dest].items;
      if (list.some((it) => it.path === info.path)) continue;
      list.push(mkItem(info));
      if (origin !== 'queued') S[dest].summary = null; // az önce biten işin sonucu görünür kalsın
      added[dest]++;
    }
    const total = added.image + added.pdf + added.video;
    if (total && !added[S.tab] && origin !== 'queued') {
      const best = TABS.slice().sort((a, b) => added[b] - added[a])[0];
      switchTab(best);
    }
    renderAll();
    if (total) {
      const other = TABS.find((k) => added[k] && k !== S.tab);
      const msg = origin === 'queued'
        ? t('toast.queuedAdded', { n: total }) + (other ? ' ' + t('toast.inTab', { tab: t('tabs.' + other) }) : '')
        : origin === 'os' ? t('toast.fromOS', { n: total }) : t('toast.added', { n: total });
      if (origin === 'os' || origin === 'drop' || origin === 'queued') toast(msg, 'success'); else announce(msg);
      if (origin === 'pick' || origin === 'drop') {
        const first = $(`#panel-${S.tab} .file-list li:last-child [data-fkey], #panel-${S.tab} .video-editor [data-fkey]`);
        if (first && document.activeElement && document.activeElement.closest('.dropzone')) first.focus({ preventScroll: true });
      }
    }
    problems.slice(0, 3).forEach((m) => toast(m, 'error'));
  }

  // Sürükle-bırak (pencerenin her yeri)
  const hasFiles = (e) => !!e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let dragDepth = 0;
  const overlay = $('#drag-overlay');
  function getPath(file) {
    try {
      if (api.getPathForFile) return api.getPathForFile(file) || null;
    } catch (_) { /* yoksa düş */ }
    return file.path || null;
  }
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    if (++dragDepth === 1 && !S.busy && !$('dialog[open]')) { overlay.hidden = false; requestAnimationFrame(() => overlay.classList.add('is-on')); }
  });
  window.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = S.busy ? 'none' : 'copy';
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    if (--dragDepth <= 0) hideOverlay();
  });
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hideOverlay();
    const files = Array.from(e.dataTransfer.files || []);
    const paths = files.map(getPath).filter(Boolean);
    if (files.length && !paths.length) { toast(t('toast.noPath'), 'error'); return; }
    addPaths(paths, 'drop');
  });
  function hideOverlay() { dragDepth = 0; overlay.classList.remove('is-on'); overlay.hidden = true; }

  // ---------------------------------------------------------------- ortak çizimler
  const DROP_ART = `
    <svg class="dz-art" viewBox="0 0 160 120" aria-hidden="true">
      <g class="dz-page">
        <rect x="58" y="8" width="44" height="56" rx="6" class="pg"/>
        <path d="M90 8v10a4 4 0 0 0 4 4h8" class="pg-fold"/>
        <path d="M67 32h26M67 40h26M67 48h16" class="pg-line"/>
      </g>
      <path d="M30 62l-14-12h34l8 12z" class="box-flap"/>
      <path d="M130 62l14-12h-34l-8 12z" class="box-flap"/>
      <rect x="30" y="60" width="100" height="50" rx="8" class="box-front"/>
      <path d="M58 82h44" class="box-tape"/>
    </svg>`;

  function renderDropzone(el, kind) {
    el.textContent = '';
    el.append(
      h('span', { class: 'corner tl' }), h('span', { class: 'corner tr' }), h('span', { class: 'corner bl' }), h('span', { class: 'corner br' }),
    );
    const art = h('div', { class: 'dz-art-wrap' }); art.innerHTML = DROP_ART; // sabit, güvenli işaretleme
    el.append(
      art,
      h('p', { class: 'dz-title' }, t('drop.title.' + kind)),
      h('p', { class: 'dz-sub' }, t('drop.types.' + kind)),
      h('button', { class: 'btn btn-primary btn-lg', type: 'button', 'data-action': 'add', 'data-fkey': 'dz-' + kind }, icon('plus'), t('drop.pick')),
      h('p', { class: 'dz-kbd' }, t('drop.kbd')),
      h('p', { class: 'dz-privacy' }, icon('shield', 'ic-sm'), t('drop.privacy')),
    );
  }

  /** Radyo kartları. items: [{ id, title, summary, note, extra }] */
  function renderCards(container, name, items, selected) {
    container.textContent = '';
    for (const it of items) {
      const sel = it.id === selected;
      const sumId = `${name}-${it.id}-sum`;
      const label = h('label', { class: 'pcard' + (sel ? ' is-selected' : '') + (it.id === 'custom' || it.id === 'none' ? ' pcard-plain' : '') },
        h('input', { type: 'radio', class: 'pcard-input', name, value: it.id, checked: sel, 'aria-describedby': sumId, 'data-fkey': `${name}-${it.id}` }),
        h('span', { class: 'pcard-mark', 'aria-hidden': 'true' }, icon('check')),
        h('span', { class: 'pcard-body' },
          h('span', { class: 'pcard-title' }, it.title),
          h('span', { class: 'pcard-sum', id: sumId }, it.summary),
          sel && it.note ? h('span', { class: 'pcard-note' }, icon('info', 'ic-xs'), it.note) : null));
      container.appendChild(label);
      if (sel && it.extra) container.appendChild(it.extra);
    }
  }

  function fitMeter(bytes, limit, after) {
    if (!limit) return null;
    const ratio = bytes / limit;
    let cls; let label;
    if (after) { cls = 'ok'; label = t('fit.after', { pct: Math.min(100, Math.round(ratio * 100)) }); }
    else if (ratio > 1) { cls = 'over'; label = t('fit.over', { x: L.num(ratio, ratio < 10 ? 1 : 0) }); }
    else { cls = 'under'; label = t('fit.under'); }
    const pct = Math.min(100, Math.max(3, ratio * 100));
    return h('div', { class: 'fit fit-' + cls },
      h('span', { class: 'fit-track', 'aria-hidden': 'true' }, h('span', { class: 'fit-fill', style: `width:${pct.toFixed(1)}%` })),
      h('span', { class: 'fit-label' }, label));
  }

  function statusChip(it) {
    if (it.status === 'queued') return h('span', { class: 'chip chip-muted' }, t('file.queued'));
    if (it.status === 'working') return h('span', { class: 'chip chip-work' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('file.working'));
    if (it.status === 'done') return h('span', { class: 'chip chip-ok' }, icon('check', 'ic-xs'), t('file.done'));
    if (it.status === 'error') return h('span', { class: 'chip chip-err' }, icon('alert', 'ic-xs'), t('file.error'));
    return null;
  }

  function thumbEl(it, fallback) {
    const src = it.preview || it.info.thumb;
    return h('span', { class: 'thumb' + (src ? '' : ' thumb-empty') }, src ? h('img', { src, alt: '', draggable: 'false' }) : icon(fallback));
  }

  function resultBanner(sum, actions) {
    if (!sum) return null;
    const cls = sum.type === 'ok' ? 'banner-ok' : sum.type === 'warn' ? 'banner-warn' : sum.type === 'err' ? 'banner-err' : 'banner-info';
    return h('div', { class: 'banner ' + cls, role: 'status' },
      h('span', { class: 'banner-icon' }, icon(sum.type === 'ok' ? 'check' : sum.type === 'info' ? 'info' : 'alert')),
      h('div', { class: 'banner-text' }, h('strong', {}, txt(sum.title)), txt(sum.sub) ? h('span', {}, txt(sum.sub)) : null),
      h('div', { class: 'banner-actions' }, actions));
  }

  function revealBtn(path, fkey) {
    return h('button', { class: 'btn btn-secondary btn-sm', type: 'button', 'data-fkey': fkey, onclick: () => api.revealInFolder(path) }, icon('folder'), t('done.reveal'));
  }

  function whereText() {
    return S.settings.outputDir ? t('where.dir', { dir: baseName(S.settings.outputDir) || S.settings.outputDir }) : t('where.beside');
  }

  function progressEl(pct, label) {
    return h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': label },
      h('span', { class: 'progress-fill', style: `width:${pct}%` }));
  }

  function busyFoot(foot, pct, label) {
    let bar = $('.progress', foot);
    if (!bar) {
      foot.textContent = '';
      foot.append(
        h('div', { class: 'busy-row' },
          h('span', { class: 'busy-label' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('span', { class: 'busy-text' }, label)),
          h('span', { class: 'busy-pct' }, L.pct(pct))),
        progressEl(pct, label),
        h('button', { class: 'btn btn-secondary btn-block', type: 'button', 'data-fkey': 'cancel', disabled: S.cancelling, onclick: doCancel }, S.cancelling ? t('common.cancelling') : t('common.stop')));
      return;
    }
    bar.setAttribute('aria-valuenow', String(Math.round(pct)));
    $('.progress-fill', foot).style.width = pct + '%';
    $('.busy-pct', foot).textContent = L.pct(pct);
    $('.busy-text', foot).textContent = label;
  }

  function goFoot(foot, { label, iconName, disabled, hint, onGo, fkey }) {
    foot.textContent = '';
    const hintId = fkey + '-hint';
    foot.append(
      h('button', { class: 'btn btn-primary btn-go btn-block', type: 'button', disabled, 'data-fkey': fkey, 'aria-describedby': hintId, onclick: onGo },
        icon(iconName), h('span', {}, label), h('kbd', { class: 'kbd', 'aria-hidden': 'true' }, 'Ctrl ↵')),
      h('p', { class: 'foot-hint', id: hintId }, hint));
  }

  async function doCancel() {
    if (!S.busy || S.cancelling) return;
    S.cancelling = true;
    renderFoot(S.tab);
    await api.cancel();
  }

  // ---------------------------------------------------------------- GÖRSEL paneli
  const P = (k) => $('#panel-' + k);

  function renderImage() {
    const panel = P('image');
    const st = S.image;
    panel.dataset.state = st.items.length ? 'has-files' : 'empty';
    keepFocus(() => {
      renderImageCards();
      renderImageList();
      renderFoot('image');
    });
  }

  function renderImageCards() {
    const cont = $('.profiles', P('image'));
    const items = profilesFor('image').map((p) => ({ id: p.id, title: loc(p.name), summary: profileSummary(p), note: loc(p.note) }));
    items.push({ id: 'custom', title: t('profile.custom'), summary: S.image.profileId === 'custom' ? customImageSummary() : t('profile.customSum'), extra: customImageForm() });
    renderCards(cont, 'p-image', items, S.image.profileId);
  }

  function numInput(id, value, opts, onInput) {
    return h('input', Object.assign({ id, type: 'number', class: 'input input-num', value: String(value), inputmode: 'decimal', 'data-fkey': id,
      oninput: (e) => onInput(parseFloat(String(e.target.value).replace(',', '.'))) }, opts));
  }

  function customImageForm() {
    const c = S.image.custom;
    const update = () => {
      const sum = $('#p-image-custom-sum');
      if (sum) sum.textContent = customImageSummary();
      const mmHint = $('#cust-mm-hint');
      if (mmHint) { const s = customImageSpec(); mmHint.textContent = s && s.spec.width ? t('custom.mmHint', { w: s.spec.width, h: s.spec.height }) : ''; }
      renderFoot('image');
      resetIncompatibleCrops();
    };
    const sizeFields = () => {
      const box = h('div', { class: 'cust-size' });
      if (c.sizeMode === 'long') {
        box.append(h('label', { class: 'mini-field' }, h('span', {}, t('custom.longEdge')),
          h('span', { class: 'input-unit' }, numInput('cust-long', c.longEdge, { min: '16', step: '1' }, (v) => { c.longEdge = v; update(); }), h('span', { class: 'unit' }, 'px'))));
      } else if (c.sizeMode === 'px') {
        box.append(
          h('label', { class: 'mini-field' }, h('span', {}, t('custom.width')), h('span', { class: 'input-unit' }, numInput('cust-pxw', c.pxW, { min: '16', step: '1' }, (v) => { c.pxW = v; update(); }), h('span', { class: 'unit' }, 'px'))),
          h('label', { class: 'mini-field' }, h('span', {}, t('custom.height')), h('span', { class: 'input-unit' }, numInput('cust-pxh', c.pxH, { min: '16', step: '1' }, (v) => { c.pxH = v; update(); }), h('span', { class: 'unit' }, 'px'))));
      } else if (c.sizeMode === 'mm') {
        const s = customImageSpec();
        box.append(
          h('label', { class: 'mini-field' }, h('span', {}, t('custom.width')), h('span', { class: 'input-unit' }, numInput('cust-mmw', c.mmW, { min: '1', step: '1' }, (v) => { c.mmW = v; update(); }), h('span', { class: 'unit' }, 'mm'))),
          h('label', { class: 'mini-field' }, h('span', {}, t('custom.height')), h('span', { class: 'input-unit' }, numInput('cust-mmh', c.mmH, { min: '1', step: '1' }, (v) => { c.mmH = v; update(); }), h('span', { class: 'unit' }, 'mm'))),
          h('label', { class: 'mini-field' }, h('span', {}, t('custom.dpi')), numInput('cust-dpi', c.dpi, { min: '50', step: '10' }, (v) => { c.dpi = v; update(); })),
          h('p', { class: 'mini-hint', id: 'cust-mm-hint' }, s && s.spec.width ? t('custom.mmHint', { w: s.spec.width, h: s.spec.height }) : ''));
      }
      return box;
    };
    const sizeBox = h('div', {}, sizeFields());
    return h('div', { class: 'custom-form', role: 'group', 'aria-label': t('profile.custom') },
      h('div', { class: 'mini-field' }, h('span', { id: 'cust-fmt-l' }, t('custom.format')),
        h('div', { class: 'segmented segmented-sm', role: 'radiogroup', 'aria-labelledby': 'cust-fmt-l' },
          ['jpg', 'png'].map((f) => h('label', {}, h('input', { type: 'radio', name: 'cust-fmt', value: f, checked: c.format === f, 'data-fkey': 'cust-fmt-' + f,
            onchange: () => { c.format = f; update(); } }), h('span', {}, f.toUpperCase()))))),
      h('label', { class: 'mini-field' }, h('span', {}, t('custom.max')),
        h('span', { class: 'input-unit' },
          numInput('cust-max', c.maxValue, { min: '1', step: '1' }, (v) => { c.maxValue = v; update(); }),
          h('select', { class: 'input select-unit', 'aria-label': t('custom.unit'), 'data-fkey': 'cust-unit', onchange: (e) => { c.unit = e.target.value; update(); } },
            ['KB', 'MB'].map((u) => h('option', { value: u, selected: c.unit === u ? 'selected' : null }, u))))),
      h('label', { class: 'mini-field' }, h('span', {}, t('custom.size')),
        h('select', { class: 'input', 'data-fkey': 'cust-mode', onchange: (e) => { c.sizeMode = e.target.value; sizeBox.replaceChildren(sizeFields()); update(); } },
          [['keep', 'custom.sizeKeep'], ['long', 'custom.sizeLong'], ['px', 'custom.sizePx'], ['mm', 'custom.sizeMm']]
            .map(([v, k]) => h('option', { value: v, selected: c.sizeMode === v ? 'selected' : null }, t(k))))),
      sizeBox);
  }

  /** Hedef oran değişince eski oranla yapılmış kırpmaları sıfırla (döndürme kalır). */
  function resetIncompatibleCrops() {
    const tg = imageTarget();
    const a = tg && tg.aspect;
    let changed = false;
    for (const it of S.image.items) {
      if (!it.crop) continue;
      const ca = it.crop.w / it.crop.h;
      if (a && Math.abs(ca / a - 1) > 0.012) { it.crop = null; it.preview = null; changed = true; }
    }
    if (changed) renderImageList();
  }

  function rotatedDims(it) {
    const w = it.info.width || 0; const hh = it.info.height || 0;
    return (it.rotate || 0) % 180 ? [hh, w] : [w, hh];
  }

  function renderImageList() {
    const ul = $('.file-list', P('image'));
    const slot = $('.banner-slot', P('image'));
    const tg = imageTarget();
    const busy = S.busy === 'images';
    slot.textContent = '';
    const sum = S.image.summary;
    if (sum) {
      slot.appendChild(resultBanner(sum, [
        sum.firstOutput ? revealBtn(sum.firstOutput, 'img-reveal') : null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-fkey': 'img-new', onclick: () => clearList('image') }, t('done.new')),
      ]));
    }
    ul.textContent = '';
    for (const it of S.image.items) ul.appendChild(imageRow(it, tg, busy));
  }

  function imageRow(it, tg, busy) {
    const info = it.info; const r = it.result;
    const [w, hh] = rotatedDims(it);
    const limit = tg && !tg.invalid ? tg.maxBytes : null;
    const meta = [];
    if (it.status === 'done' && r) {
      meta.push(h('span', { class: 'm-before' }, L.bytes(r.beforeBytes || info.sizeBytes)), icon('arrow', 'ic-xs m-arrow'),
        h('strong', { class: 'm-after' }, L.bytes(r.afterBytes)), h('span', { class: 'm-sep' }, '·'), `${r.width}×${r.height}`);
    } else {
      meta.push(L.bytes(info.sizeBytes));
      if (w && hh) meta.push(h('span', { class: 'm-sep' }, '·'), `${w}×${hh}`);
      if (it.crop) meta.push(h('span', { class: 'm-sep' }, '·'), h('span', { class: 'm-tag' }, icon('crop', 'ic-xs'), t('file.cropped')));
      else if (it.rotate) meta.push(h('span', { class: 'm-sep' }, '·'), h('span', { class: 'm-tag' }, icon('rot-r', 'ic-xs'), t('file.rotated')));
    }
    let extra = null;
    if (it.status === 'error') {
      extra = h('p', { class: 'f-error' }, icon('alert', 'ic-xs'), txt(it.errorText) || t('err.generic'));
    } else if (it.status === 'done' && r && limit) {
      extra = fitMeter(r.afterBytes, limit, true);
    } else if (limit) {
      extra = fitMeter(info.sizeBytes, limit, false);
    }
    let mismatch = null;
    if (tg && tg.aspect && !it.crop && w && hh && it.status !== 'done' && it.status !== 'error' && !busy && Math.abs((w / hh) / tg.aspect - 1) > 0.03) {
      mismatch = h('p', { class: 'f-hint' }, icon('crop', 'ic-xs'), t('file.mismatch'));
    }
    const canEdit = !busy && !['working', 'queued', 'done'].includes(it.status) && w && hh && info.thumb;
    return h('li', { class: 'frow', dataset: { status: it.status, id: it.id } },
      thumbEl(it, 'image'),
      h('div', { class: 'f-main' },
        h('div', { class: 'f-name', title: info.path }, info.name),
        h('div', { class: 'f-meta' }, meta),
        extra, mismatch),
      h('div', { class: 'f-status' }, statusChip(it)),
      h('div', { class: 'f-actions' },
        it.status === 'done' && r && r.output ? h('button', { class: 'icon-btn', type: 'button', 'data-fkey': it.id + '-reveal', title: t('done.reveal'), 'aria-label': t('file.revealFor', { name: info.name }), onclick: () => api.revealInFolder(r.output) }, icon('folder')) : null,
        canEdit ? h('button', { class: 'icon-btn' + (mismatch ? ' icon-btn-accent' : ''), type: 'button', 'data-fkey': it.id + '-crop', title: t('file.crop'), 'aria-label': t('file.cropFor', { name: info.name }), onclick: () => openCrop(it) }, icon('crop')) : null,
        h('button', { class: 'icon-btn', type: 'button', disabled: busy, 'data-fkey': it.id + '-rm', title: t('common.remove'), 'aria-label': t('file.removeFor', { name: info.name }), onclick: () => removeItem('image', it.id) }, icon('x'))));
  }

  function removeItem(kind, id) {
    const list = S[kind].items;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [gone] = list.splice(i, 1);
    S[kind].summary = null;
    renderAll();
    announce(t('file.removed', { name: gone.info.name }));
    // Odağı mantıklı bir yere taşı
    const rows = $$(`#panel-${kind} .file-list li`);
    const next = rows[Math.min(i, rows.length - 1)];
    const target = next ? $('[data-fkey$="-rm"]', next) : $(`#panel-${kind} .dropzone button`);
    if (target) target.focus();
  }

  function clearList(kind) {
    if (S.busy) return;
    if (kind === 'video') { S.video.item = null; S.video.summary = null; }
    else { S[kind].items = []; S[kind].summary = null; }
    renderAll();
    const b = $(`#panel-${kind} .dropzone button`);
    if (b) b.focus();
  }

  async function runImages() {
    const tg = imageTarget();
    const st = S.image;
    const todo = st.items.filter((it) => it.status !== 'done');
    if (!tg || tg.invalid || !todo.length || S.busy) return;
    S.busy = 'images'; S.cancelling = false; st.summary = null;
    todo.forEach((it) => { it.status = 'queued'; it.percent = 0; it.result = null; it.errorText = null; });
    st.progress = 0;
    renderAll();
    announce(t('a11y.working'));
    const files = todo.map((it) => {
      const f = { path: it.path };
      if (it.rotate) f.rotate = it.rotate;
      if (it.crop) f.crop = Object.assign({}, it.crop);
      return f;
    });
    let res;
    try { res = await api.fitImages(Object.assign({ files }, tg.payload)); } catch (e) { res = { ok: false, error: 'exception', message: String(e && e.message || e) }; }
    S.busy = null; const wasCancel = S.cancelling; S.cancelling = false;

    let ok = 0; let err = 0; let firstOutput = null; let lastOk = null;
    if (isErr(res) || !Array.isArray(res)) {
      todo.forEach((it) => { it.status = 'error'; it.errorText = () => errText(res && res.error, res && res.message); });
      err = todo.length;
    } else {
      for (const it of todo) {
        const r = res.find((x) => x && x.input === it.path);
        if (!r) { it.status = wasCancel ? 'ready' : 'error'; if (!wasCancel) { it.errorText = () => t('err.generic'); err++; } continue; }
        if (r.ok && r.afterBytes > tg.maxBytes) { r.ok = false; r.error = 'over_limit'; }
        if (r.ok) { it.status = 'done'; it.result = r; ok++; firstOutput = firstOutput || r.output; lastOk = r; }
        else if (r.error === 'cancelled') { it.status = 'ready'; }
        else { it.status = 'error'; it.errorText = () => errText(r.error, r.message); err++; }
      }
    }
    const allOk = st.items.every((it) => it.status === 'done');
    if (wasCancel) st.summary = { type: 'info', title: () => t('done.cancelled'), sub: () => (ok ? whereText() : ''), firstOutput };
    else if (ok && !err) {
      st.summary = { type: 'ok', title: () => (ok === 1 && allOk ? t('done.single', { size: L.bytes(lastOk.afterBytes) }) : t('done.multi', { n: ok })),
        sub: () => t('done.where', { dir: baseName(dirOf(firstOutput)) || dirOf(firstOutput) }), firstOutput };
    } else if (ok && err) st.summary = { type: 'warn', title: () => t('done.partial', { ok, err }), sub: () => t('done.where', { dir: baseName(dirOf(firstOutput)) }), firstOutput };
    else st.summary = { type: 'err', title: () => t('done.failed'), sub: '' };
    renderAll();
    announce(txt(st.summary.title), st.summary.type === 'err');
    focusBanner('image');
    flushQueue();
  }

  /** İş bitince odağı sonuç şeridine taşı — kullanıcı başka sekmeye/diyaloğa geçmediyse. */
  function focusBanner(kind) {
    const b = $(`#panel-${kind} .banner .btn`);
    const a = document.activeElement;
    if (!b || $('dialog[open]') || S.tab !== kind) return;
    if (!a || a === document.body || a.closest(`#panel-${kind}`)) b.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- PDF paneli
  function renderPdf() {
    const panel = P('pdf');
    const st = S.pdf;
    panel.dataset.state = st.items.length ? 'has-files' : 'empty';
    panel.dataset.mode = st.mode;
    $$('input[name=pdf-mode]', panel).forEach((r) => { r.checked = r.value === st.mode; r.disabled = !!S.busy; });
    $('#pdf-mode-desc').textContent = t(st.mode === 'merge' ? 'pdf.mergeDesc' : 'pdf.splitDesc');
    keepFocus(() => {
      renderPdfCards();
      renderPdfList();
      renderFoot('pdf');
    });
  }

  function renderPdfCards() {
    const cont = $('.profiles', P('pdf'));
    const st = S.pdf;
    const items = [{ id: 'none', title: t('pdf.noLimit'), summary: t('pdf.noLimitSum') }];
    profilesFor('pdf').forEach((p) => items.push({ id: p.id, title: loc(p.name), summary: profileSummary(p), note: loc(p.note) }));
    const form = h('div', { class: 'custom-form' },
      h('label', { class: 'mini-field' }, h('span', {}, t('custom.max')),
        h('span', { class: 'input-unit' }, numInput('pdf-mb', st.customMB, { min: '0.1', step: '0.5' }, (v) => {
          st.customMB = v; const s = $('#p-pdf-custom-sum'); if (s) s.textContent = pdfCustomSum(); renderFoot('pdf');
        }), h('span', { class: 'unit' }, 'MB'))));
    items.push({ id: 'custom', title: t('profile.custom'), summary: st.target === 'custom' ? pdfCustomSum() : t('profile.customSumPdf'), extra: form });
    renderCards(cont, 'p-pdf', items, st.target);
  }
  const pdfCustomSum = () => (S.pdf.customMB > 0 ? '≤ ' + L.bytes(S.pdf.customMB * MB) + ' · PDF' : t('custom.invalid'));

  function pdfMaxBytes() {
    const st = S.pdf;
    if (st.target === 'none') return undefined;
    if (st.target === 'custom') return st.customMB > 0 ? Math.floor(st.customMB * MB) : NaN;
    const p = profileById(st.target);
    return p ? p.maxBytes : undefined;
  }

  function renderPdfList() {
    const panel = P('pdf');
    const ol = $('.file-list', panel);
    const slot = $('.banner-slot', panel);
    const busy = S.busy === 'pdf';
    slot.textContent = '';
    const sum = S.pdf.summary;
    if (sum) {
      slot.appendChild(resultBanner(sum, [
        sum.firstOutput ? revealBtn(sum.firstOutput, 'pdf-reveal') : null,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', 'data-fkey': 'pdf-new', onclick: () => clearList('pdf') }, t('done.new')),
      ]));
    }
    ol.textContent = '';
    const n = S.pdf.items.length;
    S.pdf.items.forEach((it, i) => {
      const info = it.info;
      const meta = [L.bytes(info.sizeBytes), h('span', { class: 'm-sep' }, '·'),
        info.kind === 'pdf' ? t('file.pages', { n: info.pages || 1 }) : t('file.imagePage')];
      const skip = S.pdf.mode === 'split' && info.kind !== 'pdf';
      const li = h('li', { class: 'frow frow-order' + (skip ? ' is-skipped' : ''), draggable: busy ? 'false' : 'true', dataset: { id: it.id, status: it.status } },
        h('span', { class: 'grip', title: t('pdf.dragHint'), 'aria-hidden': 'true' }, icon('grip')),
        h('span', { class: 'order-no', 'aria-hidden': 'true' }, String(i + 1)),
        thumbEl(it, info.kind === 'pdf' ? 'doc' : 'image'),
        h('div', { class: 'f-main' },
          h('div', { class: 'f-name', title: info.path }, h('span', { class: 'sr-only' }, t('pdf.position', { i: i + 1, n }) + ' '), info.name),
          h('div', { class: 'f-meta' }, meta, skip ? [h('span', { class: 'm-sep' }, '·'), h('span', { class: 'm-tag' }, t('pdf.skipped'))] : null)),
        h('div', { class: 'f-status' }, statusChip(it)),
        h('div', { class: 'f-actions' },
          h('button', { class: 'icon-btn', type: 'button', disabled: busy || i === 0, 'data-fkey': it.id + '-up', title: t('pdf.up'), 'aria-label': t('pdf.moveUp', { name: info.name }), onclick: () => movePdf(it.id, -1) }, icon('up')),
          h('button', { class: 'icon-btn', type: 'button', disabled: busy || i === n - 1, 'data-fkey': it.id + '-down', title: t('pdf.down'), 'aria-label': t('pdf.moveDown', { name: info.name }), onclick: () => movePdf(it.id, 1) }, icon('down')),
          h('button', { class: 'icon-btn', type: 'button', disabled: busy, 'data-fkey': it.id + '-rm', title: t('common.remove'), 'aria-label': t('file.removeFor', { name: info.name }), onclick: () => removeItem('pdf', it.id) }, icon('x'))));
      ol.appendChild(li);
    });
  }

  function movePdf(id, delta, toIndex) {
    const list = S.pdf.items;
    const i = list.findIndex((x) => x.id === id);
    if (i < 0) return;
    let j = toIndex != null ? toIndex : i + delta;
    j = clamp(j, 0, list.length - 1);
    if (j === i) return;
    const [it] = list.splice(i, 1);
    list.splice(j, 0, it);
    S.pdf.summary = null;
    keepFocus(() => renderPdfList());
    renderFoot('pdf');
    // Düğme devre dışı kaldıysa odağı satırda tut
    if (document.activeElement === document.body || (document.activeElement && document.activeElement.disabled)) {
      const btn = $(`[data-fkey="${it.id}-${delta < 0 ? 'down' : 'up'}"]`) || $(`[data-fkey="${it.id}-rm"]`);
      if (btn) btn.focus();
    }
    announce(t('pdf.moved', { name: it.info.name, pos: j + 1 }));
  }

  // Sürükleyerek sıralama
  (function setupPdfDrag() {
    const ol = $('#panel-pdf .file-list');
    let dragId = null;
    const clearMarks = () => $$('.drop-before, .drop-after', ol).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    ol.addEventListener('dragstart', (e) => {
      const li = e.target.closest('li');
      if (!li || S.busy) { e.preventDefault(); return; }
      dragId = li.dataset.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/x-sigdir-row', dragId);
      li.classList.add('is-dragging');
    });
    ol.addEventListener('dragover', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const li = e.target.closest('li');
      clearMarks();
      if (!li || li.dataset.id === dragId) return;
      const r = li.getBoundingClientRect();
      li.classList.add(e.clientY < r.top + r.height / 2 ? 'drop-before' : 'drop-after');
    });
    ol.addEventListener('drop', (e) => {
      if (!dragId) return;
      e.preventDefault();
      const li = e.target.closest('li');
      if (li && li.dataset.id !== dragId) {
        const list = S.pdf.items;
        const from = list.findIndex((x) => x.id === dragId);
        let to = list.findIndex((x) => x.id === li.dataset.id);
        const r = li.getBoundingClientRect();
        if (e.clientY >= r.top + r.height / 2) to += 1;
        if (from < to) to -= 1;
        movePdf(dragId, 0, to);
      }
      clearMarks();
    });
    ol.addEventListener('dragend', () => { dragId = null; clearMarks(); $$('.is-dragging', ol).forEach((x) => x.classList.remove('is-dragging')); });
    ol.addEventListener('keydown', (e) => {
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      const li = e.target.closest('li');
      if (!li || S.busy) return;
      e.preventDefault();
      movePdf(li.dataset.id, e.key === 'ArrowUp' ? -1 : 1);
    });
  })();

  async function runPdf() {
    const st = S.pdf;
    if (S.busy || !st.items.length) return;
    st.summary = null;
    if (st.mode === 'merge') {
      const maxBytes = pdfMaxBytes();
      if (Number.isNaN(maxBytes)) return;
      S.busy = 'pdf'; S.cancelling = false; st.progress = 0;
      st.items.forEach((it) => { it.status = 'queued'; it.percent = 0; });
      renderAll(); announce(t('a11y.working'));
      const opts = { files: st.items.map((it) => it.path) };
      if (maxBytes) opts.maxBytes = maxBytes;
      let r;
      try { r = await api.mergePdf(opts); } catch (e) { r = { ok: false, error: 'exception', message: String(e) }; }
      S.busy = null; const wasCancel = S.cancelling; S.cancelling = false;
      st.items.forEach((it) => { it.status = 'ready'; });
      if (r && r.ok && maxBytes && r.afterBytes > maxBytes) { r.ok = false; r.error = 'over_limit'; }
      if (r && r.ok) {
        st.summary = { type: 'ok', title: () => (maxBytes ? t('pdf.doneMerge', { size: L.bytes(r.afterBytes) }) : t('pdf.doneMergeNoLimit', { size: L.bytes(r.afterBytes) })),
          sub: () => baseName(r.output) + (r.pages ? ' · ' + t('file.pages', { n: r.pages }) : '') + ' · ' + t('done.where', { dir: baseName(dirOf(r.output)) }), firstOutput: r.output };
      } else if (wasCancel || (r && r.error === 'cancelled')) {
        st.summary = { type: 'info', title: () => t('done.cancelledNone') };
      } else {
        st.summary = { type: 'err', title: () => t('pdf.failed'), sub: () => errText(r && r.error, r && r.message) };
      }
    } else {
      const pdfs = st.items.filter((it) => it.info.kind === 'pdf');
      if (!pdfs.length) return;
      S.busy = 'pdf'; S.cancelling = false; st.progress = 0;
      pdfs.forEach((it) => { it.status = 'queued'; });
      renderAll(); announce(t('a11y.working'));
      let pages = 0; let fails = 0; let first = null; let lastErr = null;
      for (let i = 0; i < pdfs.length; i++) {
        if (S.cancelling) break;
        const it = pdfs[i];
        it.status = 'working'; st.progress = (i / pdfs.length) * 100; renderPdfList(); renderFoot('pdf');
        let r;
        try { r = await api.splitPdf({ file: it.path }); } catch (e) { r = { ok: false, error: 'exception', message: String(e) }; }
        if (r && r.ok) { it.status = 'done'; pages += (r.outputs || []).length; first = first || (r.outputs || [])[0]; }
        else { const rr = r; it.status = 'error'; it.errorText = () => errText(rr && rr.error, rr && rr.message); fails++; lastErr = it.errorText; }
      }
      const wasCancel = S.cancelling;
      S.busy = null; S.cancelling = false;
      st.items.forEach((it) => { if (it.status !== 'error') it.status = 'ready'; });
      if (pages && !fails) st.summary = { type: 'ok', title: () => t('pdf.doneSplit', { n: pages }), sub: () => t('done.where', { dir: baseName(dirOf(first)) }), firstOutput: first };
      else if (pages) st.summary = { type: 'warn', title: () => t('pdf.doneSplitPartial', { n: pages, err: fails }), sub: lastErr, firstOutput: first };
      else if (wasCancel) st.summary = { type: 'info', title: () => t('done.cancelledNone') };
      else st.summary = { type: 'err', title: () => t('pdf.failed'), sub: lastErr };
    }
    renderAll();
    announce(txt(st.summary.title) + (txt(st.summary.sub) && st.summary.type === 'err' ? '. ' + txt(st.summary.sub) : ''), st.summary.type === 'err');
    focusBanner('pdf');
    flushQueue();
  }

  $('#pdf-mode').addEventListener('change', (e) => {
    if (e.target.name !== 'pdf-mode') return;
    S.pdf.mode = e.target.value; S.pdf.summary = null;
    renderPdf();
  });

  // ---------------------------------------------------------------- VİDEO paneli
  function videoTarget() {
    const v = S.video;
    if (!v.profileId) return null;
    if (v.profileId === 'custom') return v.customMB > 0 ? { maxBytes: Math.floor(v.customMB * MB), label: t('profile.custom') } : { invalid: true };
    const p = profileById(v.profileId);
    return p ? { maxBytes: p.maxBytes, label: loc(p.name), vertical: !!p.vertical } : null;
  }

  function renderVideo() {
    const panel = P('video');
    const off = !S.info.ffmpegAvailable;
    panel.dataset.state = S.video.item ? 'has-files' : 'empty';
    panel.classList.toggle('is-off', off);
    $('#video-badge').hidden = !off;
    $('#tab-video').classList.toggle('is-off', off);
    $('#tab-video').setAttribute('aria-description', off ? t('video.off.title') : '');
    const offBox = $('#video-off');
    offBox.hidden = !off;
    $$('.pane', panel).forEach((p) => { p.hidden = off; });
    if (off) { renderVideoOff(offBox); return; }
    keepFocus(() => {
      renderVideoCards();
      renderVideoEditor();
      renderFoot('video');
    });
  }

  function renderVideoOff(box) {
    box.textContent = '';
    box.append(h('div', { class: 'off-card' },
      h('span', { class: 'off-icon' }, icon('video')),
      h('h2', {}, t('video.off.title')),
      h('p', {}, t('video.off.body')),
      h('p', { class: 'off-ways' }, t('video.off.ways')),
      h('ul', { class: 'off-steps' }, h('li', {}, t('video.off.step1')), h('li', {}, t('video.off.step2'))),
      h('p', { class: 'muted' }, t('video.off.foot')),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => switchTab('image', true) }, icon('image'), t('tabs.image')),
        h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => switchTab('pdf', true) }, icon('doc'), t('tabs.pdf')))));
  }

  function renderVideoCards() {
    const v = S.video;
    const cont = $('.profiles', P('video'));
    const items = profilesFor('video').map((p) => ({ id: p.id, title: loc(p.name), summary: profileSummary(p), note: loc(p.note) }));
    const form = h('div', { class: 'custom-form' },
      h('label', { class: 'mini-field' }, h('span', {}, t('custom.max')),
        h('span', { class: 'input-unit' }, numInput('vid-mb', v.customMB, { min: '1', step: '1' }, (val) => {
          v.customMB = val; const s = $('#p-video-custom-sum'); if (s) s.textContent = vidCustomSum(); renderFoot('video'); updateEstimate();
        }), h('span', { class: 'unit' }, 'MB'))));
    items.push({ id: 'custom', title: t('profile.custom'), summary: v.profileId === 'custom' ? vidCustomSum() : t('profile.customSumVideo'), extra: form });
    renderCards(cont, 'p-video', items, v.profileId);
  }
  const vidCustomSum = () => (S.video.customMB > 0 ? '≤ ' + L.bytes(S.video.customMB * MB) + ' · MP4' : t('custom.invalid'));

  function renderVideoEditor() {
    const v = S.video;
    const ed = $('.video-editor', P('video'));
    const slot = $('.banner-slot', P('video'));
    slot.textContent = '';
    if (v.summary) {
      slot.appendChild(resultBanner(v.summary, [
        v.summary.firstOutput ? revealBtn(v.summary.firstOutput, 'vid-reveal') : null,
      ]));
    }
    ed.textContent = '';
    if (!v.item) return;
    const info = v.item.info;
    const dur = info.durationSec || 0;
    const busy = S.busy === 'video';
    const step = dur > 600 ? 1 : 0.1;
    const frame = h('div', { class: 'v-frame' + (v.vertical ? ' is-vertical' : '') },
      info.thumb ? h('img', { src: info.thumb, alt: '' }) : icon('video'),
      h('span', { class: 'v-crop-guide', 'aria-hidden': 'true' }),
      h('span', { class: 'v-dur' }, L.time(dur)));
    const head = h('div', { class: 'v-head' }, frame,
      h('div', { class: 'v-info' },
        h('div', { class: 'f-name', title: info.path }, info.name),
        h('div', { class: 'f-meta', id: 'v-meta' }, videoMeta()),
        h('div', { class: 'v-fit' })));

    const trim = h('fieldset', { class: 'v-trim', disabled: busy },
      h('legend', {}, t('video.trimTitle')),
      h('div', { class: 'range-dual', style: '--a:0%;--b:100%' },
        h('span', { class: 'range-track', 'aria-hidden': 'true' }, h('span', { class: 'range-sel' })),
        h('input', { type: 'range', id: 'v-r-start', min: '0', max: String(dur), step: String(step), value: String(v.start), 'aria-label': t('video.startRange'), 'data-fkey': 'v-r-start',
          oninput: (e) => setTrim(parseFloat(e.target.value), null, 'range') }),
        h('input', { type: 'range', id: 'v-r-end', min: '0', max: String(dur), step: String(step), value: String(v.end), 'aria-label': t('video.endRange'), 'data-fkey': 'v-r-end',
          oninput: (e) => setTrim(null, parseFloat(e.target.value), 'range') })),
      h('div', { class: 'v-trim-inputs' },
        h('label', { class: 'mini-field' }, h('span', {}, t('video.start')),
          numInput('v-start', round1(v.start), { min: '0', max: String(dur), step: String(step) }, (val) => setTrim(val, null, 'num'))),
        h('label', { class: 'mini-field' }, h('span', {}, t('video.end')),
          numInput('v-end', round1(v.end), { min: '0', max: String(dur), step: String(step) }, (val) => setTrim(null, val, 'num'))),
        h('p', { class: 'v-sel', id: 'v-sel', 'aria-live': 'polite' })));

    const opts = h('fieldset', { class: 'v-opts', disabled: busy },
      h('legend', { class: 'sr-only' }, t('video.options')),
      optSwitch('v-vertical', 'phone', t('video.vertical'), t('video.verticalHint'), v.vertical, (on) => { v.vertical = on; v.verticalAuto = false; $('.v-frame', ed).classList.toggle('is-vertical', on); invalidateVideo(); updateEstimate(); renderFoot('video'); }),
      optSwitch('v-mute', 'mute', t('video.mute'), t('video.muteHint'), v.mute, (on) => { v.mute = on; invalidateVideo(); updateEstimate(); renderFoot('video'); }));

    const est = h('div', { class: 'v-est', id: 'v-est' });
    ed.append(head, trim, opts, est);
    syncTrim();
  }

  function videoDone() { const v = S.video; return !!(v.summary && v.summary.type === 'ok' && v.result); }

  function videoMeta() {
    const v = S.video; const info = v.item.info; const r = videoDone() ? v.result : null;
    if (r) {
      return [h('span', { class: 'm-before' }, L.bytes(r.beforeBytes || info.sizeBytes)), icon('arrow', 'ic-xs m-arrow'),
        h('strong', { class: 'm-after' }, L.bytes(r.afterBytes)), h('span', { class: 'm-sep' }, '·'), L.time((v.end - v.start) || info.durationSec || 0),
        r.width ? [h('span', { class: 'm-sep' }, '·'), `${r.width}×${r.height}`] : null];
    }
    return [L.bytes(info.sizeBytes), h('span', { class: 'm-sep' }, '·'), L.time(info.durationSec || 0),
      info.width ? [h('span', { class: 'm-sep' }, '·'), `${info.width}×${info.height}`] : null];
  }

  /** Video ayarı değişince eski sonuç geçersiz: şeridi kaldır, çubuğu ve düğmeyi yenile. */
  function invalidateVideo() {
    const v = S.video;
    if (!v.summary) return;
    v.summary = null; v.result = null;
    $('.banner-slot', P('video')).textContent = '';
    const m = $('#v-meta'); if (m) m.replaceChildren(...videoMeta().flat(Infinity).filter(Boolean).map((x) => (typeof x === 'object' ? x : document.createTextNode(String(x)))));
  }

  function optSwitch(id, iconName, label, hint, checked, onChange) {
    return h('label', { class: 'switch-row switch-row-card' },
      h('span', { class: 'opt-icon' }, icon(iconName)),
      h('span', { class: 'switch-text' }, h('span', {}, label), h('small', {}, hint)),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', id, checked, 'data-fkey': id, onchange: (e) => onChange(e.target.checked) }));
  }

  const round1 = (x) => Math.round((x || 0) * 10) / 10;

  function setTrim(start, end, src) {
    const v = S.video;
    const dur = (v.item && v.item.info.durationSec) || 0;
    const minLen = Math.min(1, dur);
    if (start != null && !Number.isNaN(start)) v.start = clamp(start, 0, Math.max(0, v.end - minLen));
    if (end != null && !Number.isNaN(end)) v.end = clamp(end, Math.min(dur, v.start + minLen), dur);
    invalidateVideo();
    syncTrim(src);
  }

  function syncTrim(src) {
    const v = S.video;
    if (!v.item) return;
    const dur = v.item.info.durationSec || 0;
    const rs = $('#v-r-start'); const re = $('#v-r-end');
    if (!rs) return;
    if (src !== 'range') { rs.value = String(v.start); re.value = String(v.end); }
    if (src !== 'num') { $('#v-start').value = String(round1(v.start)); $('#v-end').value = String(round1(v.end)); }
    rs.setAttribute('aria-valuetext', L.time(v.start));
    re.setAttribute('aria-valuetext', L.time(v.end));
    const dual = $('.range-dual');
    dual.style.setProperty('--a', (dur ? (v.start / dur) * 100 : 0) + '%');
    dual.style.setProperty('--b', (dur ? (v.end / dur) * 100 : 100) + '%');
    // Başlangıç tutamacı sona yaklaşınca üstte kalsın
    rs.style.zIndex = v.start > dur * 0.9 ? '3' : '2';
    $('#v-sel').textContent = t('video.selection', { from: L.time(v.start), to: L.time(v.end), len: L.dur(v.end - v.start) });
    updateEstimate();
    renderFoot('video');
  }

  function updateEstimate() {
    const box = $('#v-est');
    const fitBox = $('.v-fit', P('video'));
    if (!box) return;
    const v = S.video; const tg = videoTarget();
    box.textContent = '';
    if (fitBox) {
      fitBox.textContent = '';
      if (videoDone()) fitBox.appendChild(fitMeter(v.result.afterBytes, tg && !tg.invalid ? tg.maxBytes : v.result.afterBytes, true));
      else if (tg && !tg.invalid) fitBox.appendChild(fitMeter(v.item.info.sizeBytes * ((v.end - v.start) / (v.item.info.durationSec || 1)), tg.maxBytes, false));
    }
    if (!tg || tg.invalid) return;
    const len = Math.max(0.1, v.end - v.start);
    const kbps = (tg.maxBytes * 8 * 0.94) / 1000 / len - (v.mute ? 0 : 128);
    let level; let key;
    if (kbps >= 4000) { level = 4; key = 'great'; } else if (kbps >= 1800) { level = 3; key = 'good'; } else if (kbps >= 700) { level = 2; key = 'ok'; } else { level = 1; key = 'low'; }
    box.append(
      h('span', { class: 'v-est-label' }, t('video.quality')),
      h('span', { class: 'q-meter q-' + key, 'aria-hidden': 'true' }, [1, 2, 3, 4].map((i) => h('span', { class: i <= level ? 'on' : '' }))),
      h('strong', { class: 'q-text' }, t('video.q.' + key)));
    if (key === 'low' || key === 'ok') box.append(h('p', { class: 'v-est-tip' }, t('video.tip')));
  }

  async function runVideo() {
    const v = S.video; const tg = videoTarget();
    if (S.busy || !v.item || !tg || tg.invalid) return;
    S.busy = 'video'; S.cancelling = false; v.percent = 0; v.summary = null;
    renderAll(); announce(t('a11y.working'));
    const dur = v.item.info.durationSec || 0;
    const opts = { file: v.item.path, maxBytes: tg.maxBytes };
    if (v.start > 0.05) opts.start = round1(v.start);
    if (dur && v.end < dur - 0.05) opts.end = round1(v.end);
    if (v.vertical) opts.vertical = true;
    if (v.mute) opts.mute = true;
    let r;
    try { r = await api.fitVideo(opts); } catch (e) { r = { ok: false, error: 'exception', message: String(e) }; }
    const wasCancel = S.cancelling;
    S.busy = null; S.cancelling = false;
    if (r && r.ok && r.afterBytes > tg.maxBytes) { r.ok = false; r.error = 'over_limit'; }
    if (r && r.ok) {
      v.result = r;
      v.summary = { type: 'ok', title: () => t('done.single', { size: L.bytes(r.afterBytes) }), sub: () => baseName(r.output) + ' · ' + t('done.where', { dir: baseName(dirOf(r.output)) }), firstOutput: r.output };
    } else if (wasCancel || (r && r.error === 'cancelled')) {
      v.summary = { type: 'info', title: () => t('done.cancelledNone') };
    } else {
      v.summary = { type: 'err', title: () => t('video.failed'), sub: () => errText(r && r.error, r && r.message) };
    }
    renderAll();
    announce(txt(v.summary.title) + (v.summary.type === 'err' && txt(v.summary.sub) ? '. ' + txt(v.summary.sub) : ''), v.summary.type === 'err');
    focusBanner('video');
    flushQueue();
  }

  // ---------------------------------------------------------------- alt bölüm (Sığdır düğmesi)
  function renderFoot(kind) {
    const foot = $(`#panel-${kind} .pane-foot`);
    if (!foot) return;
    const busyJob = { image: 'images', pdf: 'pdf', video: 'video' }[kind];
    if (S.busy === busyJob) {
      let pct = 0; let label = t('a11y.working');
      if (kind === 'image') {
        pct = S.image.progress || 0;
        label = t('image.working', { n: S.image.items.filter((it) => it.status !== 'ready').length || 1 });
      } else if (kind === 'pdf') { pct = S.pdf.progress || 0; label = t(S.pdf.mode === 'merge' ? 'pdf.workingMerge' : 'pdf.workingSplit'); }
      else { pct = S.video.percent || 0; label = t('video.working'); }
      if (S.cancelling) label = t('common.cancelling');
      busyFoot(foot, pct, label);
      const c = $('[data-fkey=cancel]', foot); if (c) c.disabled = S.cancelling;
      return;
    }
    if (kind === 'image') {
      const st = S.image; const tg = imageTarget();
      const pending = st.items.filter((it) => it.status !== 'done').length;
      let hint; let disabled = true; let label = t('image.go');
      if (!st.items.length) hint = t('hint.noFiles');
      else if (!tg) hint = t('hint.noTarget');
      else if (tg.invalid) hint = t('hint.invalid');
      else if (!pending) { hint = t('hint.allDone'); label = t('image.allDone'); }
      else { disabled = !!S.busy; hint = t('hint.image', { n: pending, target: tg.label }) + ' ' + whereText(); }
      goFoot(foot, { label, iconName: 'fit', disabled, hint, onGo: runImages, fkey: 'go-image' });
    } else if (kind === 'pdf') {
      const st = S.pdf;
      let hint; let disabled = true; const merge = st.mode === 'merge';
      const pdfCount = st.items.filter((it) => it.info.kind === 'pdf').length;
      const mb = pdfMaxBytes();
      if (!st.items.length) hint = t('hint.noFiles');
      else if (merge && Number.isNaN(mb)) hint = t('hint.invalid');
      else if (merge) { disabled = !!S.busy; hint = t('pdf.hintMerge', { n: st.items.length }) + ' ' + whereText(); }
      else if (!pdfCount) hint = t('pdf.noPdf');
      else { disabled = !!S.busy; hint = t('pdf.hintSplit', { n: pdfCount }) + (pdfCount < st.items.length ? ' ' + t('pdf.hintSplitImages') : ''); }
      goFoot(foot, { label: t(merge ? 'pdf.goMerge' : 'pdf.goSplit'), iconName: merge ? 'merge' : 'split', disabled, hint, onGo: runPdf, fkey: 'go-pdf' });
    } else {
      const v = S.video; const tg = videoTarget();
      let hint; let disabled = true;
      if (!v.item) hint = t('hint.noFile');
      else if (!tg) hint = t('hint.noTargetVideo');
      else if (tg.invalid) hint = t('hint.invalid');
      else if (videoDone()) { hint = t('video.doneHint'); }
      else { disabled = !!S.busy; hint = t('video.hint', { len: L.dur(v.end - v.start), target: tg.label }) + ' ' + whereText(); }
      goFoot(foot, { label: videoDone() ? t('video.done') : t('video.go'), iconName: 'fit', disabled, hint, onGo: runVideo, fkey: 'go-video' });
    }
  }

  // Profil seçimi (tüm paneller)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.classList || !el.classList.contains('pcard-input')) return;
    if (el.name === 'p-image') {
      S.image.profileId = el.value;
      S.image.items.forEach((it) => { if (it.status === 'done' || it.status === 'error') { it.status = 'ready'; it.result = null; } });
      S.image.summary = null;
      resetIncompatibleCrops();
      renderImage();
      revealCustom(el);
    } else if (el.name === 'p-pdf') {
      S.pdf.target = el.value; S.pdf.summary = null; renderPdf();
      revealCustom(el);
    } else if (el.name === 'p-video') {
      const v = S.video;
      const p = profileById(el.value);
      v.profileId = el.value; v.summary = null;
      if (p && p.vertical) { if (!v.vertical) { v.vertical = true; v.verticalAuto = true; } }
      else if (v.verticalAuto) { v.vertical = false; v.verticalAuto = false; }
      renderVideo();
      revealCustom(el);
    }
  });

  /** "Özel" seçilince açılan formu görünür alana kaydır. */
  function revealCustom(input) {
    if (input.value !== 'custom') return;
    const form = $(`input[name="${input.name}"][value="custom"]`);
    const box = form && form.closest('.pcard') && form.closest('.pcard').nextElementSibling;
    if (box && box.classList.contains('custom-form')) box.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // ---------------------------------------------------------------- KIRP & DÖNDÜR
  const C = { item: null, rot: 0, aspect: null, crop: null, s: 1, img: null, drag: null };
  const dlgCrop = $('#dlg-crop');
  const box = $('#crop-box');
  const canvas = $('#crop-canvas');

  function cropSrcDims() {
    const w = C.item.info.width; const hh = C.item.info.height;
    return C.rot % 180 ? [hh, w] : [w, hh];
  }
  function defaultCrop() {
    const [W, H] = cropSrcDims();
    if (!C.aspect) return { x: 0, y: 0, w: W, h: H };
    let w = W; let hh = w / C.aspect;
    if (hh > H) { hh = H; w = hh * C.aspect; }
    return { x: (W - w) / 2, y: (H - hh) / 2, w, h: hh };
  }

  function openCrop(it) {
    const tg = imageTarget();
    C.item = it; C.rot = it.rotate || 0; C.aspect = tg && !tg.invalid ? tg.aspect : null;
    $('#crop-sub').textContent = C.aspect ? t('crop.sub', { ratio: tg.aspectLabel || ratioText(C.aspect), target: tg.label }) : t('crop.free');
    C.img = new Image();
    // Diyalog hemen açılır (Esc/odak beklenen gibi çalışsın); görüntü yüklenince çizilir.
    C.crop = null;
    box.style.width = '0px'; box.style.height = '0px';
    canvas.width = 0; canvas.height = 0;
    if (!dlgCrop.open) dlgCrop.showModal();
    box.focus();
    C.img.onload = () => {
      if (C.item !== it || !dlgCrop.open) return;
      C.crop = it.crop && (it.rotate || 0) === C.rot ? Object.assign({}, it.crop) : defaultCrop();
      layoutCrop();
    };
    C.img.src = it.info.thumb;
  }
  const ratioText = (a) => { const g = (x, y) => (y ? g(y, x % y) : x); const w = Math.round(a * 100); const d = g(w, 100); return `${w / d}:${100 / d}`; };

  function layoutCrop() {
    if (!C.item || !C.crop) return;
    const wrap = $('.crop-stage-wrap', dlgCrop);
    const maxW = Math.max(200, wrap.clientWidth - 32); const maxH = Math.max(160, wrap.clientHeight - 32);
    const [W, H] = cropSrcDims();
    C.s = Math.min(maxW / W, maxH / H);
    const cw = Math.round(W * C.s); const ch = Math.round(H * C.s);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    const stage = $('#crop-stage'); stage.style.width = cw + 'px'; stage.style.height = ch + 'px';
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.save();
    g.translate(cw / 2, ch / 2);
    g.rotate((C.rot * Math.PI) / 180);
    const iw = C.rot % 180 ? ch : cw; const ih = C.rot % 180 ? cw : ch;
    g.imageSmoothingQuality = 'high';
    g.drawImage(C.img, -iw / 2, -ih / 2, iw, ih);
    g.restore();
    placeBox();
  }

  function placeBox() {
    const c = C.crop;
    box.style.left = c.x * C.s + 'px'; box.style.top = c.y * C.s + 'px';
    box.style.width = c.w * C.s + 'px'; box.style.height = c.h * C.s + 'px';
    $('#crop-readout').textContent = t('crop.readout', { w: Math.round(c.w), h: Math.round(c.h) });
  }

  function clampMove(c) {
    const [W, H] = cropSrcDims();
    c.x = clamp(c.x, 0, W - c.w); c.y = clamp(c.y, 0, H - c.h);
    return c;
  }

  function resizeFrom(handle, start, dx, dy) {
    const [W, H] = cropSrcDims();
    const minS = Math.max(16, Math.min(W, H) * 0.06);
    const east = handle.includes('e'); const south = handle.includes('s');
    const ax = east ? start.x : start.x + start.w; const ay = south ? start.y : start.y + start.h;
    let w = Math.abs((east ? start.x + start.w + dx : start.x + dx) - ax);
    let hh = Math.abs((south ? start.y + start.h + dy : start.y + dy) - ay);
    const maxW = east ? W - ax : ax; const maxH = south ? H - ay : ay;
    if (C.aspect) {
      w = Math.max(w, hh * C.aspect);
      w = clamp(w, minS, Math.min(maxW, maxH * C.aspect));
      hh = w / C.aspect;
    } else { w = clamp(w, minS, maxW); hh = clamp(hh, minS, maxH); }
    return { x: east ? ax : ax - w, y: south ? ay : ay - hh, w, h: hh };
  }

  function scaleCrop(f) {
    const [W, H] = cropSrcDims();
    const c = C.crop; const cx = c.x + c.w / 2; const cy = c.y + c.h / 2;
    const minS = Math.max(16, Math.min(W, H) * 0.06);
    let w = c.w * f; let hh = c.h * f;
    if (C.aspect) { w = clamp(w, minS, Math.min(W, H * C.aspect)); hh = w / C.aspect; }
    else { w = clamp(w, minS, W); hh = clamp(hh, minS, H); }
    C.crop = clampMove({ x: cx - w / 2, y: cy - hh / 2, w, h: hh });
    placeBox();
  }

  box.addEventListener('pointerdown', (e) => {
    if (!C.crop) return;
    if (e.button !== 0) return;
    e.preventDefault();
    box.focus();
    box.setPointerCapture(e.pointerId);
    C.drag = { handle: e.target.dataset.handle || null, sx: e.clientX, sy: e.clientY, start: Object.assign({}, C.crop) };
    box.classList.add('is-dragging');
  });
  box.addEventListener('pointermove', (e) => {
    if (!C.drag) return;
    const dx = (e.clientX - C.drag.sx) / C.s; const dy = (e.clientY - C.drag.sy) / C.s;
    const st = C.drag.start;
    C.crop = C.drag.handle ? resizeFrom(C.drag.handle, st, dx, dy) : clampMove({ x: st.x + dx, y: st.y + dy, w: st.w, h: st.h });
    placeBox();
  });
  const endDrag = () => { C.drag = null; box.classList.remove('is-dragging'); };
  box.addEventListener('pointerup', endDrag);
  box.addEventListener('pointercancel', endDrag);
  box.addEventListener('keydown', (e) => {
    if (!C.crop) return;
    const [W, H] = cropSrcDims();
    const step = Math.max(1, Math.round(Math.max(W, H) * (e.shiftKey ? 0.05 : 0.01)));
    const c = C.crop;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key]) { e.preventDefault(); C.crop = clampMove({ x: c.x + moves[e.key][0], y: c.y + moves[e.key][1], w: c.w, h: c.h }); placeBox(); }
    else if (e.key === '+' || e.key === '=' || e.key === 'Add') { e.preventDefault(); scaleCrop(e.shiftKey && e.key !== '+' ? 1.1 : 1.04); }
    else if (e.key === '-' || e.key === 'Subtract') { e.preventDefault(); scaleCrop(1 / 1.04); }
    else if (e.key === 'Enter') { e.preventDefault(); applyCrop(); }
  });

  function rotateCrop(d) {
    if (!C.crop) return;
    C.rot = (C.rot + d + 360) % 360;
    C.crop = defaultCrop();
    layoutCrop();
    announce(t('crop.rotated', { deg: C.rot }));
  }
  $('#crop-rot-l').addEventListener('click', () => rotateCrop(-90));
  $('#crop-rot-r').addEventListener('click', () => rotateCrop(90));
  $('#crop-reset').addEventListener('click', () => { C.rot = 0; C.crop = defaultCrop(); layoutCrop(); });
  $('#crop-apply').addEventListener('click', applyCrop);

  function applyCrop() {
    const it = C.item;
    if (!it || !C.crop) return;
    const [W, H] = cropSrcDims();
    const c = C.crop;
    let x = Math.round(c.x); let y = Math.round(c.y); let w = Math.round(c.w); let hh = Math.round(c.h);
    w = Math.min(w, W - x); hh = Math.min(hh, H - y);
    const full = x <= 0 && y <= 0 && w >= W - 1 && hh >= H - 1;
    it.rotate = C.rot;
    it.crop = full ? null : { x, y, w, h: hh };
    it.preview = makePreview(it);
    it.status = 'ready'; it.result = null;
    S.image.summary = null;
    dlgCrop.close();
    renderImage();
    announce(it.crop ? t('crop.applied', { w, h: hh }) : t('crop.appliedRotate'));
  }

  /** Kırpılmış/döndürülmüş küçük resmi (en fazla 128px) data URL olarak üret. */
  function makePreview(it) {
    if (!it.crop && !it.rotate) return null;
    const [W, H] = cropSrcDims();
    const c = it.crop || { x: 0, y: 0, w: W, h: H };
    const k = 128 / Math.max(c.w, c.h);
    const cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(c.w * k)); cv.height = Math.max(1, Math.round(c.h * k));
    const g = cv.getContext('2d');
    g.translate(-c.x * k, -c.y * k);
    g.translate((W * k) / 2, (H * k) / 2);
    g.rotate((C.rot * Math.PI) / 180);
    const iw = (C.rot % 180 ? H : W) * k; const ih = (C.rot % 180 ? W : H) * k;
    g.drawImage(C.img, -iw / 2, -ih / 2, iw, ih);
    try { return cv.toDataURL('image/jpeg', 0.85); } catch (_) { return null; }
  }

  window.addEventListener('resize', () => { if (dlgCrop.open) layoutCrop(); });

  // ---------------------------------------------------------------- diyaloglar
  $$('dialog').forEach((d) => {
    // Arka plana tıklama kapatır — ama yalnızca basma da arka planda başladıysa
    // (kırpma kutusunu sürükleyip dışarıda bırakmak pencereyi kapatmasın).
    let downOutside = false;
    const outside = (e) => {
      const r = d.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    d.addEventListener('pointerdown', (e) => { downOutside = e.target === d && outside(e); });
    // Esc her zaman kapatsın (Chromium'un CloseWatcher kuralları art arda açılan diyaloglarda Esc'i yutabiliyor).
    d.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d.open) { e.preventDefault(); e.stopPropagation(); d.close(); } });
    d.addEventListener('click', (e) => {
      if (e.target === d && downOutside && outside(e)) d.close();
      else if (e.target.closest('[data-close]')) d.close();
      downOutside = false;
    });
  });

  // ---------------------------------------------------------------- AYARLAR
  const dlgSet = $('#dlg-settings');
  function fillSettings() {
    const s = S.settings;
    $$('input[name=set-lang]').forEach((r) => { r.checked = r.value === s.lang; });
    $$('input[name=set-theme]').forEach((r) => { r.checked = r.value === s.theme; });
    $('#set-out-path').textContent = s.outputDir || t('settings.outputDefault');
    $('#set-out-path').classList.toggle('is-default', !s.outputDir);
    $('#set-out-reset').hidden = !s.outputDir;
    $('#set-open-after').checked = !!s.openFolderAfter;
    $('#set-ctx-row').hidden = S.info.platform !== 'win32';
    $('#set-ctx').checked = !!s.contextMenuInstalled;
    $('#about-version').textContent = t('settings.version', { v: S.info.version || '–' });
  }
  function openSettings() { fillSettings(); dlgSet.showModal(); }
  $('#btn-settings').addEventListener('click', openSettings);
  dlgSet.addEventListener('close', () => $('#btn-settings').focus());

  dlgSet.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.name === 'set-lang') { await saveSettings({ lang: el.value }); applyLang(); fillSettings(); }
    else if (el.name === 'set-theme') { await saveSettings({ theme: el.value }); applyTheme(); }
    else if (el.id === 'set-open-after') { await saveSettings({ openFolderAfter: el.checked }); }
    else if (el.id === 'set-ctx') {
      el.disabled = true;
      const want = el.checked;
      const r = await api.setContextMenu(want);
      el.disabled = false;
      if (!r || !r.ok) {
        el.checked = !want;
        toast(t('toast.ctxFail', { msg: errText(r && r.error, r && r.message) }), 'error');
      } else {
        await saveSettings({ contextMenuInstalled: want });
        announce(t(want ? 'settings.ctxOn' : 'settings.ctxOff'));
      }
    }
  });
  $('#set-out-pick').addEventListener('click', async () => {
    const dir = await api.pickOutputDir();
    if (dir && typeof dir === 'string') { await saveSettings({ outputDir: dir }); fillSettings(); renderAll(); }
  });
  $('#set-out-reset').addEventListener('click', async () => {
    await saveSettings({ outputDir: null }); fillSettings(); renderAll(); $('#set-out-pick').focus();
  });

  // ---------------------------------------------------------------- genel olaylar
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-action]');
    if (a) {
      if (a.dataset.action === 'add') pickForTab();
      else if (a.dataset.action === 'clear') clearList(a.closest('.workspace').dataset.kind);
      return;
    }
    const dz = e.target.closest('.dropzone');
    if (dz && !e.target.closest('button')) pickForTab();
  });

  function runCurrent() {
    if (S.tab === 'image') runImages();
    else if (S.tab === 'pdf') runPdf();
    else if (S.info.ffmpegAvailable) runVideo();
  }

  document.addEventListener('keydown', (e) => {
    if ($('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'o') { e.preventDefault(); pickForTab(); }
      else if (e.key === 'Enter') { e.preventDefault(); runCurrent(); }
      else if (e.key === ',') { e.preventDefault(); openSettings(); }
      else if (['1', '2', '3'].includes(e.key)) { e.preventDefault(); switchTab(TABS[Number(e.key) - 1], true); }
    } else if (e.key === 'Escape' && S.busy) { doCancel(); }
  });

  // İlerleme olayları
  api.onProgress((ev) => {
    if (!ev) return;
    // Sözleşme notu: percent, tüm işin (toplu işin) yüzdesidir; status dosya bazındadır.
    if (ev.job === 'images' && S.busy === 'images') {
      S.image.progress = clamp(Math.max(S.image.progress || 0, ev.percent || 0), 0, 100);
      const it = S.image.items.find((x) => x.path === ev.file);
      if (it && it.status !== 'done') {
        // 'done' ara durumu yeşil tiki hemen gösterir; boyutlar sonuç gelince yazılır.
        it.status = ev.status === 'done' ? 'done' : 'working';
        const li = $(`#panel-image .file-list li[data-id="${it.id}"]`);
        if (li) { $('.f-status', li).replaceChildren(statusChip(it) || ''); li.dataset.status = it.status; }
      }
      renderFoot('image');
    } else if (ev.job === 'pdf' && S.busy === 'pdf') {
      if (S.pdf.mode === 'merge') {
        S.pdf.progress = clamp(Math.max(S.pdf.progress || 0, ev.percent || 0), 0, 100);
        S.pdf.items.forEach((it, i) => { it.status = i < ev.index ? 'done' : i === ev.index ? 'working' : 'queued'; it.percent = i === ev.index ? Math.round(ev.percent || 0) : 0; });
        keepFocus(() => renderPdfList());
      } else {
        const idx = S.pdf.items.filter((it) => it.info.kind === 'pdf').findIndex((it) => it.path === ev.file);
        const n = S.pdf.items.filter((it) => it.info.kind === 'pdf').length || 1;
        if (idx >= 0) S.pdf.progress = clamp((idx + (ev.percent || 0) / 100) / n * 100, 0, 100);
      }
      renderFoot('pdf');
    } else if (ev.job === 'video' && S.busy === 'video') {
      S.video.percent = clamp(ev.percent || 0, 0, 100);
      renderFoot('video');
    }
  });


  function renderAll() {
    $$('.dropzone').forEach((dz) => renderDropzone(dz, dz.dataset.dropkind));
    renderImage();
    renderPdf();
    renderVideo();
    if (dlgSet.open) fillSettings();
  }

  // ---------------------------------------------------------------- başlat
  (function overlayArt() {
    const art = h('div', { class: 'dz-art-wrap drag-art' }); art.innerHTML = DROP_ART;
    $('.drag-text').prepend(art);
  })();

  async function init() {
    const [info, settings, profiles] = await Promise.all([api.getAppInfo(), api.getSettings(), api.getProfiles()]);
    if (info && !isErr(info)) S.info = Object.assign(S.info, info);
    if (settings && !isErr(settings)) S.settings = Object.assign(S.settings, settings);
    if (Array.isArray(profiles)) S.profiles = profiles;
    document.body.dataset.platform = S.info.platform;
    applyTheme();
    applyLang();
    switchTab('image');
    document.body.classList.add('is-ready');
    // Açılışta bekleyen (--files / sağ tık) dosyalar abone olunca hemen gelir; ayarlar yüklendikten sonra abone ol.
    if (api.onFilesFromOS) api.onFilesFromOS((paths) => { if (Array.isArray(paths) && paths.length) addPaths(paths, 'os'); });
  }
  init().catch((e) => { console.error(e); toast(t('err.generic'), 'error'); });

  // Testler / hata ayıklama için küçük bir pencere (yan etkisiz okuma).
  window.__sigdirUI = { state: S, switchTab, addPaths };
})();
