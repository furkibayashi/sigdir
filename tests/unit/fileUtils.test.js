'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers/fixtures');
const { desiredOutputPath, candidatePath, writeFileUnique, commitFileUnique, uniquePathSync } = require('../../src/core/fileUtils');

test('çıktı adı: kaynağın yanına -sigdir eki, uzantı hedef biçime göre', () => {
  const p = path.join('/a', 'b', 'Vesikalık Foto.HEIC');
  assert.equal(desiredOutputPath(p, { ext: 'jpg' }), path.join('/a', 'b', 'Vesikalık Foto-sigdir.jpg'));
  assert.equal(desiredOutputPath(p, { ext: '.png', outputDir: '/cikti' }), path.join('/cikti', 'Vesikalık Foto-sigdir.png'));
  assert.equal(desiredOutputPath('/x/belge.pdf', { suffix: '-sayfa-01' }), path.join('/x', 'belge-sayfa-01.pdf'));
  assert.equal(candidatePath('/x/a-sigdir.jpg', 1), '/x/a-sigdir.jpg');
  assert.equal(candidatePath('/x/a-sigdir.jpg', 3), path.join('/x', 'a-sigdir-3.jpg'));
});

test('çakışmada -2, -3 eklenir; var olan dosya asla ezilmez', async () => {
  const d = tmpDir();
  try {
    const desired = path.join(d, 'foto-sigdir.jpg');
    fs.writeFileSync(desired, 'ESKI');
    const a = await writeFileUnique(desired, Buffer.from('1'));
    const b = await writeFileUnique(desired, Buffer.from('2'));
    assert.equal(a, path.join(d, 'foto-sigdir-2.jpg'));
    assert.equal(b, path.join(d, 'foto-sigdir-3.jpg'));
    assert.equal(fs.readFileSync(desired, 'utf8'), 'ESKI');
    assert.equal(uniquePathSync(desired), path.join(d, 'foto-sigdir-4.jpg'));

    // Eşzamanlı yazımlarda bile her biri ayrı ada düşer
    const many = await Promise.all(Array.from({ length: 8 }, (_, i) => writeFileUnique(path.join(d, 'x.jpg'), Buffer.from(String(i)))));
    assert.equal(new Set(many).size, 8);

    // Geçici dosyayı taşırken de ezme yok; olmayan alt klasör oluşturulur
    const tmp = path.join(d, 'tmp.bin');
    fs.writeFileSync(tmp, 'VIDEO');
    const c = await commitFileUnique(tmp, desired);
    assert.equal(c, path.join(d, 'foto-sigdir-4.jpg'));
    assert.equal(fs.existsSync(tmp), false);
    const tmp2 = path.join(d, 'tmp2.bin');
    fs.writeFileSync(tmp2, 'V2');
    const e = await commitFileUnique(tmp2, path.join(d, 'yeni', 'klasor', 'v.mp4'));
    assert.equal(fs.readFileSync(e, 'utf8'), 'V2');
  } finally {
    rmrf(d);
  }
});

// ---------------------------------------------------------------- SIG-001: çok uzun adlar
const { safeBaseName, MAX_NAME_BYTES, ensureOutputDir, outputError } = require('../../src/core/fileUtils');
const { toErrorInfo } = require('../../src/core/errors');

