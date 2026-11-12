# Sığdır — Test Raporu

## Tur 3 — Son doğrulama (2026-11-12)

**Test edilen sürüm:** `main` @ `c2ec6a2` (Electron 45.3.0).

| | Test | Geçti | Kaldı |
|---|---:|---:|---:|
| Birim testleri (`npm test`) | 46 | 46 | 0 |
| Uçtan uca, tam koşu 1 (`--workers=1`, 2,1 dk) | 47 | 47 | 0 |
| Uçtan uca, tam koşu 2 (`--workers=2`, 1,2 dk) | 47 | 47 | 0 |

Kararsız test yok. SIG-012 denetimi kesinleştirildi: kırp düğmesine basılıp okuma alanı **aynı senkron adımda** okunuyor (küçük resim yüklenmeden);
eski ölçü/dil yerine yükleniyor metni bekleniyor.

| ID | Önem | Durum | Kanıt |
|---|---|---|---|
| SIG-001 … SIG-011 | — | **Doğrulandı** (Tur 2) | Tur 3'te de iki tam koşuda ilgili testler geçti |
| SIG-012 | Düşük | **Doğrulandı** | Açılış anında okuma alanı "Loading…" (EN), eski "1000×1200 piksel seçili" görünmüyor (`i18n-crop-readout-on-open.json`) |

**Açık hata:** yok.

