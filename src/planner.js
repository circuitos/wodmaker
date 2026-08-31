import { AXES, ENVS } from "./moves.js";
import { INTENSITY, intensityK } from "./formats.js";
import { generate, mulberry32, sessionAxisLoad, sessionLoad } from "./generator.js";
import {
  PRESET_ROWS, arrivingFromAxis, arrivingFromLifts, liftById, moveById, pctFor, splitRows,
} from "./lifts.js";
import { CORPUS_DEFAULTS } from "./corpus.js";

/* A point on Monday is not a point still carried in full on Wednesday. This
   is an explicit planning heuristic, not a claim extracted from the corpus:
   55% survives each calendar day, giving roughly 30% after the usual
   Monday-to-Wednesday gap in the source sessions. */
export const DAILY_CARRY = 0.55;
export const TARGET_DAY_LOAD = 310;

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
export function drawAccessory(seed = 0) {
  const random = mulberry32(seed >>> 0);
  const weighted = (items, weight) => {
    const total = items.reduce((sum, item) => sum + weight(item), 0);
    let r = random() * total;
    for (const item of items) { r -= weight(item); if (r <= 0) return item; }
    return items[items.length - 1];
  };

  const sizes = Object.entries(CORPUS_DEFAULTS.accessoryBlockSizes)
    .map(([size, count]) => ({ size: Number(size), count }))
    .filter((entry) => entry.size > 0);
  const n = weighted(sizes, (entry) => entry.count).size;

  const pool = [...CORPUS_DEFAULTS.accessory];
  const picked = [];
  while (picked.length < n && pool.length) {
    const choice = weighted(pool, (item) => item.sessions);
    pool.splice(pool.indexOf(choice), 1);
    picked.push({ moveId: choice.moveId, sets: choice.sets, reps: choice.reps, kg: choice.kg });
  }
  return picked;
}

/* A day's starting rows: the barbell shortcut for that slot, plus an accessory
   block. Both are replaceable; this is only what you arrive to. */
export function rowsForDay(preset, oneRM = {}, seed = 0) {
  return [...rowsForPreset(preset, oneRM), ...drawAccessory(seed)];
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

export function defaultWeekConfig(count = 2, oneRM = {}, seed = 0) {
  const safeCount = weekCount(count);
  return SCHEDULES[safeCount].map((weekday, index) => ({
    weekday,
    env: "gym",
    intensity: "auto",
    rows: rowsForDay(FOCUS[safeCount][index], oneRM, daySeed(seed, index)),
    locks: [],
    swaps: [],
    nonce: 0,
  }));
}

const INTENSITY_IDS = new Set(["auto", ...INTENSITY.map((step) => step.id)]);

/* A stored strength row is one of the two kinds the pricing model knows about,
   and nothing else gets through. */
function cleanRows(rows) {
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => {
    const source = row?.moveId ? moveById(row.moveId) : liftById(row?.liftId);
    if (!source) return null;
    const sets = Math.round(Number(row.sets));
    const reps = Math.round(Number(row.reps));
    if (!(sets > 0) || !(reps > 0)) return null;
    return {
      ...(row.moveId ? { moveId: row.moveId } : { liftId: row.liftId }),
      sets, reps,
      kg: Number(row.kg) > 0 ? Number(row.kg) : 0,
      ...(row.pct > 0 ? { pct: Number(row.pct) } : {}),
    };
  }).filter(Boolean);
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
   something to recompute. */
function cleanLocks(locks) {
  if (!Array.isArray(locks)) return [];
  return locks.map((lock) => {
    const move = moveById(lock?.moveId);
    const reps = Number(lock?.reps);
    return move && reps > 0 ? { moveId: lock.moveId, reps } : null;
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
    return {
      weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : fallback.weekday,
      env: ENVS.includes(config?.env) ? config.env : fallback.env,
      intensity: INTENSITY_IDS.has(config?.intensity) ? config.intensity : fallback.intensity,
      rows,
      locks: cleanLocks(config?.locks),
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
    return wod ? { wod, intensity: choice.id, distance: Math.abs(sessionLoad(wod).total - TARGET_DAY_LOAD) } : null;
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
    const locked = (config.locks || [])
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
