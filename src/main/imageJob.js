'use strict';

const core = require('../core');

/** IPC'den gelen files alanını { path, rotate?, crop? } listesine çevirir. */
function normalizeFiles(list) {
  return (Array.isArray(list) ? list : [])
    .map((f) => (typeof f === 'string' ? { path: f } : f))
    .filter((f) => f && typeof f.path === 'string' && f.path);
}

/** Genel bir hatayı (geçersiz hedef, meşgul, dosya yok…) dosya başına Result satırlarına çevirir. */
function failureResults(files, err, lang = 'tr') {
  const info = core.toErrorInfo(err, lang);
  const base = { output: null, ok: false, beforeBytes: 0, afterBytes: 0, width: 0, height: 0, ...info };
  return files.length ? files.map((f) => ({ input: f.path, ...base })) : [{ input: null, ...base }];
}

/**
 * fitImages IPC işleyicisinin gövdesi (SIG-008): sözleşme gereği HER ZAMAN Result[] döndürür.
 * deps: { profiles, outputDir, lang, runJob(kind, fn(signal)), onProgress, afterDone }
 * runJob meşgulse { ok:false, error:'busy' } döndürür; bu da dosya başına satıra çevrilir.
 */
async function runFitImages(opts, deps) {
  const { profiles, outputDir = null, lang = 'tr', runJob, onProgress = () => {}, afterDone = () => {} } = deps;
  const files = normalizeFiles(opts && opts.files);
  try {
    if (!files.length) throw new core.SigdirError('no_files');
    const target = core.resolveImageTarget({ profileId: opts.profileId, custom: opts.custom }, profiles);
    const results = await runJob('images', async (signal) => {
      const res = await core.fitImages(files, target, { outputDir, lang, signal, onProgress });
      afterDone(res.filter((r) => r.ok).map((r) => r.output));
      return res;
    });
    if (Array.isArray(results)) return results;
    return failureResults(files, new core.SigdirError((results && results.error) || 'unknown'), lang);
  } catch (err) {
    return failureResults(files, err, lang);
  }
}

module.exports = { runFitImages, failureResults, normalizeFiles };
