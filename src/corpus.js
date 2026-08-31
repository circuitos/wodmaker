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
  /* Every accessory movement the log evidences, with the number of sessions it
     appears in before the conditioning marker. `sets` and `reps` are the dose
     written in the log where one is legible and 3x8 otherwise, which is what
     the great majority of the readable lines say. Weighted by `sessions`, this
     is the pool a day's accessory block is drawn from. */
  accessory: [
    { moveId: "walking_lunge", sets: 3, reps: 8, kg: 0, sessions: 10 },
    { moveId: "db_row", sets: 3, reps: 10, kg: 0, sessions: 6 },
    { moveId: "db_push_press", sets: 3, reps: 8, kg: 0, sessions: 5 },
    { moveId: "step_up", sets: 3, reps: 8, kg: 0, sessions: 4 },
    { moveId: "plank", sets: 3, reps: 30, kg: 0, sessions: 4 },
    { moveId: "ring_row", sets: 3, reps: 8, kg: 0, sessions: 3 },
    { moveId: "sit_up", sets: 3, reps: 8, kg: 0, sessions: 3 },
    { moveId: "v_up", sets: 3, reps: 8, kg: 0, sessions: 3 },
    { moveId: "push_up", sets: 3, reps: 8, kg: 0, sessions: 2 },
    { moveId: "goblet_squat", sets: 3, reps: 8, kg: 0, sessions: 1 },
    { moveId: "air_squat", sets: 3, reps: 8, kg: 0, sessions: 1 },
    { moveId: "glute_bridge", sets: 3, reps: 12, kg: 0, sessions: 1 },
  ],
  /* How many accessory movements a session carries. Half the entries are
     conditioning only; the rest carry one to three, most often one. The app
     always builds a block, which is a product choice rather than something the
     log supports: the zero case is deliberately not drawn from. */
  accessoryBlockSizes: { 0: 28, 1: 18, 2: 5, 3: 5 },
  sessionsWithAccessory: 28,
};
