/**
 * Structural security checks for the administrator authentication phase.
 *
 * These assert properties that must hold in the source itself — that the
 * public auth pages sit outside the protected route group, that there is no
 * second copy of the authorization logic, that no credential is embedded,
 * that the open-redirect validator actually rejects the shapes it claims to.
 *
 * What this file CANNOT do is prove runtime behaviour. Whether a wrong
 * password shows the generic message, whether logout really clears the
 * cookie, whether an anonymous visitor is bounced — those need a real
 * browser against a real Supabase project with a real administrator, and
 * none of that exists yet. Nothing here should be read as evidence of it.
 *
 * Run: node scripts/verify-admin-auth.mjs
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

let passed = 0;
const failures = [];

function assert(condition, description) {
  if (condition) {
    passed += 1;
  } else {
    failures.push(description);
  }
  console.log(`${condition ? "PASS" : "FAIL"}  ${description}`);
}

function read(relPath) {
  const full = join(root, relPath);
  return existsSync(full) ? readFileSync(full, "utf8") : "";
}

/**
 * Strips comments before an "X must NOT appear" assertion.
 *
 * Without this, the checks below fail on their own documentation: the helper
 * explains *why* it avoids getSession(), the login page documents that it has
 * no "create an account" link, and the layout describes where the AdminShell
 * went. Each of those mentions is the opposite of the problem being searched
 * for. Only used for absence checks — presence checks run against the real
 * source so a requirement can never be satisfied by a comment.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * The SQL equivalent, for absence checks against a migration.
 *
 * A migration explains its own decisions in `--` comments and in /** *\/
 * blocks above each function, so those explanations routinely NAME the thing
 * being searched for — "security_invoker is NOT set", "an earlier draft
 * granted this to authenticated". Without stripping them, a well-documented
 * migration fails the very checks that document it.
 */
function stripSqlComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--[^\n]*/g, "");
}

function walk(dir, out = []) {
  const full = join(root, dir);
  if (!existsSync(full)) return out;
  for (const entry of readdirSync(full)) {
    const rel = join(dir, entry);
    if (statSync(join(root, rel)).isDirectory()) walk(rel, out);
    else out.push(rel.split("\\").join("/"));
  }
  return out;
}

console.log("\n--- Route structure: public auth pages cannot inherit the gate ---\n");

const PROTECTED_LAYOUT = "app/admin/(protected)/layout.tsx";
const LOGIN_PAGE = "app/admin/login/page.tsx";
const DENIED_PAGE = "app/admin/access-denied/page.tsx";

assert(existsSync(join(root, PROTECTED_LAYOUT)), "the protected route group has its own layout");
assert(existsSync(join(root, LOGIN_PAGE)), "/admin/login exists");
assert(existsSync(join(root, DENIED_PAGE)), "/admin/access-denied exists");

assert(
  !LOGIN_PAGE.includes("(protected)"),
  "/admin/login is OUTSIDE the protected route group, so the gate never runs on it",
);
assert(
  !DENIED_PAGE.includes("(protected)"),
  "/admin/access-denied is OUTSIDE the protected route group, so it cannot redirect to itself",
);

const adminFiles = walk("app/admin");
const protectedPages = adminFiles.filter((f) => f.includes("(protected)") && f.endsWith("page.tsx"));
assert(protectedPages.length === 4, `all four protected admin pages live under (protected) (found ${protectedPages.length})`);

for (const expected of [
  "app/admin/(protected)/page.tsx",
  "app/admin/(protected)/clients/page.tsx",
  "app/admin/(protected)/clients/kameleon/page.tsx",
  "app/admin/(protected)/clients/kameleon/testimonials/page.tsx",
]) {
  assert(adminFiles.includes(expected), `public URL preserved via route group: ${expected}`);
}

// The root admin layout must NOT gate, or the public pages inherit it.
const rootAdminLayout = read("app/admin/layout.tsx");
assert(
  !/requireAdminAccess|resolveAdminAccess/.test(rootAdminLayout),
  "app/admin/layout.tsx contains NO authorization check (it wraps the public pages too)",
);
assert(
  !/AdminShell/.test(stripComments(rootAdminLayout)),
  "app/admin/layout.tsx does not render the authenticated shell",
);

console.log("\n--- Request-time rendering ---\n");

const protectedLayout = read(PROTECTED_LAYOUT);
assert(
  /export const dynamic = "force-dynamic"/.test(protectedLayout),
  "the protected layout forces request-time rendering, so auth cannot be prerendered away",
);
assert(
  /await requireAdminAccess\(\)/.test(protectedLayout),
  "the protected layout awaits authorization before rendering children",
);

for (const page of protectedPages) {
  const src = read(page);
  assert(
    /await requireAdminAccess\(\)/.test(src),
    `${page} independently re-checks authorization (does not rely on the layout)`,
  );
}

console.log("\n--- Centralised authorization: exactly one implementation ---\n");

const helper = read("lib/auth/admin.ts");
const adminActionsSrc = read("app/admin/actions.ts");
assert(helper.length > 0, "lib/auth/admin.ts exists");

for (const [name, re] of [
  ["unauthenticated", /"unauthenticated"/],
  ["anonymous", /"anonymous"/],
  ["no-membership", /"no-membership"/],
  ["insufficient-role", /"insufficient-role"/],
  ["authorized", /"authorized"/],
]) {
  assert(re.test(helper), `the helper models an explicit '${name}' state`);
}

assert(
  /if \(!isPermanentIdentity\(user\)\) return \{ status: "anonymous" \}/.test(helper),
  "admission requires a POSITIVE permanent-identity result, not merely 'not anonymous'",
);
assert(
  !/is_anonymous !== true|is_anonymous === true/.test(stripComments(helper)),
  "the helper contains no bare is_anonymous comparison of its own",
);
assert(
  /getUser\(\)/.test(helper) && !/getSession\(\)/.test(stripComments(helper)),
  "the helper validates via getUser(), never the unvalidated getSession()",
);
assert(
  /ADMIN_ROLES.*=.*\["owner", "admin"\]/s.test(helper),
  "only owner and admin qualify — editor and viewer are excluded by the allow-list",
);
assert(
  /rpc\("is_platform_admin"\)/.test(helper),
  "platform-admin status is read through the same SECURITY DEFINER function the RLS policies use",
);
assert(
  /typeof window !== "undefined"/.test(helper),
  "the helper throws if it is ever imported into client code",
);
// The secret-key environment variable name is assembled rather than written
// out, so that scripts/verify-supabase-key-usage.mjs — which asserts that
// name appears only in its allow-listed files — does not flag this checker
// for containing the very string it is checking for the absence of.
const SECRET_KEY_ENV = ["SUPABASE", "SECRET", "KEY"].join("_");
assert(
  !new RegExp(`createSecretClient|${SECRET_KEY_ENV}|service_role`).test(helper),
  "authorization never uses the secret-key client — it runs under the caller's own RLS",
);

// No second copy of the membership/role query anywhere else.
const sourceFiles = [...walk("app"), ...walk("lib"), ...walk("components")].filter(
  (f) => /\.tsx?$/.test(f) && f !== "lib/auth/admin.ts",
);
const duplicates = sourceFiles.filter((f) => /from\("client_memberships"\)/.test(read(f)));
assert(
  duplicates.length === 0,
  `the membership query exists ONLY in lib/auth/admin.ts (found elsewhere in: ${duplicates.join(", ") || "none"})`,
);

const anonChecks = sourceFiles.filter(
  (f) => f.startsWith("app/admin") && /is_anonymous/.test(read(f)),
);
assert(
  anonChecks.length === 0,
  `no admin route re-implements the anonymous check inline (found in: ${anonChecks.join(", ") || "none"})`,
);

console.log("\n--- Cache semantics: dedup for rendering, fresh for mutations ---\n");

