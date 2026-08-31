import { AXES, ENVS } from "./moves.js";
import { INTENSITY, intensityK } from "./formats.js";
import { generate, sessionAxisLoad, sessionLoad } from "./generator.js";
import { PRESET_ROWS, arrivingFromAxis, arrivingFromLifts, pctFor } from "./lifts.js";
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

export function defaultWeekConfig(count = 2) {
  const safeCount = weekCount(count);
  return SCHEDULES[safeCount].map((weekday, index) => ({
    weekday,
    env: "gym",
    focus: FOCUS[safeCount][index],
    intensity: "auto",
  }));
}

const FOCUS_IDS = new Set([...Object.keys(PRESET_ROWS), "custom"]);
const INTENSITY_IDS = new Set(["auto", ...INTENSITY.map((step) => step.id)]);

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
export function normaliseWeek(configs, count) {
  const defaults = defaultWeekConfig(count);
  return orderWeek(defaults.map((fallback, index) => {
    const config = Array.isArray(configs) ? configs[index] : null;
    const weekday = Number(config?.weekday);
    return {
      weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : fallback.weekday,
      env: ENVS.includes(config?.env) ? config.env : fallback.env,
      focus: FOCUS_IDS.has(config?.focus) ? config.focus : fallback.focus,
      intensity: INTENSITY_IDS.has(config?.intensity) ? config.intensity : fallback.intensity,
    };
  }));
}

/* Moving one day rewrites the order, because the schedule is the thing the
   carry-over model reads. */
export function editWeekDay(configs, index, field, value) {
  return orderWeek(configs.map((config, i) => (
    i === index ? { ...config, [field]: field === "weekday" ? Number(value) : value } : config
  )));
}

export function daySeed(seed, index) {
  return (Number(seed) + Math.imul(index + 1, 0x9E3779B1)) >>> 0;
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

export function rowsForFocus(focus, customRows = [], oneRM = {}) {
  const source = focus === "custom" ? customRows : (PRESET_ROWS[focus] || []);
  return source.map((row) => ({
    ...row,
    ...(row.liftId && oneRM[row.liftId] > 0 && row.pct
      ? { kg: Math.round(oneRM[row.liftId] * row.pct) }
      : {}),
  }));
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
      excludeMoves: context.excludeMoves,
      excludeFormats: context.excludeFormats,
    });
    return wod ? { wod, intensity: choice.id, distance: Math.abs(sessionLoad(wod).total - TARGET_DAY_LOAD) } : null;
  }).filter(Boolean);

  candidates.sort((a, b) => a.distance - b.distance
    || Math.abs(intensityK(a.intensity) - 1) - Math.abs(intensityK(b.intensity) - 1));
  return candidates[0] || null;
}

/* Build a week in order. Each day sees today's strength plus fatigue carried
   from earlier sessions. Actual work is added only once: carried fatigue
   influences composition and volume, but sessionLoad() still counts today's
   strength and conditioning, not yesterday again. */
export function planWeek(configs, { seed = 1, oneRM = {}, customRows = [] } = {}) {
  let fatigue = Object.fromEntries(AXES.map((axis) => [axis, 0]));
  let previousWeekday = null;
  let previousMoves = [];
  let previousFormat = [];

  return configs.map((config, index) => {
    const gap = previousWeekday == null ? 0 : (config.weekday - previousWeekday + 7) % 7 || 7;
    const carry = previousWeekday == null ? fatigue : decayAxes(fatigue, gap);
    const strengthRows = rowsForFocus(config.focus, customRows, oneRM);
    const strength = strengthForRows(strengthRows, oneRM);
    const arriving = arrivingFromAxis(addAxes(carry, strength.pre));
    const chosen = chooseSession(config, {
      arriving,
      strength,
      seed: daySeed(seed, index),
      excludeMoves: previousMoves,
      excludeFormats: previousFormat,
    });
    if (!chosen) return null;

    const wod = chosen.wod;
    wod.strengthRows = strengthRows;
    wod.oneRM = oneRM;
    wod.plan = {
      /* Which config built this day. A day that cannot be built drops out of
         the returned array, so position in the plan is not position in the
         schedule and the interface must not assume it is. */
      index,
      weekday: config.weekday,
      env: config.env,
      focus: config.focus,
      requestedIntensity: config.intensity,
      intensity: chosen.intensity,
      carry,
      carryPoints: Object.values(carry).reduce((sum, value) => sum + value, 0),
      seed: daySeed(seed, index),
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
