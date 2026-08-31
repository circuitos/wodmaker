/* =========================== STRENGTH LIFTS =========================== */
import { MOVES } from "./moves.js";

/*
  The barbell work that comes before the conditioning piece.

  Same idea as a MOVES entry, different job. A MOVES entry is something the
  generator can put in a workout; a lift is something you tell the app you
  already did, so it can build around the state you are in.

  load : share of the effort taken by each axis. Sums to ~1, exactly like
         MOVES. The shares for squat, deadlift, press and pull are the seven
         old hand-tuned STRENGTH presets, normalised; the rest are set
         relative to those.
  toll : effort per rep against the baseline. 1.0 is a normal grinding lift.
         Deadlifts cost about twice what their rep count suggests, which is
         why the rep-count formula alone underestimated them by half.
  bar  : the empty bar in kg, used when you enter a percentage and want the
         kilos back. 0 for lifts not done on a barbell.
*/

/* One working rep at 75% of your one-rep max. Everything scales off this, and
   it is calibrated against the old presets: bench 5x4 at 86% comes out at 114
   points where the authored `press` preset said 115. */
export const REP_AT_75 = 5;
export const REF_PCT = 0.75;

export const LIFTS = [
  { id: "back_squat", es: "sentadilla trasera", en: "back squat", bar: 20, toll: 1.0, env: ["gym"],
    load: { piernas: 0.64, posterior: 0.21, core: 0.15 } },
  { id: "front_squat", es: "sentadilla frontal", en: "front squat", bar: 20, toll: 1.0, env: ["gym"],
    load: { piernas: 0.60, posterior: 0.15, core: 0.25 } },
  { id: "deadlift", es: "peso muerto", en: "deadlift", bar: 20, toll: 2.0, env: ["gym"],
    load: { posterior: 0.51, agarre: 0.24, piernas: 0.14, core: 0.11 } },
  { id: "rdl", es: "peso muerto rumano", en: "Romanian deadlift", bar: 20, toll: 1.5, env: ["gym"],
    load: { posterior: 0.58, agarre: 0.22, piernas: 0.10, core: 0.10 } },
  { id: "hip_thrust", es: "hip thrust", en: "hip thrust", bar: 20, toll: 0.8, env: ["gym"],
    load: { posterior: 0.70, piernas: 0.20, core: 0.10 } },
  { id: "lunge", es: "zancadas con barra", en: "barbell lunge", bar: 20, toll: 1.0, env: ["gym"],
    load: { piernas: 0.62, posterior: 0.23, core: 0.15 } },
  { id: "bench", es: "press banca", en: "bench press", bar: 20, toll: 1.0, env: ["gym"],
    load: { empuje: 0.74, core: 0.17, traccion: 0.09 } },
  { id: "ohp", es: "press militar", en: "overhead press", bar: 20, toll: 1.1, env: ["gym"],
    load: { empuje: 0.68, core: 0.24, traccion: 0.08 } },
  { id: "push_press", es: "push press", en: "push press", bar: 20, toll: 1.0, env: ["gym"],
    load: { empuje: 0.58, piernas: 0.20, core: 0.22 } },
  { id: "weighted_pullup", es: "dominadas lastradas", en: "weighted pull-up", bar: 0, toll: 1.0, env: ["gym", "parque"],
    load: { traccion: 0.61, agarre: 0.29, core: 0.10 } },
  { id: "barbell_row", es: "remo con barra", en: "barbell row", bar: 20, toll: 1.0, env: ["gym"],
    load: { traccion: 0.55, agarre: 0.25, posterior: 0.12, core: 0.08 } },
  { id: "power_clean", es: "cargada de potencia", en: "power clean", bar: 20, toll: 1.6, env: ["gym"],
    load: { posterior: 0.38, piernas: 0.25, traccion: 0.17, agarre: 0.12, core: 0.08 } },
];

export const liftById = (id) => LIFTS.find((l) => l.id === id);

/* Points for one entry in the grid. `pct` is the working weight over your
   one-rep max, so 75 kg on an 87.5 kg bench is 0.857. Without a 1RM on file
   there is nothing to take a percentage of, so it falls back to REF_PCT and
   the answer is a rougher estimate. */
export function liftPoints({ liftId, sets, reps, pct }) {
  const lift = liftById(liftId);
  if (!lift || !sets || !reps) return 0;
  const intensity = (pct || REF_PCT) / REF_PCT;
  return sets * reps * REP_AT_75 * intensity * lift.toll;
}

