# Design Notes

Architecture and tuning decisions, and the reasoning behind them. Read this before changing how the generator picks or scales anything. `CLAUDE.md` says where things live; this says why they work the way they do.

---

# The load model

## Where the numbers come from

`cost` on a `MOVES` entry is metabolic work per unit of measure, calibrated so one hard minute of work is about 20 units. Every volume number in the app is denominated in those units, which means any of them can be read back as minutes of work by dividing by 20.

Three functions currently touch session volume:

| What | Where | Owns |
|---|---|---|
| `volumeBand(fmt, cap, rounds)` | section 3 | target work for one pass through the movement list |
| `buildCandidate` | section 3 | scales every rep count so the pass hits that target |
| `dayWork` | section 5 | multiplies the pass by a per-format guess at how many passes there are, then adds the strength block |

## What is wrong with it

**1. One fact is split across two sections and held together by hand.**

For AMRAP, `volumeBand` returns `[cap * 3.0, cap * 5.2]`, midpoint `cap * 4.1`. `dayWork` multiplies by 5. The product is `cap * 20.5`, which is the real intent: a `cap`-minute AMRAP is about `cap` hard minutes of work. That intent is written down nowhere. It exists only as the product of a constant in section 3 and a different constant in section 5, in different files' worth of code, with nothing checking they still agree. Change either one and the calibration silently drifts.

**2. Format choice moves session load more than anything the user controls.**

Working the current constants through every format and parameter combination:

| Format | Draw weight | Session load | Hard minutes |
|---|---|---|---|
| AMRAP | 22% | 164 to 246 | 8.2 to 12.3 |
| For time | 28% | 190 | 9.5 |
| EMOM | 20% | 120 to 180 | 6.0 to 9.0 |
| Intervals | 10% | 68 to 81 | 3.4 to 4.0 |
| Ladder | 8% | 99 | 5.0 |
| Chipper | 7% | 155 | 7.8 |
| Quality | 5% | 100 | 5.0 |

That is a 3.6x spread, and the user has no say in it. Format is drawn at random by weight, and the volume follows from the format. Press the button twice and get a 3.4 minute session then a 12.3 minute one, with the same inputs.

Some spread is honest: an interval piece with rest really is less total work than a twelve minute AMRAP. But 3.6x is not a rounding difference, and today it is the single largest determinant of how hard the session is.

This is the finding that decides where a load control belongs. A slider that scales load by plus or minus 25% sits underneath a 3.6x random draw, so it would feel broken: the user would move it and see less change than pressing "another workout". The control has to act on the thing that dominates, which means load stops being an output of the format draw and becomes an input to it.

**3. The strength block is accounted for twice, in two different ways.**

`buildCandidate` shrinks the conditioning target by `st.dampen`. `dayWork` separately adds `pre * 0.9` for display. Both are legitimate effects (a hard squat session both reduces what you should do afterwards and counts as work you did), but one lives in the generator and one in the view, and neither mentions the other.

Worth recording, since it looks derivable and is not: `dampen` cannot be computed from the `pre` sums. Drop per unit of pre-load is about 0.00107 for squat, 0.00097 deadlift, 0.00108 lower and full, but 0.00043 for press and 0.00057 for pull. Leg work suppresses later conditioning roughly twice as hard as upper body work does. That is real information encoded in seven hand-tuned numbers, so `dampen` stays authored data.

## Smaller things found in the same code

- `volumeBand` returns a range whose only use is `(lo + hi) / 2`. The range is never read as a range. It should be one number.
- The EMOM branch of `dayWork` is `cap / items.length * (items.length === 3 ? 3 : items.length)`, which equals `cap` for every possible value of `items.length`. It is the fossil of tuning a number until the output looked right.
- `dayWork` is a single expression with five nested ternaries, and it is the only place in section 5 that knows anything about how formats work.

## The model to move to

One fact per format, declared where format knowledge already lives (section 2):

```js
{ id: "amrap", w: 22, caps: [8, 10, 12], slots: [3, 4, 5], scale: 1.0,
  passes: (p) => 5,             // times through the movement list
  load:   (p) => p.cap * 20.5 } // target work for the whole piece
```

