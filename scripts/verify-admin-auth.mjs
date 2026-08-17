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
assert(protectedPages.length === 3, `all three admin pages moved under (protected) (found ${protectedPages.length})`);

for (const expected of [
  "app/admin/(protected)/page.tsx",
  "app/admin/(protected)/clients/page.tsx",
  "app/admin/(protected)/clients/kameleon/page.tsx",
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

console.log(
  `\n${passed} structural assertions passed, ${failures.length} failed.\n`,
);
if (failures.length > 0) {
  for (const f of failures) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