/* ---------------------------- ACCESSORY WORK ----------------------------
 *
 * The second half of a strength block, and a different animal. Dumbbells at a
 * moderate load, higher reps, deliberately short of limits. Nobody tracks a
 * split-squat one-rep max, so a percentage of one cannot be entered, and the
 * formula above prices these reps as heavy working reps if you let it: a
 * 3x8-per-side split squat came out at 240 points, more than a 5x4 squat and a
 * 5x4 bench together.
 *
 * These need no new maths, because the conditioning half already prices them.
 * Every entry here is a MOVES id, charged per rep by its own `cost`, which is
 * exactly what happens when the same movement turns up inside a workout.
 *
 * refKg is the load that movement's cost already assumes. A row's own weight
 * scales against it, clamped, so a heavier dumbbell counts for more without a
 * typo being able to blow the number up. Where MOVES gives a range the middle
 * is taken; where the movement is bodyweight, refKg is a typical loaded value.
 */
export const ACCESSORY = [
  { moveId: "walking_lunge", refKg: 20 },
  { moveId: "step_up", refKg: 20 },
  { moveId: "goblet_squat", refKg: 32 },
  { moveId: "air_squat", refKg: 0 },
  { moveId: "glute_bridge", refKg: 0 },
  { moveId: "db_row", refKg: 22 },
  { moveId: "ring_row", refKg: 0 },
  { moveId: "db_push_press", refKg: 30 },
  { moveId: "push_up", refKg: 0 },
  { moveId: "sit_up", refKg: 0 },
  { moveId: "v_up", refKg: 0 },
  { moveId: "plank", refKg: 0 },
  /* Machine and running work belongs here as well as in a conditioning piece:
     it is common between the barbell and the WOD, and running in particular is
     the one piece of supplementary work that needs no equipment at all. Priced
     per unit by the movement's own `cost`, same as every other accessory, so a
     500 m row is about 31 points and 400 m of running about 30. */
  /* Evidenced as accessory work in the source log and already in `MOVES`, so
     offering them costs nothing: pull-ups in 5 sessions, farmer carries in 4,
     renegade rows and side planks in 1 each. */
  { moveId: "pull_up", refKg: 0 },
  { moveId: "farmer_carry", refKg: 0 },
  { moveId: "renegade_row", refKg: 30 },
  { moveId: "side_plank", refKg: 0 },
  { moveId: "row_cal", refKg: 0 },
  { moveId: "row_m", refKg: 0 },
  { moveId: "run_m", refKg: 0 },
];

/* A row is one of two kinds and they are two different blocks of a session:
   heavy barbell work against a one-rep max, and the supplementary work that
   sits between it and the conditioning piece. They are priced differently
   already; this is what lets them be shown separately too. */
export function splitRows(rows = []) {
  return {
    lifts: rows.filter((row) => row.liftId),
    accessory: rows.filter((row) => row.moveId),
  };
}

/* A fresh accessory row. Movements counted in reps take the usual three sets
   of eight. A distance, calorie or time piece takes one set of the dose the
   movement is normally prescribed at, because "3x8 m" is not a thing and a
   24-second plank was not intended either. */
export function defaultAccessoryRow(moveId) {
  const move = moveById(moveId);
  return move && move.unit !== "reps"
    ? { moveId, sets: 1, reps: move.dose[1], kg: 0 }
    : { moveId, sets: 3, reps: 8, kg: 0 };
}

/* How much of a movement one accessory set can hold. Reps cap at 60, but a
   distance or calorie piece is written in hundreds of metres, so the ceiling
   comes from the movement's own prescribed dose. */
export function accessoryRepMax(move) {
  return move ? Math.max(60, move.dose[1] * 5) : 60;
}

export const accessoryById = (id) => ACCESSORY.find((a) => a.moveId === id);

/* What you can actually do where you are. A barbell lift needs a barbell, so
   every one of them is gym-only; a weighted pull-up needs something to hang
   from, which the park has. Accessory work inherits availability from the
   movement it names, which `MOVES` already records. */
export const liftsFor = (env) => LIFTS.filter((lift) => lift.env.includes(env));
export const accessoriesFor = (env) => ACCESSORY.filter(
  (acc) => moveById(acc.moveId)?.env.includes(env),
);
export const rowAvailable = (row, env) => (row.liftId
  ? !!liftById(row.liftId)?.env.includes(env)
  : !!moveById(row.moveId)?.env.includes(env));
export const moveById = (id) => MOVES.find((m) => m.id === id);

/* Points for one accessory row. `reps` is per set, and per side where the
   movement is unilateral, matching how it would be written on a whiteboard. */
export function accessoryPoints({ moveId, sets, reps, kg }) {
  const acc = accessoryById(moveId);
  const move = moveById(moveId);
  if (!acc || !move || !sets || !reps) return 0;
  const loadFactor = acc.refKg > 0 && kg > 0
    ? Math.min(2.5, Math.max(0.4, kg / acc.refKg))
    : 1;
  return sets * reps * move.cost * (move.side ? 2 : 1) * loadFactor;
}

