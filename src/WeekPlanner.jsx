import React, { useMemo, useState } from "react";
import { AXES, ENVS } from "./moves.js";
import { INTENSITY, STRENGTH, cueFor } from "./formats.js";
import { T } from "./i18n.js";
import { sessionLoad } from "./generator.js";
import { blockLoads, splitRows } from "./lifts.js";
import { WEEK_COUNTS, changeEnv, presetsFor, withPreset } from "./planner.js";
import { asText, headline, repParts } from "./text.js";
import { BlockHead, BlockRows, RepLine } from "./Blocks.jsx";

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
          /* Same numbering rule as the Day card: over the blocks actually
             shown, so a day with no barbell work starts at 01. */
          const parts = splitRows(wod.strengthRows || []);
          const blocks = blockLoads(wod.strengthRows || [], oneRM);
          const pre = [[t.mainLifts, parts.lifts, blocks.lifts],
            [t.accessory, parts.accessory, blocks.accessory]]
            .filter(([, rows]) => rows.length > 0);
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
                      rows: withPreset(config.rows, event.target.value, oneRM),
                    }, index)}>
                    {STRENGTH.filter((focus) => presetsFor(config.env).includes(focus.id))
                      .map((focus) => <option key={focus.id} value={focus.id}>{t.strength[focus.id]}</option>)}
                    {wod.plan.preset === "custom" && <option value="custom">{t.planner.currentGrid}</option>}
                  </select>
                </label>
                <label>
                  <span>{t.where}</span>
                  <select value={config.env} onChange={(event) => onPatchDay(
                      changeEnv(config, event.target.value, oneRM, wod.plan.seed), index,
                    )}>
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

              {pre.map(([label, rows, blockLoad], blockIndex) => (
                <React.Fragment key={label}>
                  <BlockHead n={blockIndex + 1} name={label} load={blockLoad} />
                  <BlockRows rows={rows} lang={lang} oneRM={oneRM} />
                </React.Fragment>
              ))}

              <div className="day-wod">
                <BlockHead n={pre.length + 1} name={t.planner.conditioning}
                  load={load.conditioning} />
                <div className="day-wod-head">
                  <h3 className="disp">{headline(wod, lang)}</h3>
                  <span className="mono">{config.intensity === "auto"
                    ? `${t.planner.auto} → ${t.intensity[wod.plan.intensity]}`
                    : t.intensity[wod.plan.intensity]}</span>
                </div>
                <div className="rows">
                  {wod.items.map((item, itemIndex) => (
                    <RepLine key={item.move.id} part={repParts(item, lang, wod.plan.env, wod.fmt)}
                      minute={wod.fmt.id === "emom" ? `Min ${itemIndex + 1}` : null} />
                  ))}
                  {wod.fmt.id === "emom" && wod.items.length === 3 && (
                    <RepLine part={{ dose: "·", name: t.rest }} minute="Min 4" />
                  )}
                </div>
                <p className="cue">{cue}</p>
              </div>

              {/* The block headers now carry the conditioning and strength
                  loads, so the foot keeps only what they do not say. */}
              <footer className="day-foot">
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