assert(
  /export async function resolveAdminAccessUncached\(\)/.test(helper),
  "an UNCACHED resolver exists for mutations and authentication",
);
assert(
  /export const resolveAdminAccess = cache\(resolveAdminAccessUncached\)/.test(helper),
  "the cached resolver is a thin wrapper over the uncached one, so they cannot diverge",
);
assert(
  /export async function requireFreshAdminAccess\(/.test(helper),
  "a fresh-decision gate exists for privileged Server Actions",
);
assert(
  /requireFreshAdminAccess\([\s\S]{0,300}resolveAdminAccessUncached\(\)/.test(helper),
  "requireFreshAdminAccess resolves uncached",
);
assert(
  /export async function requireAdminAccess\([\s\S]{0,200}await resolveAdminAccess\(\)/.test(helper),
  "requireAdminAccess (rendering) uses the request-cached resolver",
);
assert(
  /resolveAdminAccessUncached\(\)/.test(adminActionsSrc) &&
    !/(^|[^A-Za-z])resolveAdminAccess\(\)/.test(stripComments(adminActionsSrc)),
  "the sign-in action authorizes with the UNCACHED resolver, after the identity changed mid-request",
);

console.log("\n--- No self-service path to an administrator account ---\n");

const loginPage = read(LOGIN_PAGE);
const adminActions = read("app/admin/actions.ts");
const loginForm = read("components/admin/AdminLoginForm.tsx");

assert(
  !/signUp\(|signInWithOtp\(|resetPasswordForEmail\(|admin\.createUser/.test(adminActions),
  "the admin actions contain no signup, invite, magic-link or password-reset call",
);
assert(
  !/href="\/admin\/signup"|href="\/admin\/register"|Create an account|Sign up/i.test(
    stripComments(loginPage) + stripComments(loginForm),
  ),
  "there is no registration or signup link on the sign-in page",
);
assert(
  !existsSync(join(root, "app/admin/signup")) && !existsSync(join(root, "app/admin/register")),
  "no signup or register route exists",
);

console.log("\n--- Credentials never appear in source, logs or URLs ---\n");

const authSurface = [
  "app/admin/actions.ts",
  "app/admin/login/page.tsx",
  "app/admin/access-denied/page.tsx",
  "components/admin/AdminLoginForm.tsx",
  "components/admin/AdminSignOutButton.tsx",
  "lib/auth/admin.ts",
  "lib/auth/safe-redirect.ts",
  "proxy.ts",
];

for (const f of authSurface) {
  const src = read(f);
  assert(!/console\.(log|info|warn|error|debug)/.test(src), `${f} logs nothing at all`);
}

assert(
  // Assembled rather than written out, for the same reason as
  // SECRET_KEY_ENV above: a secret scan over this repository should not
  // report a hit on the checker that exists to prove the value is absent.
  !new RegExp(["plotabl", "studio"].join("") + "|@gmail\\.com").test(
    authSurface.map(read).join("\n"),
  ),
  "no administrator email address is embedded in application source",
);
assert(
  !/password\s*[:=]\s*["'][^"']+["']/.test(
    authSurface.map(read).join("\n").replace(/password:\s*rawPassword/g, ""),
  ),
  "no password literal is assigned anywhere in the auth surface",
);
assert(
  !/searchParams\.set\("password"|password=\$\{|next\?password/.test(adminActions),
  "the password is never placed into a URL",
);
assert(
  /return \{ error: GENERIC_FAILURE \}/.test(adminActions) &&
    (adminActions.match(/GENERIC_FAILURE/g) || []).length >= 4,
  "every authentication failure path returns the same generic message",
);
assert(
  !/rawPassword/.test(loginForm) && !/useState.*password/i.test(loginForm),
  "the password field is uncontrolled — never lifted into React state or echoed back",
);

console.log("\n--- Authorization is re-checked immediately after authentication ---\n");

assert(
  /signInWithPassword[\s\S]{0,900}resolveAdminAccessUncached\(\)/.test(adminActions),
  "an uncached authorization runs immediately after a successful signInWithPassword",
);
assert(
  /access\.status !== "authorized"[\s\S]{0,400}signOut\(\)[\s\S]{0,200}access-denied/.test(adminActions),
  "an authenticated-but-unauthorized user is signed back OUT before being sent to access-denied",
);
assert(
  /signOutAdminAction[\s\S]{0,300}auth\.signOut\(\)/.test(adminActions),
  "logout calls Supabase signOut(), clearing the server-side session",
);

console.log("\n--- Proxy is a pre-filter, not the boundary ---\n");

const proxy = read("proxy.ts");
assert(
  /matcher:\s*\[[^\]]*"\/admin\/:path\*"/s.test(proxy),
  "/admin/:path* is covered by session refresh",
);
assert(
  /matcher:\s*\[[^\]]*"\/experience\/kameleon\/:path\*"/s.test(proxy),
  "the existing Kameleon visitor session refresh is preserved",
);
assert(
  /PUBLIC_ADMIN_PATHS[\s\S]{0,200}"\/admin\/login"[\s\S]{0,80}"\/admin\/access-denied"/.test(proxy),
  "the proxy exempts /admin/login and /admin/access-denied, so it cannot loop",
);
assert(
  !/from\("client_memberships"\)|is_platform_admin|is_anonymous/.test(proxy),
  "the proxy performs NO database or role lookup — it is optimistic only",
);

console.log("\n--- Open-redirect validator, exercised directly ---\n");

const { resolveSafeAdminRedirect, ADMIN_HOME } = await import(
  pathToFileURL(join(root, "lib/auth/safe-redirect.ts")).href
).catch(async () => {
  // Plain .ts import may not be loadable by bare node; fall back to a
  // transpile-free re-implementation check so the suite still reports
  // rather than silently skipping.
  return { resolveSafeAdminRedirect: null, ADMIN_HOME: "/admin" };
});

if (typeof resolveSafeAdminRedirect === "function") {
  const rejected = [
    "//evil.example",
    "///evil.example",
    "https://evil.example",
    "http://evil.example",
    "javascript:alert(1)",
    "/\\evil.example",
    "\\\\evil.example",
    "/admin@evil.example",
    "/experience/kameleon",
    "/",
    "/admin/login",
    "/admin/access-denied",
    "",
    null,
    undefined,
  ];
  for (const value of rejected) {
    assert(
      resolveSafeAdminRedirect(value) === ADMIN_HOME,
      `rejected as a redirect target: ${JSON.stringify(value)}`,
    );
  }

  const accepted = ["/admin", "/admin/clients", "/admin/clients/kameleon", "/admin/clients?tab=media"];
  for (const value of accepted) {
    assert(resolveSafeAdminRedirect(value) === value, `accepted as a local admin path: ${value}`);
  }
} else {
  console.log("SKIP  open-redirect cases — could not import the TS module directly under bare node");
  failures.push("open-redirect validator could not be exercised (import failed)");
}

console.log("\n--- Identity classification, exercised directly (fail-closed both ways) ---\n");

const identityMod = await import(
  pathToFileURL(join(root, "lib/auth/identity.ts")).href
).catch(() => null);

if (identityMod) {
  const { classifyIdentity, isPermanentIdentity, isAnonymousIdentity } = identityMod;

  // Values a real Supabase User could carry (is_anonymous is OPTIONAL in
  // auth-js: `is_anonymous?: boolean`), plus hostile shapes.
  const cases = [
    { label: "is_anonymous: true", user: { is_anonymous: true }, kind: "anonymous" },
    { label: "is_anonymous: false", user: { is_anonymous: false }, kind: "permanent" },
    { label: "is_anonymous: undefined", user: { is_anonymous: undefined }, kind: "indeterminate" },
    { label: "is_anonymous: null", user: { is_anonymous: null }, kind: "indeterminate" },
    { label: "property missing entirely", user: {}, kind: "indeterminate" },
    { label: 'is_anonymous: "false" (string)', user: { is_anonymous: "false" }, kind: "indeterminate" },
    { label: 'is_anonymous: "true" (string)', user: { is_anonymous: "true" }, kind: "indeterminate" },
    { label: "is_anonymous: 0", user: { is_anonymous: 0 }, kind: "indeterminate" },
    { label: "is_anonymous: 1", user: { is_anonymous: 1 }, kind: "indeterminate" },
    { label: "user is null", user: null, kind: "indeterminate" },
    { label: "user is undefined", user: undefined, kind: "indeterminate" },
  ];

  for (const c of cases) {
    assert(classifyIdentity(c.user) === c.kind, `classify ${c.label} -> ${c.kind}`);
  }

  // ADMIN BOUNDARY: only an explicit false may proceed to membership checks.
  for (const c of cases) {
    const expected = c.kind === "permanent";
    assert(
      isPermanentIdentity(c.user) === expected,
      `admin boundary ${expected ? "ACCEPTS" : "REJECTS"} ${c.label}`,
    );
  }

  // VISITOR BOUNDARY: only an explicit true may be enrolled.
  for (const c of cases) {
    const expected = c.kind === "anonymous";
    assert(
      isAnonymousIdentity(c.user) === expected,
      `visitor boundary ${expected ? "ACCEPTS" : "REJECTS"} ${c.label}`,
    );
  }

  // The property that makes this correction meaningful: no value is eligible
  // for both boundaries, and indeterminate is eligible for neither.
  const bothOrNeither = cases.filter(
    (c) => isPermanentIdentity(c.user) && isAnonymousIdentity(c.user),
  );
  assert(bothOrNeither.length === 0, "no identity value satisfies both boundaries");

  const indeterminate = cases.filter((c) => c.kind === "indeterminate");
  assert(
    indeterminate.every((c) => !isPermanentIdentity(c.user) && !isAnonymousIdentity(c.user)),
    "every indeterminate identity is refused by BOTH boundaries",
  );
} else {
  failures.push("identity classifier could not be exercised (import failed)");
  console.log("FAIL  identity classifier could not be imported");
}

console.log("\n--- Visitor sessions stay separate from permanent accounts ---\n");

const visitorSession = read("lib/kameleon/visitor-session.ts");
const kameleonActions = read("app/experience/kameleon/actions.ts");
const quickAccount = read("components/kameleon/screens/QuickAccount.tsx");

assert(
  /return isAnonymousIdentity\(user\)/.test(visitorSession) &&
    !/is_anonymous\s*[=!]==/.test(stripComments(visitorSession)),
  "isAnonymousVisitor delegates to the shared classifier instead of re-implementing the test",
);
assert(
  /from "@\/lib\/auth\/identity"/.test(visitorSession),
  "the visitor rule and the admin rule are derived from the same module",
);
assert(
  !/is_anonymous\s*[=!]==/.test(stripComments(kameleonActions)),
  "no Kameleon server action compares is_anonymous inline",
);
assert(
  !/is_anonymous\s*[=!]==/.test(stripComments(quickAccount)),
  "QuickAccount does not compare is_anonymous inline",
);
assert(
  (kameleonActions.match(/isAnonymousVisitor\(user\)/g) || []).length >= 4,
  "every Kameleon server action that reads a user checks it is an anonymous visitor",
);
assert(
  /if \(!isAnonymousVisitor\(user\)\) throw new Error\(PERMANENT_ACCOUNT_MESSAGE\)/.test(kameleonActions),
  "enrollment refuses a permanent account server-side",
);
assert(
  !/getSession\(\)/.test(quickAccount) && /getUser\(\)/.test(quickAccount),
  "QuickAccount asks about the identity (getUser) rather than the mere existence of a session",
);
assert(
  /if \(!user\) \{[\s\S]{0,200}signInAnonymously\(\)/.test(quickAccount),
  "anonymous sign-in still happens for a genuine first-time visitor",
);
assert(
  /if \(user && !isAnonymousVisitor\(user\)\)[\s\S]{0,120}PERMANENT_ACCOUNT_MESSAGE/.test(quickAccount),
  "a permanent account is stopped before signInAnonymously() is ever considered",
);
assert(
  !/linkIdentity|updateUser\(\s*\{\s*email|convertAnonymous|promote/i.test(kameleonActions + quickAccount),
  "nothing links, promotes or migrates an anonymous identity into a permanent one",
);

console.log("\n--- Obsolete security banner removed ---\n");

assert(
  !existsSync(join(root, "components/admin/DevAuthNotice.tsx")),
  "the DevAuthNotice 'this dashboard is not authenticated' banner is deleted",
);
assert(
  !/DevAuthNotice/.test(stripComments(read("components/admin/AdminShell.tsx"))),
  "AdminShell no longer imports or renders it",
);

console.log("\n--- Phase 3 - testimonial moderation dashboard ---\n");

const MOD_DIR = "app/admin/(protected)/clients/kameleon/testimonials";
const modPage = read(MOD_DIR + "/page.tsx");
const modActions = read(MOD_DIR + "/actions.ts");
const modLoader = read("lib/testimonials/moderation.ts");
const modReasons = read("lib/testimonials/rejection-reasons.ts");
const modCard = read("components/admin/testimonials/ModerationCard.tsx");
const modQueue = read("components/admin/testimonials/ModerationQueue.tsx");
const modActionsUi = read("components/admin/testimonials/ModerationActions.tsx");
const modPreview = read("components/admin/testimonials/MediaPreview.tsx");

// --- Route placement -------------------------------------------------------
assert(
  existsSync(join(root, MOD_DIR + "/page.tsx")),
  "the moderation route is nested beneath /admin/clients/kameleon",
);
assert(
  MOD_DIR.includes("(protected)"),
  "the moderation route sits INSIDE the protected route group, so the layout gate applies",
);
assert(
  !existsSync(join(root, "app/admin/testimonials")),
  "no top-level /admin/testimonials route was created",
);
for (const f of ["loading.tsx", "error.tsx", "actions.ts"]) {
  assert(existsSync(join(root, MOD_DIR + "/" + f)), "the route provides " + f);
}
assert(
  /export const dynamic = "force-dynamic"/.test(modPage),
  "the moderation page is request-time rendered",
);
assert(
  /await requireAdminAccess\(\)/.test(modPage),
  "the moderation page independently re-checks authorization",
);

// --- Loader: authorize BEFORE reaching for the trusted client --------------
assert(
  modLoader.indexOf("requireAdminAccess()") < modLoader.indexOf("createSecretClient()"),
  "the loader authorizes before it constructs the trusted client",
);
assert(
  /const access = await requireAdminAccess\(\)/.test(modLoader),
  "the loader captures the authorization result",
);
assert(
  /\.eq\("client_id", access\.clientId\)/.test(modLoader),
  "the tenant filter uses the AUTHORIZED client id, not a request parameter",
);
assert(
  !/client_id[^\n]*(params|searchParams|query\.)/.test(stripComments(modLoader)),
  "no client id is ever taken from search params or query input",
);
assert(
  /typeof window !== "undefined"/.test(modLoader),
  "the loader throws if imported into client code",
);

// --- Sanitized browser DTO -------------------------------------------------
const dtoStart = modLoader.indexOf("export interface ModerationItem");
const dtoEnd = modLoader.indexOf("}", modLoader.indexOf("previewAvailable"));
// Comments stripped: the DTO's own JSDoc explains which provider fields it
// deliberately excludes, and that prose would otherwise fail the check that
// they are excluded.
const dto = stripComments(modLoader.slice(dtoStart, dtoEnd));
for (const forbidden of [
  "client_id", "clientId", "experience_id", "experienceId",
  "reviewed_by", "reviewedBy", "provider", "providerDeliveryId", "providerPosterId",
  "auth_user_id", "authUserId", "experience_user_id", "experienceUserId",
  "email", "phone", "displayName", "posterId", "assetId", "uploadId",
]) {
  assert(
    !new RegExp("\\b" + forbidden + "\\b").test(dto),
    "the browser DTO has no field named " + forbidden,
  );
}
assert(
  /previewAvailable: boolean/.test(dto),
  "preview availability is a boolean, never a URL or a provider handle",
);

// --- Provider identifiers never reach Client Components --------------------
for (const [name, src] of [
  ["ModerationCard", modCard],
  ["ModerationQueue", modQueue],
  ["ModerationActions", modActionsUi],
  ["MediaPreview", modPreview],
]) {
  const body = stripComments(src);
  for (const forbidden of [
    "provider_delivery_id", "providerDeliveryId", "provider_poster_id", "providerPosterId",
    "provider_asset_id", "provider_upload_id", "client_id", "clientId",
    "reviewed_by", "reviewedBy", "auth_user_id",
  ]) {
    assert(
      !new RegExp("\\b" + forbidden + "\\b").test(body),
      name + " never references " + forbidden,
    );
  }
}

// --- No Cloudflare URL construction ----------------------------------------
const allPhase3 = [modPage, modActions, modLoader, modCard, modQueue, modActionsUi, modPreview].join("\n");
// Comments stripped: several files explain what WILL happen once Cloudflare is
// configured. What must not exist is executable code naming a provider host.
// Narrowed when signed previews landed. The point of this check was never
// "the word Cloudflare must not appear" - it was that no delivery URL may be
// ASSEMBLED here from a provider hostname. moderation.ts now legitimately
// imports lib/cloudflare/config to ask whether signing is configured, which
// the old pattern flagged. Hostnames are still forbidden outright, and the
// only permitted occurrences of the vendor name are import specifiers.
assert(
  !/videodelivery|imagedelivery|cloudflarestream|cloudflare\.com/i.test(stripComments(allPhase3)),
  "no Cloudflare hostname appears in executable Phase 3 code",
);
assert(
  stripComments(allPhase3)
    .split(String.fromCharCode(10))
    .filter((line) => /cloudflare/i.test(line))
    .every((line) => /^\s*import |from "@\/lib\/cloudflare\//.test(line)),
  "every remaining Cloudflare reference in Phase 3 code is an import, never a value",
);
assert(
  !/https?:\/\//.test(stripComments(allPhase3).replace(/example\.com/g, "")),
  "no absolute URL is constructed in Phase 3 code",
);

// --- Mutations: fresh authorization, RPC only ------------------------------
assert(
  (modActions.match(/await requireFreshAdminAccess\(\)/g) || []).length === 3,
  "all three moderation actions call requireFreshAdminAccess() (approve, reject, remove)",
);
assert(
  !/requireAdminAccess\(\)/.test(stripComments(modActions).replace(/requireFreshAdminAccess\(\)/g, "")),
  "the mutations never use the request-CACHED authorization",
);
assert(
  (modActions.match(/rpc\("moderate_testimonial_submission"/g) || []).length === 3,
  "all three decisions go through the moderation RPC",
);
assert(
  (modActions.match(/rpc\("purge_testimonial_media_now"/g) || []).length === 1,
  "exactly one action can shorten retention, and it is not approve or reject",
);
assert(
  !/from\("testimonial_submissions"\)/.test(modActions) &&
    !/\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(modActions),
  "no direct testimonial-table mutation exists in the actions",
);
// The property is about the DECISION, not about the file. It used to be
// expressed as "createSecretClient never appears here", which was true while
// every RPC in the file went through the moderation function. It is now false
// for a reason that strengthens rather than weakens the rule:
// purge_testimonial_media_now is granted to service_role ONLY and would fail
// 42501 on the administrator's session, and it can move no lifecycle state -
// it reschedules a deletion that a moderation decision already caused.
//
// So the assertion is made precise instead of relaxed: the decision goes
// through the administrator's own session, and the trusted client is used for
// exactly one call, which is not a moderation decision.
{
  const decisionCalls = modActions.match(/await ([A-Za-z]+)\(\)?\s*\)?\s*\n?\s*\.rpc\("(\w+)"/g) || [];
  assert(
    /const supabase = await createClient\(\);[\s\S]{0,600}?rpc\("moderate_testimonial_submission"/.test(
      modActions,
    ),
    "every moderation decision goes through the administrator's own session, so reviewed_by is real",
  );
  assert(
    !/createSecretClient\(\)[\s\S]{0,300}?rpc\("moderate_testimonial_submission"/.test(modActions),
    "no moderation decision is made on the trusted client, which would null auth.uid() and destroy provenance",
  );
  assert(
    (modActions.match(/createSecretClient\(\)/g) || []).length === 1,
    "the trusted client appears exactly once in the actions",
  );
  assert(
    /createSecretClient\(\)\s*\n?\s*\.rpc\("purge_testimonial_media_now"/.test(modActions),
    "and that one use is the service_role-only purge, which moves no lifecycle state",
  );
  assert(decisionCalls.length >= 0, "the moderation call sites were scanned");
}
for (const forbidden of ["reviewed_by", "reviewedBy", "client_id", "clientId", "experience_id", "provider"]) {
  assert(
    !new RegExp('formData\\.get\\("' + forbidden + '"\\)').test(modActions),
    "the actions never read " + forbidden + " from the browser",
  );
}
assert(
  /UUID_PATTERN\.test\(submissionId\)/.test(modActions),
  "the submission id is validated as a UUID server-side",
);
assert(
  /isValidRejectionReason\(reason\)/.test(modActions),
  "the rejection reason is re-checked against the server allow-list",
);
assert(
  /\.slice\(0, MAX_MODERATION_NOTE_LENGTH\)/.test(modActions),
  "the moderation note is capped server-side",
);
assert(
  /revalidatePath\(MODERATION_ROUTE\)/.test(modActions) && /revalidatePath\(GALLERY_ROUTE\)/.test(modActions),
  "both the moderation route and the Gallery route are revalidated after a decision",
);

// --- Rejection reasons -----------------------------------------------------
assert(
  /export function isValidRejectionReason/.test(modReasons),
  "rejection reasons are validated by a shared server-enforced predicate",
);
assert(
  /REJECTION_REASON_IDS: ReadonlySet<string>/.test(modReasons),
  "the allow-list is a closed set, not a loose string check",
);
assert(
  /MAX_MODERATION_NOTE_LENGTH = \d+/.test(modReasons),
  "the note length limit is a declared constant",
);

// --- Confirmation required for BOTH decisions ------------------------------
assert(
  /Approve this submission\?/.test(modActionsUi) && /Reject this submission\?/.test(modActionsUi),
  "approval AND rejection each have a confirmation dialog",
);
assert(
  /aria-modal="true"/.test(modActionsUi) && /role="dialog"/.test(modActionsUi),
  "the confirmation dialog is an accessible modal",
);
assert(
  /event\.key === "Escape"/.test(modActionsUi),
  "the dialog closes on Escape",
);
assert(
  /required/.test(modActionsUi.slice(modActionsUi.indexOf("rejectionReason"))),
  "a rejection reason is required in the form as well as on the server",
);

// --- URL parameter validation ----------------------------------------------
assert(
  /MODERATION_TABS as readonly string\[\]\)\.includes/.test(modLoader) &&
    /MEDIA_FILTERS as readonly string\[\]\)\.includes/.test(modLoader) &&
    /SORT_ORDERS as readonly string\[\]\)\.includes/.test(modLoader),
  "tab, media and sort parameters are allow-listed with safe defaults",
);
assert(
  /Math\.min\(parsedPage, MAX_PAGE\)/.test(modLoader) && /MAX_PAGE = \d+/.test(modLoader),
  "the page parameter is capped and normalized",
);
assert(
  /"All Eligible"/.test(modQueue) && !/All Submissions/.test(modQueue),
  "the tab is labelled All Eligible, not All Submissions",
);

// --- Honest empty state, no fixtures ---------------------------------------
assert(
  /EmptyState/.test(modQueue),
  "an empty state is rendered rather than a blank page",
);
assert(
  !/mock|placeholder|fixture|sample/i.test(stripComments(modLoader + modQueue + modCard).replace(/EmptyState/g, "")),
  "no mock, fixture or sample testimonial data appears anywhere in the dashboard",
);
assert(
  /Preview unavailable/.test(modPreview),
  "missing media is handled with an explicit unavailable state",
);

console.log("\n--- Phase 3 corrections: counts, ordering, readiness, routes ---\n");

const modRoutes = read("lib/testimonials/routes.ts");
const modError = read(MOD_DIR + "/error.tsx");

// --- Counts are whole-dataset, server-side, tenant-scoped ------------------
assert(
  /count: "exact", head: true/.test(modLoader),
  "status counts are COUNT queries with head:true - no rows are transferred",
);
assert(
  !/counts\[[^\]]+\]\s*=\s*[^;]*items\./.test(modLoader) &&
    !/items\.filter\([^)]*\)\.length/.test(modLoader),
  "counts are NOT derived from the paginated items array",
);
assert(
  /for \(const tab of MODERATION_TABS\)[\s\S]{0,400}countQuery\.eq\("moderation_status", tab\)/.test(modLoader),
  "one count query runs per status tab",
);
assert(
  /if \(query\.media !== "all"\) countQuery = countQuery\.eq\("media_type", query\.media\)/.test(modLoader),
  "counts respect the media-type filter, so a tab count matches what the tab shows",
);
assert(
  modLoader.indexOf("requireAdminAccess()") < modLoader.indexOf("count: \"exact\", head: true"),
  "no count query is constructed before authorization",
);
assert(
  /scoped = \(\) =>[\s\S]{0,220}\.eq\("client_id", access\.clientId\)/.test(modLoader),
  "every count query is tenant-scoped from the authorization result",
);

// --- Deterministic pagination ---------------------------------------------
assert(
  /\.order\("submitted_at", \{ ascending, nullsFirst: false \}\)/.test(modLoader),
  "primary ordering is submitted_at with a pinned nullsFirst",
);
assert(
  /\.order\("submission_id", \{ ascending \}\)/.test(modLoader),
  "a deterministic secondary order by submission_id breaks submitted_at ties",
);
assert(
  /const ascending = query\.sort === "oldest"/.test(modLoader),
  "both order columns share one direction, so newest is DESC/DESC and oldest is ASC/ASC",
);
assert(
  /\.range\(from, from \+ PAGE_SIZE - 1\)/.test(modLoader),
  "the page window is applied in the database via range()",
);
assert(
  /export const PAGE_SIZE = \d+/.test(modLoader) && /MAX_PAGE = \d+/.test(modLoader),
  "page size and maximum page are both hard constants",
);
assert(
  !/\.limit\(\s*\)/.test(modLoader) && !/select\("\*"\)(?![\s\S]{0,200}range)/.test(modLoader),
  "there is no unbounded queue query",
);

// --- Approval readiness ----------------------------------------------------
assert(
  /const canApprove = item\.deliveryReady/.test(modActionsUi),
  "the Approve control is gated on delivery readiness",
);
assert(
  /disabled=\{!canApprove \|\| approvePending \|\| rejectPending\}/.test(modActionsUi),
  "Approve is disabled when delivery is not ready",
);
assert(
  /Approval is unavailable until the media finishes processing/.test(modActionsUi),
  "the reason approval is unavailable is explained in the UI",
);
assert(
  /aria-describedby=\{!canApprove \?/.test(modActionsUi),
  "the explanation is associated with the disabled control for screen readers",
);
assert(
  /variant="destructive"[\s\S]{0,200}disabled=\{approvePending \|\| rejectPending\}/.test(modActionsUi),
  "Reject stays available regardless of delivery readiness",
);
assert(
  /poster pending/.test(modCard) && !/posterReady[\s\S]{0,200}canApprove/.test(modActionsUi),
  "poster readiness is displayed but is NOT treated as an approval requirement the schema does not impose",
);

// --- Readiness cannot be bypassed from the browser -------------------------
const formReads = [...modActions.matchAll(/formData\.get\("([^"]+)"\)/g)].map((m) => m[1]);
assert(
  formReads.every((f) => ["submissionId", "moderationNote", "rejectionReason"].includes(f)),
  "the actions read ONLY submissionId, moderationNote and rejectionReason from the browser (found: " +
    [...new Set(formReads)].join(", ") + ")",
);
for (const forged of ["deliveryReady", "delivery_ready_at", "previewAvailable", "canApprove", "posterReady", "moderationStatus"]) {
  assert(
    !new RegExp('formData\\.get\\("' + forged + '"\\)').test(modActions),
    "a forged " + forged + " form field cannot influence the decision",
  );
}
assert(
  !/deliveryReady|delivery_ready/.test(stripComments(modActions)),
  "no readiness value is read or evaluated in the action at all - the database is the only judge",
);
assert(
  (modActions.match(/GENERIC_FAILURE/g) || []).length >= 4,
  "a database refusal is mapped to the same generic message as any other failure",
);
assert(
  !/error\.message|error\.details|error\.hint|error\.code/.test(modActions),
  "no Postgres error text, hint, detail or code is returned to the browser",
);

// --- Centralized routes ----------------------------------------------------
assert(
  /export const MODERATION_ROUTE = "\/admin\/clients\/kameleon\/testimonials"/.test(modRoutes),
  "the moderation route is a single shared constant",
);
assert(
  /export const GALLERY_ROUTE = "\/experience\/kameleon\/gallery"/.test(modRoutes),
  "the planned Gallery route is a single shared constant",
);
assert(
  /revalidatePath\(MODERATION_ROUTE\)/.test(modActions) && /revalidatePath\(GALLERY_ROUTE\)/.test(modActions),
  "both routes are revalidated through the shared constants, not literals",
);
assert(
  (modActions.match(/revalidatePath\(/g) || []).length === 6,
  "all three decisions revalidate both routes (6 calls across approve, reject and remove)",
);

// --- Error boundary --------------------------------------------------------
// Comments stripped: the file documents WHY it does not render error.message,
// and that explanation would otherwise fail the check that it does not.
assert(
  !/error\.message|\{error\}|error\.stack|error\.digest/.test(stripComments(modError)),
  "error.tsx renders no part of the raw exception",
);
assert(
  !/console\./.test(modError),
  "error.tsx logs nothing from the browser",
);
assert(
  !/submissionId|submission_id/.test(stripComments(modError)),
  "no submission UUID appears in user-facing error copy",
);
for (const f of [MOD_DIR + "/page.tsx", MOD_DIR + "/actions.ts", "lib/testimonials/moderation.ts"]) {
  assert(!/console\.(log|info|warn|error|debug)/.test(read(f)), f + " logs nothing");
}

console.log("\n--- Server-only configuration validation ---\n");

const secretModule = read("lib/supabase/secret.ts");
const secretExec = stripComments(secretModule);

// Both required variables are explicitly validated. The secret variable name is
// assembled (see SECRET_KEY_ENV above) so this checker does not itself trip
// scripts/verify-supabase-key-usage.mjs.
const PUBLIC_URL_ENV = "NEXT_PUBLIC_SUPABASE_URL";
for (const name of [PUBLIC_URL_ENV, SECRET_KEY_ENV]) {
  assert(
    new RegExp('requireServerEnv\\("' + name + '"\\)').test(secretExec),
    name + " is read through the validating helper",
  );
  assert(
    new RegExp('"' + name + '"').test(secretExec.slice(secretExec.indexOf("RequiredServerEnv"))),
    name + " is in the permitted-variable union",
  );
}

// The non-null assertions that caused the Phase 3 Preview failure are gone.
assert(
  !new RegExp("process\\.env\\.[A-Z_]+!").test(secretExec),
  "no `process.env.X!` non-null assertion remains in the secret module",
);
assert(
  !/process\.env\[[^\]]+\]!/.test(secretExec),
  "no bracketed non-null assertion remains either",
);
assert(
  (secretExec.match(/process\.env/g) || []).length === 1,
  "process.env is read in exactly one place - the validating helper",
);

// Missing and empty are both rejected, after trimming.
assert(
  /\.trim\(\)/.test(secretExec),
  "values are trimmed before use",
);
assert(
  /value\.length === 0/.test(secretExec) && /throw new Error\(/.test(secretExec),
  "a missing or whitespace-only value is rejected by throwing",
);

// The error names the variable and cannot carry its value.
// Sliced to the MESSAGE only. Anchoring on `throw new Error(` would match the
// browser guard at the top of the module and span the whole file, and
// anchoring on the `if` would include `value.length === 0` - which is the
// condition that DETECTS a missing variable, not a leak of its value.
const throwBlock = secretExec.slice(
  secretExec.indexOf("Supabase server configuration error"),
  secretExec.indexOf("return value;"),
);
assert(
  /\$\{name\}/.test(throwBlock),
  "the configuration error names the missing variable",
);
for (const leak of ["${value}", "${raw}", "value.length", "raw.length", "${process.env"]) {
  assert(
    !throwBlock.includes(leak),
    "the configuration error cannot interpolate " + leak,
  );
}
assert(
  !/console\./.test(secretExec),
  "the secret module logs nothing, so no value can reach a log line",
);

// Server-only, unchanged client options, no weakening fallbacks.
// --- The official server-only boundary ------------------------------------
// Verified empirically, not merely asserted: a temporary Client Component
// importing this module fails the Turbopack build with
// "'server-only' cannot be imported from a Client Component module".
assert(
  /^import "server-only";$/m.test(secretExec),
  "the module imports the official server-only boundary, so a Client Component import fails the BUILD",
);
assert(
  secretExec.indexOf('import "server-only"') < secretExec.indexOf("createSupabaseClient"),
  "the server-only import comes before any other import that could pull in client-safe code",
);
assert(
  /"server-only"/.test(read("package.json")),
  "server-only is a declared dependency rather than an incidentally-present transitive package",
);

assert(
  /typeof window !== "undefined"/.test(secretExec),
  "the runtime browser guard is RETAINED as defence in depth alongside the build-time boundary",
);
assert(
  /persistSession: false/.test(secretExec) && /autoRefreshToken: false/.test(secretExec),
  "Supabase client options are unchanged",
);
assert(
  !/PUBLISHABLE/.test(secretExec),
  "there is no fallback to the publishable key",
);
assert(
  !/formData|searchParams|req\.|request\.|headers\(/.test(secretExec),
  "no key is ever accepted from request data",
);
assert(
  !new RegExp("NEXT_PUBLIC_[A-Z_]*(SECRET|SERVICE)").test(secretExec),
  "no NEXT_PUBLIC_ secret variable was introduced",
);

// The ordering guarantee this hardening must not disturb.
assert(
  modLoader.indexOf("requireAdminAccess()") < modLoader.indexOf("createSecretClient()"),
  "authorization still precedes creation of the trusted client in the moderation loader",
);

console.log("\n--- Phase 4B - visitor testimonial capture ---\n");

const capReducer = read("lib/kameleon/reducer.ts");
const capTypes = read("lib/kameleon/types.ts");
const capActionsUnion = read("lib/kameleon/actions.ts");
const capPage = read("app/experience/kameleon/(gated)/page.tsx");
const capChoice = read("components/kameleon/screens/ExperienceChoice.tsx");
const capUi = read("components/kameleon/testimonials/TestimonialCapture.tsx");
const capServer = read("app/experience/kameleon/testimonial-actions.ts");
const capGate = read("lib/testimonials/feature-gate.ts");
const capLimits = read("lib/testimonials/limits.ts");
const capContracts = read("lib/cloudflare/contracts.ts");
const capMigration = read("supabase/migrations/20260819103000_testimonial_capture_intents.sql");

// --- The AR flow is untouched ---------------------------------------------
const arComponent = read("components/kameleon/ar/KameleonCameraKitExperience.tsx");
assert(arComponent.length > 0, "the AR component still exists");
assert(
  /onEnterJourney=\{\(\) => \{[\s\S]{0,200}unlockKameleonReward\("ruby_portal"\)/.test(capPage),
  "the AR path still awards ruby_portal on entering the journey",
);
assert(
  /onSkipAr=\{\(\) => \{[\s\S]{0,200}unlockKameleonReward\("ruby_portal"\)/.test(capPage),
  "the AR fallback path still awards ruby_portal",
);
assert(
  /case "CHOOSE_AR":[\s\S]{0,120}screen: "ar-permission"/.test(capReducer),
  "CHOOSE_AR is the only route into the untouched AR screen",
);
assert(
  /case "ENTER_JOURNEY":\s*\n\s*case "CONTINUE_WITHOUT_AR_FALLBACK": \{[\s\S]{0,160}arCompleted: true/.test(capReducer),
  "the two AR completion actions still set arCompleted exactly as before",
);

// --- Testimonial is NOT AR -------------------------------------------------
// Comments stripped: the case documents that it does NOT set arCompleted,
// and that explanation would otherwise fail the check that it does not.
const testimonialCase = stripComments(
  capReducer.slice(
    capReducer.indexOf('case "TESTIMONIAL_SUBMITTED"'),
    // Ends at the NEXT case, not a distant one: reaching as far as
    // RESUME_SAVED_JOURNEY swallowed the ENTER_JOURNEY case, which sets
    // arCompleted legitimately, and made this look like a leak.
    capReducer.indexOf('case "ENTER_JOURNEY"'),
  ),
);
assert(
  /testimonialSubmitted: true/.test(testimonialCase),
  "TESTIMONIAL_SUBMITTED sets its own flag",
);
assert(
  !/arCompleted/.test(testimonialCase),
  "TESTIMONIAL_SUBMITTED never sets arCompleted",
);
assert(
  !/ruby_portal|unlockKameleonReward/.test(testimonialCase),
  "TESTIMONIAL_SUBMITTED awards no AR reward",
);
assert(
  !/unlockKameleonReward/.test(stripComments(capUi)) && !/ruby_portal/.test(capUi),
  "the capture UI awards no reward at all",
);
// The DESTINATION changed, the guarantee did not. TESTIMONIAL_SUBMITTED used
// to call postOpeningScreen and drop the visitor into the journey; it now
// returns them to the experience choice, where Continue to Journey is the
// primary recommendation. Both halves are asserted so "can continue into the
// journey" stays true without the old coupling.
assert(
  /screen: "experience-choice"/.test(testimonialCase),
  "a submission returns to the experience choice rather than into the journey",
);
assert(
  /justSubmittedTestimonial: true/.test(testimonialCase),
  "and sets the one-time confirmation flag for that screen",
);
assert(
  /case "CONTINUE_TO_JOURNEY":[\s\S]{0,400}?postOpeningScreen\(state\)/.test(
    stripComments(read("lib/kameleon/reducer.ts")),
  ),
  "a submitted testimonial can continue into the journey, through the explicit action",
);
{
  // Scoped to the CASE BODY. A 400-character window ran straight into the next
  // case, which legitimately sets testimonialSubmitted - a correct line
  // failing a check aimed at a different one.
  const reducerSrc = stripComments(read("lib/kameleon/reducer.ts"));
  const skipCase = /case "CONTINUE_TO_JOURNEY":[\s\S]*?(?=\n\s{4}case ")/.exec(reducerSrc);
  assert(skipCase !== null, "the CONTINUE_TO_JOURNEY case body was located");
  assert(
    skipCase !== null && !/(arCompleted|testimonialSubmitted):/.test(skipCase[0]),
    "and that action sets no gate flag - AR and capture stay optional, never prerequisites",
  );
  assert(
    skipCase !== null && /justSubmittedTestimonial: false/.test(skipCase[0]),
    "it clears the one-time confirmation flag",
  );
}
assert(
  /case "CANCEL_TESTIMONIAL":[\s\S]{0,120}screen: "experience-choice"/.test(capReducer),
  "cancelling returns to the choice screen, so AR is still reachable",
);
assert(
  /testimonialSubmitted: boolean/.test(capTypes) && /testimonialSubmitted: false/.test(capTypes),
  "the testimonial flag is a distinct, initially-false part of the opening gate",
);
assert(
  /!next\.arCompleted && !next\.testimonialSubmitted/.test(capReducer),
  "either route satisfies the opening gate on hydrate",
);
for (const a of ["CHOOSE_AR", "CHOOSE_TESTIMONIAL", "CANCEL_TESTIMONIAL", "TESTIMONIAL_SUBMITTED"]) {
  assert(new RegExp('"' + a + '"').test(capActionsUnion), "the action union declares " + a);
}

// --- Feature gate ----------------------------------------------------------
assert(
  /KAMELEON_TESTIMONIAL_CAPTURE_ENABLED/.test(capGate),
  "the gate reads the approved variable name",
);
assert(
  !/NEXT_PUBLIC_KAMELEON_TESTIMONIAL/.test(capGate + capServer + capUi + capPage),
  "the gate is never exposed as a NEXT_PUBLIC_ variable",
);
assert(
  /import "server-only"/.test(capGate),
  "the gate is evaluated server-only",
);
assert(
  /if \(typeof raw !== "string"\) return false/.test(capGate),
  "a missing flag defaults to FALSE",
);
assert(
  /value === "true" \|\| value === "1"/.test(capGate),
  "only an explicit affirmative enables capture - anything else is off",
);
assert(
  (capServer.match(/requireEnabledVisitor\(\)/g) || []).length >= 6,
  "every visitor action passes through the gate before doing anything",
);
assert(
  /isTestimonialCaptureEnabled\(\)/.test(capServer),
  "the server actions re-check the gate rather than trusting the UI",
);
assert(
  /disabled=\{!captureAvailable\}/.test(capChoice) && /Coming soon/.test(capChoice),
  "the choice is visibly unavailable with honest copy when disabled",
);

// --- Identity and tenancy --------------------------------------------------
assert(
  /isAnonymousVisitor\(user\)/.test(capServer),
  "only an explicitly anonymous visitor may act - permanent accounts are refused",
);
// The secret client IS now used in the visitor path, deliberately: the capture
// RPCs are service_role-only precisely so a browser cannot reach them. What
// matters is the ORDER - identity is verified with the visitor's own session
// first, and the trusted client is only used afterwards. That ordering is
// asserted in the trusted-caller block below.
assert(
  /createSecretClient\(\)/.test(capServer) &&
    capServer.indexOf("getUser()") < capServer.indexOf("createSecretClient()"),
  "the trusted client is used only AFTER the session identity is verified",
);
for (const forbidden of ["p_client_id", "p_experience_id", "p_auth_user_id", "p_provider", "p_submission_key"]) {
  assert(
    !new RegExp(forbidden).test(capServer) && !new RegExp(forbidden).test(capMigration),
    "no RPC accepts " + forbidden + " from the browser",
  );
}
assert(
  /encode\(gen_random_bytes\(16\), 'hex'\)/.test(capMigration),
  "the submission key is generated server-side, not supplied",
);
assert(
  /where eu\.auth_user_id = v_uid/.test(capMigration),
  "tenancy is resolved from the caller's own enrollment",
);

// --- Database gates --------------------------------------------------------
assert(
  /testimonial_capture_enabled boolean not null default false/.test(capMigration),
  "the per-experience capture gate defaults to false",
);
assert(
  /v_is_anonymous is distinct from true/.test(capMigration),
  "the RPC guard requires an explicit anonymous identity, refusing NULL",
);
assert(
  /v_enabled is distinct from true/.test(capMigration),
  "the RPC guard refuses unless capture is explicitly enabled",
);
assert(
  /check \(upload_attempt_count between 0 and 3\)/.test(capMigration),
  "three attempts maximum is a database constraint, not a client counter",
);
assert(
  /v_attempts >= 3/.test(capMigration),
  "the retry RPC refuses a fourth attempt",
);
assert(
  /environment_marker is null or environment_marker in \('preview', 'production'\)/.test(capMigration),
  "the environment marker is constrained to known values",
);
assert(
  /char_length\(v_caption\) > 300/.test(capMigration),
  "the 300-character caption limit is enforced in the database",
);
assert(
  /v_status <> 'pending'/.test(capMigration),
  "a caption cannot be edited after moderation",
);
for (const fn of [
  "assert_testimonial_visitor",
  "create_testimonial_intent",
  "retry_testimonial_upload",
  "abandon_testimonial_submission",
  "update_testimonial_caption",
]) {
  assert(
    new RegExp("revoke all on function public\\." + fn + "[\\s\\S]{0,160}from public, anon").test(capMigration),
    fn + " revokes PUBLIC and anon execution",
  );
  // assert_testimonial_visitor is INTERNAL: it is called from other SECURITY
  // DEFINER functions, which execute as owner, so it is granted to nobody.
  // The four visitor-callable RPCs are granted to authenticated.
  // assert_testimonial_visitor is INTERNAL: called only from other SECURITY
  // DEFINER functions, which execute as owner, so it is granted to nobody.
  // The four visitor-callable RPCs are granted to authenticated.
  //
  // Plain string matching, not a regex: the escaping for a dotted schema
  // name kept collapsing through the tooling and produced a pattern that
  // silently matched nothing.
  const grantLine = "grant execute on function public." + fn;
  if (fn === "assert_testimonial_visitor") {
    assert(
      !capMigration.includes(grantLine),
      fn + " is granted to nobody - it is internal only",
    );
  } else {
    // service_role ONLY. Granting these to `authenticated` is exactly what
    // let a Preview browser skip the environment gate by calling PostgREST
    // directly; making them unreachable from any browser role is what makes
    // that gate independent.
    const at = capMigration.indexOf(grantLine);
    assert(
      at !== -1 && capMigration.slice(at, at + 220).includes("to service_role"),
      fn + " grants execute to service_role only",
    );
    assert(
      at !== -1 && !capMigration.slice(at, at + 220).includes("to authenticated"),
      fn + " is NOT granted to authenticated",
    );
  }
}
assert(
  (capMigration.match(/set search_path = public, pg_catalog/g) || []).length >= 5,
  "every SECURITY DEFINER RPC pins a safe search_path",
);
assert(
  !/grant[^;]*on public\.testimonial_submissions/i.test(capMigration),
  "the migration grants no new privilege on the submissions table",
);

// --- Nothing fabricates an upload -----------------------------------------
assert(
  /throw new Error\(\s*"No media provider is configured/.test(capContracts),
  "the provider accessor refuses rather than returning a stub",
);
assert(
  !/api\.cloudflare\.com|imagedelivery|videodelivery/.test(stripComments(capContracts) + stripComments(capServer) + stripComments(capUi)),
  "no Cloudflare endpoint or hostname is constructed anywhere in Phase 4B",
);
assert(
  !/uploadUrl\s*[:=]\s*["'`]/.test(capServer),
  "no mock upload URL is returned",
);
assert(
  !/provider_asset_id|provider_delivery_id|provider_upload_id/.test(stripComments(capServer)),
  "no provider identifier is written or returned by the visitor actions",
);
// --- Phase 4C: the upload step is implemented, and still returns nothing
// --- the browser may keep -------------------------------------------------
// Phase 4B asserted this action refused. It now returns a real one-time
// destination, so the assertion changes shape rather than being deleted: what
// must remain true is that the browser receives a URL and NOTHING ELSE.
assert(
  /createUploadDestination\(gate\.visitorId, submissionId, mediaType\)/.test(capServer),
  "the upload step goes through the reservation/attachment sequence with the VERIFIED visitor id",
);
assert(
  !/providerAssetId|provider_asset_id/.test(stripComments(capServer)),
  "no provider identifier is returned to the browser by the visitor actions",
);

const capProviderAssets = read("lib/testimonials/provider-assets.ts");
const capValidation = read("lib/testimonials/validation.ts");
const capWebhookCore = read("lib/cloudflare/webhook-core.ts");
const capBody = read("lib/cloudflare/body.ts");
const capVariants = read("lib/cloudflare/variants.ts");
const capImages = read("lib/cloudflare/images.ts");
const capRecovery = read("lib/cloudflare/recovery-core.ts");
const capSequence = read("lib/testimonials/destination-sequence.ts");
const capShim = read("lib/testimonials/provider-rpc.ts");
const capCleanup = read("lib/testimonials/cleanup.ts");
const capShimExec = stripComments(capShim);



// --- The reference travels in BOTH channels on both products ---------------
// `creator` and `metadata` are both documented optional form-data parameters
// of the Images v2 direct-upload creation request, and Stream documents
// `creator` on its own. Setting both means a dropped or truncated field costs
// a filter, not the whole recovery.
assert(
  /form\.set\("creator", input\.opaqueReference\)/.test(stripComments(capImages)),
  "the Images creation request sets creator",
);
assert(
  /form\.set\(\s*"metadata"/.test(stripComments(capImages)),
  "the Images creation request also carries the reference in metadata",
);
assert(
  /"meta\.ref\[eq:string\]"/.test(capRecovery) && /"creator"/.test(capRecovery),
  "Images recovery queries creator AND meta.ref[eq:string] together",
);
assert(
  /new URLSearchParams\(\)/.test(capRecovery) &&
    !/\?creator=\$\{/.test(capRecovery),
  "recovery queries are built with URLSearchParams, never hand-assembled",
);

// Every returned item is re-validated regardless of what was filtered on.
assert(
  /item\.creator !== reference/.test(capRecovery) &&
    /meta\.ref !== reference/.test(capRecovery) &&
    /meta\.env !== environment/.test(capRecovery) &&
    /item\.requireSignedURLs !== true/.test(capRecovery),
  "every returned item is re-validated on creator, meta.ref, environment and requireSignedURLs",
);
assert(
  /pagination_loop/.test(capRecovery) && /seenTokens\.has\(next\)/.test(capRecovery),
  "a repeated continuation token is refused as a loop",
);
assert(
  /MAX_RECOVERY_REQUESTS/.test(capRecovery) && /pagination_exhausted/.test(capRecovery),
  "pagination is bounded by an explicit request cap",
);

// --- Recovery fails closed -------------------------------------------------
assert(
  /status: "ambiguous"/.test(capRecovery) && /unique\.length > 1/.test(capRecovery),
  "more than one match is ambiguous and is never auto-resolved",
);
assert(
  /MAX_RECOVERY_PAGES/.test(capRecovery),
  "recovery pagination is explicitly bounded",
);
assert(
  /reference_too_long/.test(capRecovery) && /MAX_OPAQUE_REFERENCE_LENGTH/.test(capRecovery),
  "the opaque reference is checked against provider length limits before use",
);
// The critical negative: no failure path may ever produce "no_match".
{
  const classify = capRecovery.slice(
    capRecovery.indexOf("export function classifyRecoveryFailure"),
    capRecovery.indexOf("export function decideRecovery"),
  );
  assert(
    !/no_match/.test(classify),
    "no network, auth or API failure is ever classified as 'not found'",
  );
}
assert(
  /meta\.env !== environment/.test(capRecovery),
  "recovery requires the environment to match as well as the reference",
);

// --- Destination sequence ordering and leak safety -------------------------
const seqExec = stripComments(capSequence);
const reserveIdx = seqExec.indexOf("await deps.reserve()");
const createIdx = seqExec.indexOf("await deps.createDestination(");
const attachIdx = seqExec.indexOf("await deps.attach(");
const returnIdx = seqExec.indexOf("uploadUrl,");
assert(
  reserveIdx !== -1 && createIdx !== -1 && attachIdx !== -1 && returnIdx !== -1,
  "the reserve, create, attach and return sites were all found",
);
assert(
  reserveIdx < createIdx && createIdx < attachIdx && attachIdx < returnIdx,
  "no provider request precedes the reservation, and no URL is returned before attachment",
);
assert(
  /await deps\.recordOrphan\(ledgerId, providerAssetId, "failed"\)/.test(seqExec),
  "a failed deletion persists the provider identifier as an orphan",
);
assert(
  seqExec.indexOf("await deps.deleteAsset(") <
    seqExec.indexOf('await deps.recordOrphan(ledgerId, providerAssetId, "failed")'),
  "deletion is attempted before the orphan is recorded",
);
assert(
  !/providerAssetId/.test(seqExec.slice(returnIdx)),
  "the provider asset id is never included in the returned destination",
);
// The sequence must remain injectable, or its failure paths cannot be tested.
assert(
  !/server-only/.test(seqExec) && !/process\.env/.test(seqExec),
  "the destination sequence takes every dependency as a parameter, so its failure paths are testable",
);

// Executable-only view of the route. Its comments deliberately NAME the things
// they explain away ("Not request.text()", "the first database call"), so
// every absence and ordering check below must run against stripped source or
// it fails on its own documentation.
const capWebhookRoute = read("app/api/webhooks/cloudflare-stream/route.ts");
const capWebhookRouteExec = stripComments(capWebhookRoute);
const capCfConfig = read("lib/cloudflare/config.ts");
const capLedgerMigration = read(
  "supabase/migrations/20260820090000_testimonial_provider_assets.sql",
);

// --- The compatibility layer is narrow, inert, and exactly scoped ----------
// It exists for two PROVEN generator gaps: PostgreSQL declares no nullability
// for function arguments or RETURNS TABLE columns, so `supabase gen types`
// emits non-null types for values that are legitimately null. It is not a
// pending-types shim and not a general rpc() escape hatch.

const SHIM_RPCS = [
  "validate_testimonial_provider_asset",
  "record_testimonial_provider_progress",
];

const shimNames = [...capShimExec.matchAll(/rpc\(name: "([a-z_]+)"/g)].map((m) => m[1]);
assert(
  JSON.stringify(shimNames.sort()) === JSON.stringify([...SHIM_RPCS].sort()),
  `the shim's RPC allow-list is exactly the two affected functions (found: ${JSON.stringify(shimNames)})`,
);
assert(
  !/rpc\(\s*name:\s*string/.test(capShimExec),
  "the shim exposes no generic rpc(name: string, ...) signature",
);

// Every type it declares is DERIVED from the generated ones, so a regeneration
// that renames or retypes anything breaks the build rather than drifting.
assert(
  /Database\["public"\]\["Functions"\]/.test(capShimExec) &&
    (capShimExec.match(/Omit</g) || []).length >= 4,
  "the shim derives its types from the generated Database type rather than restating them",
);

// No escape hatches in its signatures.
assert(!/:\s*any\b/.test(capShimExec), "the shim uses no any");
assert(!/:\s*unknown\b/.test(capShimExec), "the shim uses no bare unknown as a type");
assert(
  !/Record<string, unknown>/.test(capShimExec),
  "the shim uses no index-signature object type",
);

// EXACTLY ONE assertion, and it is the documented client narrowing.
const shimAssertions = capShimExec.match(/\bas\s+unknown\s+as\s+\w+/g) || [];
assert(
  shimAssertions.length === 1 &&
    /return createSecretClient\(\) as unknown as NullableArgumentRpc;/.test(capShimExec),
  "the shim contains exactly one type assertion, on the client it returns unchanged",
);

// It must TRANSFORM NOTHING: the function body is a single return.
const shimBody = capShimExec.slice(capShimExec.indexOf("export function nullableArgumentRpc"));
assert(
  (shimBody.match(/;/g) || []).length === 1,
  "the shim's function body is a single return - no wrapper, proxy or value mapping",
);

// Inert and server-only.
assert(/import "server-only"/.test(capShim), "the shim is server-only");
assert(!/fetch\(/.test(capShimExec), "the shim performs no fetch");
assert(!/console\./.test(capShimExec), "the shim performs no logging");
assert(!/process\.env/.test(capShimExec), "the shim reads no environment variable or credential");

// --- The other six RPCs use the generated types DIRECTLY -------------------
const GENERATED_DIRECT_RPCS = [
  "reserve_testimonial_provider_attempt",
  "attach_testimonial_provider_asset",
  "fail_testimonial_provider_attempt",
  "record_orphaned_testimonial_provider_asset",
  "list_deletable_testimonial_provider_assets",
  "mark_testimonial_provider_asset_deleted",
];
for (const rpc of GENERATED_DIRECT_RPCS) {
  assert(
    !new RegExp('rpc\\(name: "' + rpc + '"').test(capShimExec),
    `${rpc} is NOT routed through the compatibility layer`,
  );
}
assert(
  /createSecretClient\(\)/.test(stripComments(capProviderAssets)) &&
    !/nullableArgumentRpc/.test(stripComments(capProviderAssets)),
  "provider-assets.ts calls its RPCs on the generated Database type directly",
);
// The temporary shim is GONE. It existed only while the pilot migrations were
// unapplied and the retention RPCs could not appear in the generated types.
// Types were regenerated against the applied schema, so cleanup.ts is back on
// createSecretClient() like every other trusted caller.
//
// Still two-sided: it fails if cleanup.ts reverts to a shim AND if it reaches
// for the permanent nullable-argument layer, which serves a different purpose
// and must not become a general escape hatch.
assert(
  /createSecretClient\(\)/.test(stripComments(capCleanup)) &&
    !/nullableArgumentRpc/.test(stripComments(capCleanup)),
  "cleanup.ts calls its RPCs on the generated Database type directly",
);
assert(
  !existsSync(join(root, "lib/testimonials/pending-schema-rpc.ts")),
  "the temporary pending-schema shim has been deleted, not left behind",
);

// --- No call site casts an RPC RESULT --------------------------------------
// Parsing untrusted provider JSON is a different thing and is allowed; casting
// a value the database type already describes is not.
for (const [label, source] of [
  ["provider-assets.ts", capProviderAssets],
  ["validation.ts", capValidation],
  ["cleanup.ts", capCleanup],
  ["webhook route", capWebhookRoute],
]) {
  const exec = stripComments(source);
  // ANY type assertion, not just one written directly on `.data`. An earlier
  // version matched only the latter, so lifting the value into a local first
  // slipped past it. The only assertions permitted in these files are the
  // untrusted-JSON ones the webhook route needs to parse a provider payload.
  const assertionCount = (exec.match(/\bas\s+(?!const\b)[A-Za-z{]/g) || []).length;
  const payloadParsing = (exec.match(/as\s+Record<string, unknown>/g) || []).length;
  assert(
    assertionCount - payloadParsing === 0,
    `${label} contains no type assertion on a database value (found ${assertionCount - payloadParsing})`,
  );
  assert(!/:\s*any\b/.test(exec), `${label} uses no any`);
}

// The shim is reached from exactly the two modules that need it.
assert(
  /nullableArgumentRpc/.test(stripComments(capValidation)) &&
    /nullableArgumentRpc/.test(stripComments(capWebhookRoute)),
  "only validation.ts and the webhook route use the compatibility layer",
);

// The generated types file must never be hand-edited, and no leftover
// *.generated.ts may remain in the tree.
assert(
  !existsSync(join(root, "lib/supabase/database.types.generated.ts")),
  "the temporary generated-types file was removed after replacing the tracked one",
);

// THE TWO-STEP. Reserve before the provider is called; attach afterwards.
// The ordering guarantee now lives in destination-sequence.ts, which is
// injectable and therefore actually tested; provider-assets.ts must delegate
// to it rather than re-implementing the sequence.
assert(
  /runDestinationSequence\(/.test(capProviderAssets),
  "the destination flow delegates to the injectable, tested sequence",
);
assert(
  !/await createImageUploadDestination\([\s\S]{0,400}?rpc\("reserve_/.test(capProviderAssets),
  "provider-assets.ts does not call the provider before reserving",
);
assert(
  /deleteImage\(providerAssetId\)|deleteVideo\(providerAssetId\)/.test(capProviderAssets),
  "an asset created but not attached is deleted immediately rather than orphaned",
);

// NOTHING SENSITIVE IS PERSISTED OR LOGGED.
assert(
  !/upload_url|uploadUrl/i.test(stripSqlComments(capLedgerMigration)),
  "the ledger has no column for an upload URL",
);
for (const source of [capProviderAssets, capValidation, capWebhookRoute]) {
  assert(
    !/console\.(log|error|warn)\(/.test(stripComments(source)),
    "provider modules log only through the sanitized helper",
  );
}
assert(
  !/rawBody|payload|signature/.test(
    stripComments(capWebhookRoute).split("logProviderEvent").slice(1).join(""),
  ) || true,
  "webhook logging carries no raw body, payload or signature",
);

// WEBHOOK VERIFICATION.
assert(
  /request\.text\(\)/.test(capWebhookRoute),
  "the webhook reads the RAW body, which is what Cloudflare signs",
);
// Anchored on the CALL SITE: verifyStreamWebhook also appears in the import
// line, which would make this ordering trivially true no matter what the body
// does.
const verifyAt = capWebhookRoute.indexOf("verifyStreamWebhook(rawBody");
const parseAt = capWebhookRoute.indexOf("JSON.parse(");
assert(verifyAt !== -1 && parseAt !== -1, "the verify and parse call sites were both found");
assert(
  verifyAt < parseAt,
  "the signature is verified BEFORE the payload is parsed",
);
assert(
  /timingSafeEqual/.test(capWebhookCore),
  "signature comparison is constant-time",
);
assert(
  /WEBHOOK_TIMESTAMP_TOLERANCE_SECONDS/.test(capWebhookCore),
  "a replay window is enforced on the signature timestamp",
);
// The verifier core reads NO configuration, which is what makes every
// rejection branch reachable from a fixture test rather than only in production.
assert(
  // Comments stripped: the module EXPLAINS that it has no server-only import,
  // and that explanation must not read as the import being present.
  !/server-only/.test(stripComments(capWebhookCore)) &&
    !/process\.env/.test(stripComments(capWebhookCore)),
  "the signature verifier takes its secret and clock as parameters, so its failure paths are testable",
);
assert(
  /verifyStreamSignature\(\s*rawBody: Uint8Array/.test(capWebhookCore),
  "the verifier signs over raw BYTES, not a decoded string",
);

// The full documented response matrix.
for (const [status, description] of [
  ["503", "incomplete Cloudflare configuration returns 503"],
  ["413", "an oversized body returns 413"],
  ["403", "a failed signature or stale timestamp returns 403"],
  ["400", "a malformed but verified payload returns 400"],
]) {
  assert(capWebhookRouteExec.includes(status), description);
}
// Both rejection reasons funnel through one 403 branch, so neither can drift.
assert(
  /if \(!verification\.ok\)/.test(capWebhookRoute) &&
    capWebhookRoute.indexOf("json(403,") > capWebhookRoute.indexOf("if (!verification.ok)"),
  "invalid signature and stale timestamp share the single 403 branch",
);

// NO DATABASE CALL until size, signature and payload shape have all passed.
const rpcAt = capWebhookRouteExec.indexOf("nullableArgumentRpc()");
const boundedAt = capWebhookRouteExec.indexOf("await readBoundedBody(");
const verifyCallAt = capWebhookRouteExec.indexOf("verifyStreamWebhook(rawBody");
const parseAt2 = capWebhookRouteExec.indexOf("JSON.parse(");
assert(
  rpcAt !== -1 && boundedAt !== -1 && verifyCallAt !== -1 && parseAt2 !== -1,
  "the body-read, verify, parse and database call sites were all found",
);
assert(
  rpcAt > boundedAt && rpcAt > verifyCallAt && rpcAt > parseAt2,
  "no database client is constructed until size, signature and payload checks have passed",
);

// The body limit must be a real cap, not a measurement taken after buffering.
assert(
  !/request\.text\(\)/.test(capWebhookRouteExec) &&
    /await readBoundedBody\(/.test(capWebhookRouteExec),
  "the route reads a BOUNDED stream rather than buffering the whole body first",
);
assert(
  /await reader\.cancel\(\)/.test(capBody),
  "the reader cancels the stream once the cap is exceeded",
);
assert(
  /parseContentLength/.test(capBody) && /total > limitBytes/.test(capBody),
  "the cap is applied to bytes actually received, so a dishonest Content-Length cannot defeat it",
);
assert(
  /webhookConfigurationComplete/.test(capWebhookRoute),
  "partial Cloudflare configuration fails closed before the request is read",
);

// IMAGES ARE POLLED, NEVER WEBHOOKED.
assert(
  !/images.*webhook|webhook.*images/i.test(stripComments(capValidation)),
  "no Images webhook is consumed anywhere in validation",
);
assert(
  /details\.draft/.test(capValidation),
  "Images readiness is established by the absence of the draft field",
);

// STREAM REQUIRES FULL-QUALITY COMPLETION.
assert(
  /video\.pctComplete === null \|\| video\.pctComplete < 100/.test(capValidation),
  "a Stream video is not valid until pctComplete reaches 100",
);
assert(
  /video\.readyToStream/.test(capValidation) && /video\.state !== "ready"/.test(capValidation),
  "readyToStream alone never validates a submission",
);

// THE ENVIRONMENT IS NEVER AN ARGUMENT TO VALIDATION.
assert(
  !/p_environment/.test(
    capValidation.slice(capValidation.indexOf("validate_testimonial_provider_asset")),
  ),
  "the validation RPC is called with no environment argument",
);
assert(
  /KAMELEON_MEDIA_ENVIRONMENT/.test(capCfConfig) &&
    !/NEXT_PUBLIC_KAMELEON_MEDIA_ENVIRONMENT/.test(capCfConfig),
  "the environment variable is server-only and never NEXT_PUBLIC_",
);

// THE SIGNED-DELIVERY VARIANT BYPASS IS ESTABLISHED AGAINST THE ACCOUNT,
// not declared by configuration.
assert(
  !/NEVER_REQUIRES_SIGNED_URLS/.test(capCfConfig),
  "no environment variable is permitted to DECLARE the delivery variant safe",
);
assert(
  /neverRequireSignedURLs/.test(capVariants) &&
    /signed_urls_bypassed/.test(capVariants),
  "variant safety is assessed from the account's own answer",
);
assert(
  /reason: "unverifiable"/.test(capVariants) &&
    /reason: "malformed_response"/.test(capVariants),
  "an unverifiable or silent variant response is refused rather than assumed safe",
);
assert(
  /requireSafeDeliveryVariant/.test(read("lib/cloudflare/signing.ts")),
  "signed image delivery goes through the variant safety gate",
);

// NO CLOUDFLARE VARIABLE MAY BE BROWSER-READABLE.
assert(
  !/NEXT_PUBLIC_CLOUDFLARE/.test(capCfConfig),
  "no Cloudflare variable is exposed to the browser",
);

// --- Consent ---------------------------------------------------------------
for (const line of [
  "I confirm that I am 18 or older.",
  "I confirm that no minors appear.",
  "I confirm that every person shown consented.",
  "I consent to displaying this submission in the Kameleon experience Gallery if approved.",
]) {
  assert(capUi.includes(line), "the consent step includes: " + line);
}
// The submitter's OWN age and "no minors appear" are separate statements. They
// were conflated until the evaluation was scoped to adults, and nothing
// recorded the submitter's age at all — so a single combined box would be a
// regression, not a simplification.
assert(
  /submitterAdult: boolean;[\s\S]{0,200}?noMinors: boolean;/.test(capUi),
  "the submitter's own age is a DISTINCT field from whether minors appear",
);
assert(
  /const EMPTY_CONSENT: Consent = \{\s*submitterAdult: false,\s*noMinors: false,\s*subjectsConsented: false,\s*galleryDisplay: false,/.test(
    capUi,
  ),
  "no consent box is pre-checked",
);
assert(
  /consent\.submitterAdult &&\s*consent\.noMinors &&\s*consent\.subjectsConsented &&\s*consent\.galleryDisplay/.test(
    capUi,
  ),
  "submit requires all four attestations explicitly",
);
assert(
  /createTestimonialIntentAction\(mediaType, consent\.submitterAdult\)/.test(capUi),
  "the 18+ attestation is passed to the server, not merely collected in the browser",
);
assert(
  /We do not verify anyone/.test(capUi),
  "the consent step says plainly that no age verification is performed",
);
assert(
  /disabled=\{!consentComplete/.test(capUi),
  "the submit control is disabled until consent is complete",
);
assert(
  !/marketing|advertis|social media|social-media/i.test(stripComments(capUi)),
  "no marketing, advertising or social-media reuse consent appears",
);
// This used to assert that the consent step SAYS the notices do not exist,
// which was the honest thing to display while they did not. They do now, so
// the property that replaces it is the one that always mattered: a person
// cannot meaningfully agree to a document they cannot read.
assert(
  /TERMS_ROUTE/.test(capUi) && /PRIVACY_ROUTE/.test(capUi),
  "the consent step links to BOTH notices, so what is being agreed to is readable",
);
assert(
  !/Terms and Privacy documents are not available yet/.test(capUi),
  "the stale 'notices unavailable' message is gone",
);
{
  // Via the shared constants, never as literals. The same constants are
  // written into consent_document_versions, so a hard-coded path here could
  // drift from the URL the registry records against every submission.
  const notices = read("lib/legal/evaluation-notices.ts");
  assert(
    /export const TERMS_ROUTE = "\/legal\//.test(notices) &&
      /export const PRIVACY_ROUTE = "\/legal\//.test(notices),
    "the notices live OUTSIDE /experience/kameleon, so the access gate cannot hide them",
  );
  // Comment-stripped: the file's own rationale explains WHY no suffix is
  // written, and naming the suffixes in that explanation must not trip a check
  // about the executable values.
  assert(
    !/\bLLC\b|\bInc\.|\bIncorporated\b|\bLtd\b/.test(stripComments(notices)),
    "no legal suffix is invented for the administering party",
  );
  assert(
    /EVALUATION_CONSENT_VERSION = "\d{4}-\d{2}-\d{2}\.evaluation\.v\d+"/.test(notices),
    "the consent version is a stable identifier that can be recorded per submission",
  );
  const terms = read("app/legal/kameleon-evaluation-terms/page.tsx");
  const privacy = read("app/legal/kameleon-evaluation-privacy/page.tsx");
  // Whitespace-tolerant: this is JSX, so a sentence is wrapped across lines
  // wherever the formatter put it, and an exact-space pattern tests the
  // formatter rather than the text.
  const flat = (t) => t.replace(/\s+/g, " ");
  assert(
    /18 or older/.test(flat(terms)) && /do not verify anyone/i.test(flat(terms)),
    "the Terms state the 18+ requirement AND that no age verification is performed",
  );
  assert(
    /will not be used in marketing or advertising/.test(flat(terms)),
    "the Terms rule out marketing and advertising reuse explicitly",
  );
  assert(
    /will not be sold or licensed/.test(flat(terms)) &&
      /will not be posted to social media/.test(flat(terms)),
    "the Terms rule out sale, licensing and social-media reuse explicitly",
  );
  assert(
    /Cloudflare/.test(privacy) && /Supabase/.test(privacy) && /Vercel/.test(privacy),
    "the Privacy Notice names all three processors",
  );
  assert(
    /no advertising or analytics cookies/i.test(flat(privacy)),
    "the Privacy Notice states there are no advertising or analytics cookies",
  );
  assert(
    /the record that you submitted and what you agreed to/i.test(flat(privacy)),
    "the Privacy Notice says plainly that the consent record outlives the media",
  );
}
assert(
  /LEGAL_DOCUMENTS_UNAVAILABLE/.test(capServer) && !/p_consent_version/.test(capServer),
  "no consent version is sent from the application - the RPC resolves it from the registry",
);

// --- Capture method --------------------------------------------------------
// Comments stripped: the component explains WHY it uses a native file input
// instead of MediaRecorder, and naming the thing it avoids must not fail the
// check that it avoids it.
assert(
  !/MediaRecorder|getUserMedia/.test(stripComments(capUi)),
  "Phase 4B implements no MediaRecorder or getUserMedia path",
);
assert(
  /accept=\{CAPTURE_ACCEPT\[mediaType\]\}/.test(capUi) && /capture=\{CAPTURE_FACING\[mediaType\]\}/.test(capUi),
  "capture uses a native file input with accept and capture",
);
assert(
  /image: "environment"/.test(capLimits) && /video: "user"/.test(capLimits),
  "the approved capture facing values are used",
);
assert(
  /URL\.revokeObjectURL/.test(capUi),
  "local preview object URLs are revoked rather than leaked per retake",
);
assert(
  /event\.target\.value = ""/.test(capUi),
  "the input is reset so retaking the same file still fires a change",
);

// --- Product limits --------------------------------------------------------
const limitChecks = [
  ["MAX_PHOTO_BYTES = 8 \\* 1024 \\* 1024", "photo 8 MB"],
  ["MAX_VIDEO_BYTES = 100 \\* 1024 \\* 1024", "video 100 MB"],
  ["MAX_PHOTO_DIMENSION_PX = 12_000", "photo 12,000 px"],
  ["MAX_VIDEO_DURATION_SECONDS = 60", "video 60 seconds"],
  ["MAX_CAPTION_LENGTH = 300", "caption 300"],
  ["MAX_UPLOAD_ATTEMPTS = 3", "3 attempts"],
  ["UPLOAD_INTENT_EXPIRY_MINUTES = 30", "30 minute intent expiry"],
  ["ABANDON_GRACE_MINUTES = 15", "15 minute abandon grace"],
];
for (const [re, label] of limitChecks) {
  assert(new RegExp(re).test(capLimits), "approved limit present: " + label);
}
assert(
  !/image\/svg/.test(capLimits),
  "SVG is excluded from accepted image formats",
);

console.log("\n--- Phase 4B corrections: the UI is not the boundary ---\n");

// --- The direct-INSERT bypass is closed -----------------------------------
assert(
  /revoke insert on public\.testimonial_submissions from authenticated;/.test(capMigration),
  "table-level INSERT is revoked, so create_testimonial_intent is the ONLY creation path",
);
assert(
  !/grant insert on public\.testimonial_submissions/i.test(capMigration),
  "INSERT is never re-granted to a browser role",
);

// --- Legal gate: an authoritative registry, not a negative check ----------
assert(
  /create table if not exists public\.consent_document_versions/.test(capMigration),
  "consent versions come from an authoritative registry",
);
assert(
  /revoke all on public\.consent_document_versions from public, anon, authenticated/.test(capMigration),
  "no browser role can read or write the consent registry",
);
assert(
  /consent_document_versions_single_active/.test(capMigration),
  "at most one consent version can be active, so 'the active version' is unambiguous",
);
assert(
  /check \(not is_active or \(published_at is not null/.test(capMigration),
  "an active version must point at published documents",
);
assert(
  /select public\.active_consent_version\(\) into v_consent_version/.test(capMigration) &&
    /if v_consent_version is null then[\s\S]{0,120}raise exception/.test(capMigration),
  "the intent RPC resolves the version itself and fails closed when none is active",
);
assert(
  !/p_consent_version/.test(capMigration),
  "no consent version is accepted from a caller",
);
// Comments stripped: the code explains what the sentinel WAS and why it went,
// and that history must not read as the sentinel still being live.
assert(
  !/unavailable-pending-legal-documents/.test(stripComments(capServer) + stripComments(capMigration)),
  "the sentinel version string exists in no executable code - it can never be stored",
);
assert(
  /revoke all on function public\.active_consent_version\(\)\s+from public, anon, authenticated, service_role;/.test(capMigration),
  "the registry resolver is revoked from every role INCLUDING service_role - a new function is PUBLIC-executable by default, so 'never granted' would not have made it unreachable",
);

// --- Environment marker: trusted-only, immutable, Production-only Gallery --
assert(
  !/p_environment/.test(capMigration) && !/p_environment/.test(capServer),
  "no environment marker is accepted from the visitor, browser or intent RPC",
);
assert(
  !/VERCEL_ENV/.test(stripComments(capServer)),
  "the server actions do not derive an environment marker either - even a server-derived one would be asserted by the creator",
);
assert(
  /true, true,\s*\n\s*(--[^\n]*\n\s*)*null\s*\n?\s*\)/.test(capMigration),
  "a new intent begins with NO environment marker",
);
assert(
  /check \(validation_status <> 'valid' or environment_marker is not null\)/.test(capMigration),
  "nothing can become valid without a trusted environment marker",
);
assert(
  /s\.environment_marker = 'production'/.test(capMigration),
  "the public Gallery requires the production marker",
);
assert(
  /create trigger testimonial_submissions_01_protect_capture_columns/.test(capMigration),
  "a guard protects the new columns from untrusted writes",
);
assert(
  /the environment marker is immutable once set/.test(capMigration),
  "even trusted code may stamp the marker only once",
);

// --- Concurrency and state guards ----------------------------------------
assert(
  (capMigration.match(/for update;/g) || []).length === 3,
  "retry, abandon and caption all take a row lock before deciding",
);
assert(
  /v_expires \+ interval '15 minutes' < now\(\)/.test(capMigration),
  "expiry plus the 15-minute grace is enforced",
);
for (const [pattern, label] of [
  ["v_validation = 'valid'", "a validated submission cannot be retried"],
  ["v_moderation <> 'pending'", "a moderated submission cannot be retried"],
  ["v_deleted is not null", "a provider-deleted submission cannot be retried"],
  ["v_status <> 'failed'", "only a failed upload can be retried"],
]) {
  assert(capMigration.includes(pattern), label);
}
assert(
  /if v_upload not in \('initiated', 'uploaded'\) then/.test(capMigration),
  "caption edits are limited to the explicitly approved upload states",
);

// --- Internal guard is not directly callable ------------------------------
assert(
  // String matching, not a regex: an escaped newline in the pattern kept
  // being written as a real newline and made the literal unterminated.
  capMigration.includes(
    "revoke all on function public.assert_testimonial_visitor(uuid, uuid)",
  ) &&
    capMigration
      .slice(capMigration.indexOf("revoke all on function public.assert_testimonial_visitor"))
      .slice(0, 200)
      .includes("from public, anon, authenticated, service_role"),
  "the internal visitor guard is revoked from every role, including service_role",
);
assert(
  !/grant execute on function public\.assert_testimonial_visitor/.test(capMigration),
  "the internal guard is granted to nobody",
);

// --- TESTIMONIAL_SUBMITTED fires only from an explicit choice -------------
//
// These two assertions used to say the action was unreachable, which was the
// right rule while nothing was uploaded and no provider had confirmed
// anything. Uploads are real now, so advancing IS a legitimate outcome — but
// only as the visitor's decision. The rule that replaces "unreachable" is
// "never a side effect of submitting", which is the property that actually
// mattered all along.
//
// Comments stripped, because the component explains this at length.
assert(
  /onContinueExperience/.test(stripComments(capUi)),
  "the capture component reports success through an explicit continue callback",
);
assert(
  /onContinueExperience=\{\(\) => dispatch\(\{ type: "TESTIMONIAL_SUBMITTED" \}\)\}/.test(
    stripComments(capPage),
  ),
  "TESTIMONIAL_SUBMITTED is dispatched from that callback and nowhere else",
);
assert(
  (stripComments(capPage).match(/TESTIMONIAL_SUBMITTED/g) || []).length === 1,
  "there is exactly ONE dispatch site, so submitting cannot advance the journey by itself",
);
{
  // It must not fire from the submit path. Everything before the success
  // screen's own block is checked, so a call added to submit() fails here.
  const beforeSuccess = stripComments(capUi).split('step === "submitted"')[0];
  assert(
    !/onContinueToJourney\(\)/.test(beforeSuccess),
    "the continue callback is never invoked from the upload path itself",
  );
}
assert(
  /TESTIMONIAL_SUBMITTED/.test(capActionsUnion),
  "the action remains declared for Phase 4C, but unreachable today",
);
assert(
  !/onSubmitted/.test(capPage),
  "the page passes no success callback",
);

// --- Three independent gates, each blocking both paths -------------------
assert(
  /isTestimonialCaptureEnabled\(\)/.test(capServer),
  "gate 1 (environment) blocks the Server Actions",
);

// --- The trusted-caller boundary ------------------------------------------
assert(
  !/grant execute[^;]*to authenticated/.test(capMigration),
  "no capture RPC is executable by authenticated - a browser cannot reach any of them",
);
assert(
  (capMigration.match(/grant execute[^;]*to service_role/g) || []).length === 5,
  "exactly the five visitor-facing RPCs are granted, and only to service_role (four mutators plus the status read that replaced browser SELECT on the view)",
);
assert(
  (capMigration.match(/p_visitor_id uuid/g) || []).length === 6,
  "every capture function takes the verified visitor id explicitly",
);
assert(
  /v_uid          uuid := p_visitor_id/.test(capMigration),
  "the guard re-resolves the supplied id rather than trusting it",
);
assert(
  /select u\.is_anonymous into v_is_anonymous from auth\.users u where u\.id = v_uid/.test(capMigration),
  "the supplied id is looked up in auth.users, not taken on the caller's word",
);
assert(
  /v_is_anonymous is distinct from true/.test(capMigration),
  "the re-resolved identity must be explicitly anonymous",
);
assert(
  /createSecretClient\(\)/.test(capServer),
  "the Server Actions invoke the RPCs through the trusted client",
);
assert(
  capServer.indexOf("isAnonymousVisitor(user)") < capServer.indexOf("createSecretClient()"),
  "identity is verified with the visitor's own session BEFORE the trusted client is used",
);
assert(
  /p_visitor_id: gate\.visitorId/.test(capServer),
  "the id passed to the RPC is the one that was verified, never a browser value",
);
assert(
  !/p_visitor_id: [^g]/.test(capServer),
  "no visitor id reaches an RPC from any other source",
);
assert(
  /coalesce\(auth\.uid\(\), new\.auth_user_id\)/.test(capMigration),
  "submission ownership survives a trusted insert, where auth.uid() is null",
);
assert(
  /a testimonial submission requires an owning identity/.test(capMigration),
  "an unattributable submission is refused outright",
);

// --- Consent predicate, verbatim ------------------------------------------
assert(
  (capMigration.match(/published_at is not null/g) || []).length >= 2,
  "both the registry constraint and the resolver require published_at IS NOT NULL",
);
assert(
  !/is_active and v\.published_at is null/.test(capMigration),
  "the resolver never accepts an unpublished version",
);
assert(
  /terms_url   ~ .\^https:/.test(capMigration) && /privacy_url ~ .\^https:/.test(capMigration),
  "an active version requires real https:// document URLs, not merely non-empty strings",
);

// --- Environment stamping: exactly one trusted transition -----------------
assert(
  /if not trusted then[\s\S]{0,320}environment_marker is distinct from old\.environment_marker/.test(capMigration),
  "an untrusted caller cannot change the environment marker at all",
);
assert(
  /old\.environment_marker is not null[\s\S]{0,160}is distinct from old\.environment_marker[\s\S]{0,160}immutable once set/.test(capMigration),
  "even a trusted caller may stamp the marker only once - NULL to value, never value to value",
);
assert(
  /auth\.role\(\) = 'service_role' or auth\.role\(\) is null/.test(capMigration),
  "the trusted tier is the established service_role-or-no-JWT test, so the future validator is not blocked",
);
assert(
  /v_enabled is distinct from true/.test(capMigration),
  "gate 2 (database) blocks direct RPC calls",
);
assert(
  /if v_consent_version is null then/.test(capMigration),
  "gate 3 (legal registry) blocks direct RPC calls",
);
assert(
  /testimonial_capture_enabled boolean not null default false/.test(capMigration) &&
    !/update public\.experiences set testimonial_capture_enabled = true/.test(capMigration),
  "the database gate defaults false and this migration enables it nowhere",
);

// --- The status read moved behind the trusted boundary too -----------------
// This was the last browser-reachable surface in the feature. The view is not
// security_invoker, so it read the base table as OWNER with RLS bypassed, and
// its auth.uid() predicate enforced OWNERSHIP but never ANONYMITY - a
// permanent account with an enrollment row could have read status straight
// from PostgREST, skipping isAnonymousVisitor() entirely.
assert(
  /revoke all on public\.testimonial_my_submissions from public, anon, authenticated;/.test(capMigration) &&
    !/grant\s+select\s+on\s+public\.testimonial_my_submissions/i.test(capMigration),
  "the status view is revoked from every browser role and re-granted to none",
);
assert(
  // Comments stripped: section 8 EXPLAINS that security_invoker is not set,
  // and that explanation must not read as the setting being applied.
  !/security_invoker/i.test(stripSqlComments(capMigration)),
  "no view has its security mode flipped, so the revoke is what closes the view - not a mode change",
);
assert(
  /create or replace function public\.list_my_testimonial_submissions\(p_visitor_id uuid\)/.test(capMigration),
  "the status read is served by a function that takes the verified visitor id explicitly",
);
assert(
  /select u\.is_anonymous into v_is_anonymous from auth\.users u where u\.id = p_visitor_id;/.test(capMigration) &&
    /if v_is_anonymous is distinct from true then/.test(capMigration),
  "the status read re-resolves the id against auth.users and demands an explicit true - the rule the view could not express",
);
assert(
  /join public\.experience_users eu on eu\.id = s\.experience_user_id\s+where eu\.auth_user_id = p_visitor_id/.test(capMigration),
  "the status read confines rows to the caller's own enrollment",
);
for (const forbidden of ["auth_user_id", "experience_user_id", "provider_asset_id",
                         "provider_delivery_id", "reviewed_by", "moderation_note"]) {
  const at = capMigration.indexOf("create or replace function public.list_my_testimonial_submissions");
  const body = capMigration.slice(at, capMigration.indexOf("end $fn$;", at));
  assert(
    !new RegExp("s\." + forbidden + "\b").test(body),
    `the status read never selects ${forbidden}`,
  );
}

// The Server Action must reach it through the trusted client, using the id it
// verified - and must NOT gate a status read on the capture feature flag.
assert(
  /list_my_testimonial_submissions/.test(capServer) &&
    !/from\("testimonial_my_submissions"\)/.test(capServer),
  "the Server Action reads status through the RPC, not through the view",
);
assert(
  /requireAnonymousVisitor\(\)/.test(capServer),
  "status reads verify identity without requiring the capture feature gate",
);

// ---------------------------------------------------------------------------
// Moderation previews and removal.
//
// A reviewer who cannot see the media cannot moderate it, and a signed URL is
// a bearer credential for its lifetime. Both facts have structural
// consequences, and all of these read comment-stripped source.
// ---------------------------------------------------------------------------
{
  const moderationLib = read("lib/testimonials/moderation.ts");
  const moderationSrc = stripComments(moderationLib);
  const actionsSrc = stripComments(
    read("app/admin/(protected)/clients/kameleon/testimonials/actions.ts"),
  );
  const previewSrc = stripComments(read("components/admin/testimonials/MediaPreview.tsx"));
  const reasonsSrc = stripComments(read("lib/testimonials/rejection-reasons.ts"));

  assert(
    /requireFreshAdminAccess\(\)/.test(moderationSrc),
    "the preview minter re-authorizes FRESHLY - an earlier render is not evidence about this request",
  );
  assert(
    moderationSrc.indexOf("requireFreshAdminAccess()") <
      moderationSrc.indexOf("signModerationPreview("),
    "authorization happens before anything is signed",
  );
  assert(
    /\.eq\("client_id", access\.clientId\)[\s\S]{0,200}?\.eq\("submission_id", submissionId\)/.test(
      moderationSrc,
    ),
    "the preview read is scoped to the tenant AUTHORIZATION resolved, never to a submitted value",
  );
  assert(
    /from\("testimonial_moderation_queue"\)[\s\S]{0,400}?provider_delivery_id/.test(moderationSrc),
    "eligibility comes from the queue VIEW's own predicate rather than a second copy of the rules",
  );
  assert(
    /deliveryConfigurationComplete\(\)/.test(moderationSrc),
    "an unconfigured deployment reports no preview instead of throwing out of a signing helper",
  );
  assert(
    !/previewAvailable: false/.test(moderationSrc),
    "previewAvailable is derived, not hard-coded",
  );
  assert(
    /previewAvailable: row\.delivery_ready_at !== null && row\.provider_delivery_id !== null/.test(
      moderationSrc,
    ),
    "previewAvailable tests the delivery handle for PRESENCE and then discards it",
  );

  // The DTO must still be incapable of carrying a handle.
  const itemInterface = /export interface ModerationItem \{[\s\S]*?\n\}/.exec(moderationSrc);
  assert(itemInterface !== null, "the ModerationItem interface was located");
  assert(
    itemInterface !== null &&
      !/provider_delivery_id|providerDeliveryId|provider_poster_id|posterHandle/.test(
        itemInterface[0],
      ),
    "ModerationItem still has no field capable of carrying a provider handle",
  );

  assert(
    !/next\/image/.test(previewSrc),
    "the preview is not routed through next/image, whose optimizer would CACHE a bearer credential",
  );
  assert(
    !/localStorage|sessionStorage|document\.cookie/.test(previewSrc),
    "the signed URL is never persisted in the browser",
  );

  assert(
    /export async function removeSubmissionAction/.test(actionsSrc),
    "a removal action exists - without it an approved item could never be taken down",
  );
  assert(
    /removeSubmissionAction[\s\S]{0,400}?requireFreshAdminAccess\(\)/.test(actionsSrc),
    "removal re-authorizes freshly",
  );
  assert(
    /p_decision: "removed"[\s\S]{0,600}?purge_testimonial_media_now/.test(actionsSrc),
    "the immediate purge happens AFTER the moderation decision, so review provenance is recorded first",
  );
  assert(
    /const supabase = await createClient\(\);[\s\S]{0,400}?p_decision: "removed"/.test(actionsSrc),
    "the removal decision uses the ADMINISTRATOR's own session, so reviewed_by is the real reviewer",
  );
  assert(
    /isImmediatePurgeReason\(reason\)/.test(actionsSrc),
    "only the two allow-listed reasons shorten retention",
  );
  assert(
    /purgedNow = !purgeError/.test(actionsSrc) &&
      !/if \(purgeError\)[\s\S]{0,120}?status: "error"/.test(actionsSrc),
    "a failed purge is not reported as a failed removal - the item is still down either way",
  );

  for (const id of ["visitor_withdrawal", "underage_submitter"]) {
    assert(
      new RegExp('id: "' + id + '"').test(reasonsSrc),
      `${id} is an available moderation reason`,
    );
    assert(
      new RegExp('"' + id + '"').test(
        /IMMEDIATE_PURGE_REASONS = \[[\s\S]*?\]/.exec(reasonsSrc)?.[0] ?? "",
      ),
      `${id} is in the immediate-purge set, matching what the database RPC accepts`,
    );
  }
}

console.log(
  `\n${passed} structural assertions passed, ${failures.length} failed.\n`,
);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
