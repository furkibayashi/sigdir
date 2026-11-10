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
