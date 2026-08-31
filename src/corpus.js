/* Facts derived from data/55_sessions.txt and data/annotations.json by
   scripts/analyze-corpus.js.

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
  /* Every accessory movement the log evidences that the app can also offer,
     with the number of sessions it appears in and the dose most often written
     next to it. Regenerate with `npm run corpus`, which reads the structural
     annotation in data/annotations.json rather than guessing block boundaries
     from marker words.

     The guess is why this table used to be led by walking lunges and box
     step-ups: both appear inside conditioning pieces and neither appears in a
     real accessory block even once. */
  accessory: [
    { moveId: "db_row", sets: 3, reps: 10, kg: 0, sessions: 6 },
    { moveId: "pull_up", sets: 4, reps: 6, kg: 0, sessions: 5 },
    { moveId: "farmer_carry", sets: 4, reps: 20, kg: 0, sessions: 4 },
    { moveId: "plank", sets: 3, reps: 40, kg: 0, sessions: 2 },
    { moveId: "v_up", sets: 4, reps: 15, kg: 0, sessions: 2 },
    { moveId: "side_plank", sets: 3, reps: 40, kg: 0, sessions: 1 },
    { moveId: "sit_up", sets: 3, reps: 20, kg: 0, sessions: 1 },
    { moveId: "glute_bridge", sets: 3, reps: 12, kg: 0, sessions: 1 },
    { moveId: "renegade_row", sets: 4, reps: 8, kg: 0, sessions: 1 },
  ],
  /* Accessory work the log records that the app has no movement for, led by
     the three most common of the lot. Named rather than mapped onto the
     nearest thing the catalogue does have: calling a Bulgarian split squat a
     walking lunge loses the per-side dose and prices it at half. */
  unrepresentedAccessory: {
    db_press: 8, split_squat: 7, back_extension: 7, suitcase_carry: 3,
    ab_wheel: 2, ham_curl: 2, face_pull: 1, pallof: 1,
  },
  /* How many accessory movements a session carries. Half the entries have no
     accessory block at all; the rest carry one to four. The app always builds
     one, which is a product choice rather than something the log supports: the
     zero case is deliberately not drawn from. */
  accessoryBlockSizes: { 0: 28, 1: 10, 2: 12, 3: 4, 4: 2 },
  sessionsWithAccessory: 28,
  sessionsWithBarbell: 17,
  sessionsWithConditioning: 54,
};
