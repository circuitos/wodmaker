import React, { useState, useMemo, useRef, useEffect } from "react";

/* ------------------------------------------------------------------ *
 *  WOD GENERATOR
 *  Built from ~55 normalised sample workouts (Toni, 2025-2026).
 *  Data-first: MOVES is the whole database. The generator only reads it.
 * ------------------------------------------------------------------ */

/* =========================== 1. DATABASE =========================== */
/*
  pat   : slot category  mono | full | push | pull | hinge | legs | core | carry
  env   : where it can be done. 'gym' | 'parque' | 'casa'
  unit  : reps | cal | m | s
  dose  : [min, max] typical prescription seen in the samples
  step  : quantisation of the rep count
  cost  : metabolic work units per unit of measure (calibrated so a hard
          minute of work ≈ 20 units)
  load  : share of the effort taken by each system. Sums to ~1.
  skill : 1 easy · 2 needs technique · 3 high skill
  imp   : joint impact 0-2
  kg    : prescription seen in the samples (gym only)
*/

const A = {
  // axes
  legs: "piernas",
  push: "empuje",
  pull: "traccion",
  post: "posterior",
  core: "core",
  grip: "agarre",
};

const MOVES = [
  /* ---------- MONOSTRUCTURAL ---------- */
  { id: "row_cal", es: "cal de remo", en: "cal row", pat: "mono", env: ["gym"], unit: "cal", dose: [10, 15], step: 1, cost: 1.0, skill: 1, imp: 0,
    load: { piernas: 0.3, traccion: 0.35, posterior: 0.2, agarre: 0.15 } },
  { id: "row_m", es: "m de remo", en: "m row", pat: "mono", env: ["gym"], unit: "m", dose: [200, 400], step: 50, cost: 0.062, skill: 1, imp: 0,
    load: { piernas: 0.3, traccion: 0.35, posterior: 0.2, agarre: 0.15 } },
  { id: "ski_cal", es: "cal de Ski", en: "cal ski", pat: "mono", env: ["gym"], unit: "cal", dose: [10, 14], step: 1, cost: 1.0, skill: 1, imp: 0,
    load: { traccion: 0.4, core: 0.25, empuje: 0.15, agarre: 0.2 } },
  { id: "bike_cal", es: "cal de bici", en: "cal bike", pat: "mono", env: ["gym"], unit: "cal", dose: [9, 15], step: 1, cost: 1.0, skill: 1, imp: 0,
    load: { piernas: 0.5, traccion: 0.2, posterior: 0.15, empuje: 0.15 } },
  { id: "run_m", es: "m de carrera", en: "m run", pat: "mono", env: ["gym", "parque"], unit: "m", dose: [200, 400], step: 100, cost: 0.075, skill: 1, imp: 1,
    load: { piernas: 0.6, posterior: 0.3, core: 0.1 } },
  { id: "skips", es: "saltos a la comba", en: "single unders", pat: "mono", env: ["gym", "parque"], unit: "reps", dose: [30, 60], step: 10, cost: 0.16, skill: 2, imp: 1,
    load: { piernas: 0.55, agarre: 0.2, core: 0.25 } },
  { id: "mtn_climb", es: "escaladores", en: "mountain climbers", pat: "mono", env: ["gym", "parque", "casa"], unit: "reps", dose: [20, 40], step: 5, cost: 0.35, skill: 1, imp: 0,
    load: { core: 0.4, empuje: 0.2, piernas: 0.25, traccion: 0.15 } },
  { id: "high_knees", es: "rodillas al pecho", en: "high knees", pat: "mono", env: ["gym", "parque", "casa"], unit: "reps", dose: [20, 40], step: 10, cost: 0.3, skill: 1, imp: 1,
    load: { piernas: 0.5, core: 0.4, posterior: 0.1 } },
  { id: "jacks", es: "saltos de tijera", en: "jumping jacks", pat: "mono", env: ["gym", "parque", "casa"], unit: "reps", dose: [25, 40], step: 5, cost: 0.28, skill: 1, imp: 1,
    load: { piernas: 0.5, empuje: 0.25, core: 0.25 } },

  /* ---------- FULL BODY / HIGH COST ---------- */
  { id: "burpee", es: "burpees", en: "burpees", pat: "full", env: ["gym", "parque", "casa"], unit: "reps", dose: [8, 12], step: 1, cost: 3.0, skill: 1, imp: 1,
    load: { piernas: 0.3, empuje: 0.3, core: 0.25, posterior: 0.15 } },
  { id: "burpee_bjo", es: "burpee box jump overs", en: "burpee box jump overs", pat: "full", env: ["gym", "parque"], unit: "reps", dose: [8, 12], step: 1, cost: 3.6, skill: 2, imp: 2,
    load: { piernas: 0.4, empuje: 0.2, core: 0.2, posterior: 0.2 } },
  { id: "devil_press", es: "devil press", en: "devil press", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 4.0, skill: 2, imp: 1, kg: "2×12,5 kg",
    load: { empuje: 0.35, posterior: 0.3, piernas: 0.2, agarre: 0.15 } },
  { id: "db_snatch", es: "DB snatch alternos", en: "alt. DB snatch", pat: "full", env: ["gym"], unit: "reps", dose: [10, 12], step: 2, cost: 2.1, skill: 2, imp: 1, kg: "22,5 kg",
    load: { posterior: 0.4, empuje: 0.25, piernas: 0.2, agarre: 0.15 } },
  { id: "kb_snatch", es: "KB snatch alternos", en: "alt. KB snatch", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 2, cost: 2.3, skill: 3, imp: 1, kg: "24 kg",
    load: { posterior: 0.4, empuje: 0.25, piernas: 0.2, agarre: 0.15 } },
  { id: "thruster", es: "DB thrusters", en: "DB thrusters", pat: "full", env: ["gym"], unit: "reps", dose: [10, 12], step: 1, cost: 2.8, skill: 2, imp: 0, kg: "2×12,5-15 kg",
    load: { piernas: 0.35, empuje: 0.4, core: 0.15, agarre: 0.1 } },
  { id: "hang_clean", es: "DB hang clean", en: "DB hang clean", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 2.2, skill: 2, imp: 0, kg: "2×17,5-20 kg",
    load: { posterior: 0.4, traccion: 0.2, piernas: 0.25, agarre: 0.15 } },
  { id: "clean_jerk", es: "hang clean and jerk", en: "hang clean and jerk", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 2.6, skill: 3, imp: 0, kg: "2×15-17,5 kg",
    load: { posterior: 0.3, empuje: 0.3, piernas: 0.25, agarre: 0.15 } },

  /* ---------- HINGE / POSTERIOR ---------- */
  { id: "kb_swing", es: "KB swings", en: "KB swings", pat: "hinge", env: ["gym"], unit: "reps", dose: [12, 20], step: 2, cost: 1.5, skill: 2, imp: 0, kg: "24-32 kg",
    load: { posterior: 0.55, agarre: 0.2, core: 0.15, traccion: 0.1 } },
  { id: "slamball", es: "slamballs", en: "slamballs", pat: "hinge", env: ["gym"], unit: "reps", dose: [8, 15], step: 1, cost: 1.6, skill: 1, imp: 0, kg: "20 kg",
    load: { posterior: 0.35, core: 0.3, empuje: 0.2, agarre: 0.15 } },
  { id: "glute_bridge", es: "puente de glúteo", en: "glute bridge", pat: "hinge", env: ["gym", "parque", "casa"], unit: "reps", dose: [15, 25], step: 5, cost: 0.6, skill: 1, imp: 0,
    load: { posterior: 0.7, core: 0.3 } },
  { id: "superman", es: "superman", en: "superman hold", pat: "hinge", env: ["gym", "parque", "casa"], unit: "s", dose: [25, 40], step: 5, cost: 0.16, skill: 1, imp: 0,
    load: { posterior: 0.75, core: 0.25 } },

  /* ---------- PUSH ---------- */
  { id: "push_up", es: "push-ups", en: "push-ups", pat: "push", env: ["gym", "parque", "casa"], unit: "reps", dose: [10, 15], step: 1, cost: 1.0, skill: 1, imp: 0,
    load: { empuje: 0.65, core: 0.25, traccion: 0.1 } },
  { id: "ring_push_up", es: "ring push-ups", en: "ring push-ups", pat: "push", env: ["gym"], unit: "reps", dose: [8, 12], step: 1, cost: 1.4, skill: 2, imp: 0,
    load: { empuje: 0.6, core: 0.3, agarre: 0.1 } },
  { id: "pike_push_up", es: "pike push-ups", en: "pike push-ups", pat: "push", env: ["parque", "casa"], unit: "reps", dose: [8, 12], step: 1, cost: 1.3, skill: 2, imp: 0,
    load: { empuje: 0.75, core: 0.25 } },
  { id: "ring_dip", es: "ring dips", en: "ring dips", pat: "push", env: ["gym"], unit: "reps", dose: [6, 10], step: 1, cost: 2.0, skill: 3, imp: 0,
    load: { empuje: 0.7, core: 0.15, agarre: 0.15 } },
  { id: "db_push_press", es: "DB push press", en: "DB push press", pat: "push", env: ["gym"], unit: "reps", dose: [10, 12], step: 1, cost: 1.6, skill: 1, imp: 0, kg: "2×15 kg",
    load: { empuje: 0.6, piernas: 0.2, core: 0.2 } },
  { id: "db_push_press_uni", es: "DB push press unilateral", en: "single-arm DB push press", pat: "push", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 1.6, skill: 2, imp: 0, side: true, kg: "17,5 kg",
    load: { empuje: 0.55, core: 0.3, piernas: 0.15 } },

  /* ---------- PULL ---------- */
  { id: "ring_row", es: "ring rows", en: "ring rows", pat: "pull", env: ["gym"], unit: "reps", dose: [10, 16], step: 2, cost: 1.2, skill: 1, imp: 0,
    load: { traccion: 0.65, core: 0.2, agarre: 0.15 } },
  { id: "pull_up", es: "dominadas", en: "pull-ups", pat: "pull", env: ["gym", "parque"], unit: "reps", dose: [6, 10], step: 1, cost: 2.0, skill: 2, imp: 0,
    load: { traccion: 0.6, agarre: 0.25, core: 0.15 } },
  { id: "db_row", es: "remo con mancuerna", en: "DB row", pat: "pull", env: ["gym"], unit: "reps", dose: [10, 12], step: 1, cost: 1.2, skill: 1, imp: 0, side: true, kg: "20-24 kg",
    load: { traccion: 0.65, agarre: 0.2, core: 0.15 } },
  { id: "renegade_row", es: "remo renegado", en: "renegade row", pat: "pull", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 1.8, skill: 2, imp: 0, side: true, kg: "2×15 kg",
    load: { traccion: 0.4, core: 0.35, empuje: 0.15, agarre: 0.1 } },

  /* ---------- LEGS / JUMPS ---------- */
  { id: "wall_ball", es: "wall balls", en: "wall balls", pat: "legs", env: ["gym"], unit: "reps", dose: [10, 20], step: 2, cost: 2.0, skill: 2, imp: 0, kg: "9 kg",
    load: { piernas: 0.4, empuje: 0.35, core: 0.15, posterior: 0.1 } },
  { id: "goblet_squat", es: "goblet squats", en: "goblet squats", pat: "legs", env: ["gym"], unit: "reps", dose: [12, 20], step: 2, cost: 1.4, skill: 1, imp: 0, kg: "32 kg",
    load: { piernas: 0.6, core: 0.2, posterior: 0.1, agarre: 0.1 } },
  { id: "box_jump", es: "box jumps", en: "box jumps", pat: "legs", env: ["gym", "parque"], unit: "reps", dose: [8, 12], step: 1, cost: 2.2, skill: 2, imp: 2,
    load: { piernas: 0.6, posterior: 0.3, core: 0.1 } },
  { id: "box_jump_over", es: "box jump overs", en: "box jump overs", pat: "legs", env: ["gym"], unit: "reps", dose: [8, 12], step: 1, cost: 2.4, skill: 2, imp: 2,
    load: { piernas: 0.6, posterior: 0.25, core: 0.15 } },
  { id: "box_step_over", es: "box step overs", en: "box step overs", pat: "legs", env: ["gym", "parque"], unit: "reps", dose: [10, 14], step: 2, cost: 1.6, skill: 1, imp: 0,
    load: { piernas: 0.55, posterior: 0.25, core: 0.1, agarre: 0.1 } },
  { id: "step_up", es: "step ups", en: "step ups", pat: "legs", env: ["gym", "parque", "casa"], unit: "reps", dose: [8, 12], step: 1, cost: 1.3, skill: 1, imp: 0, side: true,
    load: { piernas: 0.6, posterior: 0.3, core: 0.1 } },
  { id: "air_squat", es: "air squats", en: "air squats", pat: "legs", env: ["gym", "parque", "casa"], unit: "reps", dose: [15, 25], step: 5, cost: 0.7, skill: 1, imp: 0,
    load: { piernas: 0.75, core: 0.15, posterior: 0.1 } },
  { id: "cossack", es: "cossack squats", en: "cossack squats", pat: "legs", env: ["gym", "parque", "casa"], unit: "reps", dose: [8, 10], step: 1, cost: 1.0, skill: 2, imp: 0, side: true,
    load: { piernas: 0.7, core: 0.2, posterior: 0.1 } },
  { id: "walking_lunge", es: "walking lunges", en: "walking lunges", pat: "legs", env: ["gym", "parque", "casa"], unit: "reps", dose: [12, 20], step: 2, cost: 0.85, skill: 1, imp: 0,
    load: { piernas: 0.6, posterior: 0.25, core: 0.15 } },
  { id: "lunge_bag", es: "walking lunges con saco", en: "sandbag walking lunges", pat: "legs", env: ["gym"], unit: "reps", dose: [12, 16], step: 2, cost: 1.15, skill: 1, imp: 0, kg: "20 kg",
    load: { piernas: 0.5, posterior: 0.2, core: 0.25, agarre: 0.05 } },
  { id: "broad_jump", es: "broad jumps", en: "broad jumps", pat: "legs", env: ["gym", "parque", "casa"], unit: "reps", dose: [6, 10], step: 1, cost: 1.6, skill: 1, imp: 2,
    load: { piernas: 0.55, posterior: 0.35, core: 0.1 } },

  /* ---------- CORE ---------- */
  { id: "sit_up", es: "sit-ups", en: "sit-ups", pat: "core", env: ["gym", "parque", "casa"], unit: "reps", dose: [15, 25], step: 5, cost: 0.6, skill: 1, imp: 0,
    load: { core: 0.95, piernas: 0.05 } },
  { id: "v_up", es: "V-ups", en: "V-ups", pat: "core", env: ["gym", "parque", "casa"], unit: "reps", dose: [12, 20], step: 2, cost: 0.9, skill: 1, imp: 0,
    load: { core: 1.0 } },
  { id: "hollow", es: "hollow hold", en: "hollow hold", pat: "core", env: ["gym", "parque", "casa"], unit: "s", dose: [20, 40], step: 5, cost: 0.26, skill: 1, imp: 0,
    load: { core: 1.0 } },
  { id: "plank", es: "plancha frontal", en: "front plank", pat: "core", env: ["gym", "parque", "casa"], unit: "s", dose: [30, 45], step: 5, cost: 0.16, skill: 1, imp: 0,
    load: { core: 0.9, empuje: 0.1 } },
  { id: "side_plank", es: "plancha lateral", en: "side plank", pat: "core", env: ["gym", "parque", "casa"], unit: "s", dose: [25, 40], step: 5, cost: 0.16, skill: 1, imp: 0, side: true,
    load: { core: 0.9, empuje: 0.1 } },
  { id: "toes_to_bar", es: "toes to bar", en: "toes to bar", pat: "core", env: ["gym", "parque"], unit: "reps", dose: [6, 10], step: 1, cost: 2.0, skill: 3, imp: 0,
    load: { core: 0.5, traccion: 0.25, agarre: 0.25 } },
  { id: "knee_raise", es: "elevaciones de rodillas colgado", en: "hanging knee raises", pat: "core", env: ["gym", "parque"], unit: "reps", dose: [8, 12], step: 1, cost: 1.4, skill: 2, imp: 0,
    load: { core: 0.55, agarre: 0.25, traccion: 0.2 } },

  /* ---------- CARRIES / CRAWLS ---------- */
  { id: "farmer_carry", es: "m farmer carry", en: "m farmer carry", pat: "carry", env: ["gym"], unit: "m", dose: [20, 30], step: 5, cost: 0.38, skill: 1, imp: 0, kg: "pesado",
    load: { agarre: 0.5, core: 0.25, posterior: 0.15, piernas: 0.1 } },
  { id: "suitcase_carry", es: "m suitcase carry", en: "m suitcase carry", pat: "carry", env: ["gym"], unit: "m", dose: [20, 25], step: 5, cost: 0.32, skill: 1, imp: 0, side: true,
    load: { agarre: 0.45, core: 0.35, posterior: 0.1, piernas: 0.1 } },
  { id: "sandbag_carry", es: "m sandbag carry abrazado", en: "m bear-hug sandbag carry", pat: "carry", env: ["gym"], unit: "m", dose: [20, 25], step: 5, cost: 0.5, skill: 1, imp: 0, kg: "20 kg",
    load: { core: 0.35, posterior: 0.25, piernas: 0.2, agarre: 0.2 } },
  { id: "bear_crawl", es: "m bear crawl", en: "m bear crawl", pat: "carry", env: ["gym", "parque", "casa"], unit: "m", dose: [15, 25], step: 5, cost: 0.5, skill: 1, imp: 0,
    load: { core: 0.4, empuje: 0.3, piernas: 0.2, agarre: 0.1 } },
];

