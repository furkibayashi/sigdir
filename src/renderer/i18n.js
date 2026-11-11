/*
 * Sığdır — metinler (TR varsayılan, EN).
 * Üslup: sıcak, kısa, teknik olmayan. "Sen" diliyle konuşur, ne yapılacağını söyler.
 * Çoğul: { one, other } — {n} değişkenine göre seçilir.
 */
(function () {
  'use strict';

  const tr = {
    'tabs.label': 'Dosya türü',
    'tabs.image': 'Görsel',
    'tabs.pdf': 'Belge (PDF)',
    'tabs.video': 'Video',
    'tabs.videoOff': 'ffmpeg yok',

    'common.addMore': 'Ekle',
    'common.clear': 'Temizle',
    'common.remove': 'Kaldır',
    'common.close': 'Kapat',
    'common.cancel': 'Vazgeç',
    'common.stop': 'İptal et',
    'common.cancelling': 'İptal ediliyor…',

    'drop.title.image': 'Fotoğrafını buraya bırak',
    'drop.title.pdf': 'Belgelerini buraya bırak',
    'drop.title.video': 'Videonu buraya bırak',
    'drop.types.image': 'JPG, PNG, HEIC, WebP, BMP, TIFF — birden çok dosya olabilir',
    'drop.types.pdf': 'PDF ve fotoğraflar — tek PDF yapmak ya da sayfalara ayırmak için',
    'drop.types.video': 'MP4, MOV, MKV, WebM — Discord, WhatsApp, Shorts için',
    'drop.pick': 'Dosya seç',
    'drop.kbd': 'ya da Ctrl + O',
    'drop.privacy': 'Dosyaların bilgisayarından çıkmaz; asılları değişmez.',
    'drop.overlayTitle': 'Bırak, sığdıralım',
    'drop.overlaySub': 'Fotoğraf, PDF ya da video',

    'image.step1': 'Fotoğraflarını ekle',
    'image.step2': 'Nereye yükleyeceksin?',
    'image.go': 'Sığdır',
    'image.allDone': 'Hepsi hazır',
    'image.working': { one: 'Fotoğraf sığdırılıyor…', other: '{n} fotoğraf sığdırılıyor…' },

    'profile.custom': 'Özel',
    'profile.customSum': 'Boyutu ve ölçüyü sen belirle',
    'profile.customSumPdf': 'MB sınırını sen belirle',
    'profile.customSumVideo': 'MB sınırını sen belirle',
    'profile.longEdge': 'uzun kenar {n} px',
    'profile.vertical': 'dikey 9:16',
    'profile.keepSize': 'ölçü aynı',

    'custom.format': 'Biçim',
    'custom.max': 'En fazla',
    'custom.unit': 'Birim',
    'custom.size': 'Ölçü',
    'custom.sizeKeep': 'Olduğu gibi kalsın',
    'custom.sizeLong': 'Uzun kenar (px)',
    'custom.sizePx': 'En × boy (piksel)',
    'custom.sizeMm': 'En × boy (mm)',
    'custom.width': 'En',
    'custom.height': 'Boy',
    'custom.dpi': 'DPI',
    'custom.longEdge': 'Uzun kenar',
    'custom.mmHint': '{w}×{h} piksel olarak kaydedilir.',
    'custom.invalid': 'Geçerli bir değer gir',

    'hint.noFiles': 'Önce bir dosya ekle.',
    'hint.noFile': 'Önce bir video ekle.',
    'hint.noTarget': 'Şimdi nereye yükleyeceğini seç.',
    'hint.noTargetVideo': 'Şimdi nereye göndereceğini seç.',
    'hint.invalid': 'Özel ayarlarda eksik bir değer var.',
    'hint.allDone': 'Listedeki her şey sığdırıldı. Yeni dosya ekleyebilirsin.',
    'hint.image': { one: '1 fotoğraf → {target}.', other: '{n} fotoğraf → {target}.' },
    'where.beside': 'Asıl dosyanın yanına kaydedilir.',
    'where.dir': '“{dir}” klasörüne kaydedilir.',

    'file.queued': 'Sırada',
    'file.working': 'Sığdırılıyor',
    'file.done': 'Sığdı',
    'file.error': 'Olmadı',
    'file.crop': 'Kırp / döndür',
    'file.cropFor': '{name} için kırp ve döndür',
    'file.removeFor': 'Listeden kaldır: {name}',
    'file.revealFor': 'Klasörde göster: {name}',
    'file.removed': '{name} listeden kaldırıldı.',
    'file.cropped': 'kırpıldı',
    'file.rotated': 'döndürüldü',
    'file.mismatch': 'Oranı hedeften farklı — istersen kırp.',
    'file.pages': { one: '{n} sayfa', other: '{n} sayfa' },
    'file.imagePage': 'fotoğraf · 1 sayfa',

    'fit.over': 'Sınırdan {x} kat büyük',
    'fit.under': 'Zaten sınırın altında',
    'fit.after': 'Sınırın %{pct} kadarı',

    'done.single': 'Sığdırıldı! {size} — sınırın altında ✓',
    'done.multi': { one: '1 dosya sığdırıldı — sınırın altında ✓', other: '{n} dosya sığdırıldı — hepsi sınırın altında ✓' },
    'done.partial': '{ok} dosya hazır, {err} dosyada sorun çıktı.',
    'done.failed': 'Olmadı. Satırdaki açıklamaya göz at.',
    'done.cancelled': 'İptal edildi. Bitmiş olanlar kaydedildi.',
    'done.cancelledNone': 'İptal edildi. Hiçbir şey kaydedilmedi.',
    'done.where': '“{dir}” klasörüne kaydedildi.',
    'done.reveal': 'Klasörde göster',
    'done.new': 'Yeni dosyalar',

    'pdf.step1': 'Belgelerini ekle',
    'pdf.step2': 'Ne yapalım?',
    'pdf.orderHint': 'Sırayı değiştirmek için sürükle ya da Alt + ↑ / ↓ kullan.',
    'pdf.modeLabel': 'PDF işlemi',
    'pdf.merge': 'Birleştir',
    'pdf.split': 'Ayır',
    'pdf.mergeDesc': 'Fotoğrafları ve PDF\'leri listedeki sırayla tek bir PDF yapar.',
    'pdf.splitDesc': 'Her sayfayı ayrı bir PDF dosyası olarak kaydeder.',
    'pdf.sizeTitle': 'Boyut sınırı',
    'pdf.noLimit': 'Sınır yok',
    'pdf.noLimitSum': 'Olduğu gibi birleştir',
    'pdf.goMerge': 'Tek PDF yap',
    'pdf.goSplit': 'Sayfalara ayır',
    'pdf.hintMerge': { one: '1 dosya PDF\'e dönüşecek.', other: '{n} dosya bu sırayla tek PDF olacak.' },
    'pdf.hintSplit': { one: '1 PDF sayfa sayfa ayrılacak.', other: '{n} PDF sayfa sayfa ayrılacak.' },
    'pdf.hintSplitImages': 'Fotoğraflar atlanır.',
    'pdf.noPdf': 'Ayırmak için listeye bir PDF ekle.',
    'pdf.workingMerge': 'PDF hazırlanıyor…',
    'pdf.workingSplit': 'Sayfalar ayrılıyor…',
    'pdf.doneMerge': 'PDF hazır! {size} — sınırın altında ✓',
    'pdf.doneMergeNoLimit': 'PDF hazır! {size}',
    'pdf.doneSplit': { one: '1 sayfa ayrı PDF olarak kaydedildi.', other: '{n} sayfa ayrı PDF olarak kaydedildi.' },
    'pdf.doneSplitPartial': '{n} sayfa kaydedildi, {err} dosyada sorun çıktı.',
    'pdf.failed': 'PDF hazırlanamadı.',
    'pdf.up': 'Yukarı taşı',
    'pdf.down': 'Aşağı taşı',
    'pdf.moveUp': 'Yukarı taşı: {name}',
    'pdf.moveDown': 'Aşağı taşı: {name}',
    'pdf.moved': '{name} {pos}. sıraya taşındı.',
    'pdf.position': '{n} dosyadan {i}.',
    'pdf.dragHint': 'Sürükleyerek taşı',
    'pdf.skipped': 'ayırmada atlanır',

    'video.step1': 'Videonu ekle',
    'video.step2': 'Nereye göndereceksin?',
    'video.change': 'Değiştir',
    'video.trimTitle': 'Hangi kısmı göndereceksin?',
    'video.start': 'Başlangıç (sn)',
    'video.end': 'Bitiş (sn)',
    'video.startRange': 'Başlangıç noktası',
    'video.endRange': 'Bitiş noktası',
    'video.selection': 'Seçilen: {from} – {to} ({len})',
    'video.options': 'Seçenekler',
    'video.vertical': 'Dikey yap (9:16)',
    'video.verticalHint': 'Ortası kırpılır — Shorts, TikTok, Reels için',
    'video.mute': 'Sesi kapat',
    'video.muteHint': 'Ses yerine görüntüye daha çok yer kalır',
    'video.quality': 'Tahmini görüntü kalitesi',
    'video.q.great': 'Çok iyi',
    'video.q.good': 'İyi',
    'video.q.ok': 'Orta',
    'video.q.low': 'Düşük',
    'video.tip': 'Daha kısa bir bölüm seçersen ya da sesi kapatırsan görüntü netleşir.',
    'video.go': 'Sığdır',
    'video.working': 'Video sığdırılıyor…',
    'video.hint': '{len} → {target}.',
    'video.failed': 'Video sığdırılamadı.',
    'video.done': 'Hazır',
    'video.doneHint': 'Video hazır. Kesimi ya da hedefi değiştirirsen yeniden sığdırabilirsin.',
    'video.off.title': 'Video için ffmpeg gerekiyor',
    'video.off.body': 'Videoları küçültmek için ffmpeg adlı ücretsiz bir araç gerekli, ama bu bilgisayarda bulunamadı.',
    'video.off.ways': 'İki yolu var:',
    'video.off.step1': 'Sığdır\'ın ffmpeg içeren sürümünü indir.',
    'video.off.step2': 'Ya da ffmpeg\'i kur, sonra Sığdır\'ı kapatıp yeniden aç.',
    'video.off.foot': 'Fotoğraf ve PDF araçları her zamanki gibi çalışıyor.',

    'crop.title': 'Kırp ve döndür',
    'crop.sub': 'Oran {ratio} olarak sabit ({target}).',
    'crop.free': 'Serbest kırpma — önce bir hedef seçersen oran ona kilitlenir.',
    'crop.help': 'Kutuyu sürükle ya da köşesinden büyüt. Klavyeyle: ok tuşları taşır (Shift ile hızlı), + ve − büyütür ya da küçültür, Enter uygular.',
    'crop.rotLeft': 'Sola çevir',
    'crop.rotRight': 'Sağa çevir',
    'crop.reset': 'Sıfırla',
    'crop.apply': 'Uygula',
    'crop.boxRole': 'kırpma kutusu',
    'crop.boxLabel': 'Kırpma kutusu',
    'crop.readout': '{w}×{h} piksel seçili',
    'crop.rotated': '{deg} derece döndürüldü.',
    'crop.applied': 'Kırpma kaydedildi: {w}×{h} piksel.',
    'crop.appliedRotate': 'Döndürme kaydedildi.',

    'settings.open': 'Ayarlar',
    'settings.title': 'Ayarlar',
    'settings.lang': 'Dil',
    'settings.theme': 'Tema',
    'settings.themeSystem': 'Sistem',
    'settings.themeLight': 'Açık',
    'settings.themeDark': 'Koyu',
    'settings.output': 'Sığdırılan dosyalar nereye kaydedilsin?',
    'settings.outputDefault': 'Asıl dosyanın yanına (adının sonuna “-sigdir” eklenir)',
    'settings.outputPick': 'Klasör seç…',
    'settings.outputReset': 'Varsayılana dön',
    'settings.openAfter': 'Bitince klasörü aç',
    'settings.openAfterHint': 'Hazır olan dosyayı klasöründe gösterir.',
    'settings.contextMenu': 'Sağ tık menüsüne ekle',
    'settings.contextMenuHint': 'Dosyaya sağ tıklayınca “Sığdır ile küçült” çıkar.',
    'settings.ctxOn': 'Sağ tık menüsüne eklendi.',
    'settings.ctxOff': 'Sağ tık menüsünden kaldırıldı.',
    'settings.privacyTitle': 'Her şey bu bilgisayarda olur.',
    'settings.privacy': 'İnternet gerekmez, hiçbir dosya yüklenmez; fotoğraflardaki konum gibi gizli bilgiler silinir.',
    'settings.version': 'Sığdır {v} · MIT lisanslı, reklamsız',

    'toast.added': { one: '1 dosya eklendi.', other: '{n} dosya eklendi.' },
    'toast.fromOS': { one: 'Sağ tık menüsünden 1 dosya geldi.', other: 'Sağ tık menüsünden {n} dosya geldi.' },
    'toast.unsupported': '{name}: Bu dosya türü desteklenmiyor.',
    'toast.noPath': 'Bırakılan dosyanın yeri okunamadı. “Dosya seç” ile dene.',
    'toast.busy': 'Önce süren işin bitmesini bekle.',
    'toast.queued': { one: 'İş sürüyor; gelen dosya iş bitince listeye eklenecek.', other: 'İş sürüyor; gelen {n} dosya iş bitince listeye eklenecek.' },
    'toast.queuedAdded': { one: 'İş sırasında gelen 1 dosya listeye eklendi.', other: 'İş sırasında gelen {n} dosya listeye eklendi.' },
    'toast.inTab': '({tab} sekmesinde)',
    'toast.videoNoFfmpeg': '{name} eklenmedi: video için ffmpeg gerekiyor.',
    'toast.ctxFail': 'Sağ tık menüsü ayarlanamadı. {msg}',

    'err.too_small': 'Bu sınıra sığdırılamadı. Daha büyük bir sınır seç ya da ölçüyü küçült.',
    'err.not_found': 'Dosya bulunamadı; taşınmış ya da silinmiş olabilir. Yeniden ekle.',
    'err.encode_failed': 'Dönüştürürken bir sorun çıktı; dosya bozuk olabilir. Başka bir dosyayla dene.',
    'err.no_video': 'Bu dosyada görüntü yok. Başka bir video seç.',
    'err.bad_range': 'Başlangıç ve bitiş zamanını kontrol et: bitiş, başlangıçtan sonra olmalı.',
    'err.bad_target': 'Hedef ayarları eksik. Bir hedef seç ya da geçerli bir boyut gir.',
    'err.busy': 'Başka bir iş sürüyor. Bitmesini bekle ya da iptal et.',
    'err.over_limit': 'Sonuç sınırın üstünde kaldı. Daha büyük bir sınır seç.',
    'err.read_failed': 'Dosya açılamadı; bozuk olabilir. Başka bir kopyasını dene.',
    'err.write_failed': 'Kaydedilemedi. Çıktı klasörüne yazma izni olduğundan emin ol.',
    'err.unsupported': 'Bu dosya türü desteklenmiyor.',
    'err.cancelled': 'İptal edildi.',
    'err.ffmpeg_missing': 'Video için ffmpeg bulunamadı.',
    'err.encrypted': 'Bu PDF şifreli. Şifresini kaldırıp yeniden dene.',
    'err.generic': 'Bir şeyler ters gitti. Bir daha dene.',

    'a11y.working': 'Sığdırılıyor, biraz bekle.',
  };

  const en = {
    'tabs.label': 'File type',
    'tabs.image': 'Image',
    'tabs.pdf': 'Document (PDF)',
    'tabs.video': 'Video',
    'tabs.videoOff': 'no ffmpeg',

    'common.addMore': 'Add',
    'common.clear': 'Clear',
    'common.remove': 'Remove',
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.stop': 'Stop',
    'common.cancelling': 'Stopping…',

    'drop.title.image': 'Drop your photo here',
    'drop.title.pdf': 'Drop your documents here',
    'drop.title.video': 'Drop your video here',
    'drop.types.image': 'JPG, PNG, HEIC, WebP, BMP, TIFF — several at once is fine',
    'drop.types.pdf': 'PDFs and photos — to combine into one PDF or split into pages',
    'drop.types.video': 'MP4, MOV, MKV, WebM — for Discord, WhatsApp, Shorts',
    'drop.pick': 'Choose files',
    'drop.kbd': 'or press Ctrl + O',
    'drop.privacy': 'Files never leave your computer; originals stay untouched.',
    'drop.overlayTitle': 'Drop it, we\'ll make it fit',
    'drop.overlaySub': 'Photo, PDF or video',

    'image.step1': 'Add your photos',
    'image.step2': 'Where will you upload it?',
    'image.go': 'Make it fit',
    'image.allDone': 'All done',
    'image.working': { one: 'Fitting your photo…', other: 'Fitting {n} photos…' },

    'profile.custom': 'Custom',
    'profile.customSum': 'Set your own size and dimensions',
    'profile.customSumPdf': 'Set your own MB limit',
    'profile.customSumVideo': 'Set your own MB limit',
    'profile.longEdge': 'long edge {n} px',
    'profile.vertical': 'vertical 9:16',
    'profile.keepSize': 'same dimensions',

    'custom.format': 'Format',
    'custom.max': 'At most',
    'custom.unit': 'Unit',
    'custom.size': 'Dimensions',
    'custom.sizeKeep': 'Keep as is',
    'custom.sizeLong': 'Long edge (px)',
    'custom.sizePx': 'Width × height (pixels)',
    'custom.sizeMm': 'Width × height (mm)',
    'custom.width': 'Width',
    'custom.height': 'Height',
    'custom.dpi': 'DPI',
    'custom.longEdge': 'Long edge',
    'custom.mmHint': 'Saved as {w}×{h} pixels.',
    'custom.invalid': 'Enter a valid value',

    'hint.noFiles': 'Add a file first.',
    'hint.noFile': 'Add a video first.',
    'hint.noTarget': 'Now pick where you\'ll upload it.',
    'hint.noTargetVideo': 'Now pick where you\'ll send it.',
    'hint.invalid': 'A custom value is missing.',
    'hint.allDone': 'Everything in the list fits. Add more files any time.',
    'hint.image': { one: '1 photo → {target}.', other: '{n} photos → {target}.' },
    'where.beside': 'Saved next to the original.',
    'where.dir': 'Saved to the “{dir}” folder.',

    'file.queued': 'Waiting',
    'file.working': 'Working',
    'file.done': 'Fits',
    'file.error': 'Failed',
    'file.crop': 'Crop / rotate',
    'file.cropFor': 'Crop and rotate {name}',
    'file.removeFor': 'Remove from list: {name}',
    'file.revealFor': 'Show in folder: {name}',
    'file.removed': '{name} removed from the list.',
    'file.cropped': 'cropped',
    'file.rotated': 'rotated',
    'file.mismatch': 'Different shape than the target — crop if you like.',
    'file.pages': { one: '{n} page', other: '{n} pages' },
    'file.imagePage': 'photo · 1 page',

    'fit.over': '{x}× over the limit',
    'fit.under': 'Already under the limit',
    'fit.after': '{pct}% of the limit',

    'done.single': 'Done! {size} — under the limit ✓',
    'done.multi': { one: '1 file fits — under the limit ✓', other: '{n} files fit — all under the limit ✓' },
    'done.partial': '{ok} ready, {err} had a problem.',
    'done.failed': 'That didn\'t work. See the note on the file.',
    'done.cancelled': 'Stopped. Finished files were saved.',
    'done.cancelledNone': 'Stopped. Nothing was saved.',
    'done.where': 'Saved to the “{dir}” folder.',
    'done.reveal': 'Show in folder',
    'done.new': 'New files',

    'pdf.step1': 'Add your documents',
    'pdf.step2': 'What should we do?',
    'pdf.orderHint': 'Drag to reorder, or use Alt + ↑ / ↓.',
    'pdf.modeLabel': 'PDF action',
    'pdf.merge': 'Combine',
    'pdf.split': 'Split',
    'pdf.mergeDesc': 'Turns the photos and PDFs into one PDF, in list order.',
    'pdf.splitDesc': 'Saves every page as its own PDF file.',
    'pdf.sizeTitle': 'Size limit',
    'pdf.noLimit': 'No limit',
    'pdf.noLimitSum': 'Combine as is',
    'pdf.goMerge': 'Make one PDF',
    'pdf.goSplit': 'Split into pages',
    'pdf.hintMerge': { one: '1 file becomes a PDF.', other: '{n} files become one PDF, in this order.' },
    'pdf.hintSplit': { one: '1 PDF will be split page by page.', other: '{n} PDFs will be split page by page.' },
    'pdf.hintSplitImages': 'Photos are skipped.',
    'pdf.noPdf': 'Add a PDF to split.',
    'pdf.workingMerge': 'Making your PDF…',
    'pdf.workingSplit': 'Splitting pages…',
    'pdf.doneMerge': 'PDF ready! {size} — under the limit ✓',
    'pdf.doneMergeNoLimit': 'PDF ready! {size}',
    'pdf.doneSplit': { one: '1 page saved as its own PDF.', other: '{n} pages saved as separate PDFs.' },
    'pdf.doneSplitPartial': '{n} pages saved, {err} file(s) had a problem.',
    'pdf.failed': 'Couldn\'t make the PDF.',
    'pdf.up': 'Move up',
    'pdf.down': 'Move down',
    'pdf.moveUp': 'Move up: {name}',
    'pdf.moveDown': 'Move down: {name}',
    'pdf.moved': '{name} moved to position {pos}.',
    'pdf.position': '{i} of {n}.',
    'pdf.dragHint': 'Drag to move',
    'pdf.skipped': 'skipped when splitting',

    'video.step1': 'Add your video',
    'video.step2': 'Where will you send it?',
    'video.change': 'Change',
    'video.trimTitle': 'Which part will you send?',
    'video.start': 'Start (sec)',
    'video.end': 'End (sec)',
    'video.startRange': 'Start point',
    'video.endRange': 'End point',
    'video.selection': 'Selected: {from} – {to} ({len})',
    'video.options': 'Options',
    'video.vertical': 'Make vertical (9:16)',
    'video.verticalHint': 'Crops the middle — for Shorts, TikTok, Reels',
    'video.mute': 'Remove sound',
    'video.muteHint': 'Leaves more room for the picture',
    'video.quality': 'Expected picture quality',
    'video.q.great': 'Great',
    'video.q.good': 'Good',
    'video.q.ok': 'Fair',
    'video.q.low': 'Low',
    'video.tip': 'Pick a shorter part or remove the sound for a sharper picture.',
    'video.go': 'Make it fit',
    'video.working': 'Fitting your video…',
    'video.hint': '{len} → {target}.',
    'video.failed': 'Couldn\'t fit the video.',
    'video.done': 'Done',
    'video.doneHint': 'Your video is ready. Change the part or the target to fit it again.',
    'video.off.title': 'Video needs ffmpeg',
    'video.off.body': 'Shrinking videos needs a free tool called ffmpeg, and it wasn\'t found on this computer.',
    'video.off.ways': 'Two ways to fix it:',
    'video.off.step1': 'Download the Sığdır version that includes ffmpeg.',
    'video.off.step2': 'Or install ffmpeg, then close and reopen Sığdır.',
    'video.off.foot': 'Photo and PDF tools work as usual.',

    'crop.title': 'Crop and rotate',
    'crop.sub': 'Shape locked to {ratio} ({target}).',
    'crop.free': 'Free crop — pick a target first to lock the shape.',
    'crop.help': 'Drag the box or resize it from a corner. Keyboard: arrows move (Shift for faster), + and − grow or shrink, Enter applies.',
    'crop.rotLeft': 'Rotate left',
    'crop.rotRight': 'Rotate right',
    'crop.reset': 'Reset',
    'crop.apply': 'Apply',
    'crop.boxRole': 'crop box',
    'crop.boxLabel': 'Crop box',
    'crop.readout': '{w}×{h} pixels selected',
    'crop.rotated': 'Rotated {deg} degrees.',
    'crop.applied': 'Crop saved: {w}×{h} pixels.',
    'crop.appliedRotate': 'Rotation saved.',

    'settings.open': 'Settings',
    'settings.title': 'Settings',
    'settings.lang': 'Language',
    'settings.theme': 'Theme',
    'settings.themeSystem': 'System',
    'settings.themeLight': 'Light',
    'settings.themeDark': 'Dark',
    'settings.output': 'Where should fitted files go?',
    'settings.outputDefault': 'Next to the original (with “-sigdir” added to the name)',
    'settings.outputPick': 'Choose folder…',
    'settings.outputReset': 'Back to default',
    'settings.openAfter': 'Open the folder when done',
    'settings.openAfterHint': 'Shows the finished file in its folder.',
    'settings.contextMenu': 'Add to right-click menu',
    'settings.contextMenuHint': 'Right-click a file to see “Shrink with Sığdır”.',
    'settings.ctxOn': 'Added to the right-click menu.',
    'settings.ctxOff': 'Removed from the right-click menu.',
    'settings.privacyTitle': 'Everything happens on this computer.',
    'settings.privacy': 'No internet needed, nothing is uploaded; hidden details like location are removed from photos.',
    'settings.version': 'Sığdır {v} · MIT licensed, no ads',

    'toast.added': { one: '1 file added.', other: '{n} files added.' },
    'toast.fromOS': { one: '1 file arrived from the right-click menu.', other: '{n} files arrived from the right-click menu.' },
    'toast.unsupported': '{name}: this file type isn\'t supported.',
    'toast.noPath': 'Couldn\'t read where the dropped file is. Try “Choose files”.',
    'toast.busy': 'Please wait for the current job to finish.',
    'toast.queued': { one: 'A job is running; the new file will be added when it finishes.', other: 'A job is running; {n} new files will be added when it finishes.' },
    'toast.queuedAdded': { one: '1 file that arrived during the job was added.', other: '{n} files that arrived during the job were added.' },
    'toast.inTab': '(in the {tab} tab)',
    'toast.videoNoFfmpeg': '{name} wasn\'t added: video needs ffmpeg.',
    'toast.ctxFail': 'Couldn\'t change the right-click menu. {msg}',

    'err.too_small': 'Couldn\'t fit under this limit. Pick a bigger limit or smaller dimensions.',
    'err.not_found': 'File not found; it may have been moved or deleted. Add it again.',
    'err.encode_failed': 'Something went wrong while converting; the file may be damaged. Try another one.',
    'err.no_video': 'There\'s no picture in this file. Choose another video.',
    'err.bad_range': 'Check the start and end: the end must come after the start.',
    'err.bad_target': 'The target is incomplete. Pick a target or enter a valid size.',
    'err.busy': 'Another job is running. Wait for it or stop it.',
    'err.over_limit': 'The result was still over the limit. Pick a bigger limit.',
    'err.read_failed': 'Couldn\'t open the file; it may be damaged. Try another copy.',
    'err.write_failed': 'Couldn\'t save. Make sure the output folder is writable.',
    'err.unsupported': 'This file type isn\'t supported.',
    'err.cancelled': 'Stopped.',
    'err.ffmpeg_missing': 'ffmpeg wasn\'t found for video.',
    'err.encrypted': 'This PDF is password-protected. Remove the password and try again.',
    'err.generic': 'Something went wrong. Please try again.',

    'a11y.working': 'Working on it, please wait.',
  };

  const DICT = { tr, en };
  let lang = 'tr';
  const locale = () => (lang === 'en' ? 'en-US' : 'tr-TR');

  function t(key, vars) {
    let s = (DICT[lang] && DICT[lang][key]);
    if (s == null) s = tr[key];
    if (s == null) return key;
    if (typeof s === 'object') s = vars && vars.n === 1 ? s.one : s.other;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
    return s;
  }

  function num(v, digits) {
    const d = digits == null ? 1 : digits;
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: d, minimumFractionDigits: 0 }).format(v);
  }

  /**
   * Ondalık taban (1 KB = 1000 bayt) — profiller de böyle tanımlı (200 KB = 200000).
   * Bu yön güvenlidir: Windows Gezgini aynı dosyayı daha küçük gösterir. 182 KB, 1,4 MB.
   */
  function bytes(n) {
    if (n == null || Number.isNaN(n)) return '–';
    if (n < 1000) return num(n, 0) + ' B';
    if (n < 1e6) { const v = n / 1e3; return num(v, v < 10 ? 1 : 0) + ' KB'; }
    if (n < 1e9) { const v = n / 1e6; return num(v, v < 100 ? 1 : 0) + ' MB'; }
    return num(n / 1e9, 2) + ' GB';
  }

  /** Yüzde: TR "%45", EN "45%". */
  function pct(v) { const r = Math.round(v); return lang === 'en' ? r + '%' : '%' + r; }

  /** Video zamanı: 1:05,3 (TR) / 1:05.3 (EN). */
  function time(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec - m * 60;
    const whole = Math.floor(s);
    const tenth = Math.round((s - whole) * 10);
    const ss = String(tenth === 10 ? whole + 1 : whole).padStart(2, '0');
    const dec = tenth && tenth !== 10 ? (lang === 'en' ? '.' : ',') + tenth : '';
    return `${m}:${ss}${dec}`;
  }

  /** Süre metni: "28,5 sn" / "28.5 s", 1 dk üstü "1 dk 12 sn". */
  function dur(sec) {
    sec = Math.max(0, sec || 0);
    const S = lang === 'en' ? 's' : 'sn';
    const M = lang === 'en' ? 'min' : 'dk';
    if (sec < 60) return num(Math.round(sec * 10) / 10, 1) + ' ' + S;
    const m = Math.floor(sec / 60); const s = Math.round(sec - m * 60);
    return `${m} ${M}` + (s ? ` ${s} ${S}` : '');
  }

  /** data-i18n="anahtar" ve data-i18n-attr="aria-label:anahtar;title:anahtar" uygular. */
  function apply(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
      });
    });
  }

  window.SigdirI18n = {
    t,
    has: (key) => key in tr,
    lang: () => lang,
    setLang(l) { lang = DICT[l] ? l : 'tr'; },
    apply, num, bytes, pct, time, dur,
    dict: DICT,
  };
})();
