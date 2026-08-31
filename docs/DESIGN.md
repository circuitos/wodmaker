# Design Notes

Architecture and tuning decisions, and the reasoning behind them. Read this before changing how the generator picks or scales anything. `CLAUDE.md` says where things live; this says why they work the way they do.

---

# The load model

## How the app counts effort

Every movement in `MOVES` has a `cost`: the effort in one rep, one calorie, or one metre of it. The scale is set so that **20 points is about one hard minute of work**. A burpee costs 3, so ten burpees is 30 points, or about a minute and a half.

Two words that come up constantly below:

- A **round** is one time through the list of movements.
- A **session** is every round added up, plus the strength block you did first.

The app works out both numbers. It works them out in two different places that do not know about each other, and that is the whole problem.

## Where the two numbers live

| Code | Lives in | What it decides |
|---|---|---|
| `volumeBand()` | `generator.js` | how many points one round should be |
| `buildCandidate()` | `generator.js` | scales the rep counts until the round hits that |
| `dayWork` | `App.jsx` | guesses how many rounds there are, multiplies, adds the strength block |

## Problem 1: the same fact is written down twice

Take a 10-minute AMRAP.

- `volumeBand` says one round should be about 41 points.
- `dayWork` assumes you get through 5 rounds.
- 41 × 5 = 205 points, which is about 10 hard minutes.

The answer is right. A 10-minute AMRAP should be about 10 minutes of work. But that "should" is written down nowhere. It exists only as 41 in `generator.js` multiplied by 5 in `App.jsx`, and nothing checks that the two still line up. Change the 41 and nobody changes the 5, and the app quietly starts lying about how hard the session was.

## Problem 2: the format decides how hard your session is, and you do not pick the format

Measured over 8400 generated workouts (`npm run smoke`, seed 1). "Conditioning" is the workout alone; "session" adds the strength block, averaged over all seven blocks.

| Format | How often it comes up | Conditioning mean | p10 to p90 | Session mean |
|---|---:|---:|---:|---:|
| AMRAP | 22.5% | 190.5 | 146 to 236 | 325.0 |
| For time | 24.3% | 174.4 | 144 to 204 | 311.0 |
| EMOM | 24.1% | 227.1 | 126 to 343 | 356.4 |
| Intervals | 6.1% | 81.7 | 59 to 108 | 211.1 |
| Ladder | 9.4% | 91.7 | 77 to 105 | 216.3 |
| Chipper | 7.9% | 132.8 | 112 to 153 | 265.7 |
| Quality | 5.8% | 74.5 | 54 to 93 | 199.4 |

The format is picked at random. Some come up more often than others, but you have no say in which one you get. The lightest format averages 74.5 points of conditioning and the heaviest 227.1, so which format comes up moves the workload about threefold.

Some of that is honest. An interval piece with rest really is less work than a twelve minute AMRAP.

**Reviewed and accepted (see Decisions).** The spread stays. Formats genuinely differ in how much work they are, and the variety is wanted.

That settles what kind of control this can be. A control that promised an absolute target ("give me a 200 point session") would have to override the format choice to deliver it. A control that is relative to whatever format came up ("make this one harder") does not. The spread makes the first kind expensive and the second kind honest, so the control is relative.

## Problem 3: the strength block is counted twice, two different ways

In the generator, `dampen` shrinks the workout because you are already tired. In the display, `pre * 0.9` adds the strength work into your total for the day.

Both are fair. A hard squat session should mean less conditioning afterwards, and it should also count as work you did. But one lives in `generator.js` and one in `App.jsx`, and neither knows the other exists.

Worth writing down, because it looks like it should be simple and is not: **`dampen` cannot be calculated from how much the strength block loaded you.** Squat and pull both load 140 points. Squat cuts the following workout by 15%, pull cuts it by 8%. Nearly double the cut for the same load, because legs take more out of you than arms do. That difference is real and it lives only in those seven hand-tuned numbers, so `dampen` stays as authored data.

## Three small things in the same code

