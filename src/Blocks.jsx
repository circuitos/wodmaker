import React from "react";
import { strengthParts } from "./text.js";

/* ------------------------------------------------------------------ *
 *  THE THREE BLOCKS OF A SESSION, DRAWN ONCE
 *
 *  Barbell work, then accessory work, then the conditioning piece. Both
 *  views render the same model, so both render it from here: the Day card
 *  used to list the strength block as bulleted grey text while the Week
 *  card listed it again under its own `day-strength` treatment, which is
 *  two drawings of one fact and the thing this retires.
 *
 *  The number is what carries the separation. Small caps alone left block
 *  two reading as a continuation of block one; `02 ·` does not.
 *
 *  Nothing here holds state or knows which view it is in. The Day card
 *  passes its swap and lock buttons in as children of a rep line; the Week
 *  card passes none.
 * ------------------------------------------------------------------ */

/* Blocks are numbered over the ones actually shown, not over the canonical
   three. A park day with no barbell work does its accessory block first, and
   calling that `02` would number a block that is not there. */
export function BlockHead({ n, name, load }) {
  return (
    <div className={n > 1 ? "blk blk-mid" : "blk"}>
      <span className="blk-n disp">{String(n).padStart(2, "0")} · {name}</span>
      {load > 0 && <span className="blk-load mono">{Math.round(load)}</span>}
    </div>
  );
}

/* A strength or accessory row: the movement leads, the prescription sits
   beside it in the mono face. Both halves come from `strengthParts` so the
   card and the plain text export cannot disagree. */
export function BlockRows({ rows, lang, oneRM }) {
  return rows.map((row, i) => {
    const part = strengthParts(row, lang, oneRM);
    if (!part) return null;
    return (
      <p className="blk-row" key={i}>
        {part.name} <span className="blk-rx mono">{part.dose}{part.detail}</span>
      </p>
    );
  });
}

/* One line of the conditioning piece. The dose takes the display face and
   leads the row, because it is the number you train off and the row has to
   be readable with the phone on the floor three steps away.
 *
 * A ladder prints every rung, so its dose can run to fifteen characters. It
 * still keeps one line and the movement name takes the wrap instead, which
 * is why the long case drops to a size that fits rather than wrapping. */
export function RepLine({ part, minute, children }) {
  return (
    <div className="rep">
      {minute && <span className="rep-min mono disp">{minute}</span>}
      <span className={part.dose.length > 8 ? "rep-dose disp long" : "rep-dose disp"}>{part.dose}</span>
      <span className="rep-nm">
        {part.name}
        {part.side && <em> · {part.side}</em>}
        {part.kg && <em> · {part.kg}</em>}
      </span>
      {children}
    </div>
  );
}
