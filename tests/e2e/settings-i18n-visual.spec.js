'use strict';

/**
 * Ayarlar (dil, tema, kalıcılık), çevrilmemiş metin avı, en küçük pencere boyutu (760×560),
 * açık/koyu tema ekran görüntüleri (deviceScaleFactor 1) ve konsol hataları.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

let fx;
let fxDir;

test.beforeAll(async () => {
  test.setTimeout(120000);
  fxDir = H.mkTmp('fx-set-');
  fx = await H.makeImageFixtures(fxDir);
  if (H.HAS_FFMPEG) fx.video = H.makeVideo(path.join(fxDir, 'klip.mp4'), { seconds: 4, size: '640x360' });
});

const card = (win, name, value) => win.locator(`.pcard:has(input[name="${name}"][value="${value}"])`);

/** Görünür metinler + erişilebilirlik öznitelikleri (aria-label, title, placeholder, aria-description). */
async function visibleTexts(win) {
  return win.evaluate(() => {
    const out = new Set();
    const visible = (el) => {
      if (!el || !el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.nodeValue.replace(/\s+/g, ' ').trim();
      if (!s) continue;
      const el = n.parentElement;
      // Canlı bölgelerdeki eski duyurular ve geçici bildirimler (toast) ayrı değerlendirilir
      if (el.closest('.sprite, script, style, #live-polite, #live-assertive, #toasts')) continue;
      if (visible(el) || el.closest('.sr-only')) out.add(s);
    }
    document.querySelectorAll('[aria-label],[title],[placeholder],[aria-description],[aria-roledescription],[aria-valuetext]').forEach((el) => {
      if ((!visible(el) && !el.closest('dialog[open]')) || el.closest('#toasts')) return;
      for (const a of ['aria-label', 'title', 'placeholder', 'aria-description', 'aria-roledescription']) {
        const v = el.getAttribute(a);
        if (v && v.trim()) out.add(`[${a}] ${v.trim()}`);
      }
    });
    return [...out];
  });
}

// Dilden bağımsız olabilecek metinler: marka/biçim adları, birimler, sayılar, yollar, "Discord video (10 MB)" gibi özel adlar
const ALLOW = /^(Sığdır|Türkçe|English|Video|ffmpeg|Ctrl ↵|(Discord|WhatsApp) video( \(\d+ MB\))?|\/.*|([\d\s.,:%×+\-–—≤↵/()·]|JPG|PNG|PDF|MP4|DPI|KB|MB|px|mm)+)$/;
const TR_CHARS = /[ğĞüÜşŞıİöÖçÇ]/;

async function snapshotStates(ctx, lang) {
  const { win } = ctx;
  const all = {};
  const grab = async (state) => { all[state] = await visibleTexts(win); };
  await win.locator('#tab-image').click();
  await grab('image');
  await win.locator('#tab-pdf').click();
  await grab('pdf');
  await win.locator('#pdf-mode label:has(input[value="split"])').click();
  await grab('pdf-split');
  await win.locator('#pdf-mode label:has(input[value="merge"])').click();
  await card(win, 'p-pdf', 'custom').click();
  await grab('pdf-custom');
  await win.locator('#tab-video').click();
  await grab('video');
  if (fx.video) {
    await card(win, 'p-video', 'shorts-dikey').click();
    await grab('video-shorts');
  }
  await win.locator('#tab-image').click();
  await card(win, 'p-image', 'custom').click();
  await win.locator('#panel-image select[data-fkey="cust-mode"]').selectOption('mm');
  await grab('image-custom-mm');
  await card(win, 'p-image', 'osym-vesikalik').click();
  await grab('image-osym');
  await win.locator('#panel-image .file-list li [data-fkey$="-crop"]').first().click();
  await win.waitForTimeout(500); // küçük resim yüklensin (açılış anındaki eski metin ayrıca denetlenir)
  await grab('crop');
  await win.keyboard.press('Escape');
  await win.locator('#btn-settings').click();
  await grab('settings');
  await win.screenshot({ path: path.join(H.OUT_DIR, `i18n-settings-${lang}.png`) });
  await win.keyboard.press('Escape');
  return all;
}

test('dil TR ↔ EN: tüm görünür metinler değişiyor mu (çevrilmemiş metin avı), şeritler ve hatalar dahil', async () => {
  test.setTimeout(180000);
  const out = H.mkTmp('i18n-out-');
  const ctx = await H.launchApp({ settings: { lang: 'tr', theme: 'light', outputDir: out } });
  try {
    const { win } = ctx;
    await H.stubOpenDialog(ctx.app, [fx.jpg, fx.trName, fx.corrupt, fx.pdf5, ...(fx.video ? [fx.video] : [])]);
    await win.locator('#panel-image [data-action="add"]:visible').first().click();
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(2);
    // Bir iş çalıştır: sonuç şeridi ve satır metinleri de taransın
    await card(win, 'p-image', 'biyometrik').click();
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .banner-ok')).toBeVisible({ timeout: 30000 });
    // Hatalı satır üret (zaten listedeki bir dosyayı silip yeniden işle)
    const tmpCopy = path.join(out, 'silinecek.jpg');
    fs.copyFileSync(fx.jpg, tmpCopy);
    await H.stubOpenDialog(ctx.app, [tmpCopy]);
    await win.locator('#panel-image [data-action="add"]:visible').first().click();
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(3);
    fs.unlinkSync(tmpCopy);
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .banner')).toBeVisible({ timeout: 30000 });
    await expect(win.locator('#panel-image .f-error')).toBeVisible();
    const setLang = async (l) => {
      await win.locator('#btn-settings').click();
      await win.locator(`#set-lang label:has(input[value="${l}"])`).click();
      await expect(win.locator('html')).toHaveAttribute('lang', l);
      await win.keyboard.press('Escape');
    };
    const trBanner = await win.locator('#panel-image .banner strong').innerText();
    const trErr = await win.locator('#panel-image .f-error').innerText();
    // Sonuç şeridi ve satır hatası varken dil değiştir
    await setLang('en');
    const enBanner = await win.locator('#panel-image .banner strong').innerText();
    const enErr = await win.locator('#panel-image .f-error').innerText();
    await win.screenshot({ path: path.join(H.OUT_DIR, 'i18n-banner-after-switch-en.png') });
    await setLang('tr');
    const tr = await snapshotStates(ctx, 'tr');
    await setLang('en');
    const en = await snapshotStates(ctx, 'en');

    // Kırp penceresi açıldığı ANDA (küçük resim yüklenmeden) önceki oturumun metni görünüyor mu? (SIG-012)
    await win.waitForTimeout(300);
    const staleReadout = await win.evaluate(() => {
      document.querySelector('#panel-image .file-list li [data-fkey$="-crop"]').click();
      const v = document.querySelector('#crop-readout').textContent;
      return v;
    });
    await win.keyboard.press('Escape');
    H.writeEvidence('i18n-crop-readout-on-open.json', { staleReadout });
    // SIG-012: açılış anında önceki oturumun ölçüsü/dili değil, yükleniyor metni görünmeli
    expect(staleReadout, 'kırp penceresi açılırken önceki okuma metni gösteriliyor').not.toMatch(/\d+×\d+|piksel/);
    const report = { bannerTR: trBanner, bannerEN: enBanner, rowErrorTR: trErr, rowErrorEN: enErr, sameInBoth: {}, turkishInEN: {}, rawKeys: {} };
    const keyLike = /^(\[[\w-]+\] )?[a-z]+(\.[a-zA-Z0-9_]+)+$/;
    for (const state of Object.keys(en)) {
      const trSet = new Set(tr[state] || []);
      const names = [H.TR_NAME, 'foto.jpg', 'silinecek.jpg', 'cok-sayfali.pdf', 'klip.mp4', 'bozuk.jpg'];
      const isName = (s) => names.some((n) => s.includes(n)) || /\.(jpg|pdf|mp4)\b/i.test(s);
      const strip = (s) => s.replace(/^\[[\w-]+\] /, '');
      report.sameInBoth[state] = en[state].filter((s) => trSet.has(s) && !ALLOW.test(strip(s)) && !isName(s) && /[A-Za-zğüşıöçĞÜŞİÖÇ]{3,}/.test(strip(s)));
      report.turkishInEN[state] = en[state].filter((s) => TR_CHARS.test(s) && !isName(s) && !ALLOW.test(strip(s)) && !/Türkçe|Sığdır|ÖSYM|e-Devlet/.test(s));
      report.rawKeys[state] = [...(tr[state] || []), ...en[state]].filter((s) => keyLike.test(s) && !isName(s));
    }
    H.writeEvidence('i18n-hunt.json', report);
    H.writeEvidence('i18n-texts.json', { tr, en });
    const flat = (o) => Object.entries(o).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
    expect.soft(flat(report.rawKeys), 'çevrilmemiş anahtar adları').toEqual([]);
    expect.soft(enBanner, 'dil değişince sonuç şeridi de çevrilmeli').not.toBe(trBanner);
    expect.soft(enErr, 'dil değişince satırdaki hata metni de çevrilmeli').not.toBe(trErr);
    expect.soft(flat(report.turkishInEN), 'EN arayüzde Türkçe metin').toEqual([]);
    expect.soft(flat(report.sameInBoth), 'TR ve EN’de aynı kalan metinler').toEqual([]);
    expect(ctx.consoleErrors).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('ana süreç hata mesajları dile göre (lang=en → İngilizce, lang=tr → Türkçe)', async () => {
  const ctx = await H.launchApp({ settings: { lang: 'en' } });
  try {
    const [r] = await H.api(ctx.win, 'fitImages', { files: [fx.docx], profileId: 'osym-vesikalik' });
    expect(r.message).toMatch(/not supported/);
    await H.api(ctx.win, 'setSettings', { lang: 'tr' });
    const [r2] = await H.api(ctx.win, 'fitImages', { files: [fx.docx], profileId: 'osym-vesikalik' });
    expect(r2.message).toMatch(/desteklenmiyor/);
  } finally {
    await ctx.close();
  }
});

test('tema: açık/koyu/sistem arayüzden; zemin renkleri DESIGN token’larıyla aynı; ayarlar yeniden başlatmada korunur', async () => {
  test.setTimeout(120000);
  const userData = H.mkTmp('persist-');
  const outDir = H.mkTmp('persist-out-');
  let ctx = await H.launchApp({ userData, settings: { lang: 'tr', theme: 'light' } });
  try {
    const { win } = ctx;
    const bg = () => win.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(await win.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
    expect(await bg()).toBe('rgb(243, 241, 236)'); // #F3F1EC
    await win.locator('#btn-settings').click();
    await win.locator('#set-theme label:has(input[value="dark"])').click();
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await bg()).toBe('rgb(18, 17, 23)'); // #121117
    await win.locator('#set-theme label:has(input[value="system"])').click();
    await win.locator('#set-theme label:has(input[value="dark"])').click();
    await win.locator('#set-lang label:has(input[value="en"])').click();
    await win.locator('label:has(#set-open-after)').click();
    // Çıktı klasörü seç (dizin diyaloğu taklit)
    await H.stubOpenDialog(ctx.app, [outDir]);
    await win.locator('#set-out-pick').click();
    await expect(win.locator('#set-out-path')).toHaveText(outDir);
    await expect(win.locator('#set-out-reset')).toBeVisible();
    // Linux'ta sağ tık menüsü ayarı gizli
    await expect(win.locator('#set-ctx-row')).toBeHidden();
    expect(await H.api(win, 'setContextMenu', true)).toMatchObject({ ok: false, error: 'unsupported' });
    await win.keyboard.press('Escape');
    const nativeDark = await ctx.app.evaluate(({ nativeTheme }) => nativeTheme.themeSource);
    expect(nativeDark).toBe('dark');
  } finally {
    await ctx.close();
  }
  const saved = JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));
  expect(saved).toMatchObject({ lang: 'en', theme: 'dark', outputDir: outDir, openFolderAfter: true });
  // Yeniden başlat
  ctx = await H.launchApp({ userData });
  try {
    const { win } = ctx;
    expect(await H.api(win, 'getSettings')).toMatchObject({ lang: 'en', theme: 'dark', outputDir: outDir, openFolderAfter: true });
    await expect(win.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(win.locator('html')).toHaveAttribute('lang', 'en');
    await expect(win.locator('#tab-image')).toContainText('Image');
    const winBg = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBackgroundColor());
    expect(winBg.toUpperCase()).toBe('#121117');
    // "Bitince klasörü aç" gerçekten çalışıyor mu
    await H.stubOpenDialog(ctx.app, [fx.jpg]);
    await win.locator('#panel-image [data-action="add"]:visible').first().click();
    await card(win, 'p-image', 'osym-vesikalik').click();
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .banner-ok')).toBeVisible({ timeout: 30000 });
    const revealed = await ctx.app.evaluate(() => global.__revealed);
    expect(revealed).toEqual([path.join(outDir, 'foto-sigdir.jpg')]);
    // Varsayılana dön
    await win.locator('#btn-settings').click();
    await win.locator('#set-out-reset').click();
    expect((await H.api(win, 'getSettings')).outputDir).toBe(null);
  } finally {
    await ctx.close();
  }
  // Bozuk settings.json → varsayılanlarla açılır, çökmez
  fs.writeFileSync(path.join(userData, 'settings.json'), '{bozuk json');
  ctx = await H.launchApp({ userData });
  try {
    const s = await H.api(ctx.win, 'getSettings');
    expect(s.theme).toBe('system');
  } finally {
    await ctx.close();
  }
});

/** Pencereyi verilen boyuta getirip taşma denetimi yapar. */
async function overflowAudit(ctx, label) {
  const { win } = ctx;
  return win.evaluate((lbl) => {
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const issues = [];
    const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')}`.slice(0, 80);
    const visible = (el) => {
      if (!el.getClientRects().length) return false;
      const cs = getComputedStyle(el);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0';
    };
    // Sayfa düzeyinde kaydırma olmamalı
    if (document.documentElement.scrollWidth > vw + 1) issues.push(`sayfa yatay taşıyor: ${document.documentElement.scrollWidth} > ${vw}`);
    if (document.documentElement.scrollHeight > vh + 1) issues.push(`sayfa dikey taşıyor: ${document.documentElement.scrollHeight} > ${vh}`);
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('.sprite, .sr-only, .toasts, dialog:not([open])')) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Kaydırılabilir bir ata içindeyse görünür alan dışı olabilir
      let scroller = el.parentElement;
      while (scroller && scroller !== document.body) {
        const o = getComputedStyle(scroller);
        if (/(auto|scroll)/.test(o.overflowY + o.overflowX)) break;
        scroller = scroller.parentElement;
      }
      const inScroller = scroller && scroller !== document.body;
      if (!inScroller && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1)) issues.push(`pencere dışında: ${desc(el)} [${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}]`);
      // Metin kutusundan taşan (ellipsis olmadan kırpılan) metin
      const cs = getComputedStyle(el);
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim());
      if (hasText && el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll' && cs.textOverflow !== 'ellipsis' && cs.display !== 'inline') {
        issues.push(`metin taşıyor: ${desc(el)} "${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
      }
    }
    // Ana düğme görünür olmalı
    const go = [...document.querySelectorAll('.btn-go')].find(visible);
    if (go) {
      const r = go.getBoundingClientRect();
      if (r.bottom > vh || r.right > vw) issues.push(`Sığdır düğmesi görünmüyor (${lbl})`);
    }
    return { vw, vh, issues: [...new Set(issues)] };
  }, label);
}

for (const theme of ['light', 'dark']) {
  test(`en küçük pencere 760×560 (${theme}): taşma yok; ekran görüntüleri (deviceScaleFactor 1)`, async () => {
    test.setTimeout(120000);
    const out = H.mkTmp('min-out-');
    const ctx = await H.launchApp({ settings: { lang: 'tr', theme, outputDir: out } });
    try {
      const { win, app } = ctx;
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 560));
      await win.waitForTimeout(400);
      const dpr = await win.evaluate(() => window.devicePixelRatio);
      expect(dpr).toBe(1);
      const results = {};
      const shot = async (name) => {
        await win.waitForTimeout(250);
        await win.screenshot({ path: path.join(H.OUT_DIR, `min-${theme}-${name}.png`) });
        results[name] = await overflowAudit(ctx, name);
      };
      await shot('01-bos');
      await H.stubOpenDialog(app, [fx.jpg, fx.trName, fx.webp, fx.png, fx.corrupt, ...fx.batch.slice(0, 3)]);
      await win.locator('#panel-image [data-action="add"]:visible').first().click();
      await card(win, 'p-image', 'osym-vesikalik').click();
      await shot('02-dosyalar');
      await card(win, 'p-image', 'custom').click();
      await win.locator('#panel-image select[data-fkey="cust-mode"]').selectOption('mm');
      await shot('03-ozel-mm');
      await card(win, 'p-image', 'cv-foto').click();
      await win.locator('#panel-image [data-fkey="go-image"]').click();
      await expect(win.locator('#panel-image .banner')).toBeVisible({ timeout: 30000 });
      await shot('04-sonuc');
      await win.locator('#panel-image .file-list li [data-fkey$="-reveal"]').first().waitFor();
      await win.locator('#tab-pdf').click();
      await H.stubOpenDialog(app, [fx.pdf5, fx.pdf2, fx.jpg]);
      await win.locator('#panel-pdf [data-action="add"]:visible').first().click();
      await card(win, 'p-pdf', 'custom').click();
      await shot('05-pdf');
      await win.locator('#tab-video').click();
      if (fx.video) {
        await H.stubOpenDialog(app, [fx.video]);
        await win.locator('#panel-video [data-action="add"]:visible').first().click();
        await expect(win.locator('#panel-video .video-editor .f-name')).toBeVisible({ timeout: 20000 });
        await card(win, 'p-video', 'discord-video').click();
      }
      await shot('06-video');
      await win.locator('#tab-image').click();
      await card(win, 'p-image', 'osym-vesikalik').click();
      await win.locator('#panel-image .file-list li [data-fkey$="-crop"]').first().click();
      await shot('07-kirp');
      await win.keyboard.press('Escape');
      await win.locator('#btn-settings').click();
      await shot('08-ayarlar');
      await win.keyboard.press('Escape');
      // EN (daha uzun/kısa metinler) ile tekrar
      await H.api(win, 'setSettings', { lang: 'en' });
      await win.reload();
      await win.waitForSelector('body.is-ready');
      await shot('09-en-bos');
      H.writeEvidence(`overflow-${theme}.json`, results);
      const all = Object.entries(results).flatMap(([k, v]) => v.issues.map((i) => `${k}: ${i}`));
      expect.soft(all, 'taşma/kırpılma bulguları').toEqual([]);
      expect(ctx.consoleErrors).toEqual([]);
    } finally {
      await ctx.close();
    }
  });
}
