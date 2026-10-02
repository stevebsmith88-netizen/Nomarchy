// Daily tidy-up of log-style tables that otherwise grow forever (run by the
// daily job in app/api/refresh-coords). Only records nothing reads any more:
// - ai_calls: only the last hour matters (the AI rate limit); keep 30 days.
// - dismissed_notifications: the feed only looks back 30 days.
// - place_lookup_cache: old AI lookups for restaurants; refetched if needed.
// Google usage counts are kept (they feed Admin's all-time totals).

const DAY = 24 * 60 * 60 * 1000;

export async function cleanUpOldRecords(admin, { now = () => Date.now() } = {}) {
  const before = (days) => new Date(now() - days * DAY).toISOString();
  const jobs = [
    ["ai_calls", "called_at", 30],
    ["dismissed_notifications", "dismissed_at", 30],
    ["place_lookup_cache", "created_at", 90],
  ];
  const results = {};
  for (const [table, column, days] of jobs) {
    const { error } = await admin.from(table).delete().lt(column, before(days));
    results[table] = error ? "skipped" : "ok";
  }
  return results;
}
