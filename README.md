# WOD Generator

A CrossFit-style workout generator that builds a conditioning piece around the strength work you already did, and around the equipment you actually have. Pick a place (gym, park, home), say what you lifted first, and get a balanced WOD with real rep prescriptions.

Bilingual: Spanish and English, toggled in the header.

Built from about 55 normalised sample sessions, so the doses and formats look like workouts a coach would write rather than a random draw from a movement list.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Production build: `npm run build`, then `npm run preview` to serve `dist/` locally.

The live site is auto-deployed from the default branch. Every other branch gets its own build at `/previews/<branch>/`, with an index at `/previews/`. To host your own fork, see `docs/SETUP.md`.

## How it works

1. You set the context: where you are training (`gym`, `parque`, `casa`) and what you lifted first. The strength block is a grid: tick the lifts you did, give each sets, reps and a working weight, and the app works out what that left you carrying. Store a one-rep max for a lift and the weight field shows the percentage too. Seven one-tap shortcuts fill the grid for a typical squat, deadlift, press, pull, lower-body or full-body day.
2. A format is drawn by weight: AMRAP, for time, EMOM, intervals, ladder, chipper, or quality work. Each format carries its own slot count, time cap or round scheme, and a volume scale.
3. Slots are filled from the movement pool. Every piece opens with a monostructural or full-body movement, then spreads across pushing, pulling, hinging, legs, core, and carries.
4. Reps come from each movement's typical dose, scaled to the format's volume band and quantised to a sane step (no 37-rep sets of wall balls).
5. The candidate is scored against a fault list: no axis over its share of the total work, a tighter cap on whatever the strength block already hammered, a ceiling on stacked skill and joint impact, plus soft warnings for grip-heavy and pull-free sessions. The generator draws up to 300 candidates and returns the first clean one, or the least-faulty one it saw.
6. The result renders with per-movement rep lines, a load breakdown across the six axes, a coaching cue, barbell plate loading for gym sessions, and any warnings that survived.

Anything you like, you can lock; anything you don't, you can swap for another movement in the same slot category without rerolling the whole workout.

## Exports

- **Copy** puts a plain-text version on the clipboard for a training log.
- **Share** uses the native share sheet where the browser has one, and falls back to copy.
- **Calendar** downloads an `.ics` file or opens a prefilled Google Calendar event at the date and time you pick.

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
│   ├── App.jsx                 # the interface
│   ├── main.jsx                # React root
│   └── index.css               # global reset (app styles live in App.jsx)
├── public/
│   ├── favicon.svg
│   └── robots.txt              # keeps /previews/ out of search engines
├── scripts/
│   ├── smoke.js                # generator regression sweep (npm run smoke)
│   └── build-preview-site.mjs  # composes the Pages site (run by CI)
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

The model (`moves.js` through `plates.js`) is plain JavaScript with no React in it, so it runs under Node as well as in the browser. `App.jsx` is the interface and the only file that imports React.

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

See `CLAUDE.md` for the field reference and the known gotchas. Anything larger than a data edit, meaning a new control, mode, or screen, starts with the check in its Adding Features section: work out where the idea belongs and what it replaces before writing code.

## License

MIT.
