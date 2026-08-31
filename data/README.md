# Source session log

`55_sessions.txt` is the original, unedited training-log dump supplied for the project. Keep it as source evidence. Do not normalize or correct it in place.

The filename and original product copy say 55 sessions. The file contains 56 timestamped entries, from 10 July 2025 through 14 August 2026. `npm run corpus` parses the timestamps and reports the simple frequencies used by the application.

Derived defaults currently used by the product:

- Two sessions per week, Monday and Wednesday. Those weekdays account for 47 of the 56 timestamped entries.
- Lower-body strength on Monday and pressing strength on Wednesday. These are the most common broad before-conditioning focuses on those days.
- Walking-lunge or split-squat work at 3×8, followed by dumbbell rows at 3×10, for a first-time visitor's accessory defaults. They are the two most frequent supported accessory movements in the before-conditioning blocks.

The carry-over decay and 310-point daily planner target are planning heuristics. They are documented in `docs/DESIGN.md` and are not presented as facts extracted from this source file.
