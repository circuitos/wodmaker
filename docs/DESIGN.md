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

**Resolved as week-planner groundwork.** The band was not the real mistake. `passes` said every EMOM item happened once per minute, so a 12-minute, four-movement piece multiplied all four movements by 12 instead of by 3. The generator then divided the session target by that same 12, asked for an impossibly small movement list, and hit the quantisation floors described above. `emomPasses()` now uses `cap / cycle`: two movements repeat five times in ten minutes; four repeat three times in twelve; three work movements also repeat three times because the card renders minute four as rest. The 8400-workout sweep moves EMOM conditioning from a 226-point mean and 748-point maximum full session to 130 and 387. Hard faults remain zero.

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

**4. Add the control. Done.** Three chips, soft / normal / hard, wired to `intensity` on `roundTarget`. They sit under "where you train" and above the strength grid: both shape the workout, and the grid below is about what already happened.

`generate()` moved to an options object on the way, `generate(env, arriving, { locked, fixed, intensity })`, because it was heading for five positional parameters with three optional.

**The multipliers are calibrated against what they deliver rather than what they read.** Asking for 0.8 does not produce 80% of the work: `quantise` floors every movement at half its minimum dose and `buildCandidate` clamps rep scaling at 0.55, so about 60% of the request survives. Measured over 3000 workouts a step, 0.6 gives -16% and 1.4 gives +24%, a 1.47x span from soft to hard, or 7.7 against 11.3 hard minutes.

The asymmetry is a fact rather than an oversight. Reps can be scaled up but the floors stop them going down, so about -16% is the softest this mechanism reaches at all. A genuinely light session would need fewer movements or fewer rounds, which is a different change and not one this commit makes.

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

### Built

Two labelled groups, main lifts and accessory. Twelve accessory entries, each naming a `MOVES` id: walking lunges, step ups, goblet squats, air squats, glute bridge, DB row, ring rows, DB push press, push-ups, sit-ups, V-ups, front plank.

The two groups ask for different things, which is why they are separated rather than sorted. A main lift wants a working weight and a one-rep max, and shows the percentage. An accessory row wants sets, reps and a weight, marks itself per-side where the movement is unilateral, and never asks for a max.

Accessory weight scales the movement's `cost` against a `refKg`, the load that cost already assumes, clamped to between 0.4x and 2.5x so a mistyped number cannot blow the total up. Where `MOVES` gave a range the middle was taken, and where the movement is bodyweight `refKg` is 0 and the weight field is hidden.

The real session now scores **301 points of strength** (squat 97, bench 114, split squat 51, DB row 39), dampen 0.74, which puts the day at **444** rather than the 688 first reported. The smoke report did not move, because the shortcuts use main lifts only.

### Warm-up ramps are not logged

A ramp of 6 at 20 kg, 4 at 40 and 4 at 60 before 5x4 at 75 comes to about 40 points under `liftPoints`, which would be 35% on top of the working sets. Two reasons not to count it.

The formula scales effort linearly with percentage of a max, and that only holds over the working range. It prices a 23% rep at 30% of an 86% rep, when a set of six at 23% is genuinely free. Below roughly 60% the linear term is not trustworthy, and that is exactly where warm-up sets live.

More decisively, the calibration already contains them. The old presets described whole sessions: `press` was worth 115 points as a bench day, ramp included. Logging the ramp separately would count it twice.

The instinct that warm-ups are universal is the reason to leave them out. Something everybody does adds no information; it just shifts the scale.


---

# Reproducible sessions, the full card, and an honest default

Three fixes from the same feedback pass.

## The whole thing is deterministic now

Before this, `generate()` called `Math.random()` directly, and section 5's `useEffect` re-ran it on every change to `env`, `arriving` or `intensity`. `arriving` recomputes on every keystroke in the strength grid, so ticking one accessory checkbox reshuffled the entire card: a new format, new movements, everything.

`generate()` now takes an optional `seed`. Without one it behaves exactly as before (`Math.random()`), which is what `scripts/smoke.js` relies on: it installs its own seeded stream once for the whole sweep, and `generate()` leaves that alone. With a seed, `generate()` installs a fresh seeded stream for the duration of that one call only and restores whatever `Math.random` was straight after, so it never leaks into anything else. `mulberry32` moved out of `scripts/smoke.js` and into `generator.js`, so there is one copy rather than two.

