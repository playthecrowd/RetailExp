import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Serves the AR Quick Look USDZ asset with the exact MIME type Apple's
 * WebKit AR Quick Look expects (`model/vnd.usdz+zip`). Next's default
 * static file serving from `public/` infers content-type from a generic
 * mime table that may not reliably map `.usdz`, which was the likely cause
 * of an unreliable Quick Look launch on physical-device testing — serving
 * it through a route handler with an explicit header removes that
 * uncertainty regardless of host/CDN defaults.
 */
export const dynamic = "force-static";

export async function GET() {
  const filePath = path.join(process.cwd(), "public/assets/kameleon/ar/sample-static-model.usdz");
  const file = await readFile(filePath);
  return new Response(new Uint8Array(file), {
    headers: {
      "Content-Type": "model/vnd.usdz+zip",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
