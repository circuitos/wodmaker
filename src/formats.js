/* =========================== FORMATS =========================== */

/* Two volume facts per format, and only these two.
   `load`   how many work points the whole conditioning piece should be.
   `passes` how many times you go through the movement list to get there.
   The round target is load / passes, and the finished session's cost is
   totalWork * passes. One number to change, and both move together. See
   docs/DESIGN.md. */
/* An EMOM item repeats once per cycle, not once per minute. Three work items
   have the fourth-minute rest rendered by the card, so both three- and
   four-item versions use a four-minute cycle. */
export function emomPasses(p) {
  const slots = p.items?.length || p.slots || 1;
  const cycle = slots === 3 ? 4 : slots;
  return p.cap / cycle;
}

export const FORMATS = [
  { id: "amrap",     w: 22, caps: [8, 10, 12],        slots: [3, 4, 5], scale: 1.0,
    load: (p) => p.cap * 20.5,  passes: () => 5 },
  { id: "fortime",   w: 28, rounds: [3, 4, 5],        slots: [4, 5, 6], scale: 1.0,
    load: () => 190,            passes: (p) => p.rounds },
  { id: "emom",      w: 20, caps: [8, 10, 12],        slots: [2, 3, 4], scale: 0.9,
    load: (p) => p.cap * 15,    passes: emomPasses },
  { id: "intervals", w: 10, rounds: [5, 6],           slots: [1, 2],    scale: 0.55,
    load: (p) => p.rounds * 13.5, passes: (p) => p.rounds },
  { id: "ladder",    w: 8,  scheme: [10, 8, 6, 4, 2], slots: [3],       scale: 1.0,
    load: () => 99,             passes: () => 3 },
  { id: "chipper",   w: 7,  caps: [10, 12],           slots: [4, 5],    scale: 2.1,
    load: () => 155,            passes: () => 1 },
  { id: "quality",   w: 5,  caps: [10, 12],           slots: [3, 4],    scale: 0.8,
    load: () => 100,            passes: () => 1 },
];

/* The soft / normal / hard control.
   A multiplier on the round target, relative to whatever format came up rather
   than an absolute amount of work: a hard interval piece is still lighter than
   a soft AMRAP. See docs/DESIGN.md for why it is relative.

   These are chosen for what they deliver, not for how they read. Asking for
   0.8 does not produce 80% of the work: `quantise` floors every movement at
   half its minimum dose and `buildCandidate` clamps the rep scaling to 0.55,
   so roughly 60% of the request survives. 0.6 lands at about -16%, 1.4 at
   about +24%.

   The asymmetry is real rather than sloppy. Work can be added by scaling reps
   but not removed the same way, because the floors stop reps going lower: -16%
   is close to the softest this mechanism can produce at all. Genuinely lighter
   sessions would need fewer movements or fewer rounds, which is a different
   change. Re-measure with scripts/smoke.js if these move. */
export const INTENSITY = [
  { id: "soft", k: 0.6 },
  { id: "normal", k: 1.0 },
  { id: "hard", k: 1.4 },
];

export const intensityK = (id) => (INTENSITY.find((i) => i.id === id) || INTENSITY[1]).k;

/* The strength-block shortcuts, in the order they appear. What each one is
   worth used to be hand-authored here as a `pre` axis map and a `dampen`
   factor. It is computed now, from the actual lifts in PRESET_ROWS, so this is
   just the list and its order. See src/lifts.js. */
export const STRENGTH = [
  { id: "none" },
  { id: "squat" },
  { id: "deadlift" },
  { id: "press" },
  { id: "pull" },
  { id: "lower" },
  { id: "full" },
];

export const CUES = {
  es: {
    amrap: ["Ritmo constante, sin parones largos.", "Empieza más lento de lo que crees.", "Que la última ronda se parezca a la primera."],
    fortime: ["Descanso 45-60 s entre rondas.", "Técnica limpia antes que velocidad.", "Divide las series antes de llegar al fallo."],
    emom: ["Si un minuto se te va de 45 s, baja las repeticiones.", "Entra puntual en cada minuto.", "Busca terminar cada minuto con 15 s de aire."],
    intervals: ["Los 30 s fuertes son fuertes de verdad.", "Descanso completo, no a medias."],
    ladder: ["Sin parar entre movimientos.", "Ritmo alto, la escalera se acorta sola."],
    chipper: ["Una sola pasada. Trocea las series desde el principio.", "Ritmo constante, sin parones largos."],
    quality: ["Calidad por encima de velocidad.", "Sin prisa; controla cada repetición."],
  },
  en: {
    amrap: ["Steady pace, no long breaks.", "Start slower than feels right.", "Make the last round look like the first."],
    fortime: ["Rest 45-60 s between rounds.", "Clean technique before speed.", "Break the sets before you hit failure."],
    emom: ["If a minute runs past 45 s, drop the reps.", "Start every minute on time.", "Aim to finish each minute with 15 s to spare."],
    intervals: ["The hard 30 s are actually hard.", "Full rest, not half rest."],
    ladder: ["No stopping between movements.", "High pace; the ladder shortens itself."],
    chipper: ["One pass only. Break the sets from the start.", "Steady pace, no long breaks."],
    quality: ["Quality over speed.", "No rush; control every rep."],
  },
};

/* Which cue a session shows. Derived from the session's own seed rather than
   drawn at render time, so the line holds still while you edit the day and
   the card, the copied text and the week overview all quote the same one. */
export function cueFor(wod, lang) {
  const cues = CUES[lang][wod.fmt.id];
  return cues[(wod.plan?.seed ?? 0) % cues.length];
}
