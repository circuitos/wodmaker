import { AXES, ENVS } from "./moves.js";
import { INTENSITY, intensityK } from "./formats.js";
import { generate, mulberry32, sessionAxisLoad, sessionLoad } from "./generator.js";
import {
  PRESET_ROWS, accessoryPoints, accessoriesFor, arrivingFromAxis, arrivingFromLifts,
  defaultAccessoryRow, liftById, moveById, pctFor, rowAvailable, splitRows,
} from "./lifts.js";
import { CORPUS_DEFAULTS } from "./corpus.js";

/* A point on Monday is not a point still carried in full on Wednesday. This
   is an explicit planning heuristic, not a claim extracted from the corpus:
   55% survives each calendar day, giving roughly 30% after the usual
   Monday-to-Wednesday gap in the source sessions. */
export const DAILY_CARRY = 0.55;

/* What a good day is worth, by where you train. A gym day has a barbell in it
   and can carry a great deal more than a park or a living room, so one target
   for all three made the automatic effort read as timid at the gym and
   unreachable at home.

   These are chosen against what each environment can actually produce, not
   picked for how they read: with a full barbell block a gym session runs to a
   median of 377 points at normal effort and 427 at hard, a park session with
   weighted pull-ups to 272 and 318, and a session with no loadable movement at
   all to about 177 and 240. Re-measure before moving them. */
export const TARGET_DAY_LOAD = { gym: 450, parque: 350, casa: 320 };
export const targetFor = (env) => TARGET_DAY_LOAD[env] ?? TARGET_DAY_LOAD.gym;

/* How much work a day carries before the conditioning piece, in points, across
   the barbell block and the accessory block together. At the gym the barbell
   does the heavy lifting and the log's own accessory blocks are small, so
   `null` means size the accessory block the way the log sizes one rather than
   fill to a budget.

   Away from a barbell the accessory block has to do that work instead, and the
   log has nothing to say about it because every session in it was a gym
   session. These two figures are a product choice tuned against the targets
   above. The budget covers the whole block, so a park day that keeps weighted
   pull-ups gets a small accessory block and one with no barbell at all gets a
   long one. */
const PRE_BUDGET = { gym: null, parque: 150, casa: 115 };

const SCHEDULES = {
  2: CORPUS_DEFAULTS.trainingDays,
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
};

const FOCUS = {
  2: CORPUS_DEFAULTS.strengthFocus,
  3: ["squat", "press", "deadlift"],
  4: ["squat", "press", "deadlift", "pull"],
  5: ["squat", "press", "deadlift", "pull", "none"],
};

export const WEEK_COUNTS = [2, 3, 4, 5];

export function weekCount(count) {
  return WEEK_COUNTS.includes(Number(count)) ? Number(count) : 2;
}

/* A strength preset, turned into rows a day can own and edit. Kilos come from
   the one-rep maxes on file, exactly as the daily grid fills them in. */
export function rowsForPreset(id, oneRM = {}) {
  return (PRESET_ROWS[id] || []).map((row) => ({
    ...row,
    kg: oneRM[row.liftId] > 0 && row.pct ? Math.round(oneRM[row.liftId] * row.pct) : 0,
  }));
}

/* The accessory block, drawn the way the source log writes one.

   Half the entries in the log are conditioning only, but a session here always
   gets a block: that is a product choice, not a corpus frequency, so only the
   non-zero sizes are drawn from. Within that, both the size (one movement most
   often, never more than three) and which movements come up are weighted by
   what the log actually contains, and each is written at the dose recorded
   next to it. Machine and running work is offered in the grid but never drawn,
   since the log gives no evidence for it as accessory work. */
