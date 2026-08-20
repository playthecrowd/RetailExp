import "server-only";

import { createSecretClient } from "@/lib/supabase/secret";

/**
 * TEMPORARY, and deleted the moment types are regenerated.
 *
 * lib/supabase/database.types.ts is generated FROM THE APPLIED SCHEMA, so the
 * gifting tables cannot appear in it until 20260822090000 has been pushed.
 * Until then every query against them is a type error, and the branch would
 * not build.
 *
 * Rather than spray `as never` across a dozen call sites, the cast lives here
 * once, with its expiry condition written down. The same pattern the platform
 * already used for content_nodes.video360_asset_id, for the same reason and
 * with the same ending: regenerate the types, delete this file, and the
 * compiler starts checking these queries properly.
 *
 * It casts the CLIENT, not the results. Every caller still declares the shape
 * it expects, so the loss of checking is confined to table and column names.
 */
type LooseClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export function giftingClient(): LooseClient {
  return createSecretClient() as unknown as LooseClient;
}
