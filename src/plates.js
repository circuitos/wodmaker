/* Bumper-plate load meter. Plates are a scale, not kilos.
 *
 * The colours are theme tokens rather than hexes: the only consumer is the
 * inline <svg> in App.jsx, which resolves them from the document like any
 * other rule, so the plates follow the theme without this file knowing there
 * is one. */
/* `h` is the plate's height in the drawing's own units, and it is only ever
   read next to `H` in the Barbell component: the svg is width:100% over a
   viewBox, so what the meter costs on screen is H/W of the card's width, not
   the plate heights on their own. Move one and move the other. */
export const PLATE = [
  { u: 55, h: 70, c: "var(--red)" },
  { u: 42, h: 62, c: "var(--blue)" },
  { u: 30, h: 53, c: "var(--yellow)" },
  { u: 20, h: 43, c: "var(--green)" },
  { u: 12, h: 34, c: "var(--plate-bare)" },
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
