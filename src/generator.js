import { AXES, MOVES } from "./moves.js";
import { FORMATS } from "./formats.js";
import { arrivingFromPreset } from "./lifts.js";
/* =========================== GENERATOR =========================== */

/* A small seeded PRNG (mulberry32), shared with scripts/smoke.js. Everything
   below draws from Math.random() directly rather than threading a generator
   object through every call, so generate() reproduces a session by swapping
   Math.random for a seeded stream for the duration of one call and restoring
   it afterward. Single-threaded JS makes that safe, and it is the same
   technique the smoke sweep already used to make its own report reproducible. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rnd = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rnd(arr.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function weightedFormat(excludeFormats = []) {
  const excluded = new Set(excludeFormats);
  const pool = FORMATS.filter((f) => !excluded.has(f.id));
  const choices = pool.length ? pool : FORMATS;
  const total = choices.reduce((s, f) => s + f.w, 0);
  let r = Math.random() * total;
  for (const f of choices) { r -= f.w; if (r <= 0) return f; }
  return choices[0];
}

/* Slot templates. Every conditioning piece in the sample set opens with a
   monostructural or a full-body movement, then spreads across systems. */
export function slotTemplate(n, env) {
  const secondary = ["push", "pull", "hinge", "legs", "core", "carry"];
  const slots = [Math.random() < (env === "casa" ? 0.55 : 0.8) ? "mono" : "full"];
  const bag = [...secondary];
  // core shows up in roughly 2 of 3 sample workouts
  if (n >= 3 && Math.random() < 0.68) { slots.push("core"); bag.splice(bag.indexOf("core"), 1); }
  while (slots.length < n && bag.length) {
    const i = rnd(bag.length);
    slots.push(bag[i]);
    bag.splice(i, 1);
  }
  return slots.slice(0, n);
}

export function poolFor(pat, env) {
  return MOVES.filter((m) => m.env.includes(env) && m.pat === pat);
}

export function axisVector(items) {
  const v = Object.fromEntries(AXES.map((a) => [a, 0]));
  for (const it of items) {
    const work = it.reps * it.move.cost * (it.move.side ? 2 : 1);
    for (const [k, share] of Object.entries(it.move.load)) v[k] += work * share;
  }
  return v;
}

/* What one round should cost. The inverse of sessionLoad below: that one
   multiplies a finished round back up to a session, this one divides a target
   session down to a round. `intensity` is the hook the soft/normal/hard control
   will hang off; at 1 it changes nothing. */
export function roundTarget(fmt, p, dampen, intensity = 1) {
  return (fmt.load(p) / fmt.passes(p)) * intensity * dampen;
}

/* What a finished candidate actually costs, split so the interface can show
   the parts and a week planner can compare one day against another. */
export function sessionAxisLoad(c) {
  const passes = c.fmt.passes(c);
  return Object.fromEntries(AXES.map((axis) => [
    axis,
    c.vec[axis] * passes + (c.strength.pre[axis] || 0) * 0.9,
  ]));
}

export function sessionLoad(c) {
  const conditioning = c.totalWork * c.fmt.passes(c);
  const strength = Object.values(c.strength.pre).reduce((s, v) => s + v, 0) * 0.9;
  return { conditioning, strength, total: conditioning + strength };
}

export function baseReps(m, scale) {
  const [lo, hi] = m.dose;
  const raw = (lo + Math.random() * (hi - lo)) * scale;
  return quantise(m, raw);
}

export function quantise(m, raw) {
  const step = m.step || 1;
  const [lo, hi] = m.dose;
  const floorV = Math.max(step, lo * 0.5);
  const ceilV = hi * 2.6;
  const clamped = clamp(Math.round(raw / step) * step, floorV, ceilV);
  return Math.round(clamped / step) * step;
}

export function itemCost(it) {
  return it.reps * it.move.cost * (it.move.side ? 2 : 1);
}

