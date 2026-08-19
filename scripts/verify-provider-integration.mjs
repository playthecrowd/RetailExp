/**
 * Behavioural tests for the Phase 4C provider boundary.
 *
 * These run the REAL functions against fixtures, unlike the structural checks
 * in verify-admin-auth.mjs which read source text. Both matter: structure
 * catches a rule being deleted, behaviour catches a rule being wrong.
 *
 * Nothing here contacts Cloudflare or the database. The modules under test are
 * deliberately free of `server-only` and read no configuration — secrets and
 * clocks are parameters — which is what makes every failure branch reachable.
 *
 * Run: node scripts/verify-provider-integration.mjs
 */

import { createHmac } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute paths must be file:// URLs for the ESM loader on Windows. */
const mod = (relative) => pathToFileURL(join(root, relative)).href;

const { verifyStreamSignature, parseSignatureHeader, deriveEventId } = await import(
  mod("lib/cloudflare/webhook-core.ts")
);
const { readBoundedBody, parseContentLength } = await import(mod("lib/cloudflare/body.ts"));
const { assessVariantSafety } = await import(mod("lib/cloudflare/variants.ts"));
const {
  recoverImagesAsset,
  recoverStreamAsset,
  decideRecovery,
  classifyRecoveryFailure,
  referenceFitsProviderLimits,
  validateImagesCandidate,
  validateStreamCandidate,
  imagesRecoveryQuery,
  streamRecoveryQuery,
  MAX_RECOVERY_PAGES,
  MAX_RECOVERY_REQUESTS,
} = await import(mod("lib/cloudflare/recovery-core.ts"));
const { runDestinationSequence } = await import(
  mod("lib/testimonials/destination-sequence.ts")
);

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

const SECRET = "test-webhook-secret-not-a-real-credential";
const NOW = 1_700_000_000;

function sign(bodyBytes, time = NOW, secret = SECRET) {
  const hmac = createHmac("sha256", secret);
  hmac.update(Buffer.from(`${time}.`, "utf8"));
  hmac.update(bodyBytes);
  return `time=${time},sig1=${hmac.digest("hex")}`;
}

const bytes = (text) => new TextEncoder().encode(text);

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------
console.log("\n--- webhook signature ---");

const validBody = bytes(JSON.stringify({ uid: "abc", status: { state: "ready" } }));

check(
  verifyStreamSignature(validBody, sign(validBody), SECRET, NOW).ok,
  "a correctly signed body verifies",
);
check(
  verifyStreamSignature(validBody, null, SECRET, NOW).reason === "missing_signature",
  "a missing signature header is rejected",
);
check(
  verifyStreamSignature(validBody, "garbage", SECRET, NOW).reason === "malformed_signature",
  "a malformed signature header is rejected",
);
check(
  verifyStreamSignature(validBody, `time=${NOW},sig1=nothex`, SECRET, NOW).reason ===
    "malformed_signature",
  "a non-hex signature is rejected",
);
check(
  verifyStreamSignature(validBody, sign(validBody, NOW, "wrong-secret"), SECRET, NOW).reason ===
    "invalid_signature",
  "a signature made with the wrong secret is rejected",
);

// THE CRITICAL ONE: the signature must cover the exact bytes.
const tampered = bytes(JSON.stringify({ uid: "abc", status: { state: "ready" }, extra: 1 }));
check(
  verifyStreamSignature(tampered, sign(validBody), SECRET, NOW).reason === "invalid_signature",
  "a body altered after signing is rejected",
);

// Re-serializing parsed JSON changes bytes (key order, spacing) and must fail.
const reserialized = bytes(JSON.stringify(JSON.parse(new TextDecoder().decode(validBody)), null, 2));
check(
  verifyStreamSignature(reserialized, sign(validBody), SECRET, NOW).reason === "invalid_signature",
  "a re-serialized body does not verify, proving raw bytes are required",
);

check(
  verifyStreamSignature(validBody, sign(validBody, NOW - 3600), SECRET, NOW).reason ===
    "stale_timestamp",
  "an old timestamp is rejected as stale",
);
check(
  verifyStreamSignature(validBody, sign(validBody, NOW + 3600), SECRET, NOW).reason ===
    "stale_timestamp",
  "a far-future timestamp is rejected as stale",
);
check(
  verifyStreamSignature(validBody, sign(validBody, NOW - 299), SECRET, NOW).ok,
  "a timestamp inside the tolerance is accepted",
);
check(
  verifyStreamSignature(validBody, sign(validBody, NOW - 301), SECRET, NOW).reason ===
    "stale_timestamp",
  "a timestamp just outside the tolerance is rejected",
);