- `volumeBand` returns a range, `[lo, hi]`, and the only thing done with it is take the middle. It should be one number.
- The EMOM line inside `dayWork` is `cap / items.length * (items.length === 3 ? 3 : items.length)`. Whatever `items.length` is, that works out to `cap`. It is the leftover of somebody adjusting a number until the output looked right.
- `dayWork` is one expression with five nested ternaries, and it is the only thing in `App.jsx` that knows anything about how formats work.

## What the baseline run turned up

Three things the sweep found that reading the code did not.

**The EMOM volume band is unreachable.** `volumeBand` asks for 15 points in a minute. The measured conditioning works out at 227 points over a mean 9.5 minute cap, which is about 24 points a minute, 60% over the ask. The cause is `quantise`: its floor is `max(step, lo * 0.5)`, so a movement cannot be prescribed below half its minimum dose no matter what the target says. Ask three movements for 5 points each and the floors hand back 8. The band is not steering EMOM at all; the clamps are.

This does not have to be fixed to unify the model, and it should not be fixed in the same commit. Step 3 preserves whatever the clamps do today by construction, because it sets each format's `load` to the current band midpoint times the current pass count. Worth a separate decision afterwards: either raise the EMOM band to something reachable, or accept that quantisation is the real floor and say so.

**The `nopull` warning fires on 93.7% of home workouts.** Not 31% as the overall count suggests: it is zero at the gym and in the park, and nearly universal at home. A warning that fires on almost every session in its category carries no information, so today it reads as decoration. `CLAUDE.md` already names the cause in its gotchas: there is no home-friendly pulling movement in `MOVES`, and the fix is a movement, not a scorer tweak. The number just says how bad it is.

**Nothing ever degrades.** Zero of 8400 workouts came back carrying a hard fault, so the 300-candidate loop in `generate()` always finds a clean one. The fallback path exists and is correct, but it has never been the thing that runs. Good to know before trusting it to absorb anything.

All 53 movements are reachable; none went unused across the sweep.

## The fix

Give each format two facts, written where the other format facts already are:

```js
{ id: "amrap", w: 22, caps: [8, 10, 12], slots: [3, 4, 5], scale: 1.0,
  passes: (p) => 5,             // rounds you will get through
  load:   (p) => p.cap * 20.5 } // points for the whole piece
```

Two functions use them, one dividing and one multiplying:

```js
// before: what should one round cost?
roundTarget = fmt.load(p) * intensity * strength.dampen / fmt.passes(p)

// after: what did the finished session cost?
sessionLoad(c) = { conditioning: c.totalWork * c.fmt.passes(c),
                   strength:     sumPre(c.strength) * 0.9,
                   total:        conditioning + strength }
```

Same two numbers, used twice. Change `load` and the target and the display move together, because there is only one number to change. `App.jsx` stops knowing what a format is.

`intensity` is a multiplier that sits at 1 and does nothing. It is there so the control has somewhere to plug in later, and it is now a real parameter of `roundTarget`.

## How hard, and who says so

Settled: the control scales the workout the app already drew. It does not set a target the format has to hit.

`intensity` multiplies `roundTarget`, which is where the proposed model already put it. Nothing else moves. Format choice stays exactly as random as it is now, there is no redraw loop, and the authored `caps` and `rounds` lists are untouched.

What this costs, stated plainly: "hard" is not a fixed amount of work. A hard interval piece is still lighter than a soft AMRAP. That follows from keeping the spread, and it is the reason the steps are named rather than numbered in minutes.

## The week planner, and what it needs from this

The planner is coming, so the load model has to serve it without making today's control absolute. It does, and the compromise is smaller than it first looked.

**The control stays relative. The readout becomes absolute.**

`sessionLoad()` gives every generated workout a number on one scale. That is exactly the common scale a week planner needs to weigh Monday against Thursday. The user never sets that number: they pick soft, normal or hard, which is a multiplier. The planner sets it per day by turning the same multiplier and reading `sessionLoad()` back.

So the answer to "how do you balance a week when hard is relative" is that the planner does not use the named steps at all. It uses `intensity` as a number and can see what it got. The names are an affordance over a knob the planner turns directly. No new mechanism, and no overriding the format draw for a single day.