export function drawAccessory(seed = 0, env = "gym", budget = undefined) {
  const random = mulberry32(seed >>> 0);
  const weighted = (items, weight) => {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let r = random() * total;
    for (const item of items) { r -= weight(item); if (r <= 0) return item; }
    return items[items.length - 1];
  };

  const offered = accessoriesFor(env).map((acc) => acc.moveId);
  const evidenced = new Set(CORPUS_DEFAULTS.accessory.map((entry) => entry.moveId));
  /* The movements the log evidences come first, weighted by how often it
     records them. Away from a barbell the budget can outrun that pool, so
     whatever else the place allows fills the rest, at a low weight and using
     each movement's own default dose. Filler is not corpus support and is not
     described as any. */
  const pool = [
    ...CORPUS_DEFAULTS.accessory.filter((entry) => offered.includes(entry.moveId)),
    ...offered.filter((id) => !evidenced.has(id))
      .map((id) => ({ ...defaultAccessoryRow(id), sessions: 0.3 })),
  ];
  const cap = budget === undefined ? PRE_BUDGET[env] ?? null : budget;

  /* With a barbell in the session, the log says how big this block is: one
     movement most often, never more than three. Without one, keep drawing
     until the block is worth doing on its own. */
  /* The heaviest accessory block in the log is worth about 160 points. With a
     barbell in the session the size comes from the log but the cost does not,
     so a draw of three expensive movements could reach 289 and outweigh the
     piece it precedes. Away from a barbell the budget governs instead. */
  const ceiling = cap === null ? 160 : Infinity;
  let want = 5;
  if (cap === null) {
    const sizes = Object.entries(CORPUS_DEFAULTS.accessoryBlockSizes)
      .map(([size, count]) => ({ size: Number(size), count }))
      .filter((entry) => entry.size > 0);
    want = weighted(sizes, (entry) => entry.count).size;
  }

  const picked = [];
  let points = 0;
  while (pool.length && picked.length < want && (cap === null || points < cap)) {
    const choice = weighted(pool, (item) => item.sessions);
    pool.splice(pool.indexOf(choice), 1);
    const row = { moveId: choice.moveId, sets: choice.sets, reps: choice.reps, kg: choice.kg || 0 };
    const cost = accessoryPoints(row);
    /* A movement that would take the block past the ceiling is passed over
       rather than ending the draw, so one heavy choice cannot land beyond it.
       The first is always taken: a block of nothing is not the answer. */
    if (picked.length > 0 && points + cost > ceiling) continue;
    picked.push(row);
    points += cost;
  }
  return picked;
}

/* Which shortcuts can be done where you are. A barbell block is not available
   in a park, so the list the interface offers has to be filtered rather than
   the choice quietly producing work you cannot do. */
export function presetsFor(env) {
  return Object.keys(PRESET_ROWS).filter(
    (id) => PRESET_ROWS[id].every((row) => rowAvailable(row, env)),
  );
}

/* The most substantial barbell block a place can support, used when the one
   you had is not available there. A park keeps weighted pull-ups rather than
   dropping to nothing at all; a living room has no answer and gets "none". */
export function bestPresetFor(env) {
  return presetsFor(env).reduce(
    (best, id) => (PRESET_ROWS[id].length > PRESET_ROWS[best].length ? id : best),
    "none",
  );
}

/* A day's starting rows: the barbell shortcut for that slot if the place you
   are training has the equipment for it, plus an accessory block sized for
   what is left. Both are replaceable; this is only what you arrive to. */
/* The budget covers the barbell block and the accessory block together, so
   whatever the lifts already deliver is not asked of the accessories again.
   Every path that draws a block goes through here: "Another" used to call
   `drawAccessory` directly and hand a park day the whole budget on top of its
   weighted pull-ups, which took the pre-conditioning work from 155 points to
   269. */
export function accessoryBudget(env, lifts, oneRM = {}) {
  const total = PRE_BUDGET[env] ?? null;
  if (total === null) return null;
  const points = arrivingFromLifts(lifts.map((row) => ({ ...row, pct: pctFor(row, oneRM) }))).points;
  return Math.max(0, total - points);
}

export function rowsForDay(preset, oneRM = {}, seed = 0, env = "gym") {
  const usable = presetsFor(env).includes(preset) ? preset : bestPresetFor(env);
  const lifts = rowsForPreset(usable, oneRM);
  return [...lifts, ...drawAccessory(seed, env, accessoryBudget(env, lifts, oneRM))];
}

/* Redraw a day's accessory block, keeping the barbell block it already has. */
export function redrawRows(config, oneRM = {}, seed = 0) {
  const { lifts } = splitRows(config.rows || []);
  return [...lifts, ...drawAccessory(seed, config.env, accessoryBudget(config.env, lifts, oneRM))];
}

const rowKey = (row) => `${row.liftId || row.moveId}:${row.sets}x${row.reps}`;
const rowsKey = (rows) => (rows || []).map(rowKey).sort().join("|");

/* Which shortcut a day's barbell work corresponds to, or "custom" once it has
   been edited away from all of them. The rows are the stored fact; the preset
   name is derived, so the two can never disagree.

   Only the lifts are considered. A shortcut names the heavy block, and the
   accessory work between it and the conditioning piece is a separate part of
   the session that a squat day and a press day can share. */
export function presetFor(rows) {
  const key = rowsKey(splitRows(rows).lifts);
  return Object.keys(PRESET_ROWS).find((id) => rowsKey(PRESET_ROWS[id]) === key) || "custom";
}

