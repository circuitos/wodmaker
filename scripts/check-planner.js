import assert from "node:assert/strict";
import { defaultWeekConfig, editWeekDay, normaliseWeek, planWeek, weekSummary } from "../src/planner.js";
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
assert.deepEqual(stale[0], { weekday: 1, env: "gym", focus: "lower", intensity: "auto" },
  "an unusable saved day falls back to the default for its slot");
assert.deepEqual(stale[1], { weekday: 4, env: "casa", focus: "press", intensity: "hard" },
  "a valid saved day is kept exactly");

for (const count of [2, 3, 4, 5]) {
  const week = normaliseWeek(Array(count).fill({ weekday: 3, env: "gym", focus: "squat", intensity: "auto" }), count);
  const weekdays = week.map((day) => day.weekday);
  assert.equal(new Set(weekdays).size, count, "one session per weekday");
  assert.deepEqual(weekdays, [...weekdays].sort((a, b) => a - b), "a week is stored in calendar order");
}

const moved = editWeekDay(defaultWeekConfig(3), 2, "weekday", 2);
assert.deepEqual(moved.map((day) => day.weekday), [1, 2, 3], "moving a day re-sorts the week");
assert.equal(moved[1].focus, "deadlift", "the moved day keeps its own strength focus");

/* A day the generator cannot build drops out of the plan, so plan.index, not
   position, is what pairs a card with the schedule row that produced it. */
const gappy = defaultWeekConfig(3).map((day, i) => (i === 0 ? { ...day, env: "moon" } : day));
const partial = planWeek(gappy, { seed: 20260831 });
assert.equal(partial.length, 2, "an unbuildable day drops out rather than failing the week");
for (const wod of partial) {
  assert.equal(wod.plan.weekday, gappy[wod.plan.index].weekday, "plan.index points at the day that built it");
  assert.equal(wod.plan.env, gappy[wod.plan.index].env);
}

console.log("Planner check passed for deterministic 2, 3, 4, and 5-day weeks.");
