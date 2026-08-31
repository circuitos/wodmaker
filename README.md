# WOD Generator

A CrossFit-style workout generator that builds a conditioning piece around the strength work you already did, and around the equipment you actually have. Pick a place (gym, park, home), say what you lifted first, and get a balanced WOD with real rep prescriptions.

Bilingual: Spanish and English, toggled in the header.

Built from the original training log, so the doses and formats look like workouts a coach would write rather than a random draw from a movement list. The source file is preserved under `data/`; it is named for 55 sessions but contains 56 timestamped entries.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build: `npm run build`, then `npm run preview` to serve `dist/` locally.

The live site is auto-deployed from the default branch. Every other branch gets its own build at `/previews/<branch>/`, with an index at `/previews/`. To host your own fork, see `docs/SETUP.md`.

## How it works

1. You set the context: where you are training (`gym`, `parque`, `casa`) and what you lifted first. The strength block is a grid in two parts. **Main lifts** are heavy barbell work: tick what you did, give sets, reps and a working weight, and store a one-rep max to see the percentage. **Accessory** is the dumbbell work that follows, charged per rep the way conditioning movements already are, because that is what it is. The app adds both up into what you arrive carrying. Warm-up ramps are not logged: they are already in the calibration. Seven one-tap shortcuts fill the grid for a typical squat, deadlift, press, pull, lower-body or full-body day.
2. A soft / normal / hard control scales the whole thing. It is relative to whatever format came up rather than an absolute target, so a hard interval piece is still lighter than a soft AMRAP.
3. A format is drawn by weight: AMRAP, for time, EMOM, intervals, ladder, chipper, or quality work. Each format carries its own slot count, time cap or round scheme, and a volume scale.
4. Slots are filled from the movement pool. Every piece opens with a monostructural or full-body movement, then spreads across pushing, pulling, hinging, legs, core, and carries.
5. Reps come from each movement's typical dose, scaled to the format's volume band and quantised to a sane step (no 37-rep sets of wall balls).
6. The candidate is scored against a fault list: no axis over its share of the total work, a tighter cap on whatever the strength block already hammered, a ceiling on stacked skill and joint impact, plus soft warnings for grip-heavy and pull-free sessions. The generator draws up to 300 candidates and returns the first clean one, or the least-faulty one it saw.
7. The result renders with per-movement rep lines, a load breakdown across the six axes, a coaching cue, barbell plate loading for gym sessions, and any warnings that survived.

The app has one model and two views of it. A week is a list of days, and a day carries everything about a session: which weekday, where you train, how hard, the strength block, and anything you locked.

A session is three blocks in the order they happen: barbell work against a one-rep max, then the accessory or supplementary work between it and the piece, then the conditioning piece itself. The strength shortcuts name the barbell block only, so switching from squats to pressing leaves your supplementary work alone. A day arrives with an accessory block already chosen, drawn from what the source log actually contains: one to three movements, weighted by how often each appears. "Another" redraws it with the piece.

Where you train decides the whole session, not just the conditioning piece. A park has no barbell, so a park day is built from what a park has: weighted pull-ups if you want them, a longer accessory block to do the work the barbell would have done, and a conditioning piece drawn from the same pool. A living room has no barbell either, but it does have dumbbells, so it keeps the movements a light-medium pair can do. Each environment has its own idea of what a good day is worth (450 points at the gym, 350 in a park, 320 at home), and the automatic effort aims at the one you are in. Switching back to the gym gives you the gym session you left.

The **Day** view is an editor for one day of that week, with a switcher across the top. Everything on it writes to that day: change where you train, tick a lift, lock a movement you like, swap one you don't, or press "Another" to redraw just that day. Because the day belongs to a week, it already arrives with the fatigue carried from the days before it.

The **Week** view is the overview of the same days: the weekly load, the balance across the six axes, and a card per day. "Edit day" opens that day in the Day view. Nothing is generated twice, so the first day of the week and the Day view are the same session, down to the reps.

It plans 2–5 sessions, carries each day's six-axis load into the next training day with calendar-day decay, avoids repeating the previous format and movements, and keeps one seed per week so edits change volume without reshuffling everything. Each day's weekday is a control in the card heading, and the week re-sorts itself when you move one, because the gap between two days is exactly what the carry-over decays over. Its default Monday/Wednesday cadence comes from the source log. Effort can be an explicit soft/normal/hard or `auto`, which picks the result closest to the shared daily-load target.

