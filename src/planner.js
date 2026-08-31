import { AXES } from "./moves.js";
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

export function defaultWeekConfig(count = 2) {
  const safeCount = Math.max(2, Math.min(5, Number(count) || 2));
  return SCHEDULES[safeCount].map((weekday, index) => ({
    weekday,
    env: "gym",
    focus: FOCUS[safeCount][index],
    intensity: "auto",
  }));
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