/* =========================== 2. FORMATS =========================== */

const FORMATS = [
  { id: "amrap",     w: 22, caps: [8, 10, 12],        slots: [3, 4, 5], scale: 1.0 },
  { id: "fortime",   w: 28, rounds: [3, 4, 5],        slots: [4, 5, 6], scale: 1.0 },
  { id: "emom",      w: 20, caps: [8, 10, 12],        slots: [2, 3, 4], scale: 0.9 },
  { id: "intervals", w: 10, rounds: [5, 6],           slots: [1, 2],    scale: 0.55 },
  { id: "ladder",    w: 8,  scheme: [10, 8, 6, 4, 2], slots: [3],       scale: 1.0 },
  { id: "chipper",   w: 7,  caps: [10, 12],           slots: [4, 5],    scale: 2.1 },
  { id: "quality",   w: 5,  caps: [10, 12],           slots: [3, 4],    scale: 0.8 },
];

/* The strength block that came before. Pre-loads the axes and damps volume. */
const STRENGTH = [
  { id: "none",     dampen: 1.0,  pre: {} },
  { id: "squat",    dampen: 0.85, pre: { piernas: 90, posterior: 30, core: 20 } },
  { id: "deadlift", dampen: 0.82, pre: { posterior: 95, agarre: 45, piernas: 25, core: 20 } },
  { id: "press",    dampen: 0.95, pre: { empuje: 85, core: 20, traccion: 10 } },
  { id: "pull",     dampen: 0.92, pre: { traccion: 85, agarre: 40, core: 15 } },
  { id: "lower",    dampen: 0.8,  pre: { piernas: 70, posterior: 70, core: 25, agarre: 20 } },
  { id: "full",     dampen: 0.72, pre: { piernas: 55, posterior: 55, empuje: 50, traccion: 45, agarre: 30, core: 25 } },
];

