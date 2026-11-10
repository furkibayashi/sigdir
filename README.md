# Sığdır

**Fotoğrafını, belgeni, videonu istenen boyuta tek tıkla sığdır — internete hiçbir şey yüklemeden.**

ÖSYM, e-Devlet, iş başvurusu, Discord, WhatsApp… Her biri farklı bir sınır ister: "en fazla 200 KB",
"50×60 mm vesikalık", "en fazla 10 MB video". Sığdır bu sınırları bilir; dosyanı bırakırsın, hedefi seçersin,
sınırın altında kalan yeni bir kopya hazırlanır. Kurulum yok, reklam yok, hesap yok.

Windows için kurulumsuz tek `.exe` · Türkçe / English · Açık ve koyu tema · Açık kaynak (MIT)

## Özellikler

- **Görsel sığdırma** — JPG, PNG, WebP, **HEIC/HEIF (iPhone)**, BMP, TIFF. Hazır profil ya da özel hedef
  (biçim, en fazla KB, en/boy piksel veya uzun kenar). Kalite ve ölçek üzerinde ikili arama yapılır:
  sonuç **her zaman** sınırın altındadır; sığmıyorsa bunu açıkça söyler.
- **Gizlilik** — fotoğraftaki EXIF/GPS bilgileri (konum, cihaz modeli…) çıktıdan silinir, telefonun
  yön bilgisi uygulanır. Video çıktısından da meta veriler silinir.
- **Kırp & döndür** — profilin oranına kilitli kırpma (ör. vesikalık 50×60 mm), 90° döndürme.
- **Toplu işlem** — her dosya için önce/sonra boyutu ve çözünürlük.
- **PDF araçları** — görselleri ve PDF'leri istediğin sırayla tek PDF'te birleştir, isteğe bağlı hedef
  boyut (görseller yeniden sıkıştırılır); bir PDF'i sayfalarına ayır.
- **Video sığdırma** — hedef MB (Discord 10 MB, WhatsApp 16/64 MB, Shorts/TikTok 9:16), başlangıç/bitiş
  kırpma, ortadan 9:16 dikey kırpma, sesi kapatma. Bitrate hesaplanır, 2 geçişli kodlama yapılır;
  sonuç sınırı aşarsa daha düşük bitrate ile otomatik yeniden denenir. İlerleme yüzdesi ve iptal.
- **Sağ tık menüsü** (Windows) — Gezgin'de dosyaya sağ tıkla → "Sığdır ile küçült". Ayarlardan açılıp
  kapatılır; yönetici izni gerekmez (yalnızca kendi kullanıcı kaydına yazar).
- **Kaynağa dokunmaz** — orijinal dosyanın üzerine asla yazılmaz. Çıktı kaynağın yanına `-sigdir` ekiyle
  (ör. `foto-sigdir.jpg`) ya da seçtiğin klasöre kaydedilir; aynı ad varsa `-2`, `-3` eklenir.

### Hazır profiller

| Profil | Biçim | Sınır | Ölçü |
|---|---|---|---|
| ÖSYM / e-Devlet vesikalık | JPG | 200 KB | 394×472 px (50×60 mm oranı) |
| Biyometrik / pasaport | JPG | 500 KB | 591×709 px (50×60 mm oranı) |
| e-Devlet belge yükleme | JPG / PDF | 2 MB | — |
| CV / iş başvurusu fotoğrafı | JPG | 1 MB | uzun kenar 1600 px |
| E-posta eki | JPG | 1 MB | uzun kenar 1920 px |
| Discord video | MP4 | 10 MB | — |
| WhatsApp video | MP4 | 64 MB / 16 MB | — |
| Shorts / TikTok dikey | MP4 | 50 MB | 9:16 |

> Değerler yaklaşıktır; **sınırları her zaman başvuru kılavuzundan kontrol edin.** Güvenli tarafta kalmak
> için 1 KB = 1000 bayt, 1 MB = 1 000 000 bayt alınır.
>
> Profilleri değiştirmek için `profiles.json` dosyasını ayar klasörüne kopyalayıp düzenleyebilirsin
> (Windows: `%APPDATA%\Sığdır\profiles.json`). Dosya geçerliyse yerleşik profillerin yerine o kullanılır.

## İndirme

