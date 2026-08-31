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

| Code | Section | What it decides |
|---|---|---|
| `volumeBand()` | 3 | how many points one round should be |
| `buildCandidate()` | 3 | scales the rep counts until the round hits that |
| `dayWork` | 5 | guesses how many rounds there are, multiplies, adds the strength block |

## Problem 1: the same fact is written down twice

Take a 10-minute AMRAP.

- `volumeBand` says one round should be about 41 points.
- `dayWork` assumes you get through 5 rounds.
- 41 × 5 = 205 points, which is about 10 hard minutes.

The answer is right. A 10-minute AMRAP should be about 10 minutes of work. But that "should" is written down nowhere. It exists only as 41 in section 3 multiplied by 5 in section 5, and nothing checks that the two still line up. Change the 41 and nobody changes the 5, and the app quietly starts lying about how hard the session was.

## Problem 2: the format decides how hard your session is, and you do not pick the format

| Format | How often it comes up | Session points | Hard minutes |
|---|---|---|---|
| AMRAP | 22% | 164 to 246 | 8.2 to 12.3 |
| For time | 28% | 190 | 9.5 |
| EMOM | 20% | 120 to 180 | 6.0 to 9.0 |
| Intervals | 10% | 68 to 81 | 3.4 to 4.0 |
| Ladder | 8% | 99 | 5.0 |
| Chipper | 7% | 155 | 7.8 |
| Quality | 5% | 100 | 5.0 |

The format is picked at random. Some come up more often than others, but you have no say in which one you get. The same inputs give you a 3.4 minute session on one press and a 12.3 minute one on the next. That is a 3.6x gap.

Some of it is honest. An interval piece with rest really is less work than a twelve minute AMRAP. But 3.6x is a wide gap, and right now it is the biggest single thing deciding how hard your workout turns out.

**Reviewed and accepted (see Decisions).** The spread stays. Formats genuinely differ in how much work they are, and the variety is wanted.

That settles what kind of control this can be. A control that promised an absolute target ("give me a 200 point session") would have to override the format choice to deliver it. A control that is relative to whatever format came up ("make this one harder") does not. The spread makes the first kind expensive and the second kind honest, so the control is relative.

## Problem 3: the strength block is counted twice, two different ways

In the generator, `dampen` shrinks the workout because you are already tired. In the display, `pre * 0.9` adds the strength work into your total for the day.

Both are fair. A hard squat session should mean less conditioning afterwards, and it should also count as work you did. But one lives in section 3 and one in section 5, and neither knows the other exists.

Worth writing down, because it looks like it should be simple and is not: **`dampen` cannot be calculated from how much the strength block loaded you.** Squat and pull both load 140 points. Squat cuts the following workout by 15%, pull cuts it by 8%. Nearly double the cut for the same load, because legs take more out of you than arms do. That difference is real and it lives only in those seven hand-tuned numbers, so `dampen` stays as authored data.

## Three small things in the same code

- `volumeBand` returns a range, `[lo, hi]`, and the only thing done with it is take the middle. It should be one number.
- The EMOM line inside `dayWork` is `cap / items.length * (items.length === 3 ? 3 : items.length)`. Whatever `items.length` is, that works out to `cap`. It is the leftover of somebody adjusting a number until the output looked right.
- `dayWork` is one expression with five nested ternaries, and it is the only thing in section 5 that knows anything about how formats work.

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

Same two numbers, used twice. Change `load` and the target and the display move together, because there is only one number to change. Section 5 stops knowing what a format is.

`intensity` is a multiplier that sits at 1 and does nothing. It is there so the control has somewhere to plug in later.

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

**1. Split `src/App.jsx`.** A Node script cannot import the generator while it lives inside a React component file. Move sections 1 to 4 into `moves.js`, `formats.js`, `generator.js` and `text.js`, and leave section 5 as the component. Move the code, do not edit it, so the diff reads as cut and paste.

This is a big diff, and it kills the "one file, five numbered sections" map that `CLAUDE.md` and `README.md` both describe. Both get rewritten in the same commit.

**2. Add `scripts/smoke.js`.** Generate a few thousand workouts covering every combination of settings and write down what came out: average and spread of session points per format, how the axis shares fall, how often each warning fires. Add `npm run smoke`, run it, commit the numbers.

This has to come before step 3. There are no tests here and the output is random, so if we change the model and the workouts still look plausible, that tells us nothing. We need the numbers from before.

**3. Unify the model.** Add `passes` and `load` to `FORMATS`, replace `volumeBand` with `roundTarget`, add `sessionLoad`, cut `dayWork` down to a call. Delete the ternary chain and the EMOM line that does nothing. Choose each format's `load` so the numbers come out exactly where they are today.

It is done when the smoke numbers have not moved.

**4. Add the control.** Three chips wired to one multiplier. Small, now that there is somewhere to put it.

**5. Generalise `pre` from a strength block to an arriving axis load.** Groundwork for the week planner, per the section above. Its own commit, after the load model is unified, and before any planner work starts.

## The control itself

Put it with the inputs, not the results. It changes what gets made, so it belongs next to "where are you training" and "what did you do first". The form has two rows and a third one fits.

Make it chips, not a slider. There is no slider anywhere in this app, and chips are already how it asks you to pick one of a few things. A slider would also suggest a precision the model does not have, since every `cost` is an estimate.

Three steps, named: **soft / normal / hard** (`suave / normal / duro`). Names rather than minutes, because the control is relative to the workout you got. Printing "8 min" would claim an absolute amount of work that this control does not deliver, and would also be read as how long the session takes, which is a different number again. Both readings are wrong; a name makes neither promise.

## Decisions

**Named steps, not minutes.** Soft, normal, hard. See "The control itself" for why.

**The plate meter stays, and gets a show/hide.** It draws a number you did not choose, which was the argument for cutting it, but it is worth keeping and hiding. The app already has this pattern: `calOpen` opens and closes the calendar block. The toggle belongs on the `.mhead` row, which already holds the label and the number.

This introduces the first saved preference in the app. Nothing is persisted today: reload and you are back to Spanish, gym, no strength block. Worth knowing before building it, because once there is somewhere to keep a preference, **language is the more valuable thing to keep**. Resetting the plate meter on reload is mildly annoying; resetting an English speaker to Spanish every visit is worse. Build the store once and put both in it.

A note on wording: `sessionStorage` is forgotten when the tab closes, `localStorage` is not. For "I do not want to see this meter", `localStorage` is almost certainly the intent. Both are one line.

This is independent of the load refactor and can land before it, after it, or on its own.

**The 3.6x spread is not a bug.** Formats differ in how much work they are, and that variety is wanted. Recorded in Problem 2, which now explains what the spread costs rather than arguing it should go. The knock-on is that the load control is relative rather than absolute, which is what makes step 4 small.
