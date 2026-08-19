/**
 * Behavioural tests for retention enforcement.
 *
 * These run the REAL functions against fakes. Nothing here contacts
 * Cloudflare, Supabase or the network, and no clock is waited on: the module
 * under test takes the database, the provider, the logger and `now` as
 * parameters, which is what makes the deadline, the failure paths and the
 * ordering guarantees genuinely reachable rather than assumed.
 *
 * Run: node scripts/verify-retention.mjs
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const mod = (relative) => pathToFileURL(join(root, relative)).href;

const {
  runRetentionSweep,
  authorizeCronRequest,
  EXPIRE_BATCH,
  SWEEP_BATCH,
  PURGE_BATCH,
  ATTEMPT_ALERT_THRESHOLD,
} = await import(mod("lib/testimonials/retention-core.ts"));

let passed = 0;
const failures = [];

function check(condition, description) {
  if (condition) passed += 1;
  else failures.push(description);
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

// ---------------------------------------------------------------------------
// A recording fake. Every call the core makes is captured in order, so the
// tests can assert on SEQUENCE — which is where the real guarantees live.
// ---------------------------------------------------------------------------
function makeDeps(overrides = {}) {
  const calls = [];
  const logs = [];
  let clock = 1_000_000;

  const deps = {
    deletable: [],
    purgeable: [],
    deleteResults: {},
    calls,
    logs,
    advanceOnDelete: 0,
    setClock(value) {
      clock = value;
    },

    expiredCount: 0,
    expireThrows: false,
    async expireIntents(limit) {
      calls.push(["expireIntents", limit]);
      if (deps.expireThrows) throw new Error("expiry failed");
      return deps.expiredCount;
    },
    async listDeletable(limit) {
      calls.push(["listDeletable", limit]);
      return deps.deletable;
    },
    async markAttempt(ledgerId, status) {
      calls.push(["markAttempt", ledgerId, status]);
    },
    async deleteAsset(provider, assetId) {
      calls.push(["deleteAsset", provider, assetId]);
      clock += deps.advanceOnDelete;
      const result = deps.deleteResults[assetId];
      if (result === "throw") throw new Error("provider exploded");
      return result ?? "deleted";
    },
    async listPurgeable(limit) {
      calls.push(["listPurgeable", limit]);
      return deps.purgeable;
    },
    async recordPurged(submissionId, status) {
      calls.push(["recordPurged", submissionId, status]);
      if (deps.purgeThrows?.has(submissionId)) throw new Error("refused");
    },
    log(event, code, ledgerId) {
      logs.push({ event, code, ledgerId });
    },
    now: () => clock,
    ...overrides,
  };
  return deps;
}

const asset = (id, extra = {}) => ({
  ledgerId: `ledger-${id}`,
  provider: "cloudflare_images",
  providerAssetId: id,
  reason: "superseded",
  deletionAttemptCount: 0,
  ...extra,
});

const FAR_FUTURE = Number.MAX_SAFE_INTEGER;

// ---------------------------------------------------------------------------
console.log("\n--- scheduler authentication ---");
// ---------------------------------------------------------------------------
const SECRET = "test-cron-secret-not-a-real-credential";

check(authorizeCronRequest(`Bearer ${SECRET}`, SECRET) === "ok", "the correct bearer authorizes");
check(
  authorizeCronRequest(`Bearer ${"x".repeat(SECRET.length)}`, SECRET) === "unauthorized",
  "a wrong secret of EQUAL LENGTH is rejected",
);
check(
  authorizeCronRequest("Bearer short", SECRET) === "unauthorized",
  "a wrong secret of different length is rejected",
);
check(authorizeCronRequest(null, SECRET) === "unauthorized", "a missing header is rejected");
check(authorizeCronRequest("", SECRET) === "unauthorized", "an empty header is rejected");
check(authorizeCronRequest(SECRET, SECRET) === "unauthorized", "a bare secret with no scheme is rejected");
check(
  authorizeCronRequest(`bearer ${SECRET}`, SECRET) === "unauthorized",
  "a lowercase scheme is rejected",
);
check(
  authorizeCronRequest(`Bearer  ${SECRET}`, SECRET) === "unauthorized",
  "an extra space after the scheme is rejected",
);
check(
  authorizeCronRequest(`Bearer ${SECRET} `, SECRET) === "unauthorized",
  "a trailing space is rejected rather than trimmed away",
);

// FAIL CLOSED. There is no header that opens an unconfigured deployment.
for (const [label, secret] of [
  ["undefined", undefined],
  ["null", null],
  ["empty", ""],
  ["whitespace", "   "],
]) {
  check(
    authorizeCronRequest(`Bearer ${SECRET}`, secret) === "unconfigured",
    `a ${label} secret reports unconfigured even for a correct-looking header`,
  );
}
check(
  authorizeCronRequest("Bearer ", "") === "unconfigured",
  "an empty secret is never matched by an empty presented value",
);

// ---------------------------------------------------------------------------
console.log("\n--- expiry, tier 0 ---");
//
// Order is the whole point. An intent expired here stamps media_purge_after
// through the lifecycle trigger, which is what makes its provider media
// visible to the deletion sweep AT ALL. Run afterwards, every abandoned upload
// would spend an extra cycle at the provider.
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.expiredCount = 3;
  deps.deletable = [asset("a")];

  const summary = await runRetentionSweep(deps, FAR_FUTURE);
  const names = deps.calls.map((c) => c[0]);

  check(summary.expired === 3, "expired intents are counted");
  check(names[0] === "expireIntents", "expiry runs FIRST, before anything is listed for deletion");
  check(
    names.indexOf("expireIntents") < names.indexOf("listDeletable"),
    "newly expired intents are swept in the SAME run, not the next one",
  );
  check(
    deps.logs.some((l) => l.event === "retention_expired" && l.code === "count=3"),
    "the expiry count is logged",
  );
}

{
  const deps = makeDeps();
  deps.expiredCount = 0;
  await runRetentionSweep(deps, FAR_FUTURE);
  check(
    !deps.logs.some((l) => l.event === "retention_expired"),
    "a run that expired nothing does not log an expiry line",
  );
}

{
  const deps = makeDeps();
  deps.expireThrows = true;
  deps.deletable = [asset("a")];

  const summary = await runRetentionSweep(deps, FAR_FUTURE);

  check(summary.expired === 0, "a failed expiry counts nothing");
  check(
    deps.calls.some((c) => c[0] === "deleteAsset"),
    "a failed expiry does NOT stop the deletion sweep - assets marked on earlier runs still deserve deleting today",
  );
  check(
    deps.logs.some((l) => l.event === "retention_expire_failed"),
    "a failed expiry is logged rather than swallowed",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- deletion outcomes ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.deletable = [asset("a"), asset("b"), asset("c")];
  deps.deleteResults = { a: "deleted", b: "not_found", c: "throw" };

  const summary = await runRetentionSweep(deps, FAR_FUTURE);

  check(summary.examined === 3, "every listed asset is examined");
  check(summary.deleted === 1, "a deleted asset is counted as deleted");
  check(summary.notFound === 1, "a 404 is counted as SUCCESS, not as a failure");
  check(summary.failed === 1, "a thrown provider error is counted as failed");

  const marks = deps.calls.filter((c) => c[0] === "markAttempt");
  check(marks.length === 6, "each asset is marked exactly twice: pending, then outcome");
  check(
    marks[0][2] === "pending" && marks[1][2] === "deleted",
    "the pending mark precedes the outcome mark",
  );
  check(
    marks[4][2] === "pending" && marks[5][2] === "failed",
    "a failure is still recorded, so the row is not left looking untouched",
  );

  const deletes = deps.calls.filter((c) => c[0] === "deleteAsset").map((c) => c[2]);
  check(
    deletes.join(",") === "a,b,c",
    "a throw on one asset does not stop the ones behind it",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- provider routing ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.deletable = [
    asset("img", { provider: "cloudflare_images" }),
    asset("vid", { provider: "cloudflare_stream" }),
  ];
  await runRetentionSweep(deps, FAR_FUTURE);
  const routed = deps.calls.filter((c) => c[0] === "deleteAsset");
  check(
    routed[0][1] === "cloudflare_images" && routed[1][1] === "cloudflare_stream",
    "each asset is deleted through the provider its LEDGER row names",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the deadline ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.deletable = [asset("a"), asset("b"), asset("c"), asset("d")];
  deps.advanceOnDelete = 100;

  // Budget for two deletions, then the clock is past the deadline.
  const summary = await runRetentionSweep(deps, 1_000_000 + 150);

  check(summary.examined === 2, "the sweep stops starting new deletions at the deadline");
  check(summary.stoppedOnDeadline === true, "the summary says the deadline was reached");
  check(
    deps.calls.filter((c) => c[0] === "deleteAsset").length === 2,
    "no provider call is made after the deadline",
  );
  check(
    deps.calls.filter((c) => c[0] === "markAttempt" && c[1] === "ledger-c").length === 0,
    "an asset never attempted is not marked, so its backoff window does not start",
  );
  check(
    deps.calls.some((c) => c[0] === "listPurgeable"),
    "the submission purge still runs after a deadline-truncated sweep",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- tier ordering ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.deletable = [asset("a")];
  deps.purgeable = [{ submissionId: "sub-1", providerAssetsSeen: 1 }];

  await runRetentionSweep(deps, FAR_FUTURE);

  const names = deps.calls.map((c) => c[0]);
  check(
    names.indexOf("listPurgeable") > names.lastIndexOf("deleteAsset"),
    "the submission purge is listed only AFTER every provider deletion has run",
  );
  check(
    names.indexOf("recordPurged") > names.indexOf("listPurgeable"),
    "a purge is recorded only after the listing that selected it",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the purge record ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.purgeable = [
    { submissionId: "had-media", providerAssetsSeen: 2 },
    { submissionId: "never-had-media", providerAssetsSeen: 0 },
  ];

  const summary = await runRetentionSweep(deps, FAR_FUTURE);

  const recorded = deps.calls.filter((c) => c[0] === "recordPurged");
  check(summary.purged === 2, "every purgeable submission is recorded");
  check(
    recorded[0][2] === "deleted",
    "a submission that HAD provider media records the deletion honestly",
  );
  check(
    recorded[1][2] === "none",
    "a submission that never had provider media records 'none', not a false deletion",
  );
}

{
  const deps = makeDeps();
  deps.purgeable = [
    { submissionId: "refused", providerAssetsSeen: 1 },
    { submissionId: "fine", providerAssetsSeen: 1 },
  ];
  deps.purgeThrows = new Set(["refused"]);

  const summary = await runRetentionSweep(deps, FAR_FUTURE);

  check(summary.purgeRefused === 1, "a database refusal is counted, not swallowed");
  check(summary.purged === 1, "a refusal does not prevent the next submission from being purged");
  check(
    deps.logs.some((l) => l.event === "retention_purge_refused"),
    "a refusal is logged",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- idempotence ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  deps.deletable = [asset("a")];
  await runRetentionSweep(deps, FAR_FUTURE);

  // Second run: the database no longer lists it, because deleted_at is set.
  deps.deletable = [];
  const before = deps.calls.filter((c) => c[0] === "deleteAsset").length;
  await runRetentionSweep(deps, FAR_FUTURE);
  const after = deps.calls.filter((c) => c[0] === "deleteAsset").length;

  check(before === 1 && after === 1, "a second run over drained state issues no provider call");
}

// ---------------------------------------------------------------------------
console.log("\n--- batch limits and attention ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  await runRetentionSweep(deps, FAR_FUTURE);
  const [, deletableLimit] = deps.calls.find((c) => c[0] === "listDeletable");
  const [, purgeLimit] = deps.calls.find((c) => c[0] === "listPurgeable");
  const [, expireLimit] = deps.calls.find((c) => c[0] === "expireIntents");
  check(expireLimit === EXPIRE_BATCH, "the expiry batch is bounded by the module constant");
  check(deletableLimit === SWEEP_BATCH, "the deletable batch is bounded by the module constant");
  check(purgeLimit === PURGE_BATCH, "the purge batch is bounded by the module constant");
  check(SWEEP_BATCH <= 200, "the batch never exceeds the database function's own ceiling");
}

{
  const deps = makeDeps();
  deps.deletable = [
    asset("ok", { deletionAttemptCount: ATTEMPT_ALERT_THRESHOLD - 1 }),
    asset("stuck", { deletionAttemptCount: ATTEMPT_ALERT_THRESHOLD }),
  ];
  const summary = await runRetentionSweep(deps, FAR_FUTURE);

  check(summary.needingAttention === 1, "only a row past the threshold is flagged for attention");
  check(
    summary.examined === 2,
    "a flagged row is still attempted — the threshold alerts, it does not skip",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- logging carries no identifiers or secrets ---");
// ---------------------------------------------------------------------------
{
  const deps = makeDeps();
  // The ledger id must NOT contain the asset id here. The default fixture
  // derives one from the other, which made this assertion pass on a substring
  // of the correlation value rather than on the absence of a leak — a false
  // positive of exactly the kind this suite exists to catch.
  deps.deletable = [asset("cf-secret-asset-id", { ledgerId: "ledger-unrelated-uuid" })];
  deps.purgeable = [{ submissionId: "00000000-0000-4000-8000-000000000001", providerAssetsSeen: 1 }];
  await runRetentionSweep(deps, FAR_FUTURE);

  const serialized = JSON.stringify(deps.logs);
  check(
    !serialized.includes("cf-secret-asset-id"),
    "no log line carries a provider asset id",
  );
  check(
    !serialized.includes("00000000-0000-4000-8000-000000000001"),
    "no log line carries a submission id",
  );
  check(
    deps.logs.some((l) => l.event === "retention_sweep"),
    "a run always emits one summary line",
  );
  check(
    deps.logs.every((l) => l.ledgerId === undefined || l.ledgerId.startsWith("ledger-")),
    "only our own ledger identifiers appear as correlation values",
  );
}

// ---------------------------------------------------------------------------
console.log("\n--- the route, structurally ---");
//
// Properties a behavioural test cannot reach, because they are about what the
// route does NOT contain. Comments are stripped first: this project has
// produced five false passes by matching its own prose.
// ---------------------------------------------------------------------------
{
  const { readFileSync } = await import("node:fs");
  const raw = readFileSync(join(root, "app/api/cron/testimonial-retention/route.ts"), "utf8");
  const stripComments = (text) =>
    text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split(String.fromCharCode(10))
      .filter((line) => !line.trim().startsWith("//"))
      .join(String.fromCharCode(10));
  const route = stripComments(raw);

  check(
    !/x-vercel-cron/i.test(route),
    "the route never consults x-vercel-cron — a header is not an authenticator",
  );
  check(
    !/searchParams|new URL\(|request\.json\(|request\.text\(/.test(route),
    "the route honours NO request input: no query parameters, no body",
  );
  check(
    /authorizeCronRequest\(/.test(route),
    "the route delegates authentication to the tested pure function",
  );
  check(
    route.indexOf("authorizeCronRequest(") < route.indexOf("deletionConfigurationComplete("),
    "authentication runs BEFORE the configuration probe, so an unauthenticated caller cannot enumerate configuration",
  );
  check(
    route.indexOf("authorizeCronRequest(") < route.indexOf("runRetention("),
    "nothing is deleted before the request is authenticated",
  );
  // Line-accurate, not proximity-based. An earlier version of this check used
  // a 200-character window after the secret and matched the word "log" inside
  // logProviderEvent on the NEXT statement - a false positive that would have
  // survived review because it read as a stronger test than it was.
  const routeLines = route.split(String.fromCharCode(10));
  const secretLines = routeLines.filter((line) => line.includes("CRON_SECRET"));
  check(secretLines.length === 1, "the scheduler secret is read in exactly one place");
  check(
    secretLines.every((line) => !/console|logProviderEvent/.test(line)),
    "the secret never appears on a line that logs",
  );
  check(
    /authorizeCronRequest\([\s\S]{0,200}?process\.env\.CRON_SECRET/.test(route),
    "the only thing the secret is passed to is the authorizer",
  );
  const headerLines = routeLines.filter((line) => line.includes('headers.get("authorization")'));
  check(
    headerLines.length === 1 && !/console|logProviderEvent/.test(headerLines[0]),
    "the presented Authorization header is read once and never logged",
  );
  check(
    /export const runtime = "nodejs"/.test(route),
    "the route pins the Node runtime, which node:crypto requires",
  );
  check(
    /export const maxDuration = 300/.test(route) && /DEADLINE_FRACTION/.test(route),
    "the route bounds its own wall clock and derives a deadline from it",
  );
  check(
    /return json\(401/.test(route) && /return json\(503/.test(route) && /return json\(405/.test(route),
    "the documented refusal codes are all present",
  );

  const vercelConfig = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
  const cron = vercelConfig.crons?.find(
    (c) => c.path === "/api/cron/testimonial-retention",
  );
  check(cron !== undefined, "the retention sweep is scheduled in vercel.json");
  check(
    cron?.schedule === "0 * * * *",
    "it runs hourly, which is the latency the retention copy can honestly claim",
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
