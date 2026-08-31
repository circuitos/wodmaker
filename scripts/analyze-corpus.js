import fs from "node:fs";
import { fileURLToPath } from "node:url";

const path = fileURLToPath(new URL("../data/55_sessions.txt", import.meta.url));
const raw = fs.readFileSync(path, "utf8");

const entries = raw
  .split(/(?=\[\d{1,2}\/\d{1,2}(?:\/\d{4})?,\s*\d{2}:\d{2}\])/)
  .map((entry) => entry.trim())
  .filter(Boolean);

let year = 2025;
let previousMonth = null;
const weekdayCounts = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, 0]));
const dates = entries.map((entry) => {
  const match = entry.match(/^\[(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?,/);
  if (!match) throw new Error(`Entry has no date: ${entry.slice(0, 60)}`);
  const month = Number(match[1]);
  if (match[3]) year = Number(match[3]);
  else if (previousMonth === 12 && month === 1) year += 1;
  previousMonth = month;
  const date = new Date(Date.UTC(year, month - 1, Number(match[2])));
  weekdayCounts[date.getUTCDay()] += 1;
  return date.toISOString().slice(0, 10);
});

const beforeConditioning = entries.map((entry) => entry.split(
  /\bWOD\b|\bAMRAP\b|\bEMOM\b|\bFOR TIME\b|\bFINAL\b|conditioning|⸻|🔥/i,
)[0]);

const accessoryPatterns = {
  walking_lunge: /walking lunges|zancadas|lunges con barra|split squat|búlgara|bulgarian/i,
  step_up: /step[ -]?up|step overs/i,
  goblet_squat: /goblet squat/i,
  air_squat: /air squat/i,
  glute_bridge: /puente glúteo/i,
  db_row: /remo con mancuerna|remo mancuerna|dumbbell row/i,
  ring_row: /ring rows/i,
  db_push_press: /push press|press con mancuernas|press mancuernas/i,
  push_up: /push[- ]?ups/i,
  sit_up: /sit[- ]?ups|abmat sit/i,
  v_up: /v-up/i,
  plank: /plancha frontal|plancha con peso|plancha and|hollow hold/i,
};

const accessorySessions = Object.fromEntries(Object.entries(accessoryPatterns).map(([id, pattern]) => [
  id,
  beforeConditioning.filter((entry) => pattern.test(entry)).length,
]));

/* How many accessory movements a session carries, counted only over the text
   before the conditioning marker. Half the entries have none: they are
   conditioning-only days. The rest carry one to three. */
const accessoryCounts = beforeConditioning.map(
  (entry) => Object.values(accessoryPatterns).filter((pattern) => pattern.test(entry)).length,
);
const accessoryBlockSizes = accessoryCounts.reduce((tally, count) => {
  tally[count] = (tally[count] || 0) + 1;
  return tally;
}, {});

const sortedGaps = dates.slice(1).map((date, index) => (
  (Date.parse(date) - Date.parse(dates[index])) / 86_400_000
)).sort((a, b) => a - b);

const summary = {
  source: "data/55_sessions.txt",
  statedSessions: 55,
  timestampedEntries: entries.length,
  firstDate: dates[0],
  lastDate: dates.at(-1),
  medianGapDays: sortedGaps[Math.floor(sortedGaps.length / 2)],
  weekdayCounts,
  accessorySessions,
  accessoryBlockSizes,
  sessionsWithAccessory: accessoryCounts.filter((count) => count > 0).length,
};

console.log(JSON.stringify(summary, null, 2));
