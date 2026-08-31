import assert from "node:assert/strict";
import {
  bestPresetFor, daySeed, defaultWeekConfig, drawAccessory, editWeekDay, normaliseWeek, planWeek,
  presetFor, presetsFor, rowsForDay, rowsForEnv, rowsForPreset, targetFor, weekSummary, withPreset,
} from "../src/planner.js";
import { sessionLoad } from "../src/generator.js";
import { FORMATS } from "../src/formats.js";
import { ladderRungs } from "../src/text.js";
import {
  accessoryById, accessoryPoints, accessoryRepMax, moveById, rowAvailable, splitRows,
} from "../src/lifts.js";
import { CORPUS_DEFAULTS } from "../src/corpus.js";
import { PRESET_ROWS } from "../src/lifts.js";

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
   { weekday: 4, env: "gym", focus: "press", intensity: "hard" }],
  2,
);
assert.equal(stale[0].weekday, 1, "an unusable saved day falls back to the default for its slot");
assert.equal(stale[0].env, "gym");
assert.equal(stale[0].intensity, "auto");
assert.equal(presetFor(stale[0].rows), "lower", "and to that slot's default strength rows");
assert.equal(stale[1].weekday, 4, "a valid saved day is kept exactly");
assert.equal(stale[1].env, "gym");
assert.equal(stale[1].intensity, "hard");
assert.equal(presetFor(stale[1].rows), "press", "a saved focus id migrates into stored rows");

/* Where you train decides the whole session, not just the conditioning piece.
   A barbell is not available in a park, so the block you asked for is kept as
   a request while the day shows what that place can actually give you, and
   coming back restores it. */
for (const env of ["gym", "parque", "casa"]) {
  for (const preset of presetsFor(env)) {
    for (const row of PRESET_ROWS[preset]) {
      assert(rowAvailable(row, env), `${preset} is only offered where ${row.liftId} can be done`);
    }
  }
  for (const row of rowsForDay("full", {}, 3, env)) {
    assert(rowAvailable(row, env), `a day built for ${env} contains only what ${env} can do`);
  }
}
assert.deepEqual(presetsFor("casa"), ["none"], "a living room supports no barbell block");
assert.equal(bestPresetFor("parque"), "pull", "a park keeps weighted pull-ups rather than nothing");

const trip = ["parque", "casa", "gym"].reduce(
  (rows, env) => rowsForEnv("lower", env, { back_squat: 130, rdl: 110 }, 7),
  rowsForDay("lower", { back_squat: 130, rdl: 110 }, 7, "gym"),
);
assert.equal(presetFor(trip), "lower", "the gym block comes back after a trip to the park and home");

/* Effort targets differ by environment, and each is reachable there. */
assert(targetFor("gym") > targetFor("parque"), "a gym day is worth more than a park day");
assert(targetFor("parque") >= targetFor("casa"));
for (const env of ["gym", "parque", "casa"]) {
  const loads = [];
  for (let seed = 1; seed <= 250; seed += 1) {
    const preset = bestPresetFor(env);
    const rows = rowsForDay(preset, { back_squat: 130, bench: 90, weighted_pullup: 20, barbell_row: 80 }, seed, env);
    const [wod] = planWeek(
      normaliseWeek([{ weekday: 1, env, preset, intensity: "auto", rows }], 1), { seed },
    );
    if (wod) loads.push(sessionLoad(wod).total);
  }
  loads.sort((a, b) => a - b);
  const median = loads[loads.length >> 1];
  assert(Math.abs(median - targetFor(env)) < 120,
    `${env} should land near its ${targetFor(env)}-point target, median was ${Math.round(median)}`);
}

/* A day saved for the gym cannot be read back for a park: a barbell block is
   not something you can do there, so it does not survive the round trip. */
const awayFromGym = normaliseWeek(
  [{ weekday: 1, env: "casa", focus: "press", intensity: "auto" },
   { weekday: 3, env: "parque", focus: "full", intensity: "auto" }],
  2,
);
assert.equal(splitRows(awayFromGym[0].rows).lifts.length, 0, "no barbell survives being read back at home");
assert.equal(splitRows(awayFromGym[1].rows).lifts.length, 0, "nor a full barbell block in a park");
for (const day of awayFromGym) {
  for (const row of day.rows) {
    assert(rowAvailable(row, day.env), `${row.liftId || row.moveId} must be doable at ${day.env}`);
  }
}

for (const count of [2, 3, 4, 5]) {
  const week = normaliseWeek(Array(count).fill({ weekday: 3, env: "gym", focus: "squat", intensity: "auto" }), count);
  const weekdays = week.map((day) => day.weekday);
  assert.equal(new Set(weekdays).size, count, "one session per weekday");
  assert.deepEqual(weekdays, [...weekdays].sort((a, b) => a - b), "a week is stored in calendar order");
}

const moved = editWeekDay(defaultWeekConfig(3), 2, { weekday: 2 });
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
const edited = editWeekDay(perDay, 1, { rows: rowsForPreset("full", { back_squat: 100 }) });
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

/* A swap redraws one slot inside the shape the day already has, and never
   hands back the movement it was asked to replace. */
