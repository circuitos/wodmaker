import { AXES, MOVES } from "./moves.js";
import { FORMATS, STRENGTH } from "./formats.js";
/* =========================== GENERATOR =========================== */

export const rnd = (n) => Math.floor(Math.random() * n);
export const pick = (arr) => arr[rnd(arr.length)];
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function weightedFormat() {
  const total = FORMATS.reduce((s, f) => s + f.w, 0);
  let r = Math.random() * total;
  for (const f of FORMATS) { r -= f.w; if (r <= 0) return f; }
  return FORMATS[0];
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

export function volumeBand(fmt, cap, rounds) {
  switch (fmt.id) {
    case "amrap":     return [cap * 3.0, cap * 5.2];      // cost of one round
    case "fortime":   return [130 / rounds, 250 / rounds];
    case "emom":      return [11, 19];                     // cost of one minute
    case "intervals": return [9, 18];
    case "ladder":    return [110 / 5, 220 / 5];           // cost of the "10" rung ≈ 1 unit
    case "chipper":   return [110, 200];
    case "quality":   return [70, 130];
    default:          return [20, 60];
  }
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

export function buildCandidate(env, strengthId, locked, fixed) {
  const fmt = fixed ? fixed.fmt : weightedFormat();
  const st = STRENGTH.find((s) => s.id === strengthId);
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
    const pool = poolFor(pat, env).filter((m) => !used.has(m.id));
    if (!pool.length) continue;
    const m = pick(pool);
    used.add(m.id);
    items.push({ move: m, reps: baseReps(m, fmt.scale), locked: false });
  }
  if (items.length < 2) return null;

  // Scale volume analytically into the band for this format.
  const [lo, hi] = volumeBand(fmt, cap, rounds);
  const target = (lo + hi) / 2 * st.dampen;
  const current = items.reduce((s, it) => s + itemCost(it), 0);
  if (current > 0) {
    const k = clamp(target / current, 0.55, 1.9);
    for (const it of items) if (!it.locked) it.reps = quantise(it.move, it.reps * k);
  }

  const vec = axisVector(items);
  const totalWork = items.reduce((s, it) => s + itemCost(it), 0);
  return { fmt, cap, rounds, items, vec, totalWork, strength: st };
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
  for (const [a, pre] of Object.entries(c.strength.pre)) {
    const cap = pre >= 80 ? 0.24 : pre >= 50 ? 0.3 : 0.36;
    if (share[a] > cap) out.push({ k: "axis", a, hard: true });
  }
  if (c.items.reduce((s, i) => s + i.move.skill, 0) > 6) out.push({ k: "skill", hard: true });
  if (c.items.reduce((s, i) => s + i.move.imp, 0) > 3) out.push({ k: "impact", hard: true });
  if (share.agarre > 0.3) out.push({ k: "grip", hard: false });
  if (env === "casa" && share.traccion < 0.05) out.push({ k: "nopull", hard: false });
  return out;
}

export function generate(env, strengthId, locked = [], fixed = null) {
  let best = null, bestScore = Infinity;
  for (let i = 0; i < 300; i++) {
    const c = buildCandidate(env, strengthId, locked, fixed);
    if (!c) continue;
    const f = faults(c, env);
    const hard = f.filter((x) => x.hard).length;
    if (hard === 0) { c.faults = f; return c; }
    if (hard < bestScore) { bestScore = hard; best = c; best.faults = f; }
  }
  return best;
}