GitHub **Releases** sayfasından `Sigdir-<sürüm>-portable.exe` dosyasını indir ve çalıştır. Kurulum gerekmez.
Video için gereken ffmpeg uygulamanın içinde gelir.

Windows SmartScreen "tanınmayan uygulama" uyarısı verirse: **Ek bilgi → Yine de çalıştır**
(uygulama imzasızdır; kaynak kodu bu depodadır).

## Gizlilik

**Sığdır internete hiçbir şey yüklemez.** Tüm işlemler bilgisayarında, çevrimdışı yapılır.
Analitik, telemetri, reklam ya da hesap yoktur. Ayarlar yalnızca yerel bir JSON dosyasında tutulur.

## Geliştirme

Gereksinimler: Node.js 20+ (22 önerilir). Video için `ffmpeg`/`ffprobe` PATH'te yoksa
`ffmpeg-static`/`ffprobe-static` paketleri kullanılır; ikisi de yoksa uygulama çalışır, yalnızca video
sekmesi "ffmpeg bulunamadı" der.

```bash
npm install          # bağımlılıklar
npm start            # uygulamayı aç (Linux/ekransız: xvfb-run -a npm start)
npm start -- --files foto.jpg belge.pdf   # sağ tık menüsünü taklit et
npm test             # birim testleri (node --test, fikstürler test sırasında üretilir)
npm run test:e2e     # uçtan uca testler (Playwright _electron; Linux'ta xvfb-run -a ile)
npm run dist         # Windows portable .exe (Windows üzerinde çalıştırın)
```

Proje yapısı:

```
main.js              ana süreç girişi
preload.js           window.sigdir API'si (contextBridge)
src/main/            IPC, ayarlar, tek örnek kilidi, sağ tık menüsü
src/core/            Electron'dan bağımsız çekirdek: imageFit, pdfTools, videoFit, inspect, profiles.json
src/renderer/        arayüz (vanilla JS + CSS)
tests/unit/          birim testleri          tests/e2e/   uçtan uca testler
docs/SPEC.md         şartname ve IPC sözleşmesi
```

Test/geliştirme için ortam değişkenleri: `SIGDIR_USER_DATA=<klasör>` ayarları ayrı bir klasörde tutar,
`SIGDIR_FFMPEG=none` ffmpeg yokmuş gibi davranır, `SIGDIR_FFMPEG`/`SIGDIR_FFPROBE=<yol>` belirli bir
ikiliyi kullanır.

**Paketleme notu:** `sharp` ve `ffmpeg-static`, `npm install` sırasında *çalışılan* platformun ikili
dosyalarını indirir. Bu yüzden Windows `.exe`'si Windows üzerinde (veya Windows CI'da) `npm ci && npm run dist`
ile üretilmelidir.

## Lisans

MIT. Uygulamayla birlikte dağıtılan ffmpeg kendi lisansına (GPL/LGPL) tabidir;
libvips/sharp, libheif ve pdf-lib kendi açık kaynak lisanslarıyla kullanılır.

---

## English

**Sığdır** ("make it fit") shrinks photos, documents and videos to the size, format and dimensions that
upload forms demand (Turkish exam/e-government portals, job applications, Discord, WhatsApp…) — **fully
offline, it never uploads anything.** Portable single `.exe` for Windows, Turkish/English UI, light/dark theme, MIT.

- **Images:** JPG, PNG, WebP, HEIC/HEIF, BMP, TIFF → JPG/PNG under a byte limit (binary search over quality
  and scale; the result is always under the limit or you get a clear error). EXIF orientation applied,
  EXIF/GPS metadata removed. Aspect-locked crop, 90° rotation, batch processing.
- **PDF:** merge images and PDFs in any order (optional size target), split a PDF into pages.
- **Video:** target MB, trim start/end, 9:16 center crop, mute; 2-pass x264 with automatic retry, progress, cancel.
- **Explorer context menu** (Windows, per-user, no admin rights): "Shrink with Sığdır".
- Never overwrites the source: outputs are saved as `name-sigdir.ext` (then `-2`, `-3`…).

Download the portable `.exe` from GitHub Releases. Develop with `npm install`, `npm start`, `npm test`,
`npm run test:e2e`; build with `npm run dist` on Windows.

**Privacy:** nothing is uploaded, no analytics, no telemetry, no account.