There is one more thing the planner needs, and it is cheap to design for now. `STRENGTH.pre` is currently "the axis load the strength block left you carrying". A week needs the same idea between days: Tuesday arrives carrying Monday's axis vector, decayed. Same concept, different source. So `pre` should stop being something looked up from a `STRENGTH` entry and become a plain axis vector handed to `buildCandidate` and `faults`. That is a rename and a re-source with no new arithmetic, and it is step 5 below.

## Order of work

Four commits. Two of them exist only so we can tell whether the third one broke anything.

**1. Split `src/App.jsx`. Done.** A Node script could not import the generator while it lived inside a React component file. Sections 1 to 4 are now `moves.js`, `formats.js`, `i18n.js`, `generator.js`, `text.js` and `plates.js`; `App.jsx` is the interface and the only file importing React. The code was cut by line range rather than retyped, so the diff is a move.

The "one file, five numbered sections" map in `CLAUDE.md` and `README.md` died with it, and both were rewritten in the same commit.

**2. Add `scripts/smoke.js`. Done.** 8400 workouts across every environment and strength block, with `Math.random` replaced by a seeded PRNG so the report is reproducible. Baseline committed as `out/smoke-report.md`. Findings above.

**3. Unify the model. Done.** `FORMATS` entries carry `load` and `passes`. `roundTarget` replaced `volumeBand`, `sessionLoad` is new, `dayWork` is a call to it, and the five-ternary chain and the EMOM no-op are gone. Each format's `load` is its old band midpoint times its old pass count, so the round target is arithmetically the same number.

The smoke report came back byte-identical over 8400 workouts, and the number shown on screen was unchanged in every one of them.

Two float details, checked rather than assumed. `fortime` at 3 rounds now computes `190 / 3` where it used to compute `(130 / 3 + 250 / 3) / 2`, which differ by one unit in the last place; it changed no output. And the old EMOM multiplier `cap / items.length * (items.length === 3 ? 3 : items.length)` was not exactly `cap` in floating point, so replacing it with `cap` is a correction as well as a simplification; it also changed no displayed number.

**4. Add the control.** Three chips wired to one multiplier. Small, now that there is somewhere to put it.

**5. Generalise `pre` from a strength block to an arriving axis load.** Groundwork for the week planner, per the section above. Its own commit, after the load model is unified, and before any planner work starts.

## The control itself

Put it with the inputs, not the results. It changes what gets made, so it belongs next to "where are you training" and "what did you do first". The form has two rows and a third one fits.

Make it chips, not a slider. There is no slider anywhere in this app, and chips are already how it asks you to pick one of a few things. A slider would also suggest a precision the model does not have, since every `cost` is an estimate.

Three steps, named: **soft / normal / hard** (`suave / normal / duro`). Names rather than minutes, because the control is relative to the workout you got. Printing "8 min" would claim an absolute amount of work that this control does not deliver, and would also be read as how long the session takes, which is a different number again. Both readings are wrong; a name makes neither promise.

## Decisions

**Named steps, not minutes.** Soft, normal, hard. See "The control itself" for why.

**The plate meter stays, and gets a show/hide. Done.** It draws a number you did not choose, which was the argument for cutting it, but it is worth keeping and hiding. The app already has this pattern: `calOpen` opens and closes the calendar block. The toggle belongs on the `.mhead` row, which already holds the label and the number.

This introduces the first saved preference in the app. Nothing is persisted today: reload and you are back to Spanish, gym, no strength block. Worth knowing before building it, because once there is somewhere to keep a preference, **language is the more valuable thing to keep**. Resetting the plate meter on reload is mildly annoying; resetting an English speaker to Spanish every visit is worse. Build the store once and put both in it.

A note on wording: `sessionStorage` is forgotten when the tab closes, `localStorage` is not. For "I do not want to see this meter", `localStorage` is almost certainly the intent. Both are one line.

Built as `src/prefs.js`, holding both the meter's visibility and the language. Verified in a browser: both survive a reload, a fresh visitor gets the defaults (meter shown, Spanish), and with `localStorage` rigged to throw the page still renders and the toggle still works for the session.

**The 3.6x spread is not a bug.** Formats differ in how much work they are, and that variety is wanted. Recorded in Problem 2, which now explains what the spread costs rather than arguing it should go. The knock-on is that the load control is relative rather than absolute, which is what makes step 4 small.

---

