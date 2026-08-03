/**
 * This dashboard has no authentication or route protection yet. Every
 * /admin route is reachable by anyone with the URL — do not treat it as
 * secure. Real Supabase auth + server-side route protection + RLS land in
 * Phase 7; this banner should stay until that phase is approved and live.
 */
export function DevAuthNotice() {
  return (
    <div
      role="note"
      className="flex items-center justify-center gap-2 bg-admin-warning-bg px-4 py-2 text-center text-xs font-medium text-admin-warning"
    >
      <span aria-hidden="true">⚠</span>
      Development mode — this dashboard is not authenticated. Anyone with the URL can access it.
      Real sign-in and route protection are added in Phase 7.
    </div>
  );
}