## Exports

- **Copy** puts a plain-text version on the clipboard for a training log.
- **Share** uses the native share sheet where the browser has one, and falls back to copy.
- **Calendar** downloads an `.ics` file or opens a prefilled Google Calendar event at the date and time you pick.
- **Copy week** copies every planned day as one plain-text block.

## The six axes

Every movement declares how its effort splits across `piernas` (legs), `posterior`, `empuje` (push), `traccion` (pull), `core`, and `agarre` (grip). Those shares are the whole balance model: they set the axis bars in the interface, they decide whether a candidate is balanced, and they are what the strength block pre-loads so the conditioning piece doesn't hit the same system twice.

## Project layout

```
wodmaker/
├── index.html                  # Vite entry document
├── src/
│   ├── moves.js                # the movement database and the six axes
│   ├── formats.js              # workout formats, shortcut list, cues
│   ├── lifts.js                # strength lifts and the arriving-load maths
│   ├── i18n.js                 # every string the interface renders
│   ├── generator.js            # candidate building and fault scoring
│   ├── text.js                 # rep lines and plain-text export
│   ├── plates.js               # barbell plate maths
│   ├── prefs.js                # the few choices that survive a reload
│   ├── corpus.js               # reproducible defaults derived from the source log
│   ├── planner.js              # the week model: days, carry-over, automatic effort
│   ├── WeekPlanner.jsx         # the week overview
│   ├── App.jsx                 # the week state, the day editor, the styles
│   ├── main.jsx                # React root
│   └── index.css               # global reset (app styles live in App.jsx)
├── public/
│   ├── favicon.svg
│   └── robots.txt              # keeps /previews/ out of search engines
├── scripts/
│   ├── analyze-corpus.js       # reports source-log frequencies (npm run corpus)
│   ├── check-planner.js        # deterministic planner checks
│   ├── smoke.js                # generator regression sweep (npm run smoke)
│   └── build-preview-site.mjs  # composes the Pages site (run by CI)
├── data/
│   ├── 55_sessions.txt         # original source dump, kept verbatim
│   └── README.md               # provenance and derived defaults
├── out/
│   └── smoke-report.md         # latest sweep (regenerated, never hand-edited)
├── .github/
│   └── workflows/
│       └── deploy-pages.yml    # Pages deploy: trunk + branch previews
├── docs/
│   ├── DESIGN.md               # architecture and tuning decisions
│   └── SETUP.md                # GitHub + Pages walkthrough
├── .claude/
│   ├── launch.json             # dev server config for Claude Code
│   └── settings.json           # no AI attribution on commits or PRs
├── CLAUDE.md                   # working notes for agents and contributors
├── vite.config.js
├── package.json
├── LICENSE
└── README.md
```

The model (`moves.js` through `planner.js`) is plain JavaScript with no React in it, so it runs under Node as well as in the browser. React stays in `App.jsx` and `WeekPlanner.jsx`.

## Contributing

The movement table is the actual content. To add a movement, add an entry to `MOVES` in `src/moves.js`:

```js
{ id: "wall_ball", es: "wall balls", en: "wall balls", pat: "full",
  env: ["gym"], unit: "reps", dose: [12, 20], step: 2, cost: 1.1,
  skill: 2, imp: 1, kg: "9 kg",
  load: { piernas: 0.45, empuje: 0.3, core: 0.25 } }
```

Two things to get right: `load` shares should sum to about 1, and `cost` is calibrated so a hard minute of work is roughly 20 units. Both are read silently by the fault checker, so a wrong value shows up as skewed workouts rather than an error.

Run `npm run smoke` before and after any change to the generator or the data, and read the diff in `out/smoke-report.md`. The output is random, so a workout that looks plausible proves nothing; the distributions do.

Run `npm run check:planner` after planner changes and `npm run corpus` after changing the source-log parser or any corpus-derived default.

See `CLAUDE.md` for the field reference and the known gotchas. Anything larger than a data edit, meaning a new control, mode, or screen, starts with the check in its Adding Features section: work out where the idea belongs and what it replaces before writing code.

## License

MIT.
