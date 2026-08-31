/* Bumper-plate load meter. Plates are a scale, not kilos.
 *
 * The colours are theme tokens rather than hexes: the only consumer is the
 * inline <svg> in App.jsx, which resolves them from the document like any
 * other rule, so the plates follow the theme without this file knowing there
 * is one. */
export const PLATE = [
  { u: 55, h: 100, c: "var(--red)" },
  { u: 42, h: 88, c: "var(--blue)" },
  { u: 30, h: 76, c: "var(--yellow)" },
  { u: 20, h: 62, c: "var(--green)" },
  { u: 12, h: 48, c: "var(--plate-bare)" },
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