// Signature is checked BEFORE freshness, so a bad signature never reveals the clock.
check(
  verifyStreamSignature(validBody, sign(validBody, NOW - 99999, "wrong"), SECRET, NOW).reason ===
    "invalid_signature",
  "an old AND wrongly signed request reports the signature failure, not the clock",
);

check(parseSignatureHeader("time=1,sig1=" + "a".repeat(64)) !== null, "a well-formed header parses");
check(parseSignatureHeader("sig1=" + "a".repeat(64)) === null, "a header with no time is rejected");
check(parseSignatureHeader("time=1") === null, "a header with no signature is rejected");
check(
  parseSignatureHeader("time=1,sig1=" + "a".repeat(63)) === null,
  "a short signature is rejected",
);

// Idempotency identifier
check(
  deriveEventId("uid", "ready", "t") === deriveEventId("uid", "ready", "t"),
  "the derived event id is stable for the same transition",
);
check(
  deriveEventId("uid", "ready", "t") !== deriveEventId("uid", "error", "t"),
  "a different transition derives a different event id",
);

// ---------------------------------------------------------------------------
// Bounded body reading
// ---------------------------------------------------------------------------
console.log("\n--- bounded body reader ---");

function makeRequest(chunks, headers = {}) {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return {
    request: { headers: new Headers(headers), body: stream },
    wasCancelled: () => cancelled,
  };
}

const small = bytes("hello");
{
  const { request } = makeRequest([small], { "content-length": "5" });
  const result = await readBoundedBody(request, 64);
  check(result.ok && Buffer.from(result.bytes).equals(Buffer.from(small)), "a small body is read exactly");
}
{
  // HONEST oversized Content-Length: rejected before reading anything.
  const { request } = makeRequest([bytes("x".repeat(100))], { "content-length": "100" });
  const result = await readBoundedBody(request, 64);
  check(!result.ok && result.reason === "too_large", "an honest oversized Content-Length is rejected");
}
{
  // DISHONEST Content-Length: claims small, sends large. The incremental cap
  // is what actually protects us.
  const { request } = makeRequest([bytes("x".repeat(200))], { "content-length": "5" });
  const result = await readBoundedBody(request, 64);
  check(
    !result.ok && result.reason === "too_large",
    "a dishonest Content-Length does not defeat the byte cap",
  );
}
{
  // CANCELLATION, on an ENDLESS stream. makeRequest() above closes its stream
  // immediately, and cancelling an already-closed stream is a no-op - so it
  // cannot observe this. A sender that keeps producing is the case that
  // matters anyway: without cancellation it would keep uploading into a buffer
  // we have already abandoned.
  let cancelled = false;
  let produced = 0;
  const endless = new ReadableStream({
    pull(controller) {
      produced += 1;
      controller.enqueue(bytes("x".repeat(32)));
    },
    cancel() {
      cancelled = true;
    },
  });
  const result = await readBoundedBody({ headers: new Headers(), body: endless }, 64);
  check(!result.ok && result.reason === "too_large", "an endless body is refused at the cap");
  check(cancelled, "the stream is cancelled once the cap is exceeded");
  check(produced < 10, "reading stops promptly rather than draining the sender");
}
{
  // MISSING Content-Length entirely.
  const { request } = makeRequest([bytes("x".repeat(200))]);
  const result = await readBoundedBody(request, 64);
  check(!result.ok && result.reason === "too_large", "a missing Content-Length does not defeat the cap");
}
{
  // MALFORMED Content-Length.
  const { request } = makeRequest([small], { "content-length": "not-a-number" });
  const result = await readBoundedBody(request, 64);
  check(result.ok, "a malformed Content-Length is ignored and the body still read under the cap");
}
{
  // Chunk boundaries must not corrupt the bytes, and newlines must survive.
  const text = '{"a":1}\n{"b":2}\r\n';
  const source = bytes(text);
  const chunks = [source.slice(0, 3), source.slice(3, 9), source.slice(9)];
  const { request } = makeRequest(chunks);
  const result = await readBoundedBody(request, 1024);
  check(
    result.ok && new TextDecoder().decode(result.bytes) === text,
    "bytes and newlines survive chunk reassembly exactly",
  );
}
{
  // A body assembled from chunks must still verify — the end-to-end property.
  const payload = bytes(JSON.stringify({ uid: "chunked", status: { state: "ready" } }));
  const header = sign(payload);
  const { request } = makeRequest([payload.slice(0, 7), payload.slice(7)]);
  const result = await readBoundedBody(request, 1024);
  check(
    result.ok && verifyStreamSignature(result.bytes, header, SECRET, NOW).ok,
    "a chunked body still verifies against its signature",
  );
}
check(parseContentLength("12") === 12, "a plain Content-Length parses");
check(parseContentLength("-1") === null, "a negative Content-Length is treated as absent");
check(parseContentLength(" 12 ") === 12, "a padded Content-Length parses");
check(parseContentLength(null) === null, "an absent Content-Length parses as null");

