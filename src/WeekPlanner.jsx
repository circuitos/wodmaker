import React, { useMemo, useState } from "react";
import { AXES, ENVS } from "./moves.js";
import { INTENSITY, STRENGTH, cueFor } from "./formats.js";
import { T } from "./i18n.js";
import { sessionLoad } from "./generator.js";
import { splitRows } from "./lifts.js";
import { WEEK_COUNTS, presetsFor, rowsForEnv, withPreset } from "./planner.js";
import { asText, headline, repParts, strengthLine } from "./text.js";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

function weekdayName(t, weekday) {
  return t.planner.weekdays[weekday];
}

/* The week view owns nothing. App holds the configs and the plan, because the
   Day tab edits the same days; this renders them and hands edits back. */
export default function WeekPlanner({
  lang, oneRM, plan, configs, count, summary, onCount, onPatchDay, onAnotherWeek, onOpenDay,
}) {
  const t = T[lang];
  const [copied, setCopied] = useState(false);

  /* One session per weekday: the gap between days is what carry-over decays
     over, so a day already spoken for is not offered twice. */
  const taken = useMemo(() => new Set(configs.map((config) => config.weekday)), [configs]);

  const text = useMemo(() => [
    `${t.planner.title} · ${Math.round(summary.total)} ${t.planner.points}`,
    ...plan.flatMap((wod) => [
      "",
      weekdayName(t, wod.plan.weekday),
      asText({ ...wod, cue: cueFor(wod, lang) }, lang, wod.plan.env),
    ]),
  ].join("\n"), [plan, summary.total, lang]);

  const copyWeek = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="week">
      <div className="week-intro">
        <div>
          <p className="lbl">{t.planner.title}</p>
          <p className="week-note">{t.planner.note}</p>
        </div>
        <div className="week-actions">
          <button className="btn pri" onClick={onAnotherWeek}>
            {t.planner.another}
          </button>
          <button className="btn" onClick={copyWeek}>{copied ? t.copied : t.planner.copy}</button>
        </div>
      </div>

      <div className="week-controls">
        <div>
          <p className="lbl">{t.planner.sessions}</p>
          <div className="seg week-count">
            {WEEK_COUNTS.map((value) => (
              <button key={value} aria-pressed={count === value} onClick={() => onCount(value)}>{value}</button>
            ))}
          </div>
        </div>
        <div className="week-total">
          <span className="lbl">{t.planner.weeklyLoad}</span>
          <strong className="mono disp">{Math.round(summary.total)}</strong>
          <span>{t.planner.points}</span>
        </div>
      </div>

      <div className="week-balance">
        {AXES.map((axis) => (
          <div className="week-axis" key={axis}>
            <span>{t.axisName[axis]}</span>
            <span className="bar"><i style={{ width: `${Math.min(100, (summary.shares[axis] || 0) * 300)}%` }} /></span>
            <span className="mono">{Math.round((summary.shares[axis] || 0) * 100)}%</span>
          </div>
        ))}
      </div>

      <div className="week-days">
        {plan.map((wod, position) => {
          /* A day the generator could not build drops out of the plan, so the
             card has to follow the index the planner recorded rather than its
             own position, or every later card edits the wrong schedule row. */
          const index = wod.plan.index;
          const config = configs[index];
          const load = sessionLoad(wod);
          const cue = cueFor(wod, lang);
          return (
            <article className="day-card" key={`${index}-${config.weekday}`}>
              <header className="day-head">
                <div>
                  <span className="day-kicker mono">{t.planner.day} {position + 1}</span>
                  <select className="day-when disp" aria-label={t.planner.weekday} value={config.weekday}
                    onChange={(event) => onPatchDay({ weekday: event.target.value }, index)}>
                    {WEEKDAYS.map((weekday) => (
                      <option key={weekday} value={weekday}
                        disabled={weekday !== config.weekday && taken.has(weekday)}>
                        {weekdayName(t, weekday)}
                      </option>
                    ))}
                  </select>
                </div>
                <span className="day-load mono">{Math.round(load.total)}</span>
              </header>

              <div className="day-config">
                <label>
                  <span>{t.planner.focus}</span>
                  <select value={wod.plan.preset}
                    onChange={(event) => onPatchDay({
                      preset: event.target.value,
                      rows: withPreset(config.rows, event.target.value, oneRM),
                    }, index)}>
                    {STRENGTH.filter((focus) => presetsFor(config.env).includes(focus.id))
                      .map((focus) => <option key={focus.id} value={focus.id}>{t.strength[focus.id]}</option>)}
                    {wod.plan.preset === "custom" && <option value="custom">{t.planner.currentGrid}</option>}
                  </select>
                </label>
                <label>
                  <span>{t.where}</span>
                  <select value={config.env} onChange={(event) => onPatchDay({
                      env: event.target.value,
                      rows: rowsForEnv(config.preset, event.target.value, oneRM, wod.plan.seed),
                    }, index)}>
                    {ENVS.map((env) => <option key={env} value={env}>{t[env]}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t.effort}</span>
                  <select value={config.intensity} onChange={(event) => onPatchDay({ intensity: event.target.value }, index)}>
                    <option value="auto">{t.planner.auto}</option>
                    {INTENSITY.map((item) => <option key={item.id} value={item.id}>{t.intensity[item.id]}</option>)}
                  </select>
                </label>
              </div>

              {[[t.mainLifts, splitRows(wod.strengthRows).lifts],
                [t.accessory, splitRows(wod.strengthRows).accessory]]
                .filter(([, rows]) => rows.length > 0)
                .map(([label, rows]) => (
                  <div className="day-strength" key={label}>
                    <p className="grp">{label}</p>
                    <ul>
                      {rows.map((row, rowIndex) => <li key={rowIndex}>{strengthLine(row, lang, oneRM)}</li>)}
                    </ul>
                  </div>
                ))}

              <div className="day-wod">
                <div className="day-wod-head">
                  <h3 className="disp">{headline(wod, lang)}</h3>
                  <span className="mono">{config.intensity === "auto"
                    ? `${t.planner.auto} → ${t.intensity[wod.plan.intensity]}`
                    : t.intensity[wod.plan.intensity]}</span>
                </div>
                <ol>
                  {wod.items.map((item, itemIndex) => {
                    const part = repParts(item, lang, wod.plan.env, wod.fmt);
                    return (
                    <li key={item.move.id}>
                      {wod.fmt.id === "emom" && <span className="mono">Min {itemIndex + 1}</span>}
                      <strong className="mono">{part.dose}</strong>
                      <span>
                        {part.name}
                        {part.side && <em> · {part.side}</em>}
                        {part.kg && <em> · {part.kg}</em>}
                      </span>
                    </li>
                    );
                  })}
                  {wod.fmt.id === "emom" && wod.items.length === 3 && (
                    <li>
                      <span className="mono">Min 4</span>
                      <strong className="mono">·</strong>
                      <span>{t.rest}</span>
                    </li>
                  )}
                </ol>
                <p className="cue">{cue}</p>
              </div>

              <footer className="day-foot">
                <span>{t.planner.conditioning}: <b className="mono">{Math.round(load.conditioning)}</b></span>
                <span>{t.planner.strength}: <b className="mono">{Math.round(load.strength)}</b></span>
                {wod.plan.carryPoints > 1 && (
                  <span>{t.planner.carry}: <b className="mono">{Math.round(wod.plan.carryPoints)}</b></span>
                )}
                <button className="day-open disp" onClick={() => onOpenDay(config.weekday)}>
                  {t.planner.openDay}
                </button>
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
