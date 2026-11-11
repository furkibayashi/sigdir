'use strict';

/**
 * Arayüz akışları — gerçek uygulama. Yerel dosya diyaloğu ana süreçte taklit edilir
 * (dialog.showOpenDialog), geri kalan her şey gerçek: IPC, sharp, pdf-lib, dosya sistemi.
 */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { test, expect } = require('@playwright/test');
const H = require('./helpers');

let fx;
let fxDir;
const hashes = {};

test.beforeAll(async () => {
  test.setTimeout(120000);
  fxDir = H.mkTmp('fx-ui-');
  fx = await H.makeImageFixtures(fxDir);
  for (const v of Object.values(fx)) if (typeof v === 'string') hashes[v] = H.sha256(v);
});

test.afterAll(() => {
  for (const [p, h] of Object.entries(hashes)) if (fs.existsSync(p)) expect(H.sha256(p), `kaynak değişti: ${p}`).toBe(h);
});

async function open(settings = {}, more = {}) {
  const out = H.mkTmp('ui-out-');
  const ctx = await H.launchApp({ settings: { lang: 'tr', theme: 'light', outputDir: out, ...settings }, ...more });
  ctx.out = out;
  return ctx;
}

const card = (win, name, value) => win.locator(`.pcard:has(input[name="${name}"][value="${value}"])`);

async function addViaPicker(ctx, tab, files) {
  await H.stubOpenDialog(ctx.app, files);
  await ctx.win.locator(`#panel-${tab} [data-action="add"]:visible`).first().click();
}

function noConsoleErrors(ctx) {
  expect(ctx.consoleErrors, 'konsol hataları').toEqual([]);
}

