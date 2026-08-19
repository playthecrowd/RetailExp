/**
 * A local preview frame from a just-recorded video.
 *
 * WHY THIS EXISTS
 *   The confirmation screen asked "use this or retake?" over a blank
 *   rectangle. Many mobile browsers render nothing for a `<video>` with an
 *   object URL until it is played, and `preload` is only a hint — so the
 *   visitor was being asked to approve something they could not see.
 *
 * ENTIRELY LOCAL, AND IT STAYS THAT WAY
 *   Reads the Blob the browser already holds, draws one frame to a canvas, and
 *   returns a data URL. Nothing is uploaded, nothing is persisted, and no
 *   second asset is ever created at the provider — the thumbnail exists only
 *   in this component's state for as long as the preview is on screen.
 *
 *   A data URL rather than another object URL, deliberately: there is then
 *   nothing extra to revoke, and revoking-on-retake is one of the two ways
 *   this kind of code leaks.
 *
 * WHY SEEKING IS NOT OPTIONAL
 *   Frame zero of a phone recording is very often black — the sensor has not
 *   settled. Seeking a little way in gives a frame that actually shows what
 *   was recorded, which is the whole point of the screen.
 */

/** Early enough to be the same shot, late enough to have exposure. */
const PREFERRED_SEEK_SECONDS = 0.1;

/** A phone that will not produce a frame in this long is not going to. */
const TIMEOUT_MS = 4000;

export async function extractVideoThumbnail(objectUrl: string): Promise<string | null> {
  if (typeof document === "undefined") return null;

  return new Promise<string | null>((resolve) => {
    const video = document.createElement("video");
    let settled = false;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(value);
    };

    const timer = setTimeout(() => finish(null), TIMEOUT_MS);

    // muted + playsInline are what allow a decode without a user gesture on
    // iOS; without them the element never reaches a drawable state.
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";

    video.onerror = () => finish(null);

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      // A very short clip is seeked to its midpoint instead, so the seek
      // target is always inside the media.
      const target = duration > 0 ? Math.min(PREFERRED_SEEK_SECONDS, duration / 2) : 0;
      try {
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    // seeked, not loadeddata: loadeddata can fire while the decoder is still
    // on frame zero, which is the black frame this is avoiding.
    video.onseeked = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return finish(null);

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return finish(null);

        context.drawImage(video, 0, 0, width, height);
        finish(canvas.toDataURL("image/jpeg", 0.72));
      } catch {
        // A tainted canvas or an unsupported codec. The caller shows its
        // placeholder; it must never show an empty rectangle.
        finish(null);
      }
    };

    video.src = objectUrl;
    video.load();
  });
}
