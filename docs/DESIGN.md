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