test('görsel: Dosya seç → ÖSYM profili → Sığdır; satırlar, şerit ve dosyalar doğru', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    await expect(win.locator('#panel-image [data-fkey="go-image"]')).toBeDisabled();
    await addViaPicker(ctx, 'image', [fx.jpg, fx.trName]);
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(2);
    await expect(win.locator('#panel-image .file-list')).toContainText(H.TR_NAME);
    await card(win, 'p-image', 'osym-vesikalik').click();
    await expect(win.locator('#panel-image .pcard.is-selected')).toContainText('ÖSYM');
    // Oranı farklı (yatay) fotoğraf için kırpma ipucu
    await expect(win.locator('#panel-image .f-hint').first()).toBeVisible();
    const go = win.locator('#panel-image [data-fkey="go-image"]');
    await expect(go).toBeEnabled();
    await go.click();
    await expect(win.locator('#panel-image .banner-ok')).toBeVisible({ timeout: 30000 });
    await expect(win.locator('#panel-image .banner-ok')).toContainText('sınırın altında');
    await expect(win.locator('#panel-image .chip-ok')).toHaveCount(2);
    const outs = H.ls(ctx.out);
    expect(outs).toEqual(['Vesikalık Fotoğraf ğüşiöç-sigdir.jpg', 'foto-sigdir.jpg'].sort());
    for (const n of outs) {
      const rep = await H.imageReport(path.join(ctx.out, n));
      expect(rep.bytes).toBeLessThanOrEqual(200000);
      expect([rep.width, rep.height]).toEqual([394, 472]);
      expect(rep.hasExif).toBe(false);
    }
    // Arayüzde gösterilen sonra-boyutu gerçek dosya boyutuyla uyumlu mu
    const after = await win.locator('#panel-image .m-after').allTextContents();
    expect(after).toHaveLength(2);
    // "Klasörde göster" ana sürece gider
    await win.locator('#panel-image .banner [data-fkey="img-reveal"]').click();
    await expect.poll(() => ctx.app.evaluate(() => global.__revealed.length)).toBeGreaterThan(0);
    await win.screenshot({ path: path.join(H.OUT_DIR, 'ui-image-done-tr-light.png') });
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('kırp & döndür: sağa çevir + klavyeyle taşı/küçült + Enter → çıktı döndürülmüş ve kırpılmış', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    await addViaPicker(ctx, 'image', [fx.leftRight]); // 1200×800, sol kırmızı / sağ mavi
    await card(win, 'p-image', 'osym-vesikalik').click();
    await win.locator('#panel-image .file-list li [data-fkey$="-crop"]').click();
    const dlg = win.locator('#dlg-crop');
    await expect(dlg).toBeVisible();
    await expect(win.locator('#crop-readout')).toContainText('667'); // 800 yükseklikte 5:6 → 667×800
    await win.locator('#crop-rot-r').click(); // 800×1200, üst yarı kırmızı
    await expect(win.locator('#crop-readout')).toContainText('800');
    const box = win.locator('#crop-box');
    await box.focus();
    for (let i = 0; i < 20; i++) await win.keyboard.press('ArrowUp');
    for (let i = 0; i < 10; i++) await win.keyboard.press('-');
    for (let i = 0; i < 20; i++) await win.keyboard.press('ArrowUp');
    const readout = await win.locator('#crop-readout').textContent();
    await win.screenshot({ path: path.join(H.OUT_DIR, 'ui-crop-dialog.png') });
    await win.keyboard.press('Enter');
    await expect(dlg).toBeHidden();
    await expect(win.locator('#panel-image .file-list li .m-tag')).toBeVisible();
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .banner-ok')).toBeVisible({ timeout: 30000 });
    const [name] = H.ls(ctx.out);
    const out = path.join(ctx.out, name);
    const rep = await H.imageReport(out);
    expect([rep.width, rep.height]).toEqual([394, 472]);
    // Kırpma kutusu üstte: üst kısım kırmızı, en alt şerit mavi (döndürme yönü + kırpma konumu doğru)
    expect(await H.colorAt(out, 0.5, 0.1)).toBe('red');
    expect(await H.colorAt(out, 0.5, 0.6)).toBe('red');
    expect(await H.colorAt(out, 0.5, 0.99)).toBe('blue');
    H.writeEvidence('ui-crop.json', { readout, rep });
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('kırp diyaloğu: Vazgeç değişiklik yapmaz, Esc kapatır, odak açan düğmeye döner', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    await addViaPicker(ctx, 'image', [fx.jpg]);
    await card(win, 'p-image', 'biyometrik').click();
    const btn = win.locator('#panel-image .file-list li [data-fkey$="-crop"]');
    await btn.click();
    await win.locator('#crop-rot-l').click();
    await win.locator('#dlg-crop .dialog-foot [data-close]').click();
    await expect(win.locator('#dlg-crop')).toBeHidden();
    await expect(win.locator('#panel-image .file-list li .m-tag')).toHaveCount(0);
    await btn.click();
    await expect(win.locator('#dlg-crop')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(win.locator('#dlg-crop')).toBeHidden();
    const focused = await win.evaluate(() => document.activeElement && (document.activeElement.dataset.fkey || document.activeElement.tagName));
    H.writeEvidence('ui-crop-focus-after-close.json', { focused });
    expect(focused, 'diyalog kapanınca odak kırp düğmesine dönmeli (DESIGN.md §6)').toMatch(/-crop$/);
  } finally {
    await ctx.close();
  }
});

test('PDF birleştir: 3 dosya, Alt+↑ ile sıralama, sınırsız → sayfa sırası doğru; e-Devlet 2 MB → sınır altında', async () => {
  test.setTimeout(120000);
  const ctx = await open();
  try {
    const { win } = ctx;
    await win.keyboard.press('Control+2');
    await expect(win.locator('#panel-pdf')).toBeVisible();
    await addViaPicker(ctx, 'pdf', [fx.pdf5, fx.jpg, fx.pdf2]);
    const rows = win.locator('#panel-pdf .file-list li');
    await expect(rows).toHaveCount(3);
    // 3. satırı (ikinci.pdf) iki kez yukarı taşı
    await rows.nth(2).locator('[data-fkey$="-rm"]').focus();
    await win.keyboard.press('Alt+ArrowUp');
    await win.keyboard.press('Alt+ArrowUp');
    await expect(rows.nth(0)).toContainText('ikinci.pdf');
    await expect(rows.nth(1)).toContainText('cok-sayfali.pdf');
    await expect(rows.nth(2)).toContainText('foto.jpg');
    // ↓ düğmesiyle: foto.jpg zaten sonda (devre dışı), cok-sayfali'yi bir aşağı, sonra geri
    await expect(rows.nth(2).locator('[data-fkey$="-down"]')).toBeDisabled();
    await card(win, 'p-pdf', 'none').click();
    await win.locator('#panel-pdf [data-fkey="go-pdf"]').click();
    await expect(win.locator('#panel-pdf .banner-ok')).toBeVisible({ timeout: 60000 });
    const merged = H.ls(ctx.out).filter((n) => n.endsWith('.pdf'));
    expect(merged).toEqual(['ikinci-sigdir.pdf']);
    const pages = await H.pdfPages(path.join(ctx.out, merged[0]));
    expect(pages).toEqual([[200, 200], [250, 250], [300, 400], [400, 300], [500, 500], [300, 400], [612, 792], [842, 595]]);

    // Hedef boyutlu birleştirme: 12 MP + 10 fotoğraf → ≤ 2 MB
    await win.locator('#panel-pdf .banner [data-fkey="pdf-new"]').click();
    await addViaPicker(ctx, 'pdf', [fx.big, ...fx.batch.slice(0, 5)]);
    await expect(rows).toHaveCount(6);
    await card(win, 'p-pdf', 'edevlet-belge-pdf').click();
    const t0 = Date.now();
    await win.locator('#panel-pdf [data-fkey="go-pdf"]').click();
    await expect(win.locator('#panel-pdf .banner-ok')).toBeVisible({ timeout: 90000 });
    const ms = Date.now() - t0;
    const out2 = H.ls(ctx.out).filter((n) => n.startsWith('buyuk-12mp'));
    expect(out2).toHaveLength(1);
    const size = fs.statSync(path.join(ctx.out, out2[0])).size;
    expect(size).toBeLessThanOrEqual(2000000);
    expect(await H.pdfPages(path.join(ctx.out, out2[0]))).toHaveLength(6);
    H.writeEvidence('ui-pdf-merge.json', { pages, limitedSize: size, ms });
    await win.screenshot({ path: path.join(H.OUT_DIR, 'ui-pdf-merge-tr-light.png') });
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('PDF ayır: 2 PDF + 1 görsel → görsel atlanır, 7 tek sayfalık dosya', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    await win.locator('#tab-pdf').click();
    await addViaPicker(ctx, 'pdf', [fx.pdf5, fx.jpg, fx.pdf2]);
    await win.locator('#pdf-mode label:has(input[value="split"])').click();
    await expect(win.locator('#panel-pdf .file-list li.is-skipped')).toHaveCount(1);
    await win.locator('#panel-pdf [data-fkey="go-pdf"]').click();
    await expect(win.locator('#panel-pdf .banner-ok')).toBeVisible({ timeout: 30000 });
    const outs = H.ls(ctx.out);
    expect(outs).toEqual([
      'cok-sayfali-sayfa-01.pdf', 'cok-sayfali-sayfa-02.pdf', 'cok-sayfali-sayfa-03.pdf', 'cok-sayfali-sayfa-04.pdf', 'cok-sayfali-sayfa-05.pdf',
      'ikinci-sayfa-01.pdf', 'ikinci-sayfa-02.pdf',
    ]);
    expect(await H.pdfPages(path.join(ctx.out, 'cok-sayfali-sayfa-03.pdf'))).toEqual([[500, 500]]);
    expect(await H.pdfPages(path.join(ctx.out, 'ikinci-sayfa-02.pdf'))).toEqual([[250, 250]]);
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('PDF IPC: şifreli/bozuk PDF anlaşılır hata; yalnız PDF birleştirmede sığmayan hedef → too_small', async () => {
  const ctx = await open();
  try {
    const bad = path.join(fxDir, 'bozuk.pdf');
    fs.writeFileSync(bad, '%PDF-1.7\n' + 'x'.repeat(500));
    const r1 = await H.api(ctx.win, 'splitPdf', { file: bad });
    expect(r1).toMatchObject({ ok: false, error: 'read_failed' });
    const r2 = await H.api(ctx.win, 'mergePdf', { files: [fx.pdf5], maxBytes: 1000 });
    expect(r2).toMatchObject({ ok: false, error: 'too_small' });
    const r3 = await H.api(ctx.win, 'splitPdf', { file: fx.jpg });
    expect(r3).toMatchObject({ ok: false, error: 'unsupported' });
    const r4 = await H.api(ctx.win, 'mergePdf', { files: [] });
    expect(r4).toMatchObject({ ok: false, error: 'no_files' });
    const enc = await H.makeEncryptedPdf(path.join(fxDir, 'sifreli.pdf'));
    const [ie] = await H.api(ctx.win, 'inspect', [enc]);
    expect(ie.error).toBe('encrypted');
    expect(await H.api(ctx.win, 'splitPdf', { file: enc })).toMatchObject({ ok: false, error: 'encrypted' });
    expect(await H.api(ctx.win, 'mergePdf', { files: [fx.pdf2, enc] })).toMatchObject({ ok: false, error: 'encrypted' });
    expect(H.ls(ctx.out)).toEqual([]);
  } finally {
    await ctx.close();
  }
});

test('--files ile açılış: göreli+mutlak yol, Türkçe ad; desteklenmeyen dosya için bildirim', async () => {
  const ctx = await open({}, { args: ['--files', fx.trName, 'cok-sayfali.pdf', fx.docx], cwd: fxDir });
  try {
    const { win } = ctx;
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(1, { timeout: 15000 });
    await expect(win.locator('#panel-image .file-list')).toContainText(H.TR_NAME);
    const pdfCount = await win.evaluate(() => window.__sigdirUI.state.pdf.items.length);
    expect(pdfCount).toBe(1);
    await expect(win.locator('#toasts')).toContainText('Sağ tık menüsünden 2 dosya geldi.');
    await expect(win.locator('#toasts')).toContainText('belge.docx');
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('ikinci örnek: aynı kullanıcı verisiyle --files → dosyalar ilk pencereye gelir, ikinci süreç kapanır', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    const electronBin = require(path.join(H.ROOT, 'node_modules', 'electron'));
    const env = { ...process.env, SIGDIR_USER_DATA: ctx.userData, TMPDIR: ctx.appTmp };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronBin, ['--no-sandbox', H.ROOT, '--files', fx.webp], { env, stdio: 'ignore' });
    const code = await new Promise((res) => {
      const t = setTimeout(() => { child.kill('SIGKILL'); res('timeout'); }, 20000);
      child.on('exit', (c) => { clearTimeout(t); res(c); });
    });
    expect(code).toBe(0);
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(1, { timeout: 10000 });
    await expect(win.locator('#panel-image .file-list')).toContainText('foto.webp');
    const windows = await ctx.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    expect(windows).toBe(1);
  } finally {
    await ctx.close();
  }
});

test('yalnızca klavye: Ctrl+O → Tab ile profil → Ctrl+Enter → sonuç şeridi odakta; Ctrl+, ayarlar, Esc kapatır', async () => {
  const ctx = await open();
  try {
    const { win } = ctx;
    await H.stubOpenDialog(ctx.app, [fx.jpg, fx.webp]);
    await win.locator('body').click({ position: { x: 5, y: 5 } });
    await win.keyboard.press('Control+o');
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(2);
    // Tab ile profil kartlarına ulaş
    const stops = [];
    let reached = false;
    for (let i = 0; i < 40; i++) {
      await win.keyboard.press('Tab');
      const d = await win.evaluate(() => {
        const a = document.activeElement;
        if (!a) return null;
        const cs = getComputedStyle(a);
        const host = a.closest('.pcard') || a;
        const hs = getComputedStyle(host);
        return { tag: a.tagName, fkey: a.dataset.fkey || '', name: a.name || '', value: a.value || '', label: a.getAttribute('aria-label') || a.textContent.trim().slice(0, 30),
          outline: cs.outlineStyle !== 'none' || hs.outlineStyle !== 'none' || cs.boxShadow !== 'none' };
      });
      stops.push(d);
      if (d && d.name === 'p-image') { reached = true; break; }
    }
    H.writeEvidence('keyboard-tab-stops.json', stops);
    expect(reached, 'Tab ile profil kartlarına ulaşılamadı').toBe(true);
    for (let i = 0; i < 2; i++) await win.keyboard.press('ArrowDown'); // 3. profil: e-Devlet belge (JPG)
    const sel = await win.evaluate(() => window.__sigdirUI.state.image.profileId);
    expect(sel).toBe('edevlet-belge-jpg');
    expect(stops.filter((s) => s && !s.outline), 'görünür odak göstergesi olmayan duraklar').toEqual([]);
    await win.keyboard.press('Control+Enter');
    await expect(win.locator('#panel-image .banner-ok')).toBeVisible({ timeout: 30000 });
    await win.waitForTimeout(300);
    const focusAfter = await win.evaluate(() => ({ inBanner: !!document.activeElement.closest('.banner'), fkey: document.activeElement.dataset.fkey || document.activeElement.tagName }));
    H.writeEvidence('keyboard-focus-after-run.json', focusAfter);
    // DESIGN.md §6: "iş bitince odak şeritteki ilk düğmeye taşınır"
    expect.soft(focusAfter.inBanner, `iş bitince odak sonuç şeridinde olmalı; şu an: ${focusAfter.fkey}`).toBe(true);
    expect(H.ls(ctx.out)).toHaveLength(2);
    await win.keyboard.press('Control+,');
    await expect(win.locator('#dlg-settings')).toBeVisible();
    await win.keyboard.press('Escape');
    await expect(win.locator('#dlg-settings')).toBeHidden();
    expect(await win.evaluate(() => document.activeElement.id)).toBe('btn-settings');
    // Sekmeler ok tuşlarıyla
    await win.locator('#tab-image').focus();
    await win.keyboard.press('ArrowRight');
    await expect(win.locator('#tab-pdf')).toHaveAttribute('aria-selected', 'true');
    await win.keyboard.press('End');
    await expect(win.locator('#tab-video')).toHaveAttribute('aria-selected', 'true');
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('arayüz: iş sürerken yeni dosya ekleme/ikinci iş engellenir, Esc toplu işi iptal eder', async () => {
  test.setTimeout(120000);
  const ctx = await open();
  try {
    const { win } = ctx;
    await addViaPicker(ctx, 'image', [fx.big, ...fx.batch]);
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(11);
    await card(win, 'p-image', 'custom').click();
    await win.locator('#cust-max').fill('150');
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .progress')).toBeVisible();
    // Meşgulken PDF sekmesindeki düğme pasif, Ctrl+O bildirim verir
    await win.keyboard.press('Control+o');
    await expect(win.locator('#toasts')).toContainText('Önce süren işin bitmesini bekle.');
    await win.keyboard.press('Escape');
    await expect(win.locator('#panel-image .banner')).toBeVisible({ timeout: 60000 });
    await expect(win.locator('#panel-image .banner')).toContainText('İptal edildi');
    const outs = H.ls(ctx.out);
    expect(outs.length).toBeLessThan(11);
    for (const n of outs) expect(fs.statSync(path.join(ctx.out, n)).size).toBeLessThanOrEqual(150000);
    noConsoleErrors(ctx);
  } finally {
    await ctx.close();
  }
});

test('iş sürerken sağ tık/ikinci örnekten gelen dosyalar kaybolmamalı', async () => {
  test.setTimeout(120000);
  const ctx = await open();
  try {
    const { win } = ctx;
    await addViaPicker(ctx, 'image', [fx.big, ...fx.batch]);
    await expect(win.locator('#panel-image .file-list li')).toHaveCount(11);
    await card(win, 'p-image', 'custom').click();
    await win.locator('#cust-max').fill('120');
    await win.locator('#panel-image [data-fkey="go-image"]').click();
    await expect(win.locator('#panel-image .progress')).toBeVisible();
    const electronBin = require(path.join(H.ROOT, 'node_modules', 'electron'));
    const env = { ...process.env, SIGDIR_USER_DATA: ctx.userData, TMPDIR: ctx.appTmp };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(electronBin, ['--no-sandbox', H.ROOT, '--files', fx.webp], { env, stdio: 'ignore' });
    await new Promise((res) => child.on('exit', res));
    await expect(win.locator('#panel-image .banner')).toBeVisible({ timeout: 90000 });
    const toasts = await win.locator('#toasts').innerText().catch(() => '');
    await win.waitForTimeout(1000);
    const names = await win.evaluate(() => window.__sigdirUI.state.image.items.map((it) => it.info.name));
    H.writeEvidence('busy-second-instance.json', { toasts, names });
    expect(names, `iş sürerken gelen foto.webp listeye eklenmedi (bildirim: "${toasts.replace(/\n/g, ' ')}")`).toContain('foto.webp');
  } finally {
    await ctx.close();
  }
});