/* Turn the whole grid into the axis load you arrive carrying.
 *
 * `dampen` is derived rather than authored, and it has to be: there is no way
 * to hand-tune a number for every combination of lifts and weights someone
 * might tick. The two coefficients are a least-squares fit against the seven
 * old presets, and they hold five of them inside 0.03. Leg work suppresses
 * later conditioning about twice as hard as upper-body work, which is the bit
 * the old per-preset numbers knew and a points total alone does not.
 */
const DAMP_PER_POINT = 0.000659;
const DAMP_PER_LEG_POINT = 0.000608;
const LEG_AXES = ["piernas", "posterior"];

/* Turn any axis vector into the `arriving` shape the generator consumes.
   Strength rows use this below, and the week planner uses the same function
   for fatigue carried from earlier sessions. Keeping the conversion here
   means both sources agree on how total and leg-heavy work suppress what
   follows. */
export function arrivingFromAxis(pre = {}) {
  const points = Object.values(pre).reduce((sum, value) => sum + value, 0);
  const legPoints = LEG_AXES.reduce((sum, axis) => sum + (pre[axis] || 0), 0);
  const legShare = points > 0 ? legPoints / points : 0;
  const drop = points * (DAMP_PER_POINT + DAMP_PER_LEG_POINT * legShare);
  return { pre, dampen: Math.max(0.55, 1 - drop), points };
}

export function arrivingFromLifts(rows) {
  const pre = {};

  for (const row of rows) {
    // A row is either a main lift, priced against a one-rep max, or accessory
    // work, priced per rep. Both end up as points spread over the same axes.
    const source = row.moveId ? moveById(row.moveId) : liftById(row.liftId);
    const p = row.moveId ? accessoryPoints(row) : liftPoints(row);
    if (!source || p <= 0) continue;
    for (const [axis, share] of Object.entries(source.load)) {
      pre[axis] = (pre[axis] || 0) + p * share;
    }
  }
  return arrivingFromAxis(pre);
}

/* The seven old presets, kept as one-tap shortcuts. Each is now just a set of
   rows for the grid rather than its own hand-tuned axis map, so ticking a
   preset and typing the same numbers by hand give the same answer. The sets,
   reps and percentages are chosen to land near what each preset used to be
   worth: squat 133 against an authored 140, press 114 against 115, deadlift
   180 against 185, pull 133 against 140. */
export const PRESET_ROWS = {
  none: [],
  squat: [{ liftId: "back_squat", sets: 5, reps: 5, pct: 0.80 }],
  deadlift: [{ liftId: "deadlift", sets: 5, reps: 3, pct: 0.90 }],
  press: [{ liftId: "bench", sets: 5, reps: 4, pct: 0.86 }],
  pull: [{ liftId: "weighted_pullup", sets: 5, reps: 5, pct: 0.80 }],
  lower: [
    { liftId: "back_squat", sets: 3, reps: 5, pct: 0.80 },
    { liftId: "rdl", sets: 3, reps: 5, pct: 0.70 },
  ],
  full: [
    { liftId: "back_squat", sets: 3, reps: 5, pct: 0.80 },
    { liftId: "bench", sets: 3, reps: 5, pct: 0.80 },
    { liftId: "barbell_row", sets: 4, reps: 5, pct: 0.75 },
  ],
};

/* A shortcut resolved to the same shape a hand-filled grid arrives in, so the
   generator cannot tell which one you used. */
export function arrivingFromPreset(id) {
  return arrivingFromLifts(PRESET_ROWS[id] || []);
}

/* Warm-up ramps are not logged, and should not be.
 *
 * A ramp to a working weight (6 at 20, 4 at 40, 4 at 60 before 5x4 at 75) comes
 * to about 40 points under liftPoints, which would be 35% on top of the working
 * sets. Two reasons not to count it.
 *
 * The formula scales effort linearly with percentage of a max, and that only
 * holds over the working range. It prices a 23% rep at 30% of an 86% rep, when
 * a set of six at 23% is genuinely free. Below roughly 60% the linear term is
 * not trustworthy, which is exactly where every warm-up set lives.
 *
 * More decisively, the calibration already contains them. The old presets
 * described whole sessions: `press` was worth 115 points as a bench day, ramp
 * included. Logging the ramp separately would count it twice.
 */

/* The percentage a grid row is really at: the entered kg over a stored 1RM
   when both exist, else whatever pct a preset carried (or nothing, for
   accessory rows, which never have a max to divide by). Shared by the input
   grid and by anything that renders a row back out, so both always agree. */
export function pctFor(row, oneRM) {
  return oneRM[row.liftId] > 0 && row.kg > 0 ? row.kg / oneRM[row.liftId] : row.pct;
}
