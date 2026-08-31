import assert from "node:assert/strict";
import { defaultWeekConfig, planWeek, weekSummary } from "../src/planner.js";
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

console.log("Planner check passed for deterministic 2, 3, 4, and 5-day weeks.");
