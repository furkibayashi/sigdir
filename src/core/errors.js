'use strict';

/**
 * Hata kodları ve kullanıcıya gösterilecek, teknik olmayan mesajlar.
 * Çekirdek modüller SigdirError fırlatır; ana süreç bunu
 * { ok:false, error:'kod', message } biçimine çevirir.
 */

const MESSAGES = {
  too_small: {
    tr: 'Dosya bu hedef boyuta sığdırılamadı. Hedef boyutu (KB/MB) büyütün veya ölçüyü küçültün.',
    en: 'The file could not be made small enough. Increase the target size or reduce the dimensions.',
  },
  unsupported: {
    tr: 'Bu dosya türü desteklenmiyor. JPG, PNG, WebP, HEIC, BMP, TIFF, PDF veya video dosyası seçin.',
    en: 'This file type is not supported. Choose a JPG, PNG, WebP, HEIC, BMP, TIFF, PDF or video file.',
  },
  read_failed: {
    tr: 'Dosya okunamadı. Dosya bozuk olabilir; başka bir programda açılıp açılmadığını kontrol edin.',
    en: 'The file could not be read. It may be damaged; check whether it opens in another program.',
  },
  not_found: {
    tr: 'Dosya bulunamadı. Taşınmış veya silinmiş olabilir; dosyayı yeniden seçin.',
    en: 'File not found. It may have been moved or deleted; please select it again.',
  },
  write_failed: {
    tr: 'Çıktı dosyası kaydedilemedi. Çıktı klasörüne yazma izniniz olduğundan ve diskte yer olduğundan emin olun.',
    en: 'The output file could not be saved. Make sure the output folder is writable and the disk is not full.',
  },
  output_dir_unavailable: {
    tr: 'Çıktı klasörü kullanılamıyor: silinmiş, çıkarılmış bir sürücüde ya da aslında bir dosya olabilir. Ayarlardan başka bir çıktı klasörü seçin.',
    en: 'The output folder cannot be used: it may have been deleted, be on a removed drive, or be a file. Choose another output folder in Settings.',
  },
  disk_full: {
    tr: 'Diskte yer kalmadı. Biraz yer açın veya ayarlardan başka bir sürücüde çıktı klasörü seçin.',
    en: 'The disk is full. Free up some space or choose an output folder on another drive in Settings.',
  },
  name_too_long: {
    tr: 'Dosya adı ya da klasör yolu çok uzun. Dosyayı daha kısa adlı bir klasöre taşıyın veya ayarlardan daha kısa bir çıktı klasörü seçin.',
    en: 'The file name or folder path is too long. Move the file to a folder with a shorter path or choose a shorter output folder in Settings.',
  },
  encrypted: {
    tr: 'Bu PDF parolayla korunuyor. Önce parolasını kaldırıp yeniden deneyin.',
    en: 'This PDF is password protected. Remove the password and try again.',
  },
  ffmpeg_missing: {
    tr: 'Video işlemek için gereken ffmpeg bulunamadı. Uygulamayı yeniden indirin veya ffmpeg kurun.',
    en: 'ffmpeg, which is needed for video, was not found. Re-download the app or install ffmpeg.',
  },
  no_video: {
    tr: 'Bu dosyada görüntü bulunamadı. Başka bir video dosyası seçin.',
    en: 'No video track found in this file. Please choose another video file.',
  },
  bad_range: {
    tr: 'Başlangıç ve bitiş zamanı geçersiz. Bitiş, başlangıçtan sonra ve videonun süresi içinde olmalı.',
    en: 'Invalid start/end time. The end must be after the start and within the video length.',
  },
  bad_target: {
    tr: 'Hedef ayarları geçersiz. Bir profil seçin veya geçerli bir boyut (KB/MB) girin.',
    en: 'Invalid target settings. Choose a profile or enter a valid size.',
  },
  no_files: {
    tr: 'İşlenecek dosya yok. Önce dosya ekleyin.',
    en: 'There are no files to process. Add some files first.',
  },
  busy: {
    tr: 'Başka bir işlem sürüyor. Bitmesini bekleyin veya iptal edin.',
    en: 'Another task is running. Wait for it to finish or cancel it.',
  },
  cancelled: {
    tr: 'İşlem iptal edildi.',
    en: 'The task was cancelled.',
  },
  encode_failed: {
    tr: 'Dosya dönüştürülürken bir sorun oluştu. Dosya bozuk olabilir; başka bir dosyayla deneyin.',
    en: 'Something went wrong while converting the file. It may be damaged; try another file.',
  },
  unsupported_platform: {
    tr: 'Bu özellik yalnızca Windows\'ta kullanılabilir.',
    en: 'This feature is only available on Windows.',
  },
  unknown: {
    tr: 'Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.',
    en: 'An unexpected error occurred. Please try again.',
  },
};

class SigdirError extends Error {
  /**
   * code: sözleşmedeki hata kodu; opts.messageKey: aynı kod için daha açıklayıcı mesaj
   * (ör. code 'write_failed' + messageKey 'output_dir_unavailable').
   */
  constructor(code, detail, opts = {}) {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
    this.detail = detail;
    this.messageKey = opts.messageKey || null;
  }
}

function messageFor(code, lang = 'tr') {
  const m = MESSAGES[code] || MESSAGES.unknown;
  return m[lang] || m.tr;
}

/** Herhangi bir hatayı { error, message } çiftine çevirir. */
function toErrorInfo(err, lang = 'tr') {
  let code = 'unknown';
  let key = null;
  if (err instanceof SigdirError) { code = err.code; key = err.messageKey; }
  else if (err && err.code === 'ENOENT') code = 'not_found';
  else if (err && err.code === 'ENAMETOOLONG') code = 'name_too_long';
  else if (err && err.code === 'ENOSPC') { code = 'write_failed'; key = 'disk_full'; }
  else if (err && ['EACCES', 'EPERM', 'EROFS'].includes(err.code)) code = 'write_failed';
  else if (err && err.name === 'AbortError') code = 'cancelled';
  return { error: code, message: messageFor(key || code, lang) };
}

module.exports = { SigdirError, MESSAGES, messageFor, toErrorInfo };