test('SIG-001: çok uzun ad, ek + uzantı + çakışma payıyla 255 bayta sığacak şekilde kısaltılır', () => {
  const ascii = 'a'.repeat(246);
  const p = desiredOutputPath(`/x/${ascii}.jpg`, { ext: 'jpg', platform: 'linux' });
  const name = path.basename(p);
  assert.ok(name.endsWith('-sigdir.jpg'));
  assert.ok(Buffer.byteLength(name) + '-9999'.length <= MAX_NAME_BYTES, String(Buffer.byteLength(name)));
  // Çok baytlı karakterler bölünmez (geçerli UTF-8 kalır)
  const tr = desiredOutputPath(`/x/${'ğ'.repeat(200)}.heic`, { ext: 'jpg', platform: 'linux' });
  const trName = path.basename(tr);
  assert.ok(Buffer.byteLength(trName) <= MAX_NAME_BYTES - 5);
  assert.match(trName, /^ğ+-sigdir\.jpg$/);
  // Kısa adlar olduğu gibi kalır
  assert.equal(safeBaseName('Vesikalık Foto', { suffix: '-sigdir', ext: '.jpg', platform: 'linux' }), 'Vesikalık Foto');
  // Windows: tam yol MAX_PATH (259) içinde kalır, sondaki boşluk/nokta atılır
  const deep = 'C:\\Users\\kullanici\\' + 'k'.repeat(150);
  const w = safeBaseName('b'.repeat(200), { dir: deep, suffix: '-sigdir', ext: '.jpg', platform: 'win32' });
  assert.ok(deep.length + 1 + w.length + '-sigdir.jpg'.length + 5 <= 259);
  assert.equal(safeBaseName('ad. . ', { suffix: '-sigdir', ext: '.jpg', platform: 'win32' }), 'ad');
});

test('SIG-001: 250 baytlık adlı dosyanın çıktısı gerçekten yazılabilir', async () => {
  const d = tmpDir();
  try {
    const input = path.join(d, 'a'.repeat(246) + '.jpg');
    fs.writeFileSync(input, 'x');
    const out1 = await writeFileUnique(desiredOutputPath(input, { ext: 'jpg' }), Buffer.from('1'));
    const out2 = await writeFileUnique(desiredOutputPath(input, { ext: 'jpg' }), Buffer.from('2'));
    assert.ok(fs.existsSync(out1) && fs.existsSync(out2));
    assert.match(path.basename(out2), /-sigdir-2\.jpg$/);
  } finally {
    rmrf(d);
  }
});

test('SIG-002: çıktı klasörü kullanılamazsa write_failed + ne yapılacağını söyleyen mesaj', async () => {
  const d = tmpDir();
  try {
    const file = path.join(d, 'bir-dosya');
    fs.writeFileSync(file, 'x');
    for (const dir of [file, path.join(file, 'alt')]) {
      await assert.rejects(ensureOutputDir(dir), (err) => {
        const info = toErrorInfo(err, 'tr');
        assert.equal(info.error, 'write_failed');
        assert.match(info.message, /Çıktı klasörü kullanılamıyor/);
        return true;
      });
    }
    await assert.rejects(writeFileUnique(path.join(file, 'x.jpg'), Buffer.from('1')), { code: 'write_failed' });
    assert.equal(fs.readFileSync(file, 'utf8'), 'x');
    // Olmayan sürücü (Windows'ta ENOENT) "Dosya bulunamadı" değil, klasör mesajı vermeli
    const enoent = toErrorInfo(outputError(Object.assign(new Error('x'), { code: 'ENOENT' })), 'tr');
    assert.deepEqual([enoent.error, /Çıktı klasörü/.test(enoent.message)], ['write_failed', true]);
    const full = toErrorInfo(outputError(Object.assign(new Error('x'), { code: 'ENOSPC' })), 'en');
    assert.deepEqual([full.error, /disk is full/.test(full.message)], ['write_failed', true]);
    const long = toErrorInfo(outputError(Object.assign(new Error('x'), { code: 'ENAMETOOLONG' })), 'tr');
    assert.deepEqual([long.error, /çok uzun/.test(long.message)], ['name_too_long', true]);
    const perm = toErrorInfo(outputError(Object.assign(new Error('x'), { code: 'EACCES' })), 'tr');
    assert.equal(perm.error, 'write_failed');
    assert.match(perm.message, /yazma izniniz/);
    await ensureOutputDir(path.join(d, 'yeni', 'klasor')); // normal durumda oluşturur
    assert.ok(fs.statSync(path.join(d, 'yeni', 'klasor')).isDirectory());
  } finally {
    rmrf(d);
  }
});