/* Swap the barbell block for a shortcut and leave the accessory work alone. */
export function withPreset(rows, id, oneRM = {}) {
  return [...rowsForPreset(id, oneRM), ...splitRows(rows).accessory];
}

/* Rebuild a day for a different place to train. What you had selected for the
   gym is not available in a park, so it is replaced rather than shown as
   something you could do.

   `preset` is the block you asked for, which is not always the block you can
   have: the same distinction the effort control already makes between "auto"
   and what auto resolved to. Keeping the request rather than reading it back
   off the rows is what lets a squat day survive a trip to the park and come
   home again. The accessory draw is seeded on the day, so the gym block you
   come back to is the one you left. */
export function changeEnv(config, env, oneRM = {}, seed = 0) {
  if (env === config.env) return config;
  /* The rows you authored are the stored fact, kept per place you train. What
     a gym day holds cannot be done in a park, so it is set aside rather than
     translated and translated back: coming home restores exactly what you
     left, hand edits and all, and a block you cleared stays cleared. Deriving
     it from a remembered "requested preset" instead meant an emptied day came
     back full. */
  const byEnv = { ...config.byEnv, [config.env]: config.rows };
  const rows = byEnv[env] ?? rowsForDay(presetFor(config.rows), oneRM, seed, env);
  return { ...config, env, rows, byEnv };
}

export function defaultWeekConfig(count = 2, oneRM = {}, seed = 0) {
  const safeCount = weekCount(count);
  return SCHEDULES[safeCount].map((weekday, index) => ({
    weekday,
    env: "gym",
    intensity: "auto",
    byEnv: {},
    rows: rowsForDay(FOCUS[safeCount][index], oneRM, daySeed(seed, index), "gym"),
    locks: [],
    held: [],
    swaps: [],
    nonce: 0,
  }));
}

const INTENSITY_IDS = new Set(["auto", ...INTENSITY.map((step) => step.id)]);

/* A stored strength row is one of the two kinds the pricing model knows about,
   and nothing else gets through. */
/* Bounds, not just signs. `Infinity > 0` is true, so a saved `1e309` used to
   pass every check here and turn a day's total into Infinity and the next
   day's into NaN, with the fault count still reading zero. */
const bounded = (value, lo, hi) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

function cleanRows(rows) {
  if (!Array.isArray(rows)) return null;
  const cleaned = rows.map((row) => {
    const source = row?.moveId ? moveById(row.moveId) : liftById(row?.liftId);
    if (!source) return null;
    const sets = bounded(Math.round(Number(row.sets)), 1, 20);
    const reps = bounded(Math.round(Number(row.reps)), 1, 5000);
    if (sets === null || reps === null) return null;
    const kg = bounded(row.kg, 0, 500);
    const pct = bounded(row.pct, 0.01, 2);
    return {
      ...(row.moveId ? { moveId: row.moveId } : { liftId: row.liftId }),
      sets, reps,
      kg: kg ?? 0,
      ...(pct === null ? {} : { pct }),
    };
  }).filter(Boolean);
  /* A saved block that cleans away to nothing is unusable rather than empty:
     an empty array is truthy and used to win the fallback chain, so a day with
     one unknown movement silently became conditioning-only. */
  return rows.length > 0 && cleaned.length === 0 ? null : cleaned;
}

/* Swapping one movement is stored as an intent, not as a finished workout,
   because the day is derived from its config every time it is drawn. Each
   entry replaces one movement inside the shape the day already has, so the
   format, cap and rounds survive a swap the way they always did. */
function cleanSwaps(swaps) {
  if (!Array.isArray(swaps)) return [];
  return swaps.map((swap) => {
    const nonce = Number(swap?.nonce);
    return moveById(swap?.moveId) && Number.isFinite(nonce) ? { moveId: swap.moveId, nonce } : null;
  }).filter(Boolean);
}

/* A lock keeps a movement across a redraw, and `buildCandidate` leaves a
   locked item's reps alone, so the rep count is part of the lock rather than
   something to recompute.

   `locks` is what you have ticked and `held` is what the current draw is
   honouring. They have to be separate because a day is derived from its config
   on every render: feeding `locks` straight into generation meant ticking one
   changed the amount of the random stream the accepted candidate consumed, and
   the whole session was redrawn under you. Measured over 600 seeds, that
   reshaped the format or the movement list in 599 of them. Ticking now changes
   nothing until "Another", which is what the daily card did before the week
   planner absorbed it. */
function cleanLocks(locks) {
  if (!Array.isArray(locks)) return [];
  return locks.map((lock) => {
    const move = moveById(lock?.moveId);
    const reps = bounded(lock?.reps, 1, 5000);
    return move && reps !== null ? { moveId: lock.moveId, reps } : null;
  }).filter(Boolean);
}

