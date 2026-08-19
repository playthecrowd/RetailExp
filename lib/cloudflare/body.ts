/**
 * A bounded raw-body reader — PURE, and byte-exact.
 *
 * WHY request.text() IS NOT A LIMIT
 *   An earlier version read `await request.text()` and then compared its
 *   length to a cap. That is not a cap: the entire body has already been
 *   buffered in memory by the time the check runs, so a large or hostile body
 *   costs exactly as much as if no limit existed. The check only decided what
 *   to do AFTER paying the price.
 *
 *   This reads the stream incrementally and stops the moment the limit is
 *   exceeded, cancelling the stream so the sender is not left uploading into
 *   a buffer we have already abandoned.
 *
 * WHY BYTES
 *   The signature covers the exact bytes Cloudflare sent. Decoding to a string
 *   and back can alter invalid UTF-8 sequences and normalises nothing
 *   predictably, so the raw bytes are preserved and handed to the HMAC
 *   directly. Newlines are untouched: no trimming, no line-ending conversion.
 *
 * CONTENT-LENGTH IS A HINT, NOT A FACT
 *   A declared length over the cap is rejected before a single byte is read,
 *   which is the cheap path. But a missing, malformed or dishonest header
 *   changes nothing about safety: the incremental cap below is what actually
 *   enforces the limit, and it is applied whether or not the header agreed.
 */

export type BodyReadResult =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; reason: "too_large" | "unreadable" };

/** Parses a Content-Length header defensively. Anything that is not a
 *  plain non-negative integer is treated as absent, not as zero. */
export function parseContentLength(header: string | null): number | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (!/^\d{1,15}$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return Number.isSafeInteger(value) ? value : null;
}

export async function readBoundedBody(
  request: { headers: Headers; body: ReadableStream<Uint8Array> | null },
  limitBytes: number,
): Promise<BodyReadResult> {
  // Cheap rejection first: an honest sender that declares too much is turned
  // away before any transfer.
  const declared = parseContentLength(request.headers.get("content-length"));
  if (declared !== null && declared > limitBytes) {
    return { ok: false, reason: "too_large" };
  }

  const stream = request.body;
  if (stream === null) {
    // No body at all is not an error here; an empty body simply fails the
    // signature check further along.
    return { ok: true, bytes: new Uint8Array(0) };
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;

      // The real limit. Applied to bytes ACTUALLY received, so a dishonest or
      // absent Content-Length buys nothing.
      if (total > limitBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }

      chunks.push(value);
    }
  } catch {
    await reader.cancel().catch(() => undefined);
    return { ok: false, reason: "unreadable" };
  }

  // Concatenated exactly as received — no decoding, no normalisation.
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { ok: true, bytes };
}
