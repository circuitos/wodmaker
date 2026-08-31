import React, { useEffect, useMemo, useState } from "react";
import { AXES } from "./moves.js";
import { CUES, INTENSITY, STRENGTH } from "./formats.js";
import { T } from "./i18n.js";
import { sessionLoad } from "./generator.js";
import { defaultWeekConfig, planWeek, weekSummary } from "./planner.js";
import { loadPref, savePref } from "./prefs.js";
import { asText, headline, repLine, strengthLine } from "./text.js";

function cueFor(wod, lang) {
  const cues = CUES[lang][wod.fmt.id];
  return cues[wod.plan.seed % cues.length];
}

function weekdayName(t, weekday) {
  return t.planner.weekdays[weekday];
}

export default function WeekPlanner({ lang, oneRM, customRows }) {
  const t = T[lang];
  const [count, setCount] = useState(() => loadPref("weekCount", 2));
  const [configs, setConfigs] = useState(() => {
    const saved = loadPref("weekConfigs", null);
    return Array.isArray(saved) && saved.length === Number(loadPref("weekCount", 2))
      ? saved
      : defaultWeekConfig(loadPref("weekCount", 2));
  });
  const [seed, setSeed] = useState(() => loadPref("weekSeed", Math.floor(Math.random() * 2 ** 31)));
  const [copied, setCopied] = useState(false);

  useEffect(() => { savePref("weekCount", count); }, [count]);
  useEffect(() => { savePref("weekConfigs", configs); }, [configs]);
  useEffect(() => { savePref("weekSeed", seed); }, [seed]);

  const plan = useMemo(
    () => planWeek(configs, { seed, oneRM, customRows }),
    [configs, seed, oneRM, customRows],
  );
  const summary = useMemo(() => weekSummary(plan), [plan]);

  const changeCount = (next) => {
    setCount(next);
    setConfigs(defaultWeekConfig(next));
  };

  const editDay = (index, field, value) => setConfigs((current) => current.map((config, i) => (
    i === index ? { ...config, [field]: field === "weekday" ? Number(value) : value } : config
  )));

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
          <button className="btn pri" onClick={() => setSeed(Math.floor(Math.random() * 2 ** 31))}>
            {t.planner.another}
          </button>
          <button className="btn" onClick={copyWeek}>{copied ? t.copied : t.planner.copy}</button>
        </div>
      </div>

      <div className="week-controls">
        <div>
          <p className="lbl">{t.planner.sessions}</p>
          <div className="seg week-count">
            {[2, 3, 4, 5].map((value) => (
              <button key={value} aria-pressed={count === value} onClick={() => changeCount(value)}>{value}</button>
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
        {plan.map((wod, index) => {
          const config = configs[index];
          const load = sessionLoad(wod);
          const cue = cueFor(wod, lang);
          return (
            <article className="day-card" key={`${index}-${config.weekday}`}>
              <header className="day-head">
                <div>
                  <span className="day-kicker mono">{t.planner.day} {index + 1}</span>
                  <h2 className="disp">{weekdayName(t, config.weekday)}</h2>
                </div>
                <span className="day-load mono">{Math.round(load.total)}</span>
              </header>

              <div className="day-config">
                <label>
                  <span>{t.planner.focus}</span>
                  <select value={config.focus} onChange={(event) => editDay(index, "focus", event.target.value)}>
                    {STRENGTH.map((focus) => <option key={focus.id} value={focus.id}>{t.strength[focus.id]}</option>)}
                    {customRows.length > 0 && <option value="custom">{t.planner.currentGrid}</option>}
                  </select>
                </label>
                <label>
                  <span>{t.where}</span>
                  <select value={config.env} onChange={(event) => editDay(index, "env", event.target.value)}>
                    {['gym', 'parque', 'casa'].map((env) => <option key={env} value={env}>{t[env]}</option>)}
                  </select>
                </label>
                <label>
                  <span>{t.effort}</span>
                  <select value={config.intensity} onChange={(event) => editDay(index, "intensity", event.target.value)}>
                    <option value="auto">{t.planner.auto}</option>
                    {INTENSITY.map((item) => <option key={item.id} value={item.id}>{t.intensity[item.id]}</option>)}
                  </select>
                </label>
              </div>

              {wod.strengthRows.length > 0 && (
                <div className="day-strength">
                  <p className="grp">{t.before}</p>
                  <ul>
                    {wod.strengthRows.map((row, rowIndex) => (
                      <li key={rowIndex}>{strengthLine(row, lang, oneRM)}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="day-wod">
                <div className="day-wod-head">
                  <h3 className="disp">{headline(wod, lang)}</h3>
                  <span className="mono">{config.intensity === "auto"
                    ? `${t.planner.auto} → ${t.intensity[wod.plan.intensity]}`
                    : t.intensity[wod.plan.intensity]}</span>
                </div>
                <ol>
                  {wod.items.map((item, itemIndex) => (
                    <li key={item.move.id}>
                      {wod.fmt.id === "emom" && <span className="mono">Min {itemIndex + 1}</span>}
                      <strong className="mono">{wod.fmt.id === "ladder" ? "10-2" : repLine(item, lang, config.env).split(" ")[0]}</strong>
                      <span>{wod.fmt.id === "ladder" ? item.move[lang] : repLine(item, lang, config.env).split(" ").slice(1).join(" ")}</span>
                    </li>
                  ))}
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
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