# The strength block

## What is there now, and why it does not fit

A dropdown of seven presets. Each carries a hand-authored `pre` (axis points) and a `dampen` factor.

The thing to notice: **there are no barbell lifts anywhere in this app.** `MOVES` is dumbbell, kettlebell and bodyweight conditioning work. Nothing named squat, bench or deadlift exists as data. So the strength side is a stub: seven labels with tuned numbers behind them and no lifts underneath.

That is why it falls outside real training. It is not modelling your session, it is approximating a category.

## The check

**Does the app already half-model this?** Yes, and badly. `STRENGTH.pre` means "the axis load this leaves you carrying", which is what `MOVES.load` already means for conditioning movements. Two representations of one idea, and the strength one has no movements behind it. A lift grid replaces the stub with the representation the app already uses everywhere else.

**What does it make redundant?** The seven presets and their hand-tuned `pre` maps. `pre` becomes computed from what you actually lifted rather than looked up, and `dampen` probably follows: with per-lift axis shares in hand, the leg-versus-upper difference that made `dampen` non-derivable becomes something we can read off the lift instead of guessing.

**Where does it live on screen?** The left column holds two short controls today, so there is room. The dropdown becomes a small grid: one row per lift, a checkbox, sets, reps, and a load field.

**Does it need groundwork?** Yes, and it is already queued. Step 5 generalises `pre` from "what the strength preset left you with" to "the axis load you arrive carrying, whatever its source". The lift grid is a second source for exactly that, so the week planner and this feature need the same commit first.

## The shape

A new `src/lifts.js`, sibling to `moves.js`, same idea:

```js
{ id: "bench", es: "press banca", en: "bench press",
  load: { empuje: 0.74, core: 0.17, traccion: 0.09 },  // axis shares, sum to 1
  toll: 1.0 }                                          // effort per rep against the baseline
```

Points for one lift:

```
sets * reps * 5 * (weight / oneRM / 0.75) * toll
```

Five points per working rep at 75% of one-rep max, scaled by how heavy you actually went and by what that lift takes out of you.

## Does the formula match the numbers already in the app?

Checked against the authored presets, which is the same discipline step 3 used:

| Preset | Authored | A typical session | Formula |
|---|---:|---|---:|
| press | 115 | bench 5x4 at 86% | 114 |
| squat | 140 | squat 5x5 at 85% | 142 |
| pull | 140 | weighted pull-up 5x5 at 80% | 133 |
| lower | 185 | squat and RDL, 6 working sets | 164 |
| full | 260 | four lifts, 8 working sets | 213 |
| deadlift | 185 | deadlift 5x3 at 90% | 90 |

Four of six land close. Deadlift is the useful miss: 15 heavy reps score 90 against an authored 185. That is not a broken formula, it is the thing `toll` exists for. A deadlift rep costs about twice what its rep count suggests, so deadlift gets `toll: 2`. Per-lift facts belong in the lift's own entry, which is the rule `MOVES` already follows and the reason the generator never learns about specific movements.

## Where the one-rep maxes live

A 1RM is a fact about the person, not about today. It moves every few months, and nobody wants to retype it daily.

So it goes in `prefs.js`, which already exists and is already backed by localStorage. Today's block then asks only: which lifts, sets, reps, and load. The load field takes either kg or a percentage and shows the other, computed from the stored 1RM, so you type whichever number you have in your head. Someone with no 1RM entered just types kg and gets a rougher estimate.

## What it costs

The seven presets stop being the model. They can survive as one-tap shortcuts that tick a few rows, or go.

`pre` and `dampen` become computed, so generated workouts change. This is a real behaviour change, not a no-op like step 3, and the smoke report will move. Calibrate so the presets reproduce first, then read the diff deliberately.

A lifts table has to be written: maybe a dozen entries with axis shares and tolls. That is data work, and it is the part that decides whether the feature is any good.

## Decisions, and what was built

All three settled, and the grid is built.

**A fixed dozen of lifts**, not editable: back squat, front squat, deadlift, RDL, hip thrust, barbell lunge, bench, overhead press, push press, weighted pull-up, barbell row, power clean. Editable would have meant asking for axis shares, which nobody wants to fill in.