Section 5 keeps one seed in a ref (`seedRef`, not state: reading it never needs to trigger a render on its own) and is deliberate about when it changes:

- **A new seed:** first mount, changing where you train, or pressing "Another". These are the moments that mean "give me a different session."
- **The same seed, reused:** ticking a strength row or moving the soft/normal/hard chip. `roll(false, false)` calls `generate()` again with the unchanged `seedRef.current`.

That works because of what does and does not feed into the random draws. Format, slot pattern, and which movements get picked all come from `Math.random()` calls that know nothing about `arriving` or `intensity`; only the final rep-scaling step reads them. So the same seed with a different strength load or a different chip reproduces the same format and the same movements, and only the numbers move. Rechecked after the EMOM pass fix over 30 seeds, comparing `intensity: 1.0` against `intensity: 1.4`: format identical in 30/30, movement set identical in 30/30, reps changed in 29/30.

**The one place this can still move the shape.** `generate()` tries up to 300 candidates and returns the first with zero hard faults. Faults depend on `arriving.pre`, so a candidate that passed before could fail now, or the reverse, which changes how many candidates the loop consumes before it stops and therefore how far into the seeded stream the accepted one sits. In the measured data this is not a real risk: the smoke sweep found 0 of 8400 workouts carrying a hard fault, so the loop accepts the very first candidate essentially always. Recorded here rather than hidden, since "reproduces" should come with its actual guarantee, not an unqualified one.

The swap icon on a single movement deliberately does **not** reuse `seedRef`. If it did, clicking swap on the same slot would draw from the same point in the same stream every time and hand back the identical replacement, forever. It draws a fresh `Math.random()`-based seed on every click instead, scoped to that one `generate()` call, so the session's own seed (and therefore the shape of everything else) is untouched.

## The card shows the whole session, not half of it

The strength block already fed into `wod.strength` (`pre`, `dampen`, the axis pre-load markers on the bars), but nothing on screen said *what* you actually lifted. `pctFor`, previously a one-off inline in section 5, moved to `lifts.js` as an exported function so the input grid and the card compute the same percentage the same way. `strengthLine()` in `text.js` renders one row, main lift or accessory, in the same units the grid itself shows.

`roll()` and `swapOne()` now snapshot `liftRows` and `oneRM` onto the generated candidate (`c.strengthRows`, `c.oneRM`), the same ad hoc pattern this file already used for `c.cue`. The card reads them in a block above the format headline, since chronologically the strength work happened first and it is why the axis bars carry their pre-load markers. `asText()` prepends the same lines, so Copy, Share, and the calendar export all agree with what the card shows.

## The accessory default, now backed by the source log

The original dump was supplied after the first implementation and is preserved verbatim in `data/55_sessions.txt`. The filename and product history say 55 sessions, but the file contains 56 timestamped entries. `scripts/analyze-corpus.js` makes that mismatch and every derived count reproducible.

Only the text before each conditioning marker is counted for accessory defaults. Split-squat, Bulgarian-squat, and walking-lunge work appears in 10 entries; dumbbell rows appear in 6. They are the two most common movements supported by the accessory grid. Their modal written doses are 3x8 and 3x10, so those are now the first-visit defaults. A saved `liftRows` preference still wins and is never overwritten.

---

# Week planner

## One generator, two time horizons

The planner does not own a second workout generator. `planWeek()` calls the same seeded `generate()` function for each day. It adds only the information a sequence needs: a schedule, earlier load carried into the next day, diversity exclusions, and an automatic effort choice.

The source log gives one unusually strong scheduling signal: 23 entries are on Monday and 24 on Wednesday, 47 of 56 in total. That makes a two-day Monday/Wednesday week the honest default. The corresponding broad strength defaults are lower body and pressing, the most common before-conditioning focuses on those days. Three-to-five-day schedules remain available and spread the existing strength shortcuts across weekdays; those extended schedules are product defaults, not corpus frequency claims.

## Carried fatigue is not today's work

A daily session used to have one object called `strength`, which served two jobs because they were identical: it told `faults()` what load the athlete arrived carrying, and it told `sessionLoad()` what work happened today.

They separate in a week. Wednesday's composition must see decayed Monday fatigue plus Wednesday strength, but Wednesday's reported load must not count Monday again. Candidates now keep both:

- `arriving`: today's strength plus earlier fatigue, used by rep scaling and fault checks.
- `strength`: only today's strength, used by `sessionLoad()` and the card.

