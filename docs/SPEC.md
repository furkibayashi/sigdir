# Sığdır — Ürün Şartnamesi ve Ekip Sözleşmesi

**Tek cümle:** Fotoğraf, belge ve videoları internete yüklemeden; ÖSYM, e-Devlet, iş başvurusu,
Discord, WhatsApp gibi hedeflerin istediği **format + boyut (KB/MB) + ölçü** sınırına tek tıkla
uyduran, çevrimdışı, reklamsız, veri toplamayan Windows masaüstü uygulaması.

Geliştiricinin diğer uygulamalarıyla (Zamanlayıcı, FlacSync, Yakala, OtoTık) aynı çizgide:
Türkçe öncelikli (TR/EN), açık/koyu tema, kurulumsuz tek .exe, açık kaynak (MIT).

## Teknoloji
- Electron 45 (`electron@45`, desteklenen en güncel kararlı ana sürüm; SIG-004 ile 33'ten yükseltildi), saf JavaScript (CommonJS ana süreç, renderer'da framework yok, vanilla JS + CSS).
- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; renderer sadece `window.sigdir` API'sini görür.
- Görüntü: `sharp`. HEIC çözme: `heic-decode` (saf JS/WASM). PDF: `pdf-lib`. PDF önizleme gerekmez (MVP).
- Video: sistemdeki `ffmpeg`/`ffprobe` (PATH) veya `ffmpeg-static`/`ffprobe-static` paketleri; bulunamazsa video sekmesi "ffmpeg bulunamadı" der, uygulama çökmez.
- Paketleme: `electron-builder` (Windows portable hedefi) yapılandırması yazılır; derleme bu Linux konteynerinde zorunlu değil.
- Testler: birim testleri `node --test` (tests/unit), uçtan uca Playwright `_electron` (tests/e2e) — `xvfb-run -a` ile.

## Özellikler (öncelik sırasıyla)
1. **Görsel sığdırma**: sürükle-bırak / dosya seç (JPG, PNG, WebP, HEIC/HEIF, BMP, TIFF). Hazır profil ya da özel hedef
   (format JPG/PNG, en fazla KB, en/boy piksel veya mm+DPI). Kalite ve ölçek üzerinde **ikili arama** ile hedef KB'ın
   altına inilir; sonuç her zaman sınırın altında olmalı (değilse açık hata). EXIF yönü uygulanır, EXIF/GPS meta verisi silinir (gizlilik).
   Toplu işlem; her dosya için önce/sonra boyutu, çözünürlük.
