# Ekip notları

## [Yazılımcı-1 → Tasarımcı] bilgi

- **Sözleşmeye ek:** `window.sigdir.getPathForFile(file) -> string` (senkron, Promise değil). Electron 32+ ile
  `File.path` kaldırıldı; sürükle-bırakta mutlak yolu bununla alın. Bulunamazsa `''` döner. (app.js zaten kullanıyor.)
- **Kırpma koordinatları:** `crop:{x,y,w,h}`, EXIF yönü ve `rotate` uygulandıktan *sonraki* görüntünün pikselleridir
  (yani `rotate` 90/270 ise genişlik/yükseklik yer değiştirmiş görüntü). `rotate` negatif olabilir (-90 = 270).
  Sınır dışına taşan kutu kırpılır, hata verilmez. `inspect` içindeki `width/height` EXIF yönü uygulanmış ölçülerdir.
- **Birimler:** profillerde `maxBytes` ondalık (200 KB = 200000 bayt). Güvenli taraf; arayüzün 1000 ile bölmesi doğru.
- **Hatalar:** her uç `{ ok:false, error:'kod', message }` döner; `message` ayarlardaki dile (`lang`) göre TR/EN,
  doğrudan gösterilebilir. Kodlar: `too_small, unsupported, read_failed, not_found, write_failed, encrypted,
  ffmpeg_missing, no_video, bad_range, bad_target, no_files, busy, cancelled, encode_failed, name_too_long, unknown`.
  (`name_too_long` SIG-001 ile eklendi; `write_failed` artık duruma göre farklı mesaj taşır: izin, disk dolu,
  "çıktı klasörü kullanılamıyor".)
  `inspect` hatalı dosyada reject etmez: `FileInfo.error` (+ `message`) doldurulur.
- **Meşgul:** bir iş sürerken yeni `mergePdf/splitPdf/fitVideo` çağrısı `{ok:false,error:'busy'}` döner.
  `fitImages` ise SIG-008'den beri **her durumda dizi** döner: geçersiz hedef, boş liste ve meşgulde de
  dosya başına `{input, ok:false, error, message}` satırı (boş listede `input:null` olan tek satır).
- **İptal:** `cancel()` sonrası video `error:'cancelled'` döner; toplu görselde kalan dosyalar `cancelled` olur.
- **Ek alanlar (sözleşmeyi bozmaz):** `mergePdf` sonucu `pages`, `inputs`; `fitVideo` sonucu `durationSec`,
  `videoKbps`, `audioKbps`, `attempts`; `FileInfo` için `format` (görsel), `hasAudio` (video), PDF'te `width/height` pt.
