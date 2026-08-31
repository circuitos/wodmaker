import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { ACCESSORY, moveById } from "../src/lifts.js";

/* The log is the record; data/annotations.json says where each entry's blocks
   begin and end. Both are read here, and the annotation is checked against the
   log rather than trusted: same number of entries, same timestamps, in order.

   This replaced inferring block boundaries from marker words. An entry that
   never writes "WOD" or "AMRAP" was treated as one long accessory block, so
   the movements inside an unlabelled conditioning piece were counted as
   supplementary work. That put walking lunges and box step-ups at the top of
   the accessory table when neither appears in a real accessory block at all. */
const path = (name) => fileURLToPath(new URL(`../data/${name}`, import.meta.url));
const raw = fs.readFileSync(path("55_sessions.txt"), "utf8");
const annotations = JSON.parse(fs.readFileSync(path("annotations.json"), "utf8"));

const entries = raw
  .split(/(?=\[\d{1,2}\/\d{1,2}(?:\/\d{4})?,\s*\d{2}:\d{2}\])/)
  .map((entry) => entry.trim())
  .filter(Boolean);

let year = 2025;
let previousMonth = null;
const weekdayCounts = Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, 0]));
const stamps = entries.map((entry) => {
  const match = entry.match(/^\[(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?,\s*(\d{2}:\d{2})\]/);
  if (!match) throw new Error(`Entry has no date: ${entry.slice(0, 60)}`);
  const month = Number(match[1]);
  if (match[3]) year = Number(match[3]);
  else if (previousMonth === 12 && month === 1) year += 1;
  previousMonth = month;
  const date = new Date(Date.UTC(year, month - 1, Number(match[2])));
  weekdayCounts[date.getUTCDay()] += 1;
  return `${date.toISOString().slice(0, 10)}T${match[4]}`;
});

if (annotations.entries.length !== entries.length) {
  throw new Error(`annotations cover ${annotations.entries.length} entries, the log has ${entries.length}`);
}
annotations.entries.forEach((annotated, i) => {
  if (annotated.at !== stamps[i]) {
    throw new Error(`annotation ${i} is stamped ${annotated.at}, the log says ${stamps[i]}`);
  }
});

const dates = stamps.map((stamp) => stamp.slice(0, 10));
const blocks = annotations.entries.map((entry) => entry.accessory);

const tally = (rows, key) => rows.reduce((out, row) => {
  out[key(row)] = (out[key(row)] || 0) + 1;
  return out;
}, {});

/* One count per session, not per line: a movement written twice in one entry
   is still one session that contained it. */
const accessorySessions = {};
for (const block of blocks) {
  for (const id of new Set(block.map((row) => row.id))) {
    accessorySessions[id] = (accessorySessions[id] || 0) + 1;
  }
}

/* The modal dose actually written next to each movement, rather than a default
   leaking back out of the parser. */
const accessoryDose = {};
for (const id of Object.keys(accessorySessions)) {
  const written = blocks.flat().filter((row) => row.id === id).map((row) => `${row.sets}x${row.reps}`);
  const [dose] = Object.entries(tally(written, (d) => d)).sort((a, b) => b[1] - a[1])[0];
  accessoryDose[id] = dose;
}

const offered = new Set(ACCESSORY.map((acc) => acc.moveId));
const unrepresented = Object.keys(accessorySessions)
  .filter((id) => !offered.has(id))
  .sort((a, b) => accessorySessions[b] - accessorySessions[a]);

const accessoryBlockSizes = tally(blocks, (block) => block.length);
const liftSessions = {};
for (const entry of annotations.entries) {
  for (const id of new Set(entry.lifts.map((row) => row.id))) {
    liftSessions[id] = (liftSessions[id] || 0) + 1;
  }
}

const sortedGaps = dates.slice(1).map((date, index) => (
  (Date.parse(date) - Date.parse(dates[index])) / 86_400_000
)).sort((a, b) => a - b);

console.log(JSON.stringify({
  source: "data/55_sessions.txt + data/annotations.json",
  statedSessions: 55,
  timestampedEntries: entries.length,
  firstDate: dates[0],
  lastDate: dates.at(-1),
  medianGapDays: sortedGaps[Math.floor(sortedGaps.length / 2)],
  weekdayCounts,
  sessionsWithConditioning: annotations.entries.filter((e) => e.conditioning).length,
  sessionsWithBarbell: annotations.entries.filter((e) => e.lifts.length).length,
  sessionsWithAccessory: blocks.filter((block) => block.length).length,
  accessoryBlockSizes,
  accessorySessions,
  accessoryDose,
  liftSessions,
  /* Movements the log records as accessory work that the app cannot offer.
     Named rather than mapped onto the nearest thing it does have: calling a
     Bulgarian split squat a walking lunge loses the per-side dose and prices
     it at half. */
  unrepresentedAccessory: Object.fromEntries(unrepresented.map((id) => [id, accessorySessions[id]])),
  offerableAccessory: Object.fromEntries(Object.entries(accessorySessions)
    .filter(([id]) => offered.has(id) && moveById(id))
    .sort((a, b) => b[1] - a[1])),
}, null, 2));