**The seven presets stay, as one-tap shortcuts.** They are now rows for the grid rather than their own authored axis maps, so a shortcut and the same numbers typed by hand give the same answer. `STRENGTH` keeps only the list and its order.

**The weighted sit-up was a barbell back squat with a rack.** So the worked example is squat 5x4 at 95 kg off a 130 kg max, then bench 5x4 at 75 kg off 87.5, which the model puts at 212 points: between the old `lower` preset (185) and `full` (260), and matching no single dropdown option. That gap is the whole reason the dropdown did not fit.

### How close the shortcuts stayed

Each preset's rows were tuned to land on what it used to be worth. Points come within 5% (`lower` and `full` land exactly), axis shares within 1 percentage point except `full` at 10, and `dampen` within 0.06.

Across the sweep the behaviour change is small: session load moved at most 2.5% (squat), axis shares by at most 0.2 percentage points, `nopull` from 2623 to 2616 occurrences, hard faults still zero, item counts unchanged. That is the cost of replacing seven hand-tuned constants with a model, and it is small enough to accept deliberately.

### Superseded

1. ~~**A fixed list of lifts, or editable?**~~ A fixed dozen (back squat, front squat, deadlift, RDL, bench, overhead press, weighted pull-up, barbell row, hip thrust, lunge) covers most training and keeps the grid scannable. Editable means storing user-defined lifts and asking the user for axis shares, which is not a thing anyone wants to fill in.
2. ~~**Keep the presets as shortcuts, or drop them?**~~ Kept.
3. ~~**What is the weighted sit-up?**~~ A barbell back squat.

## The strength block holds two kinds of work, and the app modelled one

Found by scoring a real session rather than by reading the code.

A session was: back squat 5x4 at 95 kg off a 130 max, bench 5x4 at 75 off 87.5, then split squat 3x8 per side with 2x15 kg dumbbells, then single-arm dumbbell row 3x8 with 22.5 kg, then a 9 minute AMRAP.

The model scored it at 688 points, and the split squat alone came to 240, more than the squat and bench together. That is plainly wrong, and the reason is a category error rather than a bad coefficient.

**The two kinds:**

**Main lifts.** Heavy barbell work, done near a known limit, and the natural way to describe them is a percentage of a one-rep max. `LIFTS` prices these correctly: the squat scored 97 and the bench 114, both right.

**Accessory and supplementary work.** Dumbbells, moderate load, higher reps, deliberately short of limits. Nobody tracks a split-squat one-rep max, so a percentage of it is not a thing that can be entered. Asked for one anyway, the model fell back to 75%, which prices a light accessory rep as a heavy working rep and inflated the two accessories from about 98 points to 360.

**The fix needs no new formula, because the app already prices this work.** `MOVES` contains these movements, at these weights: `db_row` is specced at 20 to 24 kg against the 22.5 used, and `db_push_press` at 2x15 kg against the 15 per arm used. Accessory work priced per rep by its `cost`, which is what the conditioning half has always done, gives 41 and 58 points for the two lifts.

So a strength-block row should be able to name either a `LIFTS` entry, priced by percentage of a max, or a `MOVES` entry, priced per rep. One grid, two sources, and the second source already exists with the right numbers in it.

**Corrected, the day is 452 points, about 23 hard minutes:** 212 of main lifts, 98 of accessory work, 173 of AMRAP.

**And `dampen` was not broken after all.** It floored at 0.55 only because it was fed 572 inflated points. On the corrected 310 it lands at 0.72, meaning the next conditioning piece gets built at 72% of normal volume. That matches how the session was described: the hard work is the lifting, and what follows is not near limits. The saturation was a symptom of the inflated input, not a fault in the fit.

**Also worth noting the conditioning half validated well.** The 9 minute AMRAP scored 173 points, which is 8.7 hard minutes. The per-movement costs and the 20-points-per-minute calibration are doing their job.

### Still open

- Which `MOVES` entries to expose as accessory rows. The grid cannot list all 53.
- Whether the grid shows one list or two labelled groups.
- Several of these movements carry a `kg` note (`db_row` says 20 to 24 kg) that is documentation rather than data. If accessory rows are to scale with the weight actually used, that note has to become a number.