- **İlerleme:** görsel `working` (index/total) → `done|error`; pdf birleştirme 0–50 dosya okuma, 50–95 hedef arama;
  video yüzdesi 2 geçişin toplamıdır (yeniden denemede 0'dan tekrar başlayabilir).
- **onFilesFromOS:** abone olunduğu anda, açılışta `--files` ile gelmiş bekleyen dosyalar hemen teslim edilir;
  sonradan gelenler (ikinci örnek) ~250 ms toplanıp tek dizi halinde gelir.
- `setContextMenu` Linux/macOS'ta `{ok:false,error:'unsupported'}` döner; `getAppInfo().platform` ile gizleyin.

## [Yazılımcı-1 → Test edici] bilgi

- Başlatma: `_electron.launch({ args: ['--no-sandbox', '<repo>'] })` (root olduğu için `--no-sandbox` şart).
  `npm start` bunu kendisi ekler (src/main/launch.js).
- Yalıtım: `SIGDIR_USER_DATA=<geçici klasör>` ayarları/tek örnek kilidini ayrı tutar (paralel testler için).
- `SIGDIR_FFMPEG=none` → ffmpeg yokmuş gibi (`getAppInfo().ffmpegAvailable === false`, video `ffmpeg_missing`).
- Dosya ile açılış: `args: ['--no-sandbox', '<repo>', '--files', '/mutlak/a.jpg', 'b.pdf']`.
- Çıktılar varsayılan olarak kaynağın yanına `<ad>-sigdir.<uzantı>` yazılır; testte `setSettings({outputDir})` kullanın.

## [Tasarımcı-1 → Yazılımcı-1] istekler (arayüz)

Arayüz `src/renderer/**` hazır; preload/ipc koduna göre uyarlandı. Aşağıdakiler senin alanında:

1. **Pencere boyutu** (`src/main/app.js` `createWindow`): şartname ~1000×700, en küçük ~760×560 diyor;
   arayüz bu ölçülerde test edildi. Öneri: `width: 1000, height: 700, minWidth: 760, minHeight: 560`
   (şu an 1120×780 / 820×580).
2. **Arka plan rengi** (`backgroundFor`): açılışta yanıp sönmesin diye tema zeminleriyle aynı olsun:
   açık `#F3F1EC`, koyu `#121117` (şu an `#f6f7f9` / `#16181d`).
3. **İkonlar hazır:** `assets/icon.ico` (16–256 px), `assets/icon.png` (512), `icon-256.png`, `icon-512.png`,
   kaynak `assets/icon.svg`. electron-builder için `icon.ico` / `icon.png` kullanılabilir.
4. **İsteğe bağlı profil alanı `sizeLabel`** (`profiles.json`): kartta "394×472 px" yerine insanca ölçü
   göstermek için, ör. `"sizeLabel": "50×60 mm"` (string ya da `{tr,en}`). Yoksa arayüz px gösterir.
   Öneri: `osym-vesikalik` ve `biyometrik` için `"50×60 mm"`.
5. **İlerleme sözleşmesi (sadece onay):** arayüz `onProgress` olayındaki `percent` değerini **tüm işin**
   yüzdesi, `status`'u ise **o dosyanın** durumu olarak yorumluyor (senin imageFit/pdfTools kodun gibi).
   Görselde `status:'done'` gelen satıra hemen yeşil tik konur; boyutlar `fitImages` sonucu gelince yazılır.
   `splitPdf` her PDF için ayrı ayrı, sırayla çağrılıyor; iptal mevcut dosyadan sonra durur.
6. **`openFolderAfter`:** ana süreç (`afterDone`) klasörü zaten açıyor; arayüz ayrıca `revealInFolder` çağırmıyor
   (yalnızca kullanıcı "Klasörde göster"e basınca).
7. **Hata kodları:** arayüz şu kodlar için kendi kısa metnini gösterir, diğerlerinde senin `message`'ını:
   `too_small, not_found, read_failed, write_failed, encode_failed, unsupported, encrypted, ffmpeg_missing,
   no_video, bad_range, bad_target, busy, cancelled`. Arayüz ayrıca `ok:true` ama `afterBytes > maxBytes`
   gelirse bunu `over_limit` hatası sayar (olmaması gerekir, ama yeşil tik asla yalan söylemesin).
8. **`getPathForFile`** (sözleşmeye ek) kullanılıyor, teşekkürler. Yoksa `file.path`'e düşer, o da yoksa
   "Dosya seç ile dene" bildirimi çıkar.
9. **Paketleme:** `src/renderer/mock-api.js` üretimde de yüklenir ama `window.sigdir` varsa hiçbir şey yapmaz;
   dosyayı pakette tut (index.html onu bekliyor).

## [Yazılımcı-1 → Tasarımcı] yanıt

1–4 uygulandı: pencere 1000×700 (en küçük 760×560), zemin `#F3F1EC` / `#121117`, ikon `assets/icon.ico|png`
pencerede kullanılıyor (electron-builder `buildResources: assets` ile otomatik bulur), `osym-vesikalik` ve
`biyometrik` profillerine `"sizeLabel": "50×60 mm"` eklendi. 5–9 benim tarafımla uyumlu; `mock-api.js` pakette kalıyor
(`files: src/**/*`).

## [Yazılımcı-1 → Ekip] test raporu düzeltmeleri (SIG-001, 002, 004, 007, 008, 009)

- **SIG-004:** Electron 45.3.0 (Chrome 156, Node 24). Electron 45, boş bir uygulamada bile kendi
  `IMPORT_SHARED_TEXTURE_RELEASE_RENDERER_TO_MAIN` invoke kanalını kaydediyor; bizim kanalımız değil.
- **SIG-001:** çıktı adı 255 bayta (Windows'ta ayrıca 259 karakterlik tam yola) sığacak şekilde kısaltılır.
- **SIG-002:** çıktı klasörü bir dosya, silinmiş ya da olmayan bir sürücüdeyse `write_failed` + "Çıktı klasörü kullanılamıyor…".
- **SIG-007:** tüm izin istekleri/kontrolleri reddedilir (`src/main/guards.js`).
- **SIG-009:** `mergePdf({output})` yalnızca ayarlardaki çıktı klasörünün *doğrudan içindeyse* (ya da ana süreçteki
  bir kayıt diyaloğunun onayladığı yol ise) kullanılır; aksi halde sessizce varsayılan ada (`<ilk>-sigdir.pdf`) düşer.
- **[→ Test edici]:** şu 3 e2e testi eski davranışı bekliyor, güncellenmeli:
  `images-ipc.spec.js:334` (`r.second` → `r.second[0]`), `:368` (`empty` → `empty[0]`, SIG-008 dizi);
  `security.spec.js:148` (artık `r.output` keyfi yola değil varsayılan ada yazılır — testin beklentisi ters çevrilmeli);
  `security.spec.js:99` Electron 45'in iç kanalını (`IMPORT_SHARED_TEXTURE_…`, `sigdir:` öneki yok) dışarıda bırakmalı.
