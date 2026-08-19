/**
 * A multipart POST that reports real upload progress.
 *
 * WHY XMLHttpRequest AND NOT fetch
 *   fetch has no upload-progress event. A request body stream would report
 *   bytes handed to the network stack rather than bytes acknowledged, and is
 *   not supported for this shape across the mobile browsers this pilot runs
 *   on. XHR's `upload.onprogress` is the only place a browser reports genuine
 *   transfer progress, which is the difference between a real percentage and
 *   an invented one.
 *
 * WHAT IS IDENTICAL TO THE fetch PATH IT REPLACES FOR VIDEO
 *   One multipart POST, the field name Cloudflare documents, the one-time URL
 *   used exactly once and never stored. Nothing about the destination, the
 *   reservation or the finalization changes — only how the bytes are sent and
 *   whether the browser tells us how far they got.
 *
 * The photo path deliberately keeps using fetch: it is untouched, and a photo
 * uploads fast enough that progress buys nothing.
 */

export type UploadProgress = (percent: number) => void;

export interface UploadResult {
  ok: boolean;
}

/**
 * @param onProgress receives 0-100 based on bytes the browser has actually
 *        sent. Not called at all when the length is not computable, so the
 *        caller shows an indeterminate state rather than a fabricated number.
 */
export function uploadWithProgress(
  url: string,
  fieldName: string,
  file: File,
  onProgress: UploadProgress,
): Promise<UploadResult> {
  return new Promise((resolve) => {
    const body = new FormData();
    body.set(fieldName, file);

    const request = new XMLHttpRequest();
    request.open("POST", url, true);

    request.upload.onprogress = (event) => {
      // lengthComputable is false for some proxies and some Android browsers.
      // Reporting nothing is correct there: the caller falls back to an
      // indeterminate bar instead of showing a number it made up.
      if (!event.lengthComputable || event.total === 0) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(Math.max(0, Math.min(100, percent)));
    };

    // A 2xx is the only success. Everything else — including a network error,
    // an abort and a timeout — resolves ok:false, so the caller has exactly
    // one failure path and can never mistake a failure for a completed upload.
    request.onload = () => resolve({ ok: request.status >= 200 && request.status < 300 });
    request.onerror = () => resolve({ ok: false });
    request.onabort = () => resolve({ ok: false });
    request.ontimeout = () => resolve({ ok: false });

    request.send(body);
  });
}