let swapsTested = 0;
for (let seed = 1; seed <= 40; seed += 1) {
  const week = normaliseWeek(null, 2);
  const [before] = planWeek(week, { seed });
  for (const item of before.items) {
    const after = planWeek(
      week.map((day, i) => (i === 0 ? { ...day, swaps: [{ moveId: item.move.id, nonce: 0 }] } : day)),
      { seed },
    )[0];
    swapsTested += 1;
    assert.equal(after.fmt.id, before.fmt.id, "a swap keeps the format");
    assert.equal(after.cap, before.cap);
    assert.equal(after.rounds, before.rounds);
    assert.equal(after.items.some((i) => i.move.id === item.move.id), false,
      "a swap never returns the movement it replaced");
    for (const kept of before.items.filter((i) => i.move.id !== item.move.id)) {
      assert(after.items.some((i) => i.move.id === kept.move.id), "the other movements stay");
    }
  }
}
assert(swapsTested > 100, "the swap sweep should cover a useful number of slots");

/* A ladder prints descending rungs derived from each movement's own reps, and
   what it prints has to be the work it charges for. The format's scheme is a
   shape: `reps` is the top rung and the ladder costs `reps * passes`. Printing
   the literal 10-8-6-4-2 made a ladder report loads its own card could not
   explain, which is how this was found. */
let laddersChecked = 0;
for (let seed = 1; seed <= 400; seed += 1) {
  const week = normaliseWeek([{ weekday: 1, env: "gym", intensity: "auto", rows: [] }], 1);
  const [wod] = planWeek(week, { seed });
  if (!wod || wod.fmt.id !== "ladder") continue;
  laddersChecked += 1;
  for (const item of wod.items) {
    const rungs = ladderRungs(item, wod.fmt);
    assert.equal(rungs.length, wod.fmt.scheme.length, "one rung per step of the scheme");
    assert.equal(rungs[0], Math.max(1, item.reps), "the top rung is the movement's dose");
    for (let i = 1; i < rungs.length; i += 1) assert(rungs[i] <= rungs[i - 1], "rungs descend");
    const printed = rungs.reduce((sum, rung) => sum + rung, 0);
    const charged = item.reps * wod.fmt.passes(wod);
    assert(Math.abs(printed - charged) <= 3,
      `a ladder must charge for what it prints (${printed} printed vs ${charged} charged)`);
  }
}
assert(laddersChecked > 20, "the ladder sweep should see a useful number of ladders");

/* Every day arrives with an accessory block already ticked, drawn the way the
   source log writes one: one to three movements, weighted by how often each
   appears, at the dose recorded next to it. The log's own zero case is not
   drawn from, which is a product choice and is documented as one. */
for (const count of [2, 3, 4, 5]) {
  for (const day of defaultWeekConfig(count, {}, 4242)) {
    const { lifts, accessory } = splitRows(day.rows);
    assert(accessory.length >= 1 && accessory.length <= 3,
      `a fresh day carries one to three accessory movements, got ${accessory.length}`);
    assert.equal(new Set(accessory.map((row) => row.moveId)).size, accessory.length, "no repeats");
    for (const row of accessory) {
      assert(accessoryById(row.moveId), `${row.moveId} must be offered in the grid`);
      assert(CORPUS_DEFAULTS.accessory.some((entry) => entry.moveId === row.moveId),
        `${row.moveId} must be a movement the log evidences`);
    }
    assert(lifts.length > 0 || presetFor(day.rows) === "none", "the barbell block is unaffected");
  }
}

/* The draw reproduces from its seed, and different seeds give different work. */
assert.deepEqual(drawAccessory(99), drawAccessory(99), "the accessory draw is seeded");
assert.notDeepEqual(drawAccessory(1), drawAccessory(2), "a different seed draws differently");

/* Block cost stays in the range the log shows for its own accessory blocks:
   20 at the first quartile, 43 median, 58 at the third. */
const blockCosts = [];
for (let seed = 1; seed <= 2000; seed += 1) {
  blockCosts.push(drawAccessory(seed).reduce((sum, row) => sum + accessoryPoints(row), 0));
}
blockCosts.sort((a, b) => a - b);
const median = blockCosts[blockCosts.length >> 1];
assert(median > 20 && median < 70, `median accessory block should sit near the log's 43, got ${median}`);
assert(blockCosts[blockCosts.length - 1] < 200, "and no block should dwarf the session it precedes");

/* The barbell block and the accessory block are two parts of a session. A
   strength shortcut names the first and must leave the second alone. */
const withRun = [...rowsForPreset("lower", { back_squat: 130 }),
  { moveId: "run_m", sets: 1, reps: 400, kg: 0 }];
assert.equal(presetFor(withRun), "lower", "accessory work does not make the barbell block custom");
const pressed = withPreset(withRun, "press", { bench: 87 });
assert.equal(presetFor(pressed), "press", "switching the shortcut switches the lifts");
assert.deepEqual(pressed.filter((row) => row.moveId), withRun.filter((row) => row.moveId),
  "switching the shortcut keeps the accessory work");

/* Machine and running work is priced per unit by the movement's own cost, on
   the same scale as everything else: about 20 points to a hard minute. */
for (const [moveId, reps, expected] of [["row_m", 500, 31], ["run_m", 400, 30], ["row_cal", 30, 30]]) {
  assert(accessoryById(moveId), `${moveId} is offered as accessory work`);
  const points = accessoryPoints({ moveId, sets: 1, reps, kg: 0 });
  assert(Math.abs(points - expected) < 2, `${moveId} at ${reps} should cost about ${expected}, got ${points.toFixed(1)}`);
  assert(accessoryRepMax(moveById(moveId)) >= reps, `${moveId} must accept a dose of ${reps}`);
}

console.log(`Planner check passed for deterministic 2, 3, 4, and 5-day weeks (${swapsTested} swaps, ${laddersChecked} ladders).`);