export function buildCandidate(env, arriving, {
  locked = [], fixed = null, intensity = 1, strength = arriving,
  excludeMoves = [], excludeFormats = [],
} = {}) {
  const fmt = fixed ? fixed.fmt : weightedFormat(excludeFormats);
  const st = arriving;
  const excludedMoves = new Set(excludeMoves);
  const nSlots = fixed ? null : pick(fmt.slots);
  const cap = fixed ? fixed.cap : fmt.caps ? pick(fmt.caps) : null;
  const rounds = fixed ? fixed.rounds : fmt.rounds ? pick(fmt.rounds) : fmt.id === "ladder" ? 5 : 1;

  const used = new Set();
  const items = [];

  // Locked movements keep their slot.
  for (const l of locked) {
    if (!l.move.env.includes(env)) continue;
    used.add(l.move.id);
    items.push({ move: l.move, reps: l.reps, locked: true });
  }

  // When fixed, only fill the requested slot patterns (e.g. a single swap);
  // otherwise build a full random template for the whole workout.
  const slots = fixed ? fixed.slots : slotTemplate(nSlots, env);
  const targetLen = fixed ? items.length + fixed.slots.length : nSlots;
  for (const pat of slots) {
    if (items.length >= targetLen) break;
    if (items.some((i) => i.locked && i.move.pat === pat)) continue;
    let pool = poolFor(pat, env).filter((m) => !used.has(m.id) && !excludedMoves.has(m.id));
    // Diversity is a preference. A small environment must still produce a
    // complete workout when every suitable movement appeared yesterday.
    if (!pool.length) pool = poolFor(pat, env).filter((m) => !used.has(m.id));
    if (!pool.length) continue;
    const m = pick(pool);
    used.add(m.id);
    items.push({ move: m, reps: baseReps(m, fmt.scale), locked: false });
  }
  if (items.length < 2) return null;

  // Scale volume analytically into the band for this format.
  const target = roundTarget(fmt, { cap, rounds, slots: items.length }, st.dampen, intensity);
  const current = items.reduce((s, it) => s + itemCost(it), 0);
  if (current > 0) {
    const k = clamp(target / current, 0.55, 1.9);
    for (const it of items) if (!it.locked) it.reps = quantise(it.move, it.reps * k);
  }

  const vec = axisVector(items);
  const totalWork = items.reduce((s, it) => s + itemCost(it), 0);
  return { fmt, cap, rounds, items, vec, totalWork, arriving: st, strength };
}

/* Rejection: composition problems only. Volume is solved above. */
export function faults(c, env) {
  const out = [];
  const sum = AXES.reduce((s, a) => s + c.vec[a], 0) || 1;
  const share = Object.fromEntries(AXES.map((a) => [a, c.vec[a] / sum]));
  const maxShare = c.items.length <= 3 ? 0.5 : 0.42;

  for (const a of AXES) {
    if (share[a] > maxShare) out.push({ k: "axis", a, hard: true });
  }
  // Conflict with the strength block: the axis it hammered gets a tighter cap.
  for (const [a, pre] of Object.entries((c.arriving || c.strength).pre)) {
    const cap = pre >= 80 ? 0.24 : pre >= 50 ? 0.3 : 0.36;
    if (share[a] > cap) out.push({ k: "axis", a, hard: true });
  }
  if (c.items.reduce((s, i) => s + i.move.skill, 0) > 6) out.push({ k: "skill", hard: true });
  if (c.items.reduce((s, i) => s + i.move.imp, 0) > 3) out.push({ k: "impact", hard: true });
  if (share.agarre > 0.3) out.push({ k: "grip", hard: false });
  if (env === "casa" && share.traccion < 0.05) out.push({ k: "nopull", hard: false });
  return out;
}

/* `arriving` is the axis load you turn up already carrying, and how much it
   should damp what follows. Today it comes from the strength block you did
   first; a week planner will hand it yesterday's session, decayed. Either
   source, same shape: { pre: { axis: points }, dampen }. A preset id is still
   accepted for convenience.

   `opts` carries the rest: `locked` movements to keep, a `fixed` shape when
   re-rolling one slot, `intensity`, the soft / normal / hard multiplier, and
   `seed`. An object rather than four more positional arguments, because the
   week planner will want to pass its own.

   Without a seed this reads Math.random() same as always, which is what
   scripts/smoke.js relies on: it installs its own seeded Math.random once for
   the whole sweep, and generate() leaves that alone. With a seed, generate()
   installs a fresh seeded stream for just this call and restores whatever
   Math.random was straight after, so it never leaks into anything else.

   The same seed and the same env/arriving/intensity reproduce the same
   format and the same movements: neither is chosen from anything that
   depends on arriving or intensity, only the rep scaling is. So changing the
   strength grid or the soft/normal/hard chip redraws numbers on a session
   that otherwise holds still, rather than reshuffling it. The one place this
   can still move the shape is if a candidate that satisfied faults() before
   no longer does (or the reverse), since a rejected candidate consumes more
   of the random stream before generate() tries again; in the current data
   that essentially never happens; see docs/DESIGN.md. */
export function generate(env, arriving, opts = {}) {
  if (typeof arriving === "string") arriving = arrivingFromPreset(arriving);
  const { seed } = opts;
  const prevRandom = seed != null ? Math.random : null;
  if (seed != null) Math.random = mulberry32(seed);
  try {
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 300; i++) {
      const c = buildCandidate(env, arriving, opts);
      if (!c) continue;
      const f = faults(c, env);
      const hard = f.filter((x) => x.hard).length;
      if (hard === 0) { c.faults = f; return c; }
      if (hard < bestScore) { bestScore = hard; best = c; best.faults = f; }
    }
    return best;
  } finally {
    if (prevRandom) Math.random = prevRandom;
  }
}