`sessionAxisLoad()` turns today's strength and conditioning into a six-axis vector. The next planned day decays the accumulated vector by `0.55 ^ calendarDays`, combines it with that day's strength, and runs the shared `arrivingFromAxis()` conversion. At the normal two-day gap, about 30% remains.

The 0.55 coefficient is deliberately labelled a heuristic. The source log records sessions, not recovery or readiness, so it cannot validate a physiological decay curve.

## Automatic effort and weekly diversity

For `auto`, the planner generates the same seeded shape at soft, normal, and hard, then keeps the result closest to 310 total points. That target sits on the load scale already calibrated around 20 points per hard minute; it is not a new unit. A heavy strength day therefore tends to receive softer conditioning, while a light interval or quality day can move harder.

Adjacent days exclude the previous format and movements. These are preferences, not hard constraints: `poolFor()` falls back to a repeated movement when a small environment cannot fill a required slot otherwise. The planner never returns an incomplete day just to satisfy variety.

One week seed derives one stable seed per day. Editing strength or effort therefore preserves the existing formats and movements and updates reps and downstream carry. Changing environment can replace movements because availability changed. "Another week" is the explicit redraw.

`npm run check:planner` verifies deterministic 2, 3, 4, and 5-day plans, adjacent diversity in the gym pool, nonzero carry-over, load accounting, and a changed result from a changed week seed.

## The schedule became a control

The planner shipped with the weekday as the one fact it read and the one fact you could not set. `editDay` already handled a `weekday` field and nothing ever called it; the cadence came from `SCHEDULES` and stayed there. That is an odd gap for this feature in particular, because the calendar gap is the entire input to carry-over: the same two sessions on Monday and Tuesday and on Monday and Thursday are different weeks, and only one of them was reachable.

The weekday is now a select in the card heading rather than a fourth control in the row below it. The heading already displayed the weekday, so making it the control keeps one place on screen for one fact instead of showing it twice.

Two constraints follow from what the model actually reads:

- **The week re-sorts on every edit.** `planWeek()` walks the configs in order and computes each gap as `(weekday - previous + 7) % 7`. Out of order, a Wednesday following a Friday reads as five days later rather than two days earlier, and the reported carry-over is not the week on screen.
- **One session per weekday.** With two days on the same weekday the gap expression falls through to `|| 7`, so the second session would arrive as though a full week had passed. Two-a-days are a real thing and this model does not describe them, so the select hides a day already spoken for rather than quietly mispricing it.

## A dropped day used to shift every card after it

`planWeek()` ends in `.filter(Boolean)`, because a day whose config the generator cannot satisfy returns null rather than failing the week. The interface then paired `plan[i]` with `configs[i]`. Those are the same index only while nothing drops.

The reachable cause was a saved preference. `weekConfigs` persists to `localStorage`, so a config written by one build is read back by the next; an `env` that no longer exists reaches `poolFor()`, every pool comes back empty, `buildCandidate` returns null 300 times, and the day disappears. Every later card then rendered one day's workout above another day's controls, and editing those controls wrote to the wrong day.

Fixed at both ends. `planWeek()` records `index` on `wod.plan`, so a card can find the config that produced it whatever its position; and `normaliseWeek()` checks every saved field against the list that owns it, so the stale value never reaches the generator in the first place. The first is the invariant, the second is the cause. `npm run check:planner` covers both, including a deliberately unbuildable day.

This is also why `moves.js` now exports `ENVS`. The three environments were a comment in the header, a literal in `App.jsx`, another in `WeekPlanner.jsx`, and a fourth in `smoke.js`. Validation needs a list that owns the fact.

## One model, two views

The planner and the daily card were two apps sharing a stylesheet. Every fact about a session existed twice: `env` and `intensity` as component state in the daily view and again on each week config, and the strength block as one global `liftRows` grid the week could only borrow wholesale through a `focus` of `"custom"`. The seeds were unrelated too, `seedRef` against `daySeed(weekSeed, i)`. Day one of a week could therefore never be the workout the Day tab was showing, and there was no way to walk through a week tuning each day, which is the thing the planner was for.

This is the same failure the load model had before it was unified: a per-round target in the generator and a session total in the interface, neither aware of the other. The resolution is the same shape. A day is the unit. A week is a list of days. Both views read one `planWeek()` result.

### What a day owns