/* A week is one session per weekday, in calendar order. The gap between two
   days is what carry-over decays over, so a duplicated or out-of-order day
   would report a fatigue figure the week does not actually produce. */
function orderWeek(configs) {
  const used = new Set();
  return configs.map((config) => {
    let { weekday } = config;
    while (used.has(weekday)) weekday = (weekday + 1) % 7;
    used.add(weekday);
    return { ...config, weekday };
  }).sort((a, b) => a.weekday - b.weekday);
}

/* Saved preferences outlive the code that wrote them. A stale environment or
   focus id used to reach the generator, produce no candidate, and silently
   drop that day out of the week. Every field is checked against the list that
   owns it, falling back to the default for that slot. */
export function normaliseWeek(configs, count, { oneRM = {}, liftRows = null, seed = 0 } = {}) {
  const defaults = defaultWeekConfig(count, oneRM, seed);
  return orderWeek(defaults.map((fallback, index) => {
    const config = Array.isArray(configs) ? configs[index] : null;
    const weekday = Number(config?.weekday);
    /* Rows are the stored fact now. A week saved before that carried a `focus`
       id instead, with "custom" meaning the one grid the daily view owned, so
       it is turned into rows here rather than dropped. */
    const rows = cleanRows(config?.rows)
      || (config?.focus === "custom" ? cleanRows(liftRows) : null)
      || (PRESET_ROWS[config?.focus] ? rowsForPreset(config.focus, oneRM) : null)
      || fallback.rows;
    const nonce = Number(config?.nonce);
    const env = ENVS.includes(config?.env) ? config.env : fallback.env;
    /* A barbell row saved for a gym day is not something you can do in a park,
       so it does not survive being read back for one. */
    const usable = rows.filter((row) => rowAvailable(row, env));
    const byEnv = {};
    for (const key of ENVS) {
      const saved = cleanRows(config?.byEnv?.[key]);
      if (saved) byEnv[key] = saved.filter((row) => rowAvailable(row, key));
    }
    return {
      weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : fallback.weekday,
      env,
      byEnv,
      intensity: INTENSITY_IDS.has(config?.intensity) ? config.intensity : fallback.intensity,
      rows: usable,
      locks: cleanLocks(config?.locks),
      held: cleanLocks(config?.held),
      swaps: cleanSwaps(config?.swaps),
      nonce: Number.isFinite(nonce) ? nonce : 0,
    };
  }));
}

/* Moving one day rewrites the order, because the schedule is the thing the
   carry-over model reads. A patch rather than one field at a time, because a
   redraw changes several at once and two passes would re-sort twice. */
export function editWeekDay(configs, index, patch) {
  return orderWeek(configs.map((config, i) => (
    i === index
      ? { ...config, ...patch, ...("weekday" in patch ? { weekday: Number(patch.weekday) } : {}) }
      : config
  )));
}

/* One week seed derives a stable seed per day. `nonce` is how a single day is
   redrawn without touching the rest: it moves that day's seed only. Nonce 0
   gives the seed the day had before per-day redraws existed. */
export function daySeed(seed, index, nonce = 0) {
  return (Number(seed) + Math.imul(index + 1, 0x9E3779B1) + Math.imul(Number(nonce) || 0, 0x85EBCA6B)) >>> 0;
}

export function addAxes(...vectors) {
  return Object.fromEntries(AXES.map((axis) => [
    axis,
    vectors.reduce((sum, vector) => sum + (vector?.[axis] || 0), 0),
  ]));
}

export function decayAxes(vector, calendarDays) {
  const factor = DAILY_CARRY ** Math.max(1, calendarDays);
  return Object.fromEntries(AXES.map((axis) => [axis, (vector?.[axis] || 0) * factor]));
}

function strengthForRows(rows, oneRM) {
  return arrivingFromLifts(rows.map((row) => ({ ...row, pct: pctFor(row, oneRM) })));
}

function chooseSession(config, context) {
  const choices = config.intensity === "auto"
    ? INTENSITY
    : [{ id: config.intensity, k: intensityK(config.intensity) }];

  const candidates = choices.map((choice) => {
    const wod = generate(config.env, context.arriving, {
      seed: context.seed,
      intensity: choice.k,
      strength: context.strength,
      locked: context.locked,
      excludeMoves: context.excludeMoves,
      excludeFormats: context.excludeFormats,
    });
    return wod
      ? { wod, intensity: choice.id, distance: Math.abs(sessionLoad(wod).total - targetFor(config.env)) }
      : null;
  }).filter(Boolean);

  candidates.sort((a, b) => a.distance - b.distance
    || Math.abs(intensityK(a.intensity) - 1) - Math.abs(intensityK(b.intensity) - 1));
  return candidates[0] || null;
}