// ---------------------------------------------------------------------------
// Images delivery-variant safety
// ---------------------------------------------------------------------------
console.log("\n--- images variant safety ---");

const safeVariant = {
  success: true,
  result: { variant: { id: "gallery", neverRequireSignedURLs: false, options: {} } },
};
const unsafeVariant = {
  success: true,
  result: { variant: { id: "gallery", neverRequireSignedURLs: true, options: {} } },
};
const silentVariant = { success: true, result: { variant: { id: "gallery", options: {} } } };

check(assessVariantSafety("gallery", safeVariant, 200).safe, "a variant that requires signatures is safe");
{
  const r = assessVariantSafety("gallery", unsafeVariant, 200);
  check(!r.safe && r.reason === "signed_urls_bypassed", "a bypassing variant is refused");
}
{
  const r = assessVariantSafety("gallery", silentVariant, 200);
  check(
    !r.safe && r.reason === "malformed_response",
    "a variant that does not state its setting is refused, not assumed safe",
  );
}
{
  const r = assessVariantSafety("gallery", { success: true, result: {} }, 404);
  check(!r.safe && r.reason === "variant_not_found", "a missing variant is refused");
}
{
  const r = assessVariantSafety("gallery", null, null);
  check(!r.safe && r.reason === "unverifiable", "an unreachable account is refused");
}
{
  const r = assessVariantSafety("gallery", { success: false, errors: [] }, 200);
  check(!r.safe && r.reason === "unverifiable", "an unsuccessful envelope is refused");
}
{
  const r = assessVariantSafety("gallery", "not-an-object", 200);
  check(!r.safe && r.reason === "malformed_response", "a non-object body is refused");
}
{
  // The account answered about a DIFFERENT variant than the one we asked about.
  const r = assessVariantSafety("gallery", {
    success: true,
    result: { variant: { id: "thumbnail", neverRequireSignedURLs: false } },
  }, 200);
  check(!r.safe && r.reason === "malformed_response", "an answer about another variant is refused");
}
{
  const r = assessVariantSafety("gallery", {
    success: true,
    result: { variant: { id: "gallery", neverRequireSignedURLs: "false" } },
  }, 200);
  check(
    !r.safe && r.reason === "malformed_response",
    "a string 'false' is not accepted as a boolean false",
  );
}
{
  const r = assessVariantSafety("gallery", safeVariant, 500);
  check(!r.safe && r.reason === "unverifiable", "a server error is refused");
}

// ---------------------------------------------------------------------------
// Orphan recovery — fail closed, paginated, re-validated
// ---------------------------------------------------------------------------
console.log("\n--- orphan recovery ---");

const REF = "a".repeat(32);
const ENV = "production";

/** A fully valid Images item: both reference channels, right env, signed. */
const imageItem = (id, over = {}) => ({
  id,
  creator: REF,
  meta: { ref: REF, env: ENV },
  requireSignedURLs: true,
  ...over,
});
const streamItem = (uid, over = {}) => ({
  uid,
  creator: REF,
  meta: { ref: REF, env: ENV },
  requireSignedURLs: true,
  ...over,
});

/** Builds a fetcher over scripted pages, recording the queries it received. */
function pager(pages) {
  const queries = [];
  let call = 0;
  const fetchPage = async (query) => {
    queries.push(query);
    const page = pages[Math.min(call, pages.length - 1)];
    call += 1;
    return typeof page === "function" ? page() : page;
  };
  return { fetchPage, queries, calls: () => call };
}