const AXES = ["piernas", "posterior", "empuje", "traccion", "core", "agarre"];

const CUES = {
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

const T = {
  es: {
    title: "Generador de WOD", sub: "A partir de 55 sesiones reales",
    where: "Dónde entrenas", gym: "Gimnasio", parque: "Parque", casa: "Casa",
    whereHint: { gym: "Todo el material", parque: "Barra de dominadas, banco, suelo", casa: "Sin material" },
    before: "Bloque de fuerza previo",
    strength: { none: "Ninguno", squat: "Sentadilla", deadlift: "Peso muerto / RDL", press: "Press banca u hombro", pull: "Dominadas / remo", lower: "Tren inferior completo", full: "Cuerpo completo" },
    another: "Otro", copy: "Copiar", copied: "Copiado", share: "Compartir", cal: "Calendario",
    load: "Carga del día", axes: "Reparto del esfuerzo",
    fmt: { amrap: "AMRAP", fortime: "FOR TIME", emom: "EMOM", intervals: "INTERVALOS", ladder: "ESCALERA", chipper: "CHIPPER", quality: "FOR QUALITY" },
    rounds: "rondas", cap: "cap", min: "min", rest: "descanso", side: "por lado",
    axisName: { piernas: "Piernas", posterior: "Cadena posterior", empuje: "Empuje", traccion: "Tracción", core: "Core", agarre: "Agarre" },
    lock: "Fijar movimiento", locked: "Fijado", swap: "Cambiar este movimiento",
    warnHead: "Avisos",
    warn: {
      axis: (a) => `Mucha carga en ${a.toLowerCase()} para el bloque de fuerza de hoy.`,
      skill: "Tres movimientos técnicos seguidos; con fatiga se degrada la técnica.",
      impact: "Mucho impacto articular acumulado (saltos y carrera).",
      grip: "El agarre va a fallar antes que el resto.",
      nopull: "Sin barra no hay tracción real. Compénsalo el otro día de la semana.",
    },
    at: "a las", addCal: "Añadir al calendario", download: "Descargar .ics", gcal: "Google Calendar",
    total: "trabajo total", perRound: "por ronda", perMin: "por minuto",
  },
  en: {
    title: "WOD Generator", sub: "Built from 55 real sessions",
    where: "Where you train", gym: "Gym", parque: "Park", casa: "Home",
    whereHint: { gym: "Full equipment", parque: "Pull-up bar, bench, ground", casa: "No equipment" },
    before: "Strength block before",
    strength: { none: "None", squat: "Squat", deadlift: "Deadlift / RDL", press: "Bench or shoulder press", pull: "Pull-ups / rows", lower: "Full lower body", full: "Full body" },
    another: "Another", copy: "Copy", copied: "Copied", share: "Share", cal: "Calendar",
    load: "Load of the day", axes: "Effort split",
    fmt: { amrap: "AMRAP", fortime: "FOR TIME", emom: "EMOM", intervals: "INTERVALS", ladder: "LADDER", chipper: "CHIPPER", quality: "FOR QUALITY" },
    rounds: "rounds", cap: "cap", min: "min", rest: "rest", side: "per side",
    axisName: { piernas: "Legs", posterior: "Posterior chain", empuje: "Push", traccion: "Pull", core: "Core", agarre: "Grip" },
    lock: "Lock movement", locked: "Locked", swap: "Swap this movement",
    warnHead: "Warnings",
    warn: {
      axis: (a) => `Heavy ${a.toLowerCase()} load on top of today's strength block.`,
      skill: "Three technical movements in a row; technique degrades under fatigue.",
      impact: "A lot of accumulated joint impact (jumps and running).",
      grip: "Grip will fail before anything else does.",
      nopull: "No bar means no real pulling. Balance it on your other session.",
    },
    at: "at", addCal: "Add to calendar", download: "Download .ics", gcal: "Google Calendar",
    total: "total work", perRound: "per round", perMin: "per minute",
  },
};

/* =========================== 3. GENERATOR =========================== */

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rnd(arr.length)];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function weightedFormat() {
  const total = FORMATS.reduce((s, f) => s + f.w, 0);
  let r = Math.random() * total;
  for (const f of FORMATS) { r -= f.w; if (r <= 0) return f; }
  return FORMATS[0];
}

