import { T } from "./i18n.js";
/* =========================== TEXT RENDERING =========================== */

export function repLine(it, lang, env) {
  const m = it.move;
  const name = m[lang];
  const kg = env === "gym" && m.kg ? ` (${m.kg})` : "";
  const side = m.side ? ` ${T[lang].side}` : "";
  if (m.unit === "s") return `${it.reps}" ${name}${side}${kg}`;
  if (m.unit === "m" || m.unit === "cal") return `${it.reps} ${name}${side}${kg}`;
  return `${it.reps} ${name}${side}${kg}`;
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
    case "ladder": return `${f} 10-8-6-4-2`;
    default: return f;
  }
}

export function asText(c, lang, env) {
  const t = T[lang];
  const lines = [headline(c, lang), ""];
  if (c.fmt.id === "emom") {
    c.items.forEach((it, i) => lines.push(`Min ${i + 1} → ${repLine(it, lang, env)}`));
    if (c.items.length === 3) lines.push(`Min 4 → ${t.rest}`);
  } else if (c.fmt.id === "ladder") {
    c.items.forEach((it) => lines.push(`· ${it.move[lang]}${env === "gym" && it.move.kg ? ` (${it.move.kg})` : ""}`));
  } else {
    c.items.forEach((it) => lines.push(`· ${repLine(it, lang, env)}`));
  }
  lines.push("", c.cue);
  return lines.join("\n");
}