// ---- query construction ---------------------------------------------------
{
  const q = imagesRecoveryQuery(REF, null);
  check(q instanceof URLSearchParams, "the Images query is built with URLSearchParams, not by hand");
  check(q.get("creator") === REF, "Images recovery filters on creator");
  check(q.get("meta.ref[eq:string]") === REF, "Images recovery also filters on meta.ref[eq:string]");
  check(
    q.toString().includes("meta.ref%5Beq%3Astring%5D"),
    "the bracket syntax is URL-encoded by the URL layer",
  );
  check(q.get("continuation_token") === null, "the first page carries no continuation token");
  check(imagesRecoveryQuery(REF, "tok").get("continuation_token") === "tok",
    "a continuation token is passed on subsequent pages");
}
{
  const nasty = "a&b=c d";
  check(
    imagesRecoveryQuery(nasty, null).toString().includes("a%26b%3Dc+d"),
    "a reference containing separators is encoded, not injected into the query",
  );
}
check(streamRecoveryQuery(REF).get("creator") === REF, "Stream recovery filters on creator");

// ---- per-item re-validation ----------------------------------------------
check(validateImagesCandidate(imageItem("i1"), REF, ENV) === "i1", "a fully valid image validates");
check(
  validateImagesCandidate(imageItem("i1", { creator: "other" }), REF, ENV) === null,
  "an image with the WRONG creator is rejected",
);
check(
  validateImagesCandidate(imageItem("i1", { meta: { ref: "other", env: ENV } }), REF, ENV) === null,
  "an image with the WRONG meta.ref is rejected",
);
check(
  validateImagesCandidate(imageItem("i1", { meta: { ref: REF, env: "preview" } }), REF, ENV) === null,
  "an image from the WRONG environment is rejected",
);
check(
  validateImagesCandidate(imageItem("i1", { requireSignedURLs: false }), REF, ENV) === null,
  "an UNSIGNED image is never recoverable",
);
check(
  validateImagesCandidate(imageItem("i1", { requireSignedURLs: undefined }), REF, ENV) === null,
  "an image that does not state requireSignedURLs is rejected",
);
check(validateImagesCandidate({ creator: REF }, REF, ENV) === null, "an item with no id is rejected");
check(validateImagesCandidate(null, REF, ENV) === null, "a null item is rejected");
check(validateStreamCandidate(streamItem("v1"), REF, ENV) === "v1", "a fully valid video validates");
check(
  validateStreamCandidate(streamItem("v1", { requireSignedURLs: false }), REF, ENV) === null,
  "an UNSIGNED video is never recoverable",
);

// ---- outcomes -------------------------------------------------------------
{
  const { fetchPage } = pager([{ ok: true, items: [], continuationToken: null }]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "no_match", "ZERO matches is 'not found'");
}
{
  const { fetchPage } = pager([{ ok: true, items: [imageItem("i1")], continuationToken: null }]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "recovered" && r.providerAssetId === "i1", "exactly ONE valid match is recoverable");
}
{
  const { fetchPage } = pager([
    { ok: true, items: [imageItem("i1"), imageItem("i2")], continuationToken: null },
  ]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "ambiguous" && r.count === 2, "DUPLICATE valid matches are ambiguous, never auto-resolved");
}
{
  // The same id twice is one asset, not an ambiguity.
  const { fetchPage } = pager([
    { ok: true, items: [imageItem("i1"), imageItem("i1")], continuationToken: null },
  ]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "recovered", "the same id repeated is one asset, not an ambiguity");
}
{
  // Items the provider returned but that fail re-validation are NOT matches.
  const { fetchPage } = pager([
    {
      ok: true,
      items: [
        imageItem("bad1", { creator: "other" }),
        imageItem("bad2", { meta: { ref: "other", env: ENV } }),
        imageItem("bad3", { meta: { ref: REF, env: "preview" } }),
        imageItem("bad4", { requireSignedURLs: false }),
      ],
      continuationToken: null,
    },
  ]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(
    r.status === "no_match",
    "items the provider returned but that fail re-validation are not matches",
  );
}

// ---- failures are never 'not found' ---------------------------------------
for (const [status, reason, description] of [
  [null, "network_error", "a network failure is unresolved, not 'no match'"],
  [401, "auth_error", "a 401 is unresolved, not 'no match'"],
  [403, "auth_error", "a 403 is unresolved, not 'no match'"],
  [404, "api_error", "a 404 on a LIST call is unresolved, not 'no match'"],
  [500, "api_error", "a 500 is unresolved, not 'no match'"],
]) {
  const { fetchPage } = pager([{ ok: false, status }]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "unresolved" && r.reason === reason, description);
}
{
  const fetchPage = async () => {
    throw new Error("socket hang up");
  };
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "unresolved" && r.reason === "network_error", "a thrown fetch is unresolved");
}
{
  const { fetchPage } = pager([{ ok: true, items: "not-an-array", continuationToken: null }]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "unresolved" && r.reason === "parse_error", "an unparsable page is unresolved");
}
check(classifyRecoveryFailure(200) === null, "a 200 is not a failure");