Everything else derives from those two, through exactly two functions that are inverses of each other:

```js
// section 3: what one pass should cost, given a target
roundTarget(fmt, p, intensity, strength) = fmt.load(p) * intensity * strength.dampen / fmt.passes(p)

// section 3: what the finished session actually costs
sessionLoad(c) = { conditioning: c.totalWork * c.fmt.passes(c),
                   strength:     sumPre(c.strength) * 0.9,
                   total:        conditioning + strength }
```

The generator calls the first. The view calls the second and renders `total`. Change a format's `load` and both move together, because there is only one constant. Section 5 stops knowing what a format is.

`intensity` is the hook the load control plugs into later. It defaults to 1 and changes nothing until there is a control bound to it.

## Making load an input instead of an output

This is the part that needs a decision, because it changes behaviour rather than structure.

Today: draw a format, draw its parameters, and the load falls out (68 to 246).

Proposed: the user sets a target, then draw a format by weight as now, then choose that format's `cap` or `rounds` from its authored list to land closest to the target, then let rep scaling absorb what remains. If the closest fit is still far off (asking an interval piece for 246), redraw the format, up to a few attempts, then accept the miss. That mirrors how `generate()` already handles composition: try repeatedly, degrade rather than fail.

What this preserves: the authored `caps` and `rounds` lists stay as they are, because they came from real sessions. Format variety stays, since formats are still drawn by weight.

What it costs: the format draw is no longer purely by weight once a target is set. Ask for a very light session and interval pieces will be over-represented; ask for a heavy one and they will nearly vanish. That is arguably correct, but it is a behaviour change and should be a deliberate one.

## Sequencing

The refactor is not one commit, and two of the four steps exist only to make the third checkable.

**Step 1. Split `src/App.jsx`.** The generator cannot be tested while it lives inside a React component file, because a Node script cannot import it. Move sections 1 to 4 out into `src/moves.js`, `src/formats.js`, `src/generator.js` and `src/text.js`, leaving section 5 as the component. Pure moves, no edits, so the diff reads as cut and paste.

Cost: it is a large diff, and it kills the "one file, five numbered sections" map that `CLAUDE.md` and `README.md` both describe. Both have to be rewritten in the same commit. This also converges the project on the layout the other repos in this account already use.

**Step 2. Add `scripts/smoke.js`.** Sweep environment by strength block by format across many seeds, and write mean and spread of session load per format, axis share distributions, and warning rates to `out/smoke-report.md`. Add `npm run smoke`. Run it and commit the baseline before touching the model.

There are no tests in this project. Without a baseline, step 3 is unfalsifiable: generated workouts are random, so "it still looks right" is not evidence. This is also the convention the sibling repo already uses for exactly this problem.

**Step 3. Unify the model.** Add `passes` and `load` to `FORMATS`. Replace `volumeBand` with `roundTarget`. Add `sessionLoad`. Reduce `dayWork` to a call. Delete the ternary chain and the EMOM no-op. Pick each format's `load` constant to reproduce today's implied session totals exactly, so the smoke report before and after is unchanged. A clean diff here is a report that does not move.

**Step 4. Add the control.** Only now, on a structure that has somewhere to put it.

## The control itself, when we get there

Where on screen: with the inputs, not the output. It changes what gets generated, so it belongs next to "where are you training" and "what did you do first", not next to the result. The form currently has two rows and a third fits.

What kind of control: chips, not a slider. The app has no slider anywhere, and chips with `aria-pressed` are its existing idiom for picking one of a few. A continuous slider would also promise precision the model does not have, since `cost` values are estimates. Three or four steps, labelled in hard minutes because that is what the unit actually means, is more honest than an abstract 1 to 10.

## Open questions

1. Should the target read as hard minutes of work (about 5, 8, 12), or as named efforts (suave, normal, duro)? Minutes are honest about the unit but invite the reading that the session takes that long in elapsed time, which it does not.
2. Once the user sets load, does the plate meter still earn its place? It currently visualises a number the user did not choose. It could show target against actual instead, or go.
3. Is the 3.6x random spread a bug or variety worth keeping? Everything above assumes it is a bug. If it is deliberate, the control becomes a range constraint rather than a target and the design changes.
