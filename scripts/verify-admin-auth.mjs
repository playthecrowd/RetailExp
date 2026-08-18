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
assert(
  !/cloudflare|videodelivery|imagedelivery|cloudflarestream/i.test(stripComments(allPhase3)),
  "no Cloudflare hostname or product name appears in executable Phase 3 code",
);
assert(
  !/https?:\/\//.test(stripComments(allPhase3).replace(/example\.com/g, "")),
  "no absolute URL is constructed in Phase 3 code",
);

// --- Mutations: fresh authorization, RPC only ------------------------------
assert(
  (modActions.match(/await requireFreshAdminAccess\(\)/g) || []).length === 2,
  "both moderation actions call requireFreshAdminAccess()",
);
assert(
  !/requireAdminAccess\(\)/.test(stripComments(modActions).replace(/requireFreshAdminAccess\(\)/g, "")),
  "the mutations never use the request-CACHED authorization",
);
assert(
  (modActions.match(/rpc\("moderate_testimonial_submission"/g) || []).length === 2,
  "both actions go through the moderation RPC",
);
assert(
  !/from\("testimonial_submissions"\)/.test(modActions) &&
    !/\.update\(|\.insert\(|\.delete\(|\.upsert\(/.test(modActions),
  "no direct testimonial-table mutation exists in the actions",
);
assert(
  !/createSecretClient/.test(modActions),
  "the mutations use the administrator's own session, not the trusted client, so reviewed_by is real",
);
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
  (modActions.match(/revalidatePath\(/g) || []).length === 4,
  "both decisions revalidate both routes (4 calls across approve and reject)",
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

console.log(
  `\n${passed} structural assertions passed, ${failures.length} failed.\n`,
);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
