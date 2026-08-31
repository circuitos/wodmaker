/* =========================== FORMATS =========================== */

/* Two volume facts per format, and only these two.
   `load`   how many work points the whole conditioning piece should be.
   `passes` how many times you go through the movement list to get there.
   The round target is load / passes, and the finished session's cost is
   totalWork * passes. One number to change, and both move together. See
   docs/DESIGN.md. */
export const FORMATS = [
  { id: "amrap",     w: 22, caps: [8, 10, 12],        slots: [3, 4, 5], scale: 1.0,
    load: (p) => p.cap * 20.5,  passes: () => 5 },
  { id: "fortime",   w: 28, rounds: [3, 4, 5],        slots: [4, 5, 6], scale: 1.0,
    load: () => 190,            passes: (p) => p.rounds },
  { id: "emom",      w: 20, caps: [8, 10, 12],        slots: [2, 3, 4], scale: 0.9,
    load: (p) => p.cap * 15,    passes: (p) => p.cap },
  { id: "intervals", w: 10, rounds: [5, 6],           slots: [1, 2],    scale: 0.55,
    load: (p) => p.rounds * 13.5, passes: (p) => p.rounds },
  { id: "ladder",    w: 8,  scheme: [10, 8, 6, 4, 2], slots: [3],       scale: 1.0,
    load: () => 99,             passes: () => 3 },
  { id: "chipper",   w: 7,  caps: [10, 12],           slots: [4, 5],    scale: 2.1,
    load: () => 155,            passes: () => 1 },
  { id: "quality",   w: 5,  caps: [10, 12],           slots: [3, 4],    scale: 0.8,
    load: () => 100,            passes: () => 1 },
];

/* The strength block that came before. Pre-loads the axes and damps volume. */
export const STRENGTH = [
  { id: "none",     dampen: 1.0,  pre: {} },
  { id: "squat",    dampen: 0.85, pre: { piernas: 90, posterior: 30, core: 20 } },
  { id: "deadlift", dampen: 0.82, pre: { posterior: 95, agarre: 45, piernas: 25, core: 20 } },
  { id: "press",    dampen: 0.95, pre: { empuje: 85, core: 20, traccion: 10 } },
  { id: "pull",     dampen: 0.92, pre: { traccion: 85, agarre: 40, core: 15 } },
  { id: "lower",    dampen: 0.8,  pre: { piernas: 70, posterior: 70, core: 25, agarre: 20 } },
  { id: "full",     dampen: 0.72, pre: { piernas: 55, posterior: 55, empuje: 50, traccion: 45, agarre: 30, core: 25 } },
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
