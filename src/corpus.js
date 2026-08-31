/* Facts derived from data/55_sessions.txt by scripts/analyze-corpus.js.

   The filename and original product copy say 55 sessions, but the dump has
   56 timestamped entries. Both numbers stay visible so provenance is never
   silently rewritten. Planner defaults use only simple, reproducible facts:
   cadence and the most common accessory work before conditioning. */
export const CORPUS_DEFAULTS = {
  statedSessions: 55,
  timestampedEntries: 56,
  firstDate: "2025-07-10",
  lastDate: "2026-08-14",
  weekdayCounts: { 0: 1, 1: 23, 2: 2, 3: 24, 4: 3, 5: 3, 6: 0 },
  trainingDays: [1, 3],
  strengthFocus: ["lower", "press"],
  accessory: [
    { moveId: "walking_lunge", sets: 3, reps: 8, kg: 0, sessions: 10 },
    { moveId: "db_row", sets: 3, reps: 10, kg: 0, sessions: 6 },
  ],
};