`{ weekday, env, intensity, rows, locks, swaps, nonce }`. Everything a session needs, and nothing derived.

`rows` replaced `focus` rather than joining it. Storing a preset name and the rows it stands for is two representations of one fact, and they drift the moment a row is edited. The rows are stored; `presetFor(rows)` derives which shortcut they match, or `custom`. One-rep maxes stayed global: a 1RM is a fact about the athlete, not about Wednesday.

`locks` carry `{ moveId, reps }`. `buildCandidate()` deliberately does not rescale a locked item, so the rep count is part of what a lock means; storing the id alone would rescale the movement you locked in order to keep.

`nonce` redraws one day. `daySeed(seed, index, nonce)` moves that day's stream and nothing else, and nonce 0 reproduces the seed a day had before per-day redraws existed, so no saved week moved when this landed.

### Swap had to become an intent

The daily card used to keep its workout in state, so a swap could be applied to it directly. A day is now derived from its config on every render, so an applied swap would vanish on the next keystroke. `config.swaps` stores `{ moveId, nonce }` and `applySwaps()` replays them after the day is generated, pinning `fmt`, `cap` and `rounds` so only the named slot is redrawn. Replaying in order is what makes swapping the same slot twice behave: the second entry names the movement the first one produced.

Writing it down exposed a bug that had always been there. The old swap passed the kept movements as `locked` and let `buildCandidate` fill the empty slot, but `used` only contains the kept movements, so the movement you just rejected was still in the pool and could be drawn straight back. In a small pool it often was, and the button looked broken. `excludeMoves`, which the week planner had introduced for day-to-day variety, is exactly the missing piece: a swap now excludes what it replaces, and the previous day's movements as well, so a swap cannot quietly undo the week's diversity. Checked over 144 swaps in `npm run check:planner`: the format, cap and rounds always survive, every other movement stays, and the rejected movement never comes back.

### A day is addressed by its weekday

Editing a day re-sorts the week, because calendar order is what the carry-over model reads. An index into `configs` therefore points at a different day after almost any edit. `App` keeps `selectedDay` as a weekday, which is unique within a week and survives the sort, and looks the config up by it.

### What this costs

A workout with no week around it no longer exists. Every session belongs to a day, and "Another" redraws that day rather than handing you an anonymous new workout. That is a real loss for someone who only wanted a one-off, and it is the price of the two views agreeing.

Editing one day also changes the days after it. Their reps move because their `arriving` includes the edited day's carry, and their movements can move because they exclude the previous day's. Earlier days never move. This is the diversity and carry-over model doing what it says rather than a leak, and `npm run check:planner` pins the direction: redrawing day two leaves day one untouched.

## A ladder was printing one workout and charging for another

Reported from use: adding `3x8 goblet squats` to a strength block moved the day's load from 310 down to 303, with the conditioning piece looking completely unchanged. Two separate things were stacked underneath it.

**Auto effort is a trade, and that part is working.** `chooseSession()` picks whichever of soft, normal and hard lands the whole day closest to `TARGET_DAY_LOAD`. Strength and conditioning therefore compete for the same budget: about 34 points of accessory work pushed "hard" past the target, auto stepped down to "normal", and the conditioning fell further than the strength rose.

```
seed 36, ladder, identical movements
  before:  effort hard    strength 193  conditioning 119  total 312
  after:   effort normal  strength 224  conditioning  74  total 297
```

Measured over 1500 seeds with the same two strength rows: on `auto` the load drops in 297 of 1234 same-shape cases; at a fixed effort it drops in 0 of 1239 at soft, 8 of 1219 at normal, 19 of 1210 at hard. Those last few are quantisation, not the target: `row_m` steps 50 m at a time, which is 15.5 points across five passes, so two coarse movements stepping down together can outweigh the strength added. Both behaviours are the model doing what it says.

**The ladder display was not.** `repParts()` printed the format's literal `10-8-6-4-2` for every movement, so the reps the generator had actually scaled were invisible. In the case above they went `10/25/6` to `6/15/4`, a 40% cut, with a byte-identical card. Across 927 generated ladder items the costed reps ranged from 4 to 450 and every one of them printed `10-2`.

The model itself was already coherent. `passes: () => 3` is exact because the scheme sums to 30 against a top rung of 10, so `it.reps` is the top rung and the ladder costs `reps * 3`. Only the printing was wrong. `ladderRungs()` now scales the scheme by `reps / scheme[0]`, so a movement at 11 reps prints `11-9-7-4-2` and one at 450 m prints `450-360-270-180-90`, and the rungs sum to exactly what `sessionLoad()` charges. The headline dropped its global `10-8-6-4-2`, which was never true of more than one movement at a time.

