# Source session log

`55_sessions.txt` is the original, unedited training-log dump supplied for the project. Keep it as source evidence. Do not normalize or correct it in place.

The filename and original product copy say 55 sessions. The file contains 56 timestamped entries, from 10 July 2025 through 14 August 2026. `npm run corpus` parses the timestamps and reports the simple frequencies used by the application.

Derived defaults currently used by the product:

- Two sessions per week, Monday and Wednesday. Those weekdays account for 47 of the 56 timestamped entries.
- Lower-body strength on Monday and pressing strength on Wednesday. These are the most common broad before-conditioning focuses on those days.
- The accessory pool and its block sizes, from the annotation described below. Dumbbell rows lead the movements the app can offer, in 6 sessions; the three most common of all, dumbbell presses, split squats and back extensions, have no movement in the catalogue and are reported as unrepresented rather than folded into the nearest match.

An earlier version of this file named walking lunges and box step-ups as the most frequent accessory movements. That came from splitting entries on marker words, which read the movements inside an unlabelled conditioning piece as accessory work. Neither appears in a real accessory block once.

The carry-over decay and the per-environment daily targets are planning heuristics. They are documented in `docs/DESIGN.md` and are not presented as facts extracted from this source file.

## annotations.json

`55_sessions.txt` is the record and stays verbatim. `annotations.json` says
where each entry's blocks begin and end: `lifts` is barbell work against a
one-rep max, `accessory` is the supplementary work between that and the piece,
and `conditioning` says whether the entry contains a piece at all. Entries are
keyed by the log's own timestamp, and `scripts/analyze-corpus.js` refuses to run
if the two disagree on count, order or timestamps.

It was written by hand because the alternative does not work. Splitting an entry
on marker words like `WOD` or `AMRAP` fails on the 13 entries that never write
one: their conditioning pieces were read as one long accessory block, which put
walking lunges and box step-ups at the top of the accessory table. Neither
appears in a real accessory block once.

Movement ids are the app's where one exists. Where the log records something the
app has no movement for, the id is the honest name and the analyser reports it
under `unrepresentedAccessory` rather than folding it into the nearest thing the
catalogue happens to have.

Four entries carry `certainty: "judgement"`, where the log does not settle the
reading. Each has a `note` saying what the alternative would change, and
`npm run corpus` lists them, so a count that rests on one of those calls can be
told from a count that does not.