2. **Kırp & döndür**: profilin en-boy oranına kilitli kırpma (ör. vesikalık 50×60 mm), 90° döndürme.
3. **PDF araçları**: görselleri + PDF'leri tek PDF'te birleştir (sıra değiştirilebilir), PDF'i sayfalara ayır, isteğe bağlı hedef boyut
   (birleştirilen PDF'teki görselleri yeniden sıkıştırarak).
4. **Video sığdırma**: hedef MB (Discord 10 MB, WhatsApp, özel), başlangıç/bitiş kırpma, isteğe bağlı 9:16 dikey (ortadan kırp),
   sesi kapat seçeneği; bitrate hesabı + sonuç sınırı aşarsa daha düşük bitrate ile otomatik yeniden deneme. İlerleme yüzdesi.
5. **Sağ tık menüsü** (Windows): "Sığdır ile küçült" — uygulama `--files <yol...>` argümanıyla açılır. Kayıt defteri girişini
   ekleyip kaldıran ayar düğmesi (HKCU, yönetici gerekmez). Linux'ta bu ayar gizlenir.
6. Ayarlar: dil (TR/EN), tema (sistem/açık/koyu), çıktı klasörü (varsayılan: kaynağın yanına `-sigdir` ekiyle), bitince klasörü aç.

**Profiller** `src/core/profiles.json` içinde, kullanıcı sonradan düzenleyebilsin diye. Değerler kılavuzlardan doğrulanmadı:
arayüzde her profilde küçük not "Sınırları başvuru kılavuzundan kontrol edin." Başlangıç profilleri (yaklaşık değerler):
- ÖSYM/e-Devlet vesikalık: JPG, ≤ 200 KB, 50×60 mm oran (ör. 394×472 px), 
- Biyometrik/pasaport: JPG, ≤ 500 KB, 50×60 mm
- e-Devlet belge yükleme: PDF/JPG, ≤ 2 MB (genel)
- CV / iş başvurusu fotoğrafı: JPG, ≤ 1 MB
- E-posta eki (küçült): JPG, ≤ 1 MB, uzun kenar 1920
- Discord video: MP4, ≤ 10 MB; WhatsApp video: MP4, ≤ 64 MB (genel paylaşım için 16 MB seçeneği de)
- Shorts/TikTok dikey: MP4 9:16, ≤ 50 MB

## Dosya sahipliği (ÇAKIŞMAYI ÖNLEMEK İÇİN KESİN)
| Alan | Sahibi |
|---|---|
| `package.json`, `main.js`, `preload.js`, `src/main/**`, `src/core/**`, `tests/unit/**`, `electron-builder.yml`, `README.md` | **Yazılımcı** |
| `src/renderer/**` (index.html, styles.css, app.js, i18n.js, mock-api.js, ikonlar), `assets/**`, `docs/DESIGN.md` | **Tasarımcı** |
| `tests/e2e/**`, `docs/TEST_REPORT.md` | **Test edici** |

Başkasının alanındaki bir değişiklik gerekiyorsa dosyayı düzenleme; `docs/NOTES.md` dosyasına "[Kimden → Kime] istek" diye ekle.

## IPC sözleşmesi — `window.sigdir` (preload.js, `contextBridge`)
Hepsi Promise döner. Yollar mutlak dosya yolu (string). Hata olursa reject değil, `{ ok:false, error:'kod', message }` döner.
```
getAppInfo() -> { version, platform, ffmpegAvailable:boolean }
getSettings() -> { lang:'tr'|'en', theme:'system'|'light'|'dark', outputDir:string|null, openFolderAfter:boolean, contextMenuInstalled:boolean }
setSettings(partial) -> settings
getProfiles() -> Profile[]
   Profile = { id, kind:'image'|'pdf'|'video', name:{tr,en}, note:{tr,en}, format:'jpg'|'png'|'pdf'|'mp4',
               maxBytes:number, width?:number, height?:number, aspect?:number /* w/h */, longEdge?:number, vertical?:boolean }
pickFiles(kind?:'image'|'pdf'|'video'|'any') -> string[]          // dosya seçme diyaloğu
pickOutputDir() -> string|null
inspect(paths:string[]) -> FileInfo[]
   FileInfo = { path, name, sizeBytes, kind:'image'|'pdf'|'video'|'unknown', width?, height?, pages?, durationSec?,
                thumb?: string /* data:image/jpeg;base64, en fazla 256px */, error? }
fitImages({ files:[{ path, rotate?:0|90|180|270, crop?:{x,y,w,h} /* kaynak piksel */ }],
            profileId?:string, custom?:{ format:'jpg'|'png', maxBytes, width?, height?, longEdge? } })
   -> Result[]  Result = { input, output, ok, beforeBytes, afterBytes, width, height, quality?, error? }
mergePdf({ files:string[] /* görsel veya pdf, sırayla */, output?:string, maxBytes?:number }) -> Result
splitPdf({ file:string }) -> { ok, outputs:string[], error? }
fitVideo({ file, maxBytes, start?:number, end?:number, vertical?:boolean, mute?:boolean }) -> Result
cancel() -> { ok:true }                                               // süren video/toplu işi iptal
onProgress(cb) -> unsubscribe   // cb({ job:'images'|'pdf'|'video', index, total, file, percent, status:'working'|'done'|'error' })
onFilesFromOS(cb) -> unsubscribe // sağ tık menüsü / ikinci örnek / argümanla gelen dosyalar: cb(string[])
revealInFolder(path) -> void
setContextMenu(enabled:boolean) -> { ok, error? }    // sadece win32
```
Tasarımcı `src/renderer/mock-api.js` yazar: `window.sigdir` yoksa sahte veriyle aynı sözleşmeyi taklit eder; böylece arayüz
tarayıcıda (Playwright ile) tek başına önizlenebilir. Gerçek uygulamada preload API'si varsa mock devreye girmez.

## Kalite çıtası
- Hedef boyut asla aşılmaz (birim testle kanıtlı). Kaynak dosyanın üzerine asla yazılmaz.
- Her işlemde Türkçe, teknik olmayan, ne yapılacağını söyleyen hata mesajı.
- `npm start` (Linux'ta `xvfb-run -a npm start` ile de) çalışır; `npm test` birim testlerini çalıştırır; `npm run test:e2e` uçtan uca.
