import assert from "node:assert/strict";
import { daySeed, defaultWeekConfig, editWeekDay, normaliseWeek, planWeek, presetFor, rowsForPreset, weekSummary }
  from "../src/planner.js";
import { sessionLoad } from "../src/generator.js";
import { FORMATS } from "../src/formats.js";

const shape = (plan) => plan.map((wod) => ({
  format: wod.fmt.id,
  intensity: wod.plan.intensity,
  items: wod.items.map((item) => [item.move.id, item.reps]),
  total: Math.round(sessionLoad(wod).total),
}));

const emom = FORMATS.find((format) => format.id === "emom");
assert.equal(emom.passes({ cap: 12, slots: 4 }), 3);
assert.equal(emom.passes({ cap: 12, slots: 3 }), 3, "three work minutes include the displayed rest minute");
assert.equal(emom.passes({ cap: 10, slots: 2 }), 5);

for (const count of [2, 3, 4, 5]) {
  const config = defaultWeekConfig(count);
  const first = planWeek(config, { seed: 20260831 });
  const second = planWeek(config, { seed: 20260831 });
  assert.equal(first.length, count);
  assert.deepEqual(shape(first), shape(second), `${count}-day plan must reproduce from its seed`);

  for (let index = 1; index < first.length; index += 1) {
    assert.notEqual(first[index].fmt.id, first[index - 1].fmt.id, "adjacent formats should differ");
    const previous = new Set(first[index - 1].items.map((item) => item.move.id));
    assert.equal(first[index].items.some((item) => previous.has(item.move.id)), false,
      "adjacent sessions should avoid repeated movements when the environment allows it");
    assert(first[index].plan.carryPoints > 0, "later days must receive decayed carry-over");
  }

  const summary = weekSummary(first);
  const summed = first.reduce((total, wod) => total + sessionLoad(wod).total, 0);
  assert(Math.abs(summary.total - summed) < 1e-9);
  assert(summary.total > count * 150 && summary.total < count * 500);
}

const changedSeed = planWeek(defaultWeekConfig(2), { seed: 7 });
assert.notDeepEqual(shape(changedSeed), shape(planWeek(defaultWeekConfig(2), { seed: 8 })),
  "Another week must produce a different plan");

/* A saved preference outlives the build that wrote it. Every field is checked
   against the list that owns it, so nothing unknown reaches the generator. */
const stale = normaliseWeek(
  [{ weekday: 9, env: "moon", focus: "cardio", intensity: "brutal" },
   { weekday: 4, env: "casa", focus: "press", intensity: "hard" }],
  2,
);
assert.equal(stale[0].weekday, 1, "an unusable saved day falls back to the default for its slot");
assert.equal(stale[0].env, "gym");
assert.equal(stale[0].intensity, "auto");
assert.equal(presetFor(stale[0].rows), "lower", "and to that slot's default strength rows");
assert.equal(stale[1].weekday, 4, "a valid saved day is kept exactly");
assert.equal(stale[1].env, "casa");
assert.equal(stale[1].intensity, "hard");
assert.equal(presetFor(stale[1].rows), "press", "a saved focus id migrates into stored rows");

for (const count of [2, 3, 4, 5]) {
  const week = normaliseWeek(Array(count).fill({ weekday: 3, env: "gym", focus: "squat", intensity: "auto" }), count);
  const weekdays = week.map((day) => day.weekday);
  assert.equal(new Set(weekdays).size, count, "one session per weekday");
  assert.deepEqual(weekdays, [...weekdays].sort((a, b) => a - b), "a week is stored in calendar order");
}

const moved = editWeekDay(defaultWeekConfig(3), 2, "weekday", 2);
assert.deepEqual(moved.map((day) => day.weekday), [1, 2, 3], "moving a day re-sorts the week");
assert.equal(presetFor(moved[1].rows), "deadlift", "the moved day keeps its own strength rows");

/* A day the generator cannot build drops out of the plan, so plan.index, not
   position, is what pairs a card with the schedule row that produced it. */
const gappy = defaultWeekConfig(3).map((day, i) => (i === 0 ? { ...day, env: "moon" } : day));
const partial = planWeek(gappy, { seed: 20260831 });
assert.equal(partial.length, 2, "an unbuildable day drops out rather than failing the week");
for (const wod of partial) {
  assert.equal(wod.plan.weekday, gappy[wod.plan.index].weekday, "plan.index points at the day that built it");
  assert.equal(wod.plan.env, gappy[wod.plan.index].env);
}

/* A day owns its strength rows, so editing one day must not touch another. */
const perDay = normaliseWeek(null, 3);
const edited = editWeekDay(perDay, 1, "rows", rowsForPreset("full", { back_squat: 100 }));
assert.equal(presetFor(edited[1].rows), "full", "the edited day takes the new rows");
assert.equal(presetFor(edited[0].rows), presetFor(perDay[0].rows), "other days keep theirs");
assert.equal(presetFor(edited[2].rows), presetFor(perDay[2].rows));
assert.equal(edited[1].rows.find((row) => row.liftId === "back_squat").kg, 80,
  "a preset fills kilos from the one-rep maxes on file");

/* A lock keeps its movement, and its reps, across a redraw of that day. */
const base = normaliseWeek(null, 2);
const [firstDay] = planWeek(base, { seed: 4242 });
const keep = firstDay.items[0];
const withLock = base.map((day, i) => (i === 0
  ? { ...day, locks: [{ moveId: keep.move.id, reps: keep.reps }], nonce: 7 }
  : day));
const [redrawn] = planWeek(withLock, { seed: 4242 });
const held = redrawn.items.find((item) => item.move.id === keep.move.id);
assert(held, "a locked movement survives a redraw of its day");
assert.equal(held.reps, keep.reps, "and keeps the reps it was locked at");
assert.notEqual(daySeed(4242, 0, 7), daySeed(4242, 0, 0), "a redraw moves that day's seed");
assert.equal(daySeed(4242, 1, 0), daySeed(4242, 1), "and nonce 0 is the seed a day had before");

/* Redrawing one day must not move the days before it. */
const untouched = planWeek(base, { seed: 4242 });
const after = planWeek(base.map((day, i) => (i === 1 ? { ...day, nonce: 3 } : day)), { seed: 4242 });
assert.deepEqual(shape([after[0]]), shape([untouched[0]]), "an earlier day holds still");

console.log("Planner check passed for deterministic 2, 3, 4, and 5-day weeks.");
