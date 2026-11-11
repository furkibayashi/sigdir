# Sığdır — Tasarım

> **Dosyanı bırak → nereye yükleyeceğini seç → hazır.** Uygulama 10 saniyede anlaşılmalı.

Hedef kullanıcı teknik değil: vesikalığını ÖSYM'ye yükleyen aday, iş başvurusu yapan biri,
Discord'a klip atan oyuncu. Sığdır onlara "KB", "bitrate", "DPI" öğretmez; **nereye** yükleyeceklerini sorar.

## 1. İlkeler

1. **Üç adım, ekranda görünür.** Her sekmede sol bölme **①  Dosyalarını ekle**, sağ bölme **②  Nereye?**,
   altta tek büyük düğme **Sığdır**. Düğmenin altındaki ipucu her zaman bir sonraki adımı söyler
   ("Önce bir dosya ekle." → "Şimdi nereye yükleyeceğini seç." → "3 fotoğraf → ÖSYM vesikalık.").
2. **Hedefe göre konuş, teknik terime göre değil.** Profil kartı adı ("ÖSYM / e-Devlet vesikalık") önde,
   teknik özet küçük ve ikinci planda ("≤ 200 KB · JPG · 50×60 mm"). Not ("Sınırları başvuru kılavuzundan
   kontrol edin.") yalnızca seçili kartta görünür; kalabalık yapmaz.
3. **Asla yalan yeşil tik yok.** Yeşil yalnızca sonuç sınırın altındaysa. Ana süreç `ok:true` dese bile
   `afterBytes > maxBytes` ise arayüz bunu hata (`over_limit`) olarak gösterir.
4. **Güven veren dil.** Bırakma alanında "Dosyaların bilgisayarından çıkmaz; asılları değişmez."
   Ayarlarda gizlilik kutusu. Hatalar ne olduğunu değil **ne yapılacağını** söyler.
5. **Sade ama şablon değil.** Kimlik tek bir metafordan gelir: *kutuya sığan dosya*.

## 2. Görsel kimlik

- **Metafor:** kırpma/sığdırma çerçevesinin **dört köşe işareti** + kraft (karton kutu) rengi.
  - Bırakma alanı: köşe işaretleri (üzerine gelince içe doğru "sıkışır"), ortada kutuya inen sayfa çizimi.
  - Sürükleme katmanı: tüm pencere çerçeve olur, köşeler nefes alır gibi içe-dışa hareket eder; "Bırak, sığdıralım".
  - **Sığma çubuğu:** her dosyada iz = sınır (kutu). Önce: çizgili kehribar dolgu "Sınırdan 17 kat büyük";
    sonra: yeşil dolgu "Sınırın %89 kadarı". Kullanıcı "sığdı" kavramını sayı okumadan görür.
  - **Uygulama ikonu** (`assets/icon.svg`): mor yuvarlak kare, beyaz köşe işaretleri, içinde kraft renkli sayfa.
- **Renk ayrımı:** marka **mor**, başarı **yeşil**, uyarı **kehribar**, hata **kırmızı**. Marka asla yeşil
  değildir; böylece yeşil = "sınırın altında" anlamı korunur.
- Yuvarlak köşeler, ince kenarlıklar, çok hafif gölgeler — Zamanlayıcı / OtoTık çizgisinde Windows aracı hissi.

## 3. Token'lar (`src/renderer/styles.css` `:root`)

### Renk

| Token | Açık | Koyu | Kullanım |
|---|---|---|---|
| `--bg` | `#F3F1EC` | `#121117` | pencere zemini (sıcak kâğıt) |
| `--surface` | `#FFFFFF` | `#1B1A21` | bölmeler, kartlar |
| `--surface-2` | `#F6F4EF` | `#222029` | bırakma alanı, alt bölüm |
| `--surface-3` | `#ECE8E0` | `#2B2833` | sekme rayı, çubuk izi |
| `--border` | `#E2DDD3` | `#33303C` | ayırıcı (dekoratif) |
| `--border-input` | `#8A8377` | `#7A7488` | giriş/düğme kenarı (≥ 3:1) |
| `--text` | `#1C1A21` | `#EFEDF4` | ana metin |
| `--text-2` | `#55515D` | `#B9B4C4` | ikincil metin |
| `--text-3` | `#6A6571` | `#A19CAD` | ipucu, devre dışı |
| `--primary` | `#5B3FD0` | `#A895FF` | marka, seçili, birincil düğme |
| `--primary-soft` | `#EEEAFD` | `#2A2546` | seçili kart zemini |
| `--success` | `#17784A` | `#5AD394` | sığdı, yeşil tik |
| `--warn` | `#8A5300` | `#F1B95E` | "sınırdan büyük", ffmpeg yok |
| `--danger` | `#B42318` | `#FF8E84` | hata |
| `--kraft` | `#E2B26A` | `#D4A35A` | kutu çizimi (dekoratif) |

Kontrast (WCAG AA, hesaplandı): metin/zemin çiftlerinin hepsi ≥ 4.5:1 — ör. `--text-2` beyazda 7.7:1,
`--primary` beyazda 6.9:1, `--success` beyazda 5.5:1, `--text-3` `--surface-3`'te 4.6:1; koyu temada hepsi ≥ 5.4:1.
Giriş kenarları ≥ 3.7:1 (1.4.11).

### Tipografi
Sistem fontu, harici font yok: `"Segoe UI Variable Text", "Segoe UI Variable", "Segoe UI", sans-serif`;
başlıklarda `Segoe UI Variable Display`. Ölçek: 12 / 13 / **14 (gövde)** / 16 / 20 / 24 px.
Sayılar `font-variant-numeric: tabular-nums` (boyutlar kaymaz).

### Boşluk, köşe, hareket
- Boşluk 4'lü ızgara: 4 · 8 · 12 · 16 · 20 · 24 · 32.
- Köşe: 6 (giriş) · 10 (düğme) · 14 (kart) · 18 (bölme, diyalog) · pill.
- Hareket: 160 ms, `cubic-bezier(.2,.7,.2,1)`. `prefers-reduced-motion: reduce` → tüm animasyonlar kapanır.

## 4. Ekranlar

Varsayılan pencere ~1000×700; en küçük ~760×560 (≤ 900 px'te sağ bölme 280 px, ≤ 620 px yükseklikte sıkı düzen).

| Ekran | İçerik |
|---|---|
| **Üst çubuk** | Logo + "Sığdır", ortada sekme rayı (Görsel · Belge (PDF) · Video), sağda Ayarlar. |
| **Görsel** | Sol: bırakma alanı → dosya listesi (küçük resim, ad, önce→sonra boyut, ölçü, sığma çubuğu, durum çipi, kırp/klasör/kaldır). Sağ: profil kartları + **Özel** (JPG/PNG, en fazla KB/MB, ölçü: olduğu gibi / uzun kenar / px / mm+DPI). |
| **Kırp & döndür** | Modal diyalog. Profil oranına kilitli kutu, üçte bir çizgileri, köşe tutamaçları; Sola/Sağa çevir, Sıfırla, Vazgeç, Uygula. Seçim kaynak piksel olarak gösterilir ("2796×3355 piksel seçili"). |
| **Belge (PDF)** | Sol: numaralı, sürüklenebilir liste (tutamaç, ↑ ↓ düğmeleri, Alt+↑/↓). Sağ: **Birleştir / Ayır** anahtarı; birleştirmede boyut sınırı kartları (Sınır yok · e-Devlet ≤ 2 MB · Özel MB). Ayırmada görseller soluk ve "ayırmada atlanır". |
| **Video** | Sol: kapak + süre, sığma çubuğu; "Hangi kısmı göndereceksin?" (çift kaydırıcı + saniye girişleri, seçilen süre); "Dikey yap (9:16)" (kapakta kırpma kılavuzu belirir) ve "Sesi kapat" anahtar kartları; **tahmini kalite** göstergesi (MB ÷ süre → Çok iyi/İyi/Orta/Düşük + ipucu). Sağ: Discord, WhatsApp, Shorts… + Özel MB. Shorts seçilince dikey otomatik açılır. |
| **Ayarlar** | Sağdan açılan panel: Dil, Tema (Sistem/Açık/Koyu), çıktı klasörü (varsayılan "asıl dosyanın yanına, -sigdir ekiyle" / Klasör seç / Varsayılana dön), Bitince klasörü aç, Sağ tık menüsü (yalnız win32), gizlilik + sürüm. Değişiklik anında uygulanır. |

## 5. Durumlar

| Durum | Nasıl görünür |
|---|---|
| **Boş** | Büyük bırakma alanı (köşe işaretleri + kutu çizimi), "Dosya seç", "ya da Ctrl + O", gizlilik satırı. Sağdaki düğme pasif, ipucu "Önce bir dosya ekle." |
| **Sürükleniyor** | Pencere üstü katman, köşeler içe-dışa nefes alır, "Bırak, sığdıralım". Bırakılan dosyalar türüne göre doğru sekmeye gider (görsel PDF sekmesindeyken PDF listesine). |
| **Hazır** | Satırda kehribar çizgili çubuk "Sınırdan 17 kat büyük"; oran farklıysa "Oranı hedeften farklı — istersen kırp." ve kırp düğmesi vurgulu. |
| **İşleniyor** | Satırlar "Sırada" → döner simge "Sığdırılıyor" → "✓ Sığdı". Altta genel ilerleme çubuğu + yüzde + **İptal et** (Esc de iptal eder). Kontroller kilitli. |
| **Başarı** | Yeşil şerit: "Sığdırıldı! 182 KB — sınırın altında ✓" (çoklu: "3 dosya sığdırıldı — hepsi sınırın altında ✓"), kaydedildiği klasör, **Klasörde göster**, **Yeni dosyalar**. Satırda üstü çizili eski boyut → yeşil yeni boyut. Düğme "Hepsi hazır" olur. |
| **Kısmi / hata** | Kehribar şerit "2 dosya hazır, 1 dosyada sorun çıktı."; hatalı satır kırmızı kenarlı, altında ne yapılacağını söyleyen mesaj. Toplu hata kırmızı şerit. |
| **İptal** | Gri şerit "İptal edildi. Bitmiş olanlar kaydedildi." |
| **ffmpeg yok** | Video sekmesinde kilit rozeti "ffmpeg yok"; sekme seçilebilir ama panel açıklama kartı gösterir (ne eksik, iki çözüm yolu, Görsel/PDF'e kısayollar). Video bırakılırsa bildirim. |
| **Desteklenmeyen dosya** | Kırmızı bildirim: "belge.docx: Bu dosya türü desteklenmiyor." |
| **Sağ tık menüsünden gelen** | Dosyalar otomatik eklenir, doğru sekme açılır, bildirim "Sağ tık menüsünden 1 dosya geldi." |

## 6. Erişilebilirlik kararları

- **Klavye:** her şey Tab ile erişilebilir. Sekmeler `role=tablist` (←/→/Home/End), profil kartları yerel
  radyo grubu (oklar), anahtarlar `role=switch`. Kısayollar: **Ctrl+O** dosya seç, **Ctrl+Enter** sığdır,
  **Ctrl+1/2/3** sekme, **Ctrl+,** ayarlar, **Esc** iptal / diyalog kapat, PDF'te **Alt+↑/↓** sırala.
- **Kırpma klavyeyle:** kutu odaklanabilir; oklar taşır (Shift ×5), **+ / −** büyütür/küçültür, **Enter** uygular;
  seçim boyutu `aria-live` ile okunur.
- **Görünür odak halkası:** 2 px marka rengi + 5 px yumuşak hale (`:focus-visible`); kartlarda `:has()` ile kartın tamamı.
- **Ekran okuyucu:** simge düğmelerinin hepsinde dosya adını içeren `aria-label` ("Listeden kaldır: vesikalik.jpg");
  kart özetleri `aria-describedby`; ilerleme `role=progressbar` + `aria-valuenow`; video kaydırıcılarında
  `aria-valuetext` ("0:12,5"). Durum mesajları iki canlı bölgeden: `polite` (eklendi, bitti) ve `assertive` (hata).
  Sonuç şeridi `role=status`; iş bitince odak şeritteki ilk düğmeye taşınır.
- **Diyaloglar** yerel `<dialog>` + `showModal()` (odak tuzağı, Esc). Kapanınca odak açan düğmeye döner.
  Arka plana tıklama yalnızca basma da arka planda başladıysa kapatır (kırpma sürüklemesi kaybolmaz).
- **Hareket:** `prefers-reduced-motion` saygı görür; Windows yüksek kontrast için `forced-colors` kuralları.
- **Hedef boyutları:** düğmeler ≥ 30 px, birincil 48 px; kırpma tutamaçlarının görünmez tıklama alanı 42 px.

## 7. Yazım (UX metni)

Sen diliyle, kısa, sıcak. Teknik kelime yalnızca özetlerde (KB, JPG). Örnekler:
"Fotoğrafını buraya bırak" · "Nereye yükleyeceksin?" · "Sığdırıldı! 182 KB — sınırın altında ✓" ·
"Bu sınıra sığdırılamadı. Daha büyük bir sınır seç ya da ölçüyü küçült." · "Video için ffmpeg gerekiyor".
Tüm metinler `src/renderer/i18n.js` içinde (TR varsayılan, EN). Boyutlar ondalık tabanla (1 KB = 1000 B,
profillerle aynı); TR'de virgül ve "%45", EN'de nokta ve "45%".

## 8. Teknik notlar (arayüz)

- `index.html` → `i18n.js` → `mock-api.js` → `app.js` (klasik `defer` betikleri; ES modülü değil — `file://`
  altında modül CORS sorunlarından kaçınmak için). Framework, CDN, harici font yok. CSP:
  `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`.
- `mock-api.js` yalnızca `window.sigdir` yoksa devreye girer. URL parametreleri: `?lang=en&theme=dark&platform=linux&ffmpeg=0&fast=1&errors=1`.
  Ayrıca `window.__sigdirMock.emitFilesFromOS([...])` sağ tık akışını taklit eder.
- Kırpma: `crop` **döndürülmüş** görüntünün kaynak piksellerindedir (sıra: EXIF → rotate → crop), `FileInfo.width/height` ile ölçeklenir.
- Ekran görüntüleri: `docs/screenshots/` (Playwright, mock API, deviceScaleFactor 2).