// ---- pagination -----------------------------------------------------------
{
  // The match is on page two: pagination must actually be followed.
  const { fetchPage, calls, queries } = pager([
    { ok: true, items: [], continuationToken: "tok-1" },
    { ok: true, items: [imageItem("i9")], continuationToken: null },
  ]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(r.status === "recovered" && r.providerAssetId === "i9", "pagination is followed to a later page");
  check(calls() === 2, "exactly two requests were made");
  check(queries[1].get("continuation_token") === "tok-1", "the token from page one is sent on page two");
}
{
  // A REPEATED token would loop forever.
  const { fetchPage } = pager([{ ok: true, items: [], continuationToken: "same" }]);
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(
    r.status === "unresolved" && r.reason === "pagination_loop",
    "a repeated continuation token is refused as a loop, not treated as 'no match'",
  );
}
{
  // Distinct tokens for ever: the request cap must stop it.
  let n = 0;
  const fetchPage = async () => {
    n += 1;
    return { ok: true, items: [], continuationToken: `tok-${n}` };
  };
  const r = await recoverImagesAsset(fetchPage, REF, ENV);
  check(
    r.status === "unresolved" && r.reason === "pagination_exhausted",
    "reaching the request cap is unresolved, NOT 'no match'",
  );
  check(n <= MAX_RECOVERY_REQUESTS, "the request cap is strictly enforced");
  check(n <= MAX_RECOVERY_PAGES, "the page cap is strictly enforced");
}
{
  // Stream is a single request; a token on its response changes nothing.
  const { fetchPage, calls } = pager([
    { ok: true, items: [streamItem("v1")], continuationToken: "ignored" },
  ]);
  const r = await recoverStreamAsset(fetchPage, REF, ENV);
  check(r.status === "recovered" && r.providerAssetId === "v1", "Stream recovery resolves in one request");
  check(calls() === 1, "Stream recovery does not paginate");
}

// ---- reference limits -----------------------------------------------------
check(referenceFitsProviderLimits(REF), "a 32-character reference fits every provider limit");
check(!referenceFitsProviderLimits("x".repeat(65)), "an over-long reference is refused");
check(!referenceFitsProviderLimits(""), "an empty reference is refused");
{
  const { fetchPage, calls } = pager([{ ok: true, items: [], continuationToken: null }]);
  const r = await recoverImagesAsset(fetchPage, "x".repeat(65), ENV);
  check(
    r.status === "unresolved" && r.reason === "reference_too_long",
    "an over-long reference is unresolved before any request is made",
  );
  check(calls() === 0, "no request is sent for an over-long reference");
}

// ---- the decision helper --------------------------------------------------
check(decideRecovery([]).status === "no_match", "no ids decides 'not found'");
check(decideRecovery(["one"]).status === "recovered", "one id decides 'recovered'");
check(decideRecovery(["a", "b"]).status === "ambiguous", "two ids decide 'ambiguous'");

// ---------------------------------------------------------------------------
// Destination safety
// ---------------------------------------------------------------------------
console.log("\n--- destination sequence ---");

const EXPIRY = new Date(NOW * 1000 + 1800000);

function makeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    calls,
    reserve: async () => {
      calls.push("reserve");
      return overrides.reserve
        ? overrides.reserve()
        : { ok: true, ledgerId: "ledger-1", opaqueReference: REF };
    },
    createDestination: async (ref) => {
      calls.push("createDestination");
      if (overrides.createDestination) return overrides.createDestination(ref);
      return { providerAssetId: "cf-asset-1", uploadUrl: "https://upload.example/one-time" };
    },
    attach: async (l, a) => {
      calls.push("attach");
      return overrides.attach ? overrides.attach(l, a) : { ok: true };
    },
    deleteAsset: async (a) => {
      calls.push("deleteAsset");
      return overrides.deleteAsset ? overrides.deleteAsset(a) : "deleted";
    },
    recordOrphan: async (l, a, st) => {
      calls.push("recordOrphan");
      return overrides.recordOrphan ? overrides.recordOrphan(l, a, st) : { ok: true };
    },
    markDeleted: async () => {
      calls.push("markDeleted");
    },
    failAttempt: async () => {
      calls.push("failAttempt");
    },
    log: () => {},
  };
  return deps;
}

