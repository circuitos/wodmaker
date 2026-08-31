import { T } from "./i18n.js";
import { liftById, moveById, pctFor } from "./lifts.js";
/* =========================== TEXT RENDERING =========================== */

/* A ladder's rungs for one movement. The format's scheme is a shape, not a
   prescription: `it.reps` is the top rung, and the rest descend in the same
   proportions. They have to be derived per movement rather than printed as
   the literal 10-8-6-4-2, because the generator scales `reps` to hit the
   day's volume target and a movement can land anywhere from 4 to 450.

   The rungs sum to about `reps * 3`, which is exactly what the ladder's
   `passes: () => 3` charges for it, so what the card prescribes and what the
   load reports are the same work. See docs/DESIGN.md. */
export function ladderRungs(it, fmt) {
  const top = fmt.scheme[0];
  return fmt.scheme.map((rung) => Math.max(1, Math.round((it.reps * rung) / top)));
}

/* One movement row, split into the parts a card lays out in its own columns:
   the dose, the name, and the two qualifiers. The plain-text export joins them
   with spaces and parentheses, the cards put them in separate elements with
   their own separators, and all three read the same facts from here. Deriving
   the parts from the rendered string instead is how "8 ring rows" and
   "8/lado zancadas" start disagreeing about where the dose ends.

   `fmt` is optional and only matters for a ladder, where the dose is a set of
   descending rungs rather than one number. */
export function repParts(it, lang, env, fmt = null) {
  const m = it.move;
  const rungs = fmt?.scheme ? ladderRungs(it, fmt) : null;
  return {
    dose: rungs ? rungs.join("-") + (m.unit === "s" ? '"' : "")
      : m.unit === "s" ? `${it.reps}"` : `${it.reps}`,
    name: m[lang],
    side: m.side ? T[lang].side : null,
    kg: env === "gym" && m.kg ? m.kg : null,
  };
}

export function repLine(it, lang, env, fmt = null) {
  const { dose, name, side, kg } = repParts(it, lang, env, fmt);
  return `${dose} ${name}${side ? ` ${side}` : ""}${kg ? ` (${kg})` : ""}`;
}

/* One line for one row of the strength block, main lift or accessory, in
   the same units the grid itself shows: sets x reps, the weight, and a
   percentage where one can be computed. Used by the card and by the plain
   text export, so what you read and what you copy always agree. */
export function strengthLine(row, lang, oneRM) {
  const kgTxt = row.kg > 0 ? ` · ${row.kg} kg` : "";
  if (row.liftId) {
    const lift = liftById(row.liftId);
    if (!lift) return "";
    const pct = pctFor(row, oneRM);
    const pctTxt = pct ? ` · ${Math.round(pct * 100)}%` : "";
    return `${row.sets}×${row.reps} ${lift[lang]}${kgTxt}${pctTxt}`;
  }
  const move = moveById(row.moveId);
  if (!move) return "";
  const side = move.side ? ` ${T[lang].side}` : "";
  return `${row.sets}×${row.reps} ${move[lang]}${side}${kgTxt}`;
}

export function headline(c, lang) {
  const t = T[lang];
  const f = t.fmt[c.fmt.id];
  switch (c.fmt.id) {
    case "amrap": return `${f} ${c.cap}'`;
    case "chipper": return `${f} · ${t.cap} ${c.cap}'`;
    case "quality": return `${f} ${c.cap}'`;
    case "emom": return `${f} ${c.cap}'`;
    case "fortime": return `${f} · ${c.rounds} ${t.rounds}`;
    case "intervals": return `${c.rounds} × 30" / 30"`;
    // The rungs differ per movement now, so the headline names the shape only.
    case "ladder": return f;
    default: return f;
  }
}

export function asText(c, lang, env) {
  const t = T[lang];
  const lines = [];
  if (c.strengthRows?.length) {
    lines.push(t.before);
    c.strengthRows.forEach((r) => lines.push(`· ${strengthLine(r, lang, c.oneRM || {})}`));
    lines.push("");
  }
  lines.push(headline(c, lang), "");
  if (c.fmt.id === "emom") {
    c.items.forEach((it, i) => lines.push(`Min ${i + 1} → ${repLine(it, lang, env, c.fmt)}`));
    if (c.items.length === 3) lines.push(`Min 4 → ${t.rest}`);
  } else {
    c.items.forEach((it) => lines.push(`· ${repLine(it, lang, env, c.fmt)}`));
  }
  lines.push("", c.cue);
  return lines.join("\n");
}
