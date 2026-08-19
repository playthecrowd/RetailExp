import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * A resolve hook that lets Node's built-in TypeScript stripping follow this
 * project's ordinary import style.
 *
 * TWO THINGS NODE WILL NOT DO ON ITS OWN
 *   1. Relative specifiers need an explicit extension in ESM, and application
 *      code is written the normal TypeScript way — `from "./pathway-model"`.
 *   2. `@/…` is a tsconfig path alias. Node knows nothing about tsconfig, so
 *      it reads it as a bare package name and fails.
 *
 *   Every earlier verifier in scripts/ happens to test modules with neither,
 *   which is why this has not been needed before. The reducer has both.
 *
 * WHY NOT CHANGE THE IMPORTS
 *   Rewriting application source to suit a test harness is the wrong
 *   direction, and Turbopack does not want extensions on relative imports
 *   anyway. The harness adapts to the code.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *   It resolves no bare package name, and it never rewrites a specifier that
 *   already resolves — every rewrite happens only after the default resolver
 *   has failed, or (for `@/`) for the one prefix tsconfig defines. It cannot
 *   change which file a working import points at.
 */

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** Mirrors the single `"@/*": ["./*"]` entry in tsconfig.json. */
const ALIAS = "@/";

function withExtension(absolutePath) {
  if (existsSync(absolutePath)) return absolutePath;
  for (const suffix of [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"]) {
    const candidate = `${absolutePath}${suffix}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(ALIAS)) {
    const target = withExtension(join(ROOT, specifier.slice(ALIAS.length)));
    if (target !== null) {
      return { url: pathToFileURL(target).href, shortCircuit: true };
    }
  }

  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const hasExtension = /\.[A-Za-z0-9]+$/.test(specifier);
    if (relative && !hasExtension && context.parentURL) {
      const target = withExtension(
        resolvePath(dirname(fileURLToPath(context.parentURL)), specifier),
      );
      if (target !== null) {
        return { url: pathToFileURL(target).href, shortCircuit: true };
      }
    }
    throw error;
  }
}
