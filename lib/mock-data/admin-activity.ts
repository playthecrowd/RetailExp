/**
 * Placeholder activity feed — clearly mock, not sourced from any real event
 * log. Replaced by real Phase 9 analytics/activity tracking once Supabase is
 * connected.
 */
export interface MockActivityEntry {
  isMock: true;
  id: string;
  message: string;
  timestampIso: string;
}

export const mockRecentActivity: MockActivityEntry[] = [
  {
    isMock: true,
    id: "activity-1",
    message: "Kameleon client record created",
    timestampIso: "2026-08-02T00:00:00.000Z",
  },
  {
    isMock: true,
    id: "activity-2",
    message: "Design foundation (Phase 1) approved",
    timestampIso: "2026-08-02T00:05:00.000Z",
  },
  {
    isMock: true,
    id: "activity-3",
    message: "Admin dashboard scaffolding started (Phase 2)",
    timestampIso: "2026-08-02T00:10:00.000Z",
  },
];
