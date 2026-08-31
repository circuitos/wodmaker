/* Bumper-plate load meter. Plates are a scale, not kilos. */
export const PLATE = [
  { u: 55, h: 100, c: "#C8102E" },
  { u: 42, h: 88, c: "#0057B8" },
  { u: 30, h: 76, c: "#F5C400" },
  { u: 20, h: 62, c: "#00843D" },
  { u: 12, h: 48, c: "#E8E6DF" },
];

export function platesFor(work) {
  const out = [];
  let left = work;
  for (const p of PLATE) {
    while (left >= p.u && out.length < 7) { out.push(p); left -= p.u; }
  }
  if (!out.length) out.push(PLATE[PLATE.length - 1]);
  return out;
}