`npm run check:planner` pins the invariant that made this findable: printed rungs sum to `reps * passes`, within the rounding of five integers.

Rounding does leave a tie at small doses (`4-3-2-2-1`). That is honest about a ladder the generator scaled down to almost nothing, where the old display claimed 30 reps and charged for 12, so it is left alone rather than smoothed into a nicer-looking lie.

## The page scrolled sideways on a phone

Found while checking the ladder rungs at 390px, and it turned out to predate them. Three separate causes, each of which widened the document and dragged everything else out with it.

**The title set the page's minimum width.** `.h1` was a fixed 42px, which renders "GENERADOR DE WOD" at 302px. With the language toggle at 71px and the flex gap, the header needed 417px before anything else was considered, so every viewport under about 430px scrolled. The title now scales with `clamp(26px,8.5vw,42px)` and its flex parent may shrink.

**A `1fr` grid track is `minmax(auto,1fr)`.** It refuses to go below the min-content width of its widest item, so a card holding a long ladder dose widened the column, and the sidebar sharing that column stretched with it. The overflow therefore reported itself in the sidebar while the cause was in the card, which is what made it confusing to chase. `minmax(0,1fr)` lets the track shrink and the content wrap.

**The card header could not wrap.** The headline and the nowrap work tag sat on one flex line, so "CHIPPER · CAP 10'" beside "TRABAJO TOTAL · 121" needed 354px at a 320px viewport. It wraps now, and the headline scales.

Measured across 320, 360, 390, 430, 620, 768, 880 and 1280px: 25 workouts in the Day view and every week size from 2 to 5, zero horizontal overflow. Before the fix, 320px overflowed on 6 of 25 workouts and 390px on every one of them.

One layout decision follows from what a ladder is for. When a rung list and a movement name compete for a narrow row, the rungs keep their line and the name wraps: the rungs are the number you train off, and breaking `20-16-12-8-4` across two lines to keep "m de carrera" intact gets the priority backwards.

## The middle of a session is its own block

Reported from use, describing how the sessions actually run: a warm-up, then barbell work, then accessory or supplementary work, then the piece. The app collapsed the middle two into one heading, "strength block before", so a set of walking lunges read as part of the same block as a 3x5 back squat. They are not the same block, and the app already knew it in every place except the card: the sidebar has had separate `Levantamientos` and `Accesorio` headings all along, and `arrivingFromLifts()` has always priced the two kinds of row by different formulas.

`splitRows()` now separates them by row kind, and the day card, the week card and the plain-text export each render them as their own block. Nothing about the load model changed; this is the interface catching up with a distinction the data already made.

One consequence worth having: a strength shortcut names the barbell block only. `presetFor()` reads the lifts alone, so accessory work no longer forces the shortcut to read `custom`, and `withPreset()` swaps the lifts while leaving the supplementary rows in place. Switching Monday from squats to pressing used to delete the accessory work as a side effect.

## Rowing and running as supplementary work

Also reported: a rower or a run is not only a conditioning movement. It sits between the barbell and the piece often enough to belong in the accessory grid, and running in particular is the one piece of supplementary work that needs no equipment, which makes it useful away from a gym.

`row_cal`, `row_m` and `run_m` were already in `MOVES` and reach about 10% of gym sessions each as conditioning movements. Adding them to `ACCESSORY` needed no pricing work: `accessoryPoints()` charges per unit by the movement's own `cost`, so 500 m of rowing is 31 points, 400 m of running is 30, and 30 calories of rowing is 30. All three land near a minute and a half on the scale that puts a hard minute at 20.

What did need work was the grid, which assumed every accessory is counted in reps. The dose ceiling was a flat 60 and a new row was seeded at 3x8, which gives "3x8 m of rowing". `accessoryRepMax()` takes the ceiling from the movement's own prescribed dose, `defaultAccessoryRow()` seeds a distance, calorie or time piece as one set of that dose, and the row shows its unit. This also fixes a plank, which had been defaulting to 3x8 seconds since it was added.

The warm-up stays unlogged, for the reason already recorded above: the calibration was fitted against whole sessions that included their warm-ups, so logging one would count it twice.