{
  const deps = makeDeps({ reserve: () => ({ ok: false }) });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "reservation_refused",
    "a refused reservation returns immediately",
  );
  check(
    !deps.calls.includes("createDestination"),
    "NO provider request occurs before the database reservation succeeds",
  );
}
{
  let reserveCalls = 0;
  const deps = makeDeps({
    reserve: () => {
      reserveCalls += 1;
      return reserveCalls === 1
        ? { ok: true, ledgerId: "ledger-1", opaqueReference: REF }
        : { ok: false };
    },
  });
  await runDestinationSequence(deps, EXPIRY);
  const second = await runDestinationSequence(deps, EXPIRY);
  check(
    !second.ok && second.reason === "reservation_refused",
    "a repeated reservation while active cannot create another destination",
  );
  check(
    deps.calls.filter((c) => c === "createDestination").length === 1,
    "only ONE provider destination was ever requested",
  );
}
{
  const deps = makeDeps({ attach: () => ({ ok: false }) });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(!result.ok, "a failed attachment never returns an upload URL");
  check(
    JSON.stringify(result).indexOf("upload.example") === -1,
    "the one-time URL does not leak through the failure result",
  );
}
{
  const deps = makeDeps({ attach: () => ({ ok: false }), deleteAsset: () => "deleted" });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "attachment_orphan_deleted",
    "attachment failure plus successful deletion resolves the orphan",
  );
  check(deps.calls.includes("markDeleted"), "the resolved deletion is recorded");
}
{
  const deps = makeDeps({ attach: () => ({ ok: false }), deleteAsset: () => "not_found" });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "attachment_orphan_deleted",
    "a not_found deletion also resolves the orphan",
  );
}
{
  const order = [];
  const deps = makeDeps({
    attach: () => ({ ok: false }),
    deleteAsset: () => {
      order.push("delete");
      return "failed";
    },
    recordOrphan: (l, a, st) => {
      order.push("orphan:" + a + ":" + st);
      return { ok: true };
    },
  });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "attachment_orphan_recorded",
    "a failed deletion persists the orphan before returning",
  );
  check(
    order.includes("orphan:cf-asset-1:failed"),
    "the provider identifier itself is persisted, not discarded",
  );
  check(
    order.indexOf("delete") < order.indexOf("orphan:cf-asset-1:failed"),
    "deletion is attempted first, and the orphan recorded only if it fails",
  );
}
{
  const deps = makeDeps({
    attach: () => ({ ok: false }),
    deleteAsset: () => {
      throw new Error("boom");
    },
  });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "attachment_orphan_recorded",
    "a thrown deletion is treated as failure and the orphan is still recorded",
  );
}
{
  const deps = makeDeps({
    attach: () => ({ ok: false }),
    deleteAsset: () => "failed",
    recordOrphan: () => ({ ok: false }),
  });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(
    !result.ok && result.reason === "attachment_orphan_unrecoverable",
    "an unrecordable orphan is reported distinctly for operators",
  );
}
{
  const deps = makeDeps();
  const result = await runDestinationSequence(deps, EXPIRY);
  check(result.ok, "a fully successful sequence returns a destination");
  check(
    JSON.stringify(result).indexOf("cf-asset-1") === -1,
    "the provider asset id NEVER reaches the caller, even on success",
  );
  check(
    deps.calls.join(",") === "reserve,createDestination,attach",
    "the sequence is exactly reserve -> create -> attach",
  );
}
{
  const deps = makeDeps({
    createDestination: () => {
      throw new Error("timeout");
    },
  });
  const result = await runDestinationSequence(deps, EXPIRY);
  check(!result.ok && result.reason === "provider_unavailable", "a provider failure is reported");
  check(deps.calls.includes("failAttempt"), "the reservation is closed out rather than left live");
  check(
    !deps.calls.includes("attach"),
    "nothing is attached when the provider never returned an identifier",
  );
}

console.log(`\n${passed} behavioural checks passed, ${failures.length} failed.`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  FAILED: ${failure}`);
  process.exit(1);
}