/* Slot templates. Every conditioning piece in the sample set opens with a
   monostructural or a full-body movement, then spreads across systems. */
function slotTemplate(n, env) {
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

function poolFor(pat, env) {
  return MOVES.filter((m) => m.env.includes(env) && m.pat === pat);
}

function axisVector(items) {
  const v = Object.fromEntries(AXES.map((a) => [a, 0]));
  for (const it of items) {
    const work = it.reps * it.move.cost * (it.move.side ? 2 : 1);
    for (const [k, share] of Object.entries(it.move.load)) v[k] += work * share;
  }
  return v;
}

function volumeBand(fmt, cap, rounds) {
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

function baseReps(m, scale) {
  const [lo, hi] = m.dose;
  const raw = (lo + Math.random() * (hi - lo)) * scale;
  return quantise(m, raw);
}

function quantise(m, raw) {
  const step = m.step || 1;
  const [lo, hi] = m.dose;
  const floorV = Math.max(step, lo * 0.5);
  const ceilV = hi * 2.6;
  const clamped = clamp(Math.round(raw / step) * step, floorV, ceilV);
  return Math.round(clamped / step) * step;
}

function itemCost(it) {
  return it.reps * it.move.cost * (it.move.side ? 2 : 1);
}

function buildCandidate(env, strengthId, locked, fixed) {
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
function faults(c, env) {
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

function generate(env, strengthId, locked = [], fixed = null) {
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

/* =========================== 4. RENDERING =========================== */

function repLine(it, lang, env) {
  const m = it.move;
  const name = m[lang];
  const kg = env === "gym" && m.kg ? ` (${m.kg})` : "";
  const side = m.side ? ` ${T[lang].side}` : "";
  if (m.unit === "s") return `${it.reps}" ${name}${side}${kg}`;
  if (m.unit === "m" || m.unit === "cal") return `${it.reps} ${name}${side}${kg}`;
  return `${it.reps} ${name}${side}${kg}`;
}

function headline(c, lang) {
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

function asText(c, lang, env) {
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

/* Bumper-plate load meter. Plates are a scale, not kilos. */
const PLATE = [
  { u: 55, h: 100, c: "#C8102E" },
  { u: 42, h: 88, c: "#0057B8" },
  { u: 30, h: 76, c: "#F5C400" },
  { u: 20, h: 62, c: "#00843D" },
  { u: 12, h: 48, c: "#E8E6DF" },
];

function platesFor(work) {
  const out = [];
  let left = work;
  for (const p of PLATE) {
    while (left >= p.u && out.length < 7) { out.push(p); left -= p.u; }
  }
  if (!out.length) out.push(PLATE[PLATE.length - 1]);
  return out;
}

function Barbell({ work }) {
  const plates = platesFor(work);
  const W = 320, H = 116, mid = H / 2;
  const sleeve = 96;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} aria-hidden="true">
      <rect x="8" y={mid - 4} width={W - 16} height="8" rx="4" fill="#8A8F98" />
      <rect x={W / 2 - 52} y={mid - 6} width="104" height="12" rx="6" fill="#5C6169" />
      {[-1, 1].map((dir) =>
        plates.map((p, i) => {
          const x = W / 2 + dir * (52 + i * 12) - (dir === 1 ? 0 : 10);
          return (
            <rect key={`${dir}-${i}`} x={x} y={mid - p.h / 2} width="10" height={p.h} rx="2"
              fill={p.c} stroke="#14171A" strokeWidth="1.2" />
          );
        })
      )}
      {[-1, 1].map((d) => (
        <rect key={d} x={W / 2 + d * (52 + sleeve) - (d === 1 ? 0 : 6)} y={mid - 9} width="6" height="18" rx="2" fill="#3A3F47" />
      ))}
    </svg>
  );
}

/* =========================== 5. APP =========================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
:root{
  --board:#F4F3EE; --ink:#14171A; --ink-2:#5C6169; --rule:#CFD2CB;
  --red:#C8102E; --blue:#0057B8; --yellow:#F5C400; --green:#00843D;
}
*{box-sizing:border-box}
.wg{min-height:100vh;background:var(--board);color:var(--ink);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
  padding:20px 16px 56px}
.wg-in{max-width:1040px;margin:0 auto}
.disp{font-family:'Barlow Condensed',ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.02em;line-height:.95}
.mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  font-variant-numeric:tabular-nums}
.h1{font-size:42px;font-weight:700;margin:0}
.sub{font-size:12px;color:var(--ink-2);letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:20px}
.lang{display:flex;border:1px solid var(--ink);border-radius:2px;overflow:hidden;flex:0 0 auto}
.lang button{border:0;background:transparent;padding:5px 9px;font-size:11px;font-weight:600;
  letter-spacing:.08em;cursor:pointer;color:var(--ink)}
.lang button[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.grid{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:880px){.grid{grid-template-columns:288px 1fr;gap:32px;align-items:start}}
.lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);
  margin:0 0 8px;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1.5px solid var(--ink);background:transparent;border-radius:2px;padding:9px 12px;
  cursor:pointer;text-align:left;flex:1 1 auto;min-width:88px;color:var(--ink);font:inherit}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.chip b{display:block;font-size:14px;font-weight:600}
.chip span{display:block;font-size:10.5px;opacity:.7;margin-top:2px;line-height:1.25}
.sel{width:100%;padding:10px;border:1.5px solid var(--ink);border-radius:2px;background:transparent;
  font:inherit;font-size:14px;color:var(--ink)}
.block{margin-bottom:22px}
.card{background:#fff;border:2px solid var(--ink);border-radius:3px;
  box-shadow:5px 5px 0 rgba(20,23,26,.1)}
.card-h{padding:16px 18px 12px;border-bottom:1px dashed var(--rule);
  display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.fmt{font-size:32px;font-weight:700}
.tag{font-size:10.5px;letter-spacing:.14em;color:var(--ink-2);text-transform:uppercase;white-space:nowrap}
.rows{padding:6px 8px 10px}
.row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:2px}
.row+.row{border-top:1px solid #EFEEE9}
.row:hover{background:#FAFAF7}
.minute{font-size:10px;letter-spacing:.1em;color:var(--ink-2);width:40px;flex:0 0 40px}
.reps{font-size:19px;font-weight:600;min-width:52px;flex:0 0 auto}
.nm{font-size:15px;line-height:1.25;flex:1 1 auto}
.nm em{font-style:normal;color:var(--ink-2);font-size:12.5px}
.ico{border:0;background:transparent;cursor:pointer;padding:6px;border-radius:2px;
  color:var(--ink-2);opacity:.55;line-height:0}
.ico:hover{opacity:1;background:#F0EFEA}
.ico[aria-pressed="true"]{opacity:1;color:var(--red)}
.cue{padding:0 18px 16px;font-size:13px;color:var(--ink-2);font-style:italic}
.meter{border-top:2px solid var(--ink);padding:16px 18px}
.mhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px}
.work{font-size:26px;font-weight:700}
.axis{display:grid;grid-template-columns:104px 1fr 34px;align-items:center;gap:10px;margin-top:7px}
.axis .an{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.bar{height:7px;background:#EDECE6;border-radius:1px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--ink)}
.bar i.hot{background:var(--red)}
.pct{font-size:11px;color:var(--ink-2);text-align:right}
.warn{margin:14px 18px 0;border-left:3px solid var(--yellow);padding:8px 0 8px 11px;
  font-size:12.5px;color:var(--ink-2);line-height:1.45}
.acts{display:flex;gap:8px;flex-wrap:wrap;padding:16px 18px 18px}
.btn{border:1.5px solid var(--ink);background:transparent;border-radius:2px;padding:11px 15px;
  font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--ink);
  display:inline-flex;align-items:center;gap:7px}
.btn:hover{background:#F1F0EB}
.btn.pri{background:var(--ink);color:var(--board);flex:1 1 140px;justify-content:center}
.btn.pri:hover{background:#000}
.pop{margin:0 18px 18px;border:1.5px dashed var(--rule);border-radius:2px;padding:14px}
.pop label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-2);margin-bottom:5px}
.pop input{width:100%;padding:9px;border:1.5px solid var(--ink);border-radius:2px;font:inherit;
  background:transparent;color:var(--ink)}
.pop .two{display:flex;gap:10px;margin-bottom:12px}
.pop .two>div{flex:1}
a.btn{text-decoration:none}
button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{
  outline:2px solid var(--blue);outline-offset:2px}
@media(prefers-reduced-motion:no-preference){
  .card{transition:box-shadow .2s ease}
}
`;

const IconLock = ({ on }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d={on ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
  </svg>
);
const IconSwap = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
  </svg>
);

export default function App() {
  const [lang, setLang] = useState("es");
  const [env, setEnv] = useState("gym");
  const [strengthId, setStrengthId] = useState("none");
  const [wod, setWod] = useState(null);
  const [locks, setLocks] = useState({});
  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:45");
  const t = T[lang];

  const roll = (keepLocks = false) => {
    const locked = keepLocks && wod ? wod.items.filter((it) => locks[it.move.id]) : [];
    const c = generate(env, strengthId, locked);
    if (!c) return;
    c.cue = pick(CUES[lang][c.fmt.id]);
    setWod(c);
    if (!keepLocks) setLocks({});
    setCopied(false);
  };

  useEffect(() => { roll(false); /* eslint-disable-next-line */ }, [env, strengthId]);
  useEffect(() => { if (wod) setWod({ ...wod, cue: pick(CUES[lang][wod.fmt.id]) }); /* eslint-disable-next-line */ }, [lang]);

  const text = useMemo(() => (wod ? asText(wod, lang, env) : ""), [wod, lang, env]);

  const shares = useMemo(() => {
    const sum = wod ? AXES.reduce((s, a) => s + wod.vec[a], 0) || 1 : 1;
    return wod ? Object.fromEntries(AXES.map((a) => [a, wod.vec[a] / sum])) : {};
  }, [wod]);

  const dayWork = useMemo(() => {
    if (!wod) return 0;
    const pre = Object.values(wod.strength.pre).reduce((s, v) => s + v, 0);
    return Math.round(wod.totalWork * (wod.fmt.id === "amrap" ? 5 : wod.fmt.id === "fortime" ? wod.rounds : wod.fmt.id === "emom" ? wod.cap / wod.items.length * (wod.items.length === 3 ? 3 : wod.items.length) : wod.fmt.id === "intervals" ? wod.rounds : wod.fmt.id === "ladder" ? 3 : 1) + pre * 0.9);
  }, [wod]);

  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const doShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: headline(wod, lang), text }); return; } catch {} }
    doCopy();
  };

  const icsHref = useMemo(() => {
    if (!wod) return "";
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const esc = (s) => s.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WOD Generator//ES", "BEGIN:VEVENT",
      `UID:${Date.now()}@wodgen`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      `SUMMARY:${esc(headline(wod, lang))}`, `DESCRIPTION:${esc(text)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [wod, date, time, text, lang]);

  const gcalHref = useMemo(() => {
    if (!wod) return "";
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(headline(wod, lang))}&dates=${z(start)}/${z(end)}&details=${encodeURIComponent(text)}`;
  }, [wod, date, time, text, lang]);

  const swapOne = (id) => {
    const removed = wod.items.find((it) => it.move.id === id);
    const keep = wod.items.filter((it) => it.move.id !== id);
    const fixed = { fmt: wod.fmt, cap: wod.cap, rounds: wod.rounds, slots: [removed.move.pat] };
    const c = generate(env, strengthId, keep, fixed);
    if (!c) return;
    c.cue = wod.cue;
    setWod(c);
  };

  const warnList = useMemo(() => {
    if (!wod) return [];
    const seen = new Set();
    return wod.faults.filter((f) => {
      const k = f.k + (f.a || "");
      if (seen.has(k)) return false; seen.add(k); return true;
    }).map((f) => (f.k === "axis" ? t.warn.axis(t.axisName[f.a]) : t.warn[f.k]));
  }, [wod, lang]);

  return (
    <div className="wg">
      <style>{CSS}</style>
      <div className="wg-in">
        <header className="top">
          <div>
            <h1 className="h1 disp">{t.title}</h1>
            <div className="sub disp">{t.sub}</div>
          </div>
          <div className="lang">
            {["es", "en"].map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </header>

        <div className="grid">
          <aside>
            <div className="block">
              <p className="lbl">{t.where}</p>
              <div className="chips">
                {["gym", "parque", "casa"].map((e) => (
                  <button key={e} className="chip" aria-pressed={env === e} onClick={() => setEnv(e)}>
                    <b>{t[e]}</b><span>{t.whereHint[e]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="block">
              <p className="lbl">{t.before}</p>
              <select className="sel" value={strengthId} onChange={(e) => setStrengthId(e.target.value)}>
                {STRENGTH.map((s) => <option key={s.id} value={s.id}>{t.strength[s.id]}</option>)}
              </select>
            </div>
          </aside>

          {wod && (
            <main className="card">
              <div className="card-h">
                <div className="fmt disp">{headline(wod, lang)}</div>
                <div className="tag mono">
                  {wod.fmt.id === "emom" ? t.perMin : wod.fmt.id === "fortime" || wod.fmt.id === "amrap" ? t.perRound : t.total}
                  {" · "}{Math.round(wod.totalWork)}
                </div>
              </div>

              <div className="rows">
                {wod.items.map((it, i) => (
                  <div className="row" key={it.move.id}>
                    {wod.fmt.id === "emom" && <span className="minute mono disp">Min {i + 1}</span>}
                    <span className="reps mono">
                      {wod.fmt.id === "ladder" ? "10-2"
                        : it.move.unit === "s" ? `${it.reps}"` : it.reps}
                    </span>
                    <span className="nm">
                      {it.move[lang]}
                      {it.move.side && <em> · {t.side}</em>}
                      {env === "gym" && it.move.kg && <em> · {it.move.kg}</em>}
                    </span>
                    <button className="ico" title={t.swap} onClick={() => swapOne(it.move.id)}><IconSwap /></button>
                    <button className="ico" title={t.lock} aria-pressed={!!locks[it.move.id]}
                      onClick={() => setLocks({ ...locks, [it.move.id]: !locks[it.move.id] })}>
                      <IconLock on={!!locks[it.move.id]} />
                    </button>
                  </div>
                ))}
                {wod.fmt.id === "emom" && wod.items.length === 3 && (
                  <div className="row"><span className="minute mono disp">Min 4</span>
                    <span className="reps mono">—</span><span className="nm">{t.rest}</span></div>
                )}
              </div>

              <p className="cue">{wod.cue}</p>

              <div className="meter">
                <div className="mhead">
                  <span className="lbl" style={{ margin: 0 }}>{t.load}</span>
                  <span className="work mono disp">{dayWork}</span>
                </div>
                <Barbell work={dayWork} />
                <p className="lbl" style={{ marginTop: 14 }}>{t.axes}</p>
                {AXES.map((a) => {
                  const s = shares[a] || 0;
                  const pre = wod.strength.pre[a] || 0;
                  const hot = s > 0.4 || (pre >= 80 && s > 0.24);
                  return (
                    <div className="axis" key={a}>
                      <span className="an">{t.axisName[a]}{pre >= 50 ? " ▪" : ""}</span>
                      <span className="bar"><i className={hot ? "hot" : ""} style={{ width: `${Math.min(100, s * 220)}%` }} /></span>
                      <span className="pct mono">{Math.round(s * 100)}%</span>
                    </div>
                  );
                })}
              </div>

              {warnList.length > 0 && (
                <div className="warn">
                  <strong className="disp" style={{ letterSpacing: ".1em", fontSize: 11 }}>{t.warnHead}</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {warnList.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="acts">
                <button className="btn pri" onClick={() => roll(true)}><IconSwap /> {t.another}</button>
                <button className="btn" onClick={doCopy}>{copied ? t.copied : t.copy}</button>
                <button className="btn" onClick={doShare}>{t.share}</button>
                <button className="btn" onClick={() => setCalOpen(!calOpen)}>{t.cal}</button>
              </div>

              {calOpen && (
                <div className="pop">
                  <div className="two">
                    <div><label>{lang === "es" ? "Fecha" : "Date"}</label>
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div><label>{lang === "es" ? "Hora" : "Time"}</label>
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="btn" href={icsHref} download="wod.ics">{t.download}</a>
                    <a className="btn" href={gcalHref} target="_blank" rel="noreferrer">{t.gcal}</a>
                  </div>
                </div>
              )}
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
