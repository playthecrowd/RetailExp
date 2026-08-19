/**
 * A multipart POST that reports real upload progress.
 *
 * WHY XMLHttpRequest AND NOT fetch
 *   fetch has no upload-progress event. XHR's `upload.onprogress` is the only
 *   place a browser reports genuine transfer, which is the difference between
 *   a real percentage and an invented one.
 *
 * WHAT IS IDENTICAL TO THE fetch PATH IT REPLACES FOR VIDEO
 *   One multipart POST, the field name Cloudflare documents, the one-time URL
 *   used exactly once and never stored. Nothing about the destination, the
 *   reservation or the finalization changes.
 *
 * THE DENOMINATOR, AND WHY THERE ARE TWO
 *   `event.total` is preferred. Some proxies and some Android builds report
 *   lengthComputable false, and the first version reported nothing at all in
 *   that case - the visitor watched dots for the whole upload. The fallback is
 *   the FILE'S OWN SIZE, which is a real byte count we already hold, so the
 *   percentage stays measured rather than guessed. There is no third fallback:
 *   without a byte total there is no honest number, and a timer would be a
 *   fabrication.
 *
 *   Fallback progress is clamped below 100 until the load event succeeds,
 *   because `loaded` counts bytes handed to the socket. Reaching 100 there
 *   would claim a completed upload the server has not acknowledged.
 */

export type UploadProgress = (percent: number) => void;

export interface UploadResult {
  ok: boolean;
}

/** Highest value the byte-progress callback may report before the server has
 *  acknowledged the upload. */
export const MAX_IN_FLIGHT_PERCENT = 99;

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
      const total = event.lengthComputable && event.total > 0 ? event.total : file.size;
      if (!total) return;

      const raw = (event.loaded / total) * 100;
      // Never 100 in flight. The load handler below is what promotes it.
      const percent = Math.min(MAX_IN_FLIGHT_PERCENT, Math.max(0, Math.round(raw)));
      onProgress(percent);
    };

    // A 2xx is the only success. Everything else - network error, abort,
    // timeout - resolves ok:false, so the caller has exactly one failure path
    // and can never mistake a failure for a completed upload.
    request.onload = () => {
      const ok = request.status >= 200 && request.status < 300;
      // Only on an acknowledged upload does the bar reach the top of the
      // transfer phase.
      if (ok) onProgress(100);
      resolve({ ok });
    };
    request.onerror = () => resolve({ ok: false });
    request.onabort = () => resolve({ ok: false });
    request.ontimeout = () => resolve({ ok: false });

    request.send(body);
  });
}
