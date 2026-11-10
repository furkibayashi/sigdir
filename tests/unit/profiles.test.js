'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { tmpDir, rmrf } = require('./helpers/fixtures');
const { loadProfiles } = require('../../src/core/profiles');

test('yerleşik profiller sözleşmeye uygun', () => {
  const list = loadProfiles();
  const ids = list.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'kimlikler benzersiz olmalı');
  for (const p of list) {
    assert.ok(['image', 'pdf', 'video'].includes(p.kind), p.id);
    assert.ok(['jpg', 'png', 'pdf', 'mp4'].includes(p.format), p.id);
    assert.ok(p.name.tr && p.name.en, p.id);
    assert.match(p.note.tr, /kılavuz/, p.id);
    assert.ok(p.note.en.length > 10, p.id);
    assert.ok(Number.isInteger(p.maxBytes) && p.maxBytes > 0, p.id);
    if (p.kind === 'video') assert.equal(p.format, 'mp4', p.id);
    if (p.width && p.height && p.aspect) assert.ok(Math.abs(p.width / p.height - p.aspect) < 0.01, p.id);
  }
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  assert.deepEqual([byId['osym-vesikalik'].maxBytes, byId['osym-vesikalik'].width, byId['osym-vesikalik'].height], [200000, 394, 472]);
  assert.equal(byId['biyometrik'].maxBytes, 500000);
  assert.equal(byId['eposta'].longEdge, 1920);
  assert.equal(byId['discord-video'].maxBytes, 10000000);
  assert.equal(byId['whatsapp-video'].maxBytes, 64000000);
  assert.equal(byId['whatsapp-video-16'].maxBytes, 16000000);
  assert.equal(byId['shorts-dikey'].vertical, true);
  assert.ok(Math.abs(byId['shorts-dikey'].aspect - 9 / 16) < 1e-9);
  assert.equal(byId['edevlet-belge-pdf'].kind, 'pdf');
});

test('kullanıcı profilleri dosyası varsa onu kullanır, bozuksa yerleşiğe döner', () => {
  const d = tmpDir();
  try {
    const f = path.join(d, 'profiles.json');
    fs.writeFileSync(f, JSON.stringify([
      { id: 'benim', kind: 'image', name: 'Benim profilim', format: 'jpg', maxBytes: 123456 },
      { id: 'gecersiz', kind: 'ses', name: { tr: 'x' }, format: 'mp3', maxBytes: 1 },
    ]));
    const list = loadProfiles(f);
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].name, { tr: 'Benim profilim', en: 'Benim profilim' });
    assert.deepEqual(list[0].note, { tr: '', en: '' });
    fs.writeFileSync(f, 'bozuk');
    assert.ok(loadProfiles(f).length >= 8);
    assert.ok(loadProfiles(path.join(d, 'yok.json')).length >= 8);
  } finally {
    rmrf(d);
  }
});