**Yayına hazır mı?** **Evet — Linux'ta otomatik olarak doğrulanabilen her alan için yayına hazır.** Tüm 12 hata doğrulandı, iki tam koşu temiz.
Koşul: yayından önce aşağıdaki "Windows'ta elle doğrulanması gerekenler" listesi gerçek bir Windows makinede geçmeli (portable `.exe`, sağ tık menüsü/HKCU,
Gezgin'den sürükle-bırak, MAX_PATH/USB çıktı klasörü, gerçek iPhone HEIC/telefon videoları).

---

## Tur 2 — Yeniden test (2026-11-12)

**Test edilen sürüm:** `main` @ `129a8dd` (Electron 45.3.0 / Chrome 156 / Node 24) · düzeltme commit'leri `2f9acb8`, `f51bbef`, `5f8edf7`, `129a8dd`.

| | Test | Geçti | Kaldı |
|---|---:|---:|---:|
| Birim testleri (`npm test`) | 46 | 46 | 0 |
| Uçtan uca (`xvfb-run -a npm run test:e2e -- --workers=1`, 2,1 dk) | 47 | 47 | 0 |

İki tam koşuda 47/47 (ilk koşuda kalan tek test aşağıdaki SIG-012 zamanlama bulgusuydu; test kırp penceresinde küçük resmin yüklenmesini
bekleyecek şekilde düzeltildi, açılış anındaki metin ayrıca kaydediliyor).

**Test güncellemeleri** (Yazılımcı-1'in `docs/NOTES.md` isteği): `images-ipc.spec.js` meşgul ve boş liste testleri artık `fitImages` dizisinin
ilk öğesini denetliyor (`r.second[0]`, `empty[0]`) ve geçersiz hedefte dizi bekliyor (SIG-008); `security.spec.js` mergePdf testi ters çevrildi
(keyfi yol reddedilip varsayılan ada yazılmalı; çıktı klasörünün doğrudan içi kabul, alt klasör ve `..` reddedilmeli — SIG-009);
IPC yüzeyi testi Electron'un iç kanallarını aynı sürümle açılan **boş bir Electron uygulamasından alınan taban çizgisiyle** çıkarıyor
(`IMPORT_SHARED_TEXTURE_RELEASE_RENDERER_TO_MAIN`), kalan kanallar birebir sözleşme + dahili `takePendingFiles`.

| ID | Önem | Durum | Kanıt (Tur 2) |
|---|---|---|---|
| SIG-001 | Orta | **Doğrulandı** | 250 baytlık ad → `aaa…a-sigdir.jpg` kısaltılarak yazıldı (`long-names.json`, test geçti) |
| SIG-002 | Orta | **Doğrulandı** | ENOTDIR ve EROFS → `write_failed` + "Çıktı klasörü kullanılamıyor… Ayarlar'dan başka bir klasör seçin" (`unwritable-enotdir.json`) |
| SIG-003 | Orta | **Doğrulandı** | İş sürerken ikinci örnekten gelen `foto.webp` iş bitince listeye eklendi (`busy-second-instance.json`) |
| SIG-004 | Orta | **Doğrulandı** | Electron 45.3.0, Chrome 156.0.8078.96 (`versions.json`); tüm e2e bu sürümde geçti |
| SIG-005 | Düşük | **Doğrulandı** | Dil değişince şerit "That didn't work. See the note on the file.", satır hatası "File not found; …" (`i18n-hunt.json`) |
| SIG-006 | Düşük | **Doğrulandı** | Ctrl+Enter sonrası odak `img-reveal` (şeritte) (`keyboard-focus-after-run.json`) |
| SIG-007 | Düşük | **Doğrulandı** | Bildirim ve konum izni `denied` (`permissions.json`) |
| SIG-008 | Düşük | **Doğrulandı** | `busy`, `no_files`, `bad_target` dizi içinde dönüyor (test güncellendi ve geçti) |
| SIG-009 | Düşük | **Doğrulandı** | Keyfi `output` → `a-sigdir.pdf` (kaynağın yanı), hedef klasör hiç oluşturulmadı; çıktı klasörünün doğrudan içi kabul (`merge-output-path.json`) |
| SIG-010 | Düşük | **Doğrulandı** | Video bitince yeşil "94,8 MB → 9,8 MB · Sınırın %98 kadarı", düğme "Hazır" (`ui-video-done-tr-dark.png`, gözle incelendi) |
| SIG-011 | Düşük | **Doğrulandı** | 760×560'ta yüzde etiketi tek satır, eylem simgeleri durum çipinin altına diziliyor; EN boş ekranda kalkan simgesi metinle hizalı (`min-*-04-sonuc.png`, `min-dark-09-en-bos.png`) |
| SIG-012 | Düşük | Yeni → **Doğrulandı (Tur 3)** | Aşağıda |

### SIG-012 — Kırp penceresi açılırken okuma alanı kısa süre önceki oturumun metnini gösteriyor (yeni, `129a8dd` sonrası)
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-1
- **Adımlar:** TR'de bir fotoğrafın kırp penceresini aç, kapat → dili EN yap → kırp penceresini yeniden aç; küçük resim yüklenmeden okuma alanına bak.
- **Beklenen:** Okuma alanı boş ya da yeni görsel/dil için doğru metin ("… pixels selected").
- **Gerçekleşen:** `129a8dd` ile pencere küçük resim yüklenmeden açılıyor; `#crop-readout` (aria-live) sıfırlanmadığı için yükleme bitene kadar önceki
  değer ("1000×1200 piksel seçili", önceki dil ve önceki görselin ölçüsü) görünüyor ve ekran okuyucuya duyurulabiliyor. İlk Tur 2 koşusunda
  çevrilmemiş metin avı bunu EN ekranda Türkçe metin olarak yakaladı; zamanlamaya bağlı, kısa süreli.
- **Kanıt:** `sig-r2` koşusu: "EN arayüzde Türkçe metin: crop: 1000×1200 piksel seçili". **İlgili yer:** `src/renderer/app.js:1218-1235` `openCrop`
  (`C.crop = null` yapılıyor ama `#crop-readout` temizlenmiyor; `placeBox` yalnızca yüklemeden sonra çağrılıyor).

Tur 2 sonu dağılımı: açık hata 1 (Düşük: SIG-012, Tur 3'te doğrulandı); Tur 1'in 11 hatasının tamamı doğrulandı.

---

## Tur 1 — İlk test (2026-11-11)

**Test edilen sürüm:** `main` @ `c26a61f` (0.1.0) · **Tarih:** 2026-11-11 · **Test Edici:** Test Edici (Claude)
**Ortam:** Linux konteyner (root, 4 çekirdek, 15 GB), Node 22.23, Electron 33.4.11 (Chrome 130, Node 20.18),
@playwright/test 1.63 (`_electron`), ffmpeg/ffprobe 6.1.1 (PATH), `xvfb-run -a`, deviceScaleFactor 1.

Uygulama her testte **gerçek haliyle** açıldı (`_electron.launch` + `--no-sandbox`, ayrı `SIGDIR_USER_DATA`).
Tek taklit: yerel dosya/klasör seçme diyaloğu (`dialog.showOpenDialog`) ve `shell.showItemInFolder`
(gerçek dosya yöneticisi açılmasın diye çağrılar kaydedildi). IPC, sharp, pdf-lib, ffmpeg, dosya sistemi gerçek.
Tüm fikstürler test sırasında üretilir (JPG/PNG/WebP, 12 MP, EXIF yönlü + GPS'li, HEIC, bozuk, 0 bayt,
rastgele bayt, .docx/.txt, "Vesikalık Fotoğraf ğüşiöç.jpg", 5 ve 2 sayfalık PDF, şifreli PDF, 20 sn 720p ffmpeg testsrc).
Depoya ikili dosya eklenmedi.

## Nasıl çalıştırılır

```bash
npm test                                        # birim testleri
xvfb-run -a npm run test:e2e                    # uçtan uca (47 test, ~1,7 dk, 2 işçi)
xvfb-run -a npm run test:e2e -- --workers=1     # performans ölçümleri için önerilen (~3 dk)
# İsteğe bağlı: SIGDIR_E2E_TMP=<fikstür kökü>  SIGDIR_E2E_OUT=<ekran görüntüsü/ölçüm JSON klasörü>
```

Testler: `tests/e2e/helpers.js`, `images-ipc.spec.js`, `ui-flows.spec.js`, `video.spec.js`,
`settings-i18n-visual.spec.js`, `security.spec.js`. Kanıt dosyaları (JSON + PNG) `SIGDIR_E2E_OUT` klasörüne yazılır;
bu rapordaki kanıtlar `/tmp/claude-0/-home-user/b303732c-6774-565f-bebf-76e257d70a06/scratchpad/e2e-out-final2/` koşusundandır
(geçici klasör; testler yeniden çalıştırılarak aynı dosyalar üretilir).

`npm run test:e2e` betiği çalışıyor (engelleyici sorun yok). Notlar: kökte `playwright.config` olmadığı için zaman aşımları
spec dosyalarında ayarlandı; Linux'ta ekran için `xvfb-run -a` gerekir (README'de yazıyor). Uygulamanın kendi `TMPDIR`'i
kısa bir sistem geçici klasörüne verilir (Chromium Unix soket yolu ≤ 107 bayt sınırı) ve kapanışta silinir.

## Özet

| Alan | Test | Geçti | Kaldı |
|---|---:|---:|---:|
| Birim testleri (`npm test`, 42,5 sn) | 38 | 38 | 0 |
| Görsel sığdırma (her profil, özel PNG/mm, EXIF/GPS, HEIC/WebP, Türkçe ad, döndür/kırp IPC, kullanıcı profilleri, arayüz akışı, 10'lu toplu iş) | 9 | 9 | 0 |
| Kırp & döndür (arayüzden) | 2 | 2 | 0 |
| PDF birleştir/ayır (arayüzden, sıralama, 2 MB hedef, şifreli/bozuk PDF) | 3 | 3 | 0 |
| Video (Discord 10 MB, kırp+9:16+sessiz, iptal, `SIGDIR_FFMPEG=none`) | 4 | 4 | 0 |
| Açılış (`--files`, ikinci örnek) | 2 | 2 | 0 |
| Ayarlar (dil TR↔EN, tema, kalıcılık, bozuk ayar dosyası) | 3 | 2 | 1 |
| Kenar durumlar (çakışma, uzun ad, imkânsız hedef, bozuk/0 bayt/desteklenmeyen, yazılamaz klasör, meşgul, iptal) | 10 | 7 | 3 |
| Güvenlik (yalıtım, CSP, IPC yüzeyi, preload↔sözleşme, gezinme, izinler, gönderen doğrulama) | 10 | 9 | 1 |
| Arayüz / erişilebilirlik (yalnız klavye, 760×560 açık/koyu taşma + ekran görüntüleri, konsol hataları) | 3 | 2 | 1 |
| Performans (12 MP → 200 KB) | 1 | 1 | 0 |
| **Toplam uçtan uca** | **47** | **41** | **6** |

İki tam koşuda (1 ve 2 işçi) sonuçlar aynı; kararsız (flaky) test yok. Kalan 6 testin her biri aşağıdaki bir hataya karşılık gelir.

**Hata dağılımı:** Kritik 0 · Yüksek 0 · Orta 4 · Düşük 7 (toplam 11).

### Ana doğrulamalar (geçenler)
- **Hedef boyut hiç aşılmadı:** 5 görsel profili × 2 kaynak (12 MP ve 1600×1200), özel PNG/mm, 10'lu toplu iş, PDF 2 MB,
  video 10 MB — gerçek dosya boyutu her seferinde `≤ maxBytes` ve `afterBytes` gerçek boyuta eşit.
- Ölçüler doğru (ÖSYM 394×472, biyometrik 591×709, mm+DPI 413×531, uzun kenar sınırları); format/uzantı doğru.
- **Gizlilik:** çıktılarda EXIF/XMP/IPTC yok; kamera markası/modeli, telif, GPS baytları dahil hiçbir iz yok.
  Video çıktısında `title/comment` meta verisi silinmiş.
- EXIF Orientation=6 uygulanıyor (çıktı dikey, üst kırmızı), Orientation etiketi kalmıyor.
- **Kaynak dosyalar değişmedi** (tüm testlerde SHA-256 önce/sonra eşit); çıktının kendisi yeniden işlendiğinde de ezilmiyor.
- Ad çakışması: `…-sigdir.jpg` → `…-sigdir-2.jpg`; ilk çıktı korunuyor. Türkçe/boşluklu ad sorunsuz.
- Kırp & döndür arayüzden: sağa çevir + klavyeyle taşı/küçült + Enter → çıktı doğru yönde ve doğru bölgeden kırpılmış.
- PDF: Alt+↑ ile sıralama sonrası sayfa sırası birebir doğru (8 sayfa); 6 fotoğraf → 1,30 MB (≤ 2 MB); ayırmada görsel atlanıyor,
  7 tek sayfalık dosya; şifreli PDF → `encrypted`, bozuk → `read_failed`.
- Video: 94,8 MB / 20 sn / 720p → **9,83 MB**, h264 + aac, 20,0 sn, `ffmpeg -xerror` ile hatasız çözülüyor; ilerleme %0→%98 akıcı.
  İptal: çıktı yok, geçici klasör yok, ffmpeg süreci öldürülmüş, ardından yeni iş çalışıyor. `SIGDIR_FFMPEG=none`: rozet + açıklama kartı,
  çökme yok, IPC `ffmpeg_missing`.
- `--files` (göreli + mutlak + Türkçe ad + desteklenmeyen dosya) ve ikinci örnek (dosyalar ilk pencereye, ikinci süreç 0 ile çıkıyor).
- Ayarlar: dil/tema/çıktı klasörü/"bitince klasörü aç" yeniden başlatmada korunuyor; zemin renkleri DESIGN token'larıyla aynı
  (`#F3F1EC` / `#121117`, pencere `backgroundColor` dahil); bozuk `settings.json` → varsayılanlarla açılıyor; Linux'ta sağ tık ayarı gizli.
- Güvenlik: `require/process/module/Buffer` yok; `contextIsolation`, `sandbox`, `webSecurity` açık, `nodeIntegration` kapalı;
  `window.sigdir` dondurulmuş; CSP satır içi betiği, `on*` özniteliğini ve dış görseli engelliyor (`unsafe-eval/inline` yok);
  preload API = sözleşmedeki 16 işlev + NOTES'ta belgelenmiş `getPathForFile`; ana süreçte yalnızca 14 sözleşme kanalı +
  dahili `takePendingFiles`; dış URL'ye gezinme ve `window.open` engelli; `file://` dışı gönderen reddediliyor.
- 760×560'ta açık ve koyu temada 9 ekran (boş, dosyalar, özel mm, sonuç, PDF, video, kırp, ayarlar, EN) — sayfa taşması,
  pencere dışına çıkan öğe, kırpılan metin yok; Sığdır düğmesi hep görünür. Tüm UI testlerinde **konsol hatası yok**.
- Yalnızca klavye: Ctrl+O → Tab → profil (oklar) → Ctrl+Enter akışı tamamlanıyor; tüm Tab duraklarında görünür odak var;
  Ctrl+, / Esc / sekmelerde ←→ Home End çalışıyor; diyalog kapanınca odak açan düğmeye dönüyor.

### Performans (1 işçi, 4 çekirdek)

| Ölçüm | Sonuç |
|---|---|
| 12 MP JPG → 200 KB (ölçü serbest; ikili arama ölçek+kalite) | **2,2–2,4 sn** → 2140×1605, q77, 194 KB |
| 12 MP JPG → ÖSYM (394×472) | 0,35 sn |
| 10 dosya (2400×1800) toplu → ÖSYM | **1,4–1,6 sn** |
| Dosya ekleme (inspect + küçük resim): 12 MP / 10 dosya | 0,15–0,18 sn / 0,57–0,61 sn |
| Toplu iş sırasında arayüz (rAF kareleri arası en uzun boşluk) | 17 ms — donma yok |
| PDF: 12 MP + 5 fotoğraf → ≤ 2 MB | 2,4 sn (1,30 MB) |
| Video: 20 sn 720p → Discord 10 MB (2 geçiş) | 16,5–17,6 sn, tek denemede sığdı |
| Birim testleri / uçtan uca paket | 42,5 sn / 1,7 dk (2 işçi), 3,0 dk (1 işçi) |

---

## Hatalar

### SIG-001 — Çok uzun dosya adında çıktı yazılamıyor, mesaj yanıltıcı ("klasöre yazma izni")
- **Önem:** Orta · **Sorumlu:** Yazılımcı-1 · **Test:** `images-ipc.spec.js` › "çok uzun dosya adı (≈250 bayt) işlenebilmeli" (KALDI)
- **Adımlar:** 246 karakterlik adı olan bir JPG (`aaaa…a.jpg`, 250 bayt) ekle → ÖSYM → Sığdır (çıktı klasörü varsayılan).
- **Beklenen:** Çıktı adı dosya sistemi sınırına (255 bayt; Windows'ta ayrıca MAX_PATH 260) sığacak şekilde kısaltılarak kaydedilir
  (ör. `aaaa…a-sigdir.jpg` kısaltılmış) ya da en azından "dosya adı çok uzun" denir.
- **Gerçekleşen:** `{ ok:false, error:'write_failed', message:'Çıktı dosyası kaydedilemedi. Çıktı klasörüne yazma izniniz olduğundan…' }`.
  Kullanıcı izinleri kontrol eder; sorun ad uzunluğudur (`ENAMETOOLONG`). 120 × "ğ" (244 bayt) olan ad ise çalışıyor.
- **Kanıt:** `long-names.json` (1. kayıt `write_failed`, 2. kayıt `ok`).
- **İlgili yer:** `src/core/fileUtils.js:14` `desiredOutputPath` (ad kısaltma yok), `:42-55` `writeFileUnique`
  (`ENAMETOOLONG` → `write_failed`). Windows'ta derin klasörlerde (MAX_PATH) daha sık görülecektir.

### SIG-002 — Çıktı klasörü kullanılamazken "Beklenmeyen bir hata" / "Dosya bulunamadı" mesajı
- **Önem:** Orta · **Sorumlu:** Yazılımcı-1 · **Test:** `images-ipc.spec.js` › "çıktı klasörü yazılamaz (yol bir dosya, ENOTDIR)" (KALDI)
- **Adımlar:** Ayarlarda çıktı klasörü olarak sonradan dosyaya dönüşmüş bir yol (ya da Windows'ta çıkarılmış USB / olmayan sürücü harfi) kullan → Sığdır veya PDF birleştir.
- **Beklenen:** `write_failed` + "Çıktı klasörü kullanılamıyor; başka bir klasör seçin" türü, ne yapılacağını söyleyen mesaj (SPEC "Kalite çıtası").
- **Gerçekleşen:** `fitImages` ve `mergePdf` → `{ error:'unknown', message:'Beklenmeyen bir hata oluştu…' }`.
  Kod incelemesine göre olmayan sürücüde `mkdir` `ENOENT` verir ve bu `not_found` → "Dosya bulunamadı. Taşınmış veya silinmiş olabilir"
  olarak gösterilir (kaynak dosya sanılır). Salt okunur klasör (EROFS) doğru şekilde `write_failed` veriyor (test geçti).
- **Kanıt:** `unwritable-enotdir.json`, `unwritable-erofs.json`.
- **İlgili yer:** `src/core/fileUtils.js:43` ve `:62` — `fsp.mkdir` `try` dışında, hata ham olarak fırlıyor;
  `src/core/errors.js:93-94` `toErrorInfo` `ENOTDIR/EEXIST/ENAMETOOLONG`'u eşlemiyor, `ENOENT`'i her durumda `not_found` yapıyor.

### SIG-003 — İş sürerken sağ tık menüsünden / ikinci örnekten gelen dosyalar kayboluyor
- **Önem:** Orta · **Sorumlu:** Tasarımcı-1 (renderer kuyruğu; istenirse Yazılımcı-1 ana süreçte bekletebilir)
- **Test:** `ui-flows.spec.js` › "iş sürerken sağ tık/ikinci örnekten gelen dosyalar kaybolmamalı" (KALDI)
- **Adımlar:** 11 fotoğraflık toplu işi başlat → iş sürerken Gezgin'den başka bir dosyaya "Sığdır ile küçült" (testte: aynı kullanıcı verisiyle
  `electron . --files foto.webp`) → işin bitmesini bekle.
- **Beklenen:** Gelen dosya iş bitince listeye eklenir (ya da kuyruğa alınır).
- **Gerçekleşen:** Yalnızca 5 sn'lik "Önce süren işin bitmesini bekle." bildirimi; dosya hiçbir zaman listeye eklenmiyor. İş bitiminde
  kullanıcıya hiçbir iz kalmıyor; ikinci süreç de kapandığı için dosya kayboluyor.
- **Kanıt:** `busy-second-instance.json` (`names` içinde `foto.webp` yok).
- **İlgili yer:** `src/renderer/app.js:237` (`addPaths` içinde `if (S.busy) { toast(…); return; }`), `:1472` (`onFilesFromOS` → `addPaths`).

### SIG-004 — Electron 33 desteği bitmiş sürüm (Chrome 130); güvenlik yamaları gelmiyor
- **Önem:** Orta · **Sorumlu:** Yazılımcı-1 (SPEC'te `electron@33` yazdığı için ekip kararı gerekir)
- **Adımlar:** `process.versions` oku.
- **Beklenen:** Desteklenen bir Electron ana sürümü (son 3 sürümden biri).
- **Gerçekleşen:** Electron 33.4.11 / Chrome 130.0.6723.191 — 2025 ortasında destek dışı kaldı. Renderer yalnızca yerel sayfa yüklese ve
  CSP sıkı olsa da, kullanıcıdan gelen dosyalardan üretilen küçük resimler (`data:` JPEG) Chromium'da çözülüyor.
- **Kanıt:** `versions.json`. **İlgili yer:** `package.json:23`, `docs/SPEC.md` "Teknoloji".

### SIG-005 — Dil değiştirilince sonuç şeridi, satır hata metinleri ve açık bildirimler eski dilde kalıyor
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-1 · **Test:** `settings-i18n-visual.spec.js` › "dil TR ↔ EN …" (KALDI)
- **Adımlar:** TR'de bir iş çalıştır (bir satır hata versin) → Ayarlar → English.
- **Beklenen:** Tüm görünür metin İngilizce olur.
- **Gerçekleşen:** Şerit "Olmadı. Satırdaki açıklamaya göz at." ve satırdaki "Dosya bulunamadı; taşınmış ya da silinmiş olabilir…" Türkçe kalıyor
  (yanındaki "New files", "Fits", "Failed" İngilizce — karışık ekran). Açık bildirimlerin "Kapat" etiketi de TR kalıyor.
  Bunun dışında 10 ekran durumunda (görsel/özel mm/ÖSYM/PDF birleştir-ayır-özel/video/Shorts/kırp/ayarlar) çevrilmemiş metin,
  ham anahtar adı ya da EN'de Türkçe metin **bulunmadı**; TR/EN sözlükleri 203/203 anahtar, eksik yok.
- **Kanıt:** `i18n-hunt.json` (`bannerTR` = `bannerEN`, `rowErrorTR` = `rowErrorEN`), `i18n-banner-after-switch-en.png`.
- **İlgili yer:** `src/renderer/app.js:656-661`, `:831-836`, `:857-860` (şerit başlığı `t()` ile o anda metne çevrilip saklanıyor),
  `:643/648/652` (`it.errorText` saklanıyor); `:183` `applyLang` bunları yeniden üretmiyor. Çözüm önerisi: kod + değişkenleri sakla, çizimde çevir.

### SIG-006 — Ctrl+Enter ile başlatılan işte bitince odak sonuç şeridine taşınmıyor
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-1 · **Test:** `ui-flows.spec.js` › "yalnızca klavye …" (KALDI, `expect.soft`)
- **Adımlar:** Klavyeyle dosya ekle → Tab ile profil kartına gel, ok tuşuyla seç → Ctrl+Enter → iş biter.
- **Beklenen:** DESIGN.md §6: "iş bitince odak şeritteki ilk düğmeye taşınır" ("Klasörde göster").
- **Gerçekleşen:** Odak profil kartında kalıyor (`p-image-edevlet-belge-jpg`). Fareyle "Sığdır"a basınca taşınıyor (düğme devre dışı kalıp odak `body`'ye düştüğü için).
  Sonuç canlı bölgeyle duyuruluyor, bu yüzden düşük önem.
- **Kanıt:** `keyboard-focus-after-run.json`. **İlgili yer:** `src/renderer/app.js:667-669` `focusBanner` (yalnızca `body` veya `.pane-foot` odaktaysa taşıyor).

### SIG-007 — İzin istekleri (bildirim, konum, kamera…) sessizce onaylanıyor
- **Önem:** Düşük · **Sorumlu:** Yazılımcı-1 · **Test:** `security.spec.js` › "izin istekleri … reddedilmeli" (KALDI)
- **Adımlar:** Renderer'da `Notification.requestPermission()` ve `navigator.permissions.query({name:'geolocation'})`.
- **Beklenen:** Uygulama hiçbir izne ihtiyaç duymuyor; Electron güvenlik kontrol listesi gereği `session.setPermissionRequestHandler` ile hepsi reddedilmeli.
- **Gerçekleşen:** `notification: "granted"`, `geolocation: "granted"`. Dış içerik yüklenmediği ve CSP sıkı olduğu için doğrudan sömürü yolu görülmedi (derinlemesine savunma).
- **Kanıt:** `permissions.json`. **İlgili yer:** `src/main/app.js:73-113` `createWindow` (izin işleyicisi yok).

### SIG-008 — `fitImages` geçersiz hedef / boş listede dizi yerine tek nesne döndürüyor (sözleşme)
- **Önem:** Düşük · **Sorumlu:** Yazılımcı-1
- **Adımlar:** `fitImages({ files:[a.jpg], custom:{ format:'jpg', maxBytes:0 } })` veya `profileId:'yok'` veya `files:[]`.
- **Beklenen:** SPEC: `-> Result[]`. NOTES yalnızca `busy` için tek nesneyi belgeliyor.
- **Gerçekleşen:** `{ ok:false, error:'bad_target' }` / `{ ok:false, error:'no_files' }` (dizi değil). Arayüz `isErr` ile idare ediyor; ama sözleşmeye güvenen
  başka bir istemci `res.map` ile çöker. NOTES'a eklenmeli ya da `[{…}]` döndürülmeli.
- **Kanıt:** `bad-target.json`. **İlgili yer:** `src/main/ipc.js:112-113` (`resolveImageTarget` `runJob` içinde fırlatıyor → `fail()`).

### SIG-009 — `mergePdf({output})` renderer'ın PDF'i istediği herhangi bir yola yazmasına izin veriyor
- **Önem:** Düşük · **Sorumlu:** Yazılımcı-1
- **Adımlar:** `mergePdf({ files:[a.pdf], output:'/başka/yer/alt/klasor/gizli' })`.
- **Beklenen:** Renderer'dan gelen `output` ya hiç kabul edilmemeli (arayüz kullanmıyor) ya da çıktı klasörüyle sınırlanmalı.
- **Gerçekleşen:** Ara klasörler oluşturulup `/başka/yer/alt/klasor/gizli.pdf` yazılıyor. `wx` bayrağı var olan dosyayı ezmiyor ve uzantı `.pdf`'e
  zorlanıyor; risk düşük ama ele geçirilmiş bir renderer'ın (ör. Windows Başlangıç klasörüne) dosya bırakmasını sağlar.
- **Kanıt:** `merge-output-path.json`. **İlgili yer:** `src/main/ipc.js:127`, `src/core/pdfTools.js:139-142`.

### SIG-010 — Video başarıyla sığdırıldıktan sonra kartta hâlâ "Sınırdan 9,5 kat büyük" (kehribar) görünüyor
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-1
- **Adımlar:** Video sekmesi → 94,8 MB video → Discord → Sığdır → bitince ekrana bak.
- **Beklenen:** DESIGN "Sığma çubuğu": sonra yeşil dolgu "Sınırın %98 kadarı" ve satırda yeni boyut; ya da en azından eski uyarı gizlenmeli.
- **Gerçekleşen:** Üstte yeşil "Sığdırıldı! 9,8 MB" şeridi varken hemen altında kehribar "Sınırdan 9,5 kat büyük" çubuğu ve kaynak boyutu (94,8 MB) duruyor;
  "Sığdır" düğmesi yeniden etkin (tekrar basınca `-sigdir-2.mp4` üretir). DESIGN ilkesi 3 ("yalan yeşil tik yok") ile ters yönde bir çelişki.
- **Kanıt:** `ui-video-done-tr-dark.png`. **İlgili yer:** `src/renderer/app.js:1026` (`updateEstimate` her zaman kaynak boyutuyla `after=false` çiziyor), `:1111`.

### SIG-011 — 760×560'ta satır içi bilgiler sıkışıyor (yüzde etiketi 3 satıra bölünüyor)
- **Önem:** Düşük · **Sorumlu:** Tasarımcı-1
- **Adımlar:** Pencere 760×560 → birkaç fotoğraf → CV profili → Sığdır.
- **Beklenen:** Etiketler okunaklı tek/iki satır.
- **Gerçekleşen:** Taşma ya da üst üste binme yok (otomatik denetim temiz), ancak sağ sütun 280 px'e inince "Sınırın / %76 / kadarı" üç satıra,
  "1,2 MB → 761 KB · 1600×1200" iki satıra bölünüyor; satır yüksekliği artıyor. EN boş ekranda gizlilik satırı iki satıra inince kalkan simgesi
  metinden kopuk sola yaslı kalıyor.
- **Kanıt:** `min-dark-04-sonuc.png`, `min-light-04-sonuc.png`, `min-dark-09-en-bos.png`.
- **İlgili yer:** `src/renderer/styles.css:455` (`.f-meta`), `:484` (`.fit-label`), ≤ 900 px kuralları.

---

## Gözlemler (hata sayılmadı)
- Varsayılan dil sistem diline göre seçiliyor (bu konteynerde `en`). SPEC "Türkçe öncelikli" diyor; Türkçe olmayan Windows'ta ilk açılış İngilizce olur — ürün kararı.
- Ölçü serbest "Özel 1 KB" hedefinde 12 MP fotoğraf uyarısız 159×119'a iniyor (sınır altında, kurala uygun). Kullanıcıya "çok küçültüldü" ipucu düşünülebilir.
- ÖSYM gibi oranı kilitli profiller yatay fotoğrafı ortadan kırpıyor; arayüz "Oranı hedeften farklı — istersen kırp." ipucunu gösteriyor (beklenen davranış).
- `getPathForFile` SPEC'teki sözleşmede yok, yalnızca NOTES'ta; SPEC'e eklenmesi önerilir.
- CMYK JPEG, 16 bit PNG, gri tonlu, GIF, TIFF, AVIF ve 90° döndürme meta verili (telefon tipi) videolar çekirdekte doğru işlendi (elle yoklama).
- Playwright `evaluate()` DevTools bağlamında çalıştığından `eval()` engeli e2e ile ölçülemiyor; CSP metninde `unsafe-eval` olmadığı doğrulandı.

## Windows'ta elle doğrulanması gerekenler
1. **Paket:** Windows'ta `npm ci && npm run dist` → portable `.exe` açılıyor mu; SmartScreen akışı; `ffmpeg-static` `app.asar.unpacked` içinden bulunuyor mu (video sekmesi açık mı); sharp'ın win32 ikilileri.
2. **Sağ tık menüsü (HKCU):** Ayarlardan aç/kapat; "Sığdır ile küçült" görünüyor mu; dil değişince etiket güncelleniyor mu; Gezgin'de **çok dosya seçip** tıklayınca
   (her dosya ayrı süreç) dosyaların tek pencerede tek bildirimle toplanması (~250 ms); yönetici izni istemiyor mu; kaldırınca kayıt temizleniyor mu.
3. **Sürükle-bırak:** Gezgin'den gerçek dosya bırakma (`webUtils.getPathForFile`), karışık tür bırakma (doğru sekmeye gitme), klasör bırakma.
4. **Yollar:** MAX_PATH (260) aşan derin klasörler (bkz. SIG-001), OneDrive/ağ sürücüsü, Türkçe karakterli kullanıcı adı (`%APPDATA%\Sığdır`),
   **çıkarılmış USB / olmayan sürücü** çıktı klasörü (bkz. SIG-002 — `ENOENT` → "Dosya bulunamadı" beklenir), ACL ile salt okunur klasör,
   FAT32/exFAT USB'ye video yazma (`COPYFILE_EXCL`).
5. **Yerel diyaloglar:** Dosya seç filtreleri (Görsel / Görseller ve PDF / Video), klasör seç, "Klasörde göster" Gezgin'de dosyayı seçili açıyor mu, "Bitince klasörü aç".
6. **Görünüm:** Windows açık/koyu tema "Sistem" seçiliyken canlı geçiş; Segoe UI Variable; %125/%150 ölçekleme; yüksek kontrast (`forced-colors`);
   açılışta beyaz yanıp sönme olmaması.
7. **Erişilebilirlik:** NVDA/Narrator ile canlı bölge duyuruları, sekme/radyo/anahtar rolleri, kırpma kutusu `aria-live` okuması.
8. **Gerçek medya:** iPhone HEIC (10 bit, ızgara/tile, derinlik haritalı), telefonların EXIF yönleri, iPhone HEVC `.mov`, 4K60, değişken kare hızı, 10 dk+ video (ilerleme/iptal).
9. **Tek örnek kilidi:** uygulama açıkken `.exe`'ye dosya sürükleme (paketli modda `--files`'sız argüman yolu), ikinci pencere açılmaması.
10. **Antivirüs/Defender:** ffmpeg alt süreci engelleniyor mu, geçici klasör (`%TEMP%\sigdir-*`) temizleniyor mu.
