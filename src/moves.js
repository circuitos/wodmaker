/* =========================== MOVEMENT DATABASE =========================== */
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

export const A = {
  // axes
  legs: "piernas",
  push: "empuje",
  pull: "traccion",
  post: "posterior",
  core: "core",
  grip: "agarre",
};

export const MOVES = [
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
  { id: "devil_press", es: "devil press", en: "devil press", pat: "full", env: ["gym", "casa"], unit: "reps", dose: [8, 10], step: 1, cost: 4.0, skill: 2, imp: 1, kg: "2×12,5 kg",
    load: { empuje: 0.35, posterior: 0.3, piernas: 0.2, agarre: 0.15 } },
  { id: "db_snatch", es: "DB snatch alternos", en: "alt. DB snatch", pat: "full", env: ["gym"], unit: "reps", dose: [10, 12], step: 2, cost: 2.1, skill: 2, imp: 1, kg: "22,5 kg",
    load: { posterior: 0.4, empuje: 0.25, piernas: 0.2, agarre: 0.15 } },
  { id: "kb_snatch", es: "KB snatch alternos", en: "alt. KB snatch", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 2, cost: 2.3, skill: 3, imp: 1, kg: "24 kg",
    load: { posterior: 0.4, empuje: 0.25, piernas: 0.2, agarre: 0.15 } },
  { id: "thruster", es: "DB thrusters", en: "DB thrusters", pat: "full", env: ["gym", "casa"], unit: "reps", dose: [10, 12], step: 1, cost: 2.8, skill: 2, imp: 0, kg: "2×12,5-15 kg",
    load: { piernas: 0.35, empuje: 0.4, core: 0.15, agarre: 0.1 } },
  { id: "hang_clean", es: "DB hang clean", en: "DB hang clean", pat: "full", env: ["gym"], unit: "reps", dose: [8, 10], step: 1, cost: 2.2, skill: 2, imp: 0, kg: "2×17,5-20 kg",
    load: { posterior: 0.4, traccion: 0.2, piernas: 0.25, agarre: 0.15 } },
  { id: "clean_jerk", es: "hang clean and jerk", en: "hang clean and jerk", pat: "full", env: ["gym", "casa"], unit: "reps", dose: [8, 10], step: 1, cost: 2.6, skill: 3, imp: 0, kg: "2×15-17,5 kg",
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
  { id: "db_push_press", es: "DB push press", en: "DB push press", pat: "push", env: ["gym", "casa"], unit: "reps", dose: [10, 12], step: 1, cost: 1.6, skill: 1, imp: 0, kg: "2×15 kg",
    load: { empuje: 0.6, piernas: 0.2, core: 0.2 } },
  { id: "db_push_press_uni", es: "DB push press unilateral", en: "single-arm DB push press", pat: "push", env: ["gym", "casa"], unit: "reps", dose: [8, 10], step: 1, cost: 1.6, skill: 2, imp: 0, side: true, kg: "17,5 kg",
    load: { empuje: 0.55, core: 0.3, piernas: 0.15 } },

  /* ---------- PULL ---------- */
  { id: "ring_row", es: "ring rows", en: "ring rows", pat: "pull", env: ["gym"], unit: "reps", dose: [10, 16], step: 2, cost: 1.2, skill: 1, imp: 0,
    load: { traccion: 0.65, core: 0.2, agarre: 0.15 } },
  { id: "pull_up", es: "dominadas", en: "pull-ups", pat: "pull", env: ["gym", "parque"], unit: "reps", dose: [6, 10], step: 1, cost: 2.0, skill: 2, imp: 0,
    load: { traccion: 0.6, agarre: 0.25, core: 0.15 } },
  { id: "db_row", es: "remo con mancuerna", en: "DB row", pat: "pull", env: ["gym", "casa"], unit: "reps", dose: [10, 12], step: 1, cost: 1.2, skill: 1, imp: 0, side: true, kg: "20-24 kg",
    load: { traccion: 0.65, agarre: 0.2, core: 0.15 } },
  { id: "renegade_row", es: "remo renegado", en: "renegade row", pat: "pull", env: ["gym", "casa"], unit: "reps", dose: [8, 10], step: 1, cost: 1.8, skill: 2, imp: 0, side: true, kg: "2×15 kg",
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


export const AXES = ["piernas", "posterior", "empuje", "traccion", "core", "agarre"];

/* Where you can train. One owner for the list, so a saved preference can be
   checked against it rather than trusted. */
export const ENVS = ["gym", "parque", "casa"];
