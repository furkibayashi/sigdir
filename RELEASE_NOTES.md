## Sığdır v0.1.0 — ilk sürüm

Fotoğraf, belge ve videoları **internete yüklemeden** ÖSYM, e-Devlet, iş başvurusu, Discord ve WhatsApp gibi hedeflerin istediği boyut ve ölçüye sığdırır.

**İndir:** `Sigdir-0.1.0-portable.exe` — kurulum gerektirmez, çift tıkla çalışır.

### Neler var
- **Görsel:** JPG, PNG, WebP, HEIC (iPhone), BMP, TIFF → hazır profiller (ÖSYM/e-Devlet vesikalık, biyometrik, CV, e-posta) veya özel KB/ölçü hedefi; kırp ve döndür; konum (GPS) bilgisi silinir
- **PDF:** fotoğrafları ve PDF'leri tek PDF'te birleştir, sayfalara ayır, isteğe bağlı boyut sınırı
- **Video:** Discord 10 MB, WhatsApp, Shorts/TikTok dikey (9:16); başlangıç/bitiş kırpma, sesi kapatma
- Türkçe / English, açık / koyu tema, sağ tık menüsü ("Sığdır ile küçült")
- Kaynak dosyanın üzerine asla yazmaz; hiçbir veriyi internete göndermez

### Bilmeniz gerekenler
- **İlk sürüm:** Linux üzerinde 46 birim + 47 uçtan uca testle doğrulandı; gerçek Windows makinelerde geniş çaplı denenmedi. Sorun görürseniz lütfen Issues'a yazın.
- **SmartScreen uyarısı:** exe dijital olarak imzalı değil. "Windows bilgisayarınızı korudu" ekranında **Ek bilgi → Yine de çalıştır**'a basın. Exe bu depodaki koddan GitHub Actions ile derlenmiştir; `SHA256SUMS.txt` ile doğrulayabilirsiniz.
- Profillerdeki sınırlar yaklaşık değerlerdir; başvuru kılavuzundan kontrol edin.