/* Replace one movement at a time inside the shape the day already has. The
   format, cap and rounds are pinned, every other movement is held at the reps
   it has, and only the named slot is drawn again. This is what the daily card
   has always done for a swap; storing it as an intent is what lets the day
   stay derived from its config rather than kept in the interface. */
function applySwaps(wod, config, { arriving, strength, seed, intensity, excludeMoves }) {
  let current = wod;
  for (const swap of config.swaps || []) {
    const removed = current.items.find((item) => item.move.id === swap.moveId);
    if (!removed) continue;
    const keep = current.items.filter((item) => item.move.id !== swap.moveId);
    const next = generate(config.env, arriving, {
      strength,
      locked: keep,
      fixed: { fmt: current.fmt, cap: current.cap, rounds: current.rounds, slots: [removed.move.pat] },
      /* The movement you just rejected is not a candidate to replace itself.
         `buildCandidate` only marks the kept movements as used, so without
         this a small pool hands the same one straight back and the button
         looks broken. The previous day's movements stay excluded too, so a
         swap cannot undo the week's variety. */
      excludeMoves: [swap.moveId, ...excludeMoves],
      intensity: intensityK(intensity),
      seed: (seed + Math.imul(swap.nonce + 1, 0xC2B2AE35)) >>> 0,
    });
    if (next) current = next;
  }
  return current;
}

/* Build a week in order. Each day sees today's strength plus fatigue carried
   from earlier sessions. Actual work is added only once: carried fatigue
   influences composition and volume, but sessionLoad() still counts today's
   strength and conditioning, not yesterday again. */
export function planWeek(configs, { seed = 1, oneRM = {} } = {}) {
  let fatigue = Object.fromEntries(AXES.map((axis) => [axis, 0]));
  let previousWeekday = null;
  let previousMoves = [];
  let previousFormat = [];

  return configs.map((config, index) => {
    const gap = previousWeekday == null ? 0 : (config.weekday - previousWeekday + 7) % 7 || 7;
    const carry = previousWeekday == null ? fatigue : decayAxes(fatigue, gap);
    const strengthRows = config.rows || [];
    const strength = strengthForRows(strengthRows, oneRM);
    const arriving = arrivingFromAxis(addAxes(carry, strength.pre));
    /* A lock names a movement and the reps it holds, because buildCandidate
       leaves a locked item's reps alone. Anything the environment cannot do is
       simply not locked. */
    const locked = (config.held || [])
      .map((lock) => ({ move: moveById(lock.moveId), reps: lock.reps }))
      .filter((item) => item.move);
    const chosen = chooseSession(config, {
      arriving,
      strength,
      locked,
      seed: daySeed(seed, index, config.nonce),
      excludeMoves: previousMoves,
      excludeFormats: previousFormat,
    });
    if (!chosen) return null;

    const wod = applySwaps(chosen.wod, config, {
      arriving, strength, seed: daySeed(seed, index, config.nonce), intensity: chosen.intensity,
      excludeMoves: previousMoves,
    });
    wod.strengthRows = strengthRows;
    wod.oneRM = oneRM;
    wod.plan = {
      /* Which config built this day. A day that cannot be built drops out of
         the returned array, so position in the plan is not position in the
         schedule and the interface must not assume it is. */
      index,
      weekday: config.weekday,
      env: config.env,
      requestedIntensity: config.intensity,
      intensity: chosen.intensity,
      preset: presetFor(strengthRows),
      carry,
      carryPoints: Object.values(carry).reduce((sum, value) => sum + value, 0),
      seed: daySeed(seed, index, config.nonce),
    };

    fatigue = addAxes(carry, sessionAxisLoad(wod));
    previousMoves = wod.items.map((item) => item.move.id);
    previousFormat = [wod.fmt.id];
    previousWeekday = config.weekday;
    return wod;
  }).filter(Boolean);
}

export function weekSummary(plan) {
  const axes = plan.reduce((sum, wod) => addAxes(sum, sessionAxisLoad(wod)), {});
  const total = plan.reduce((sum, wod) => sum + sessionLoad(wod).total, 0);
  const axisTotal = Object.values(axes).reduce((sum, value) => sum + value, 0) || 1;
  return {
    total,
    axes,
    shares: Object.fromEntries(AXES.map((axis) => [axis, axes[axis] / axisTotal])),
  };
}
