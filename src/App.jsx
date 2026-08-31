import React, { useState, useMemo, useRef, useEffect } from "react";
import { AXES } from "./moves.js";
import { CUES, STRENGTH } from "./formats.js";
import { LIFTS, PRESET_ROWS, arrivingFromLifts } from "./lifts.js";
import { T } from "./i18n.js";
import { generate, pick, sessionLoad } from "./generator.js";
import { asText, headline } from "./text.js";
import { platesFor } from "./plates.js";
import { loadPref, savePref } from "./prefs.js";

/* ------------------------------------------------------------------ *
 *  WOD GENERATOR
 *  Built from ~55 normalised sample workouts (Toni, 2025-2026).
 *  Data-first: MOVES is the whole database. The generator only reads it.
 *
 *  This file is the interface. The model lives alongside it:
 *    moves.js      the movement database and the six axes
 *    formats.js    workout formats, strength blocks, coaching cues
 *    i18n.js       every string the interface renders
 *    generator.js  candidate building, fault scoring, quantisation
 *    text.js       rep lines and the plain-text export
 *    plates.js     barbell plate maths for the load meter
 * ------------------------------------------------------------------ */

/* ---------- the plate meter drawing ---------- */
function Barbell({ work }) {
  const plates = platesFor(work);
  const W = 320, H = 116, mid = H / 2;
  const sleeve = 96;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} aria-hidden="true">
      <rect x="8" y={mid - 4} width={W - 16} height="8" rx="4" fill="#8A8F98" />
      <rect x={W / 2 - 52} y={mid - 6} width="104" height="12" rx="6" fill="#5C6169" />
      {[-1, 1].map((dir) =>
        plates.map((p, i) => {
          const x = W / 2 + dir * (52 + i * 12) - (dir === 1 ? 0 : 10);
          return (
            <rect key={`${dir}-${i}`} x={x} y={mid - p.h / 2} width="10" height={p.h} rx="2"
              fill={p.c} stroke="#14171A" strokeWidth="1.2" />
          );
        })
      )}
      {[-1, 1].map((d) => (
        <rect key={d} x={W / 2 + d * (52 + sleeve) - (d === 1 ? 0 : 6)} y={mid - 9} width="6" height="18" rx="2" fill="#3A3F47" />
      ))}
    </svg>
  );
}

/* =========================== 5. APP =========================== */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600&display=swap');
:root{
  --board:#F4F3EE; --ink:#14171A; --ink-2:#5C6169; --rule:#CFD2CB;
  --red:#C8102E; --blue:#0057B8; --yellow:#F5C400; --green:#00843D;
}
*{box-sizing:border-box}
.wg{min-height:100vh;background:var(--board);color:var(--ink);
  font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
  padding:20px 16px 56px}
.wg-in{max-width:1040px;margin:0 auto}
.disp{font-family:'Barlow Condensed',ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase;letter-spacing:.02em;line-height:.95}
.mono{font-family:'IBM Plex Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  font-variant-numeric:tabular-nums}
.h1{font-size:42px;font-weight:700;margin:0}
.sub{font-size:12px;color:var(--ink-2);letter-spacing:.14em;text-transform:uppercase;margin-top:2px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:20px}
.lang{display:flex;border:1px solid var(--ink);border-radius:2px;overflow:hidden;flex:0 0 auto}
.lang button{border:0;background:transparent;padding:5px 9px;font-size:11px;font-weight:600;
  letter-spacing:.08em;cursor:pointer;color:var(--ink)}
.lang button[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.grid{display:grid;grid-template-columns:1fr;gap:22px}
@media(min-width:880px){.grid{grid-template-columns:288px 1fr;gap:32px;align-items:start}}
.lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);
  margin:0 0 8px;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1.5px solid var(--ink);background:transparent;border-radius:2px;padding:9px 12px;
  cursor:pointer;text-align:left;flex:1 1 auto;min-width:88px;color:var(--ink);font:inherit}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.chip b{display:block;font-size:14px;font-weight:600}
.chip span{display:block;font-size:10.5px;opacity:.7;margin-top:2px;line-height:1.25}
.shortcuts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.scut{border:1px solid var(--rule);background:transparent;border-radius:2px;padding:4px 7px;
  font:inherit;font-size:11px;color:var(--ink-2);cursor:pointer}
.scut:hover{border-color:var(--ink);color:var(--ink)}
.lifts{list-style:none;margin:0;padding:0;border-top:1px solid var(--rule)}
.lift{border-bottom:1px solid #EFEEE9;padding:5px 0}
.lift.on{background:#FAFAF7}
.lname{display:flex;align-items:center;gap:7px;font-size:13px;cursor:pointer}
.lname input{margin:0;accent-color:var(--ink)}
.lift.on .lname{font-weight:600}
.lfields{display:flex;align-items:center;flex-wrap:wrap;gap:3px;padding:5px 0 2px 22px;font-size:12px}
.num{width:38px;padding:3px 4px;border:1px solid var(--rule);border-radius:2px;background:#fff;
  font:inherit;font-size:12px;color:var(--ink);text-align:right}
.num:focus{outline:2px solid var(--ink);outline-offset:1px}
.num.kg{width:52px;margin-left:5px}
.x{color:var(--ink-2)}
.unit,.pct{font-size:11px;color:var(--ink-2)}
.rm{display:flex;align-items:center;gap:4px;margin-left:8px;font-size:10.5px;
  letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2)}
.rm .num{width:52px}
.pct{margin-left:auto;font-weight:500}
.ltotal{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:13px}
.ltotal .mono{font-weight:600}
.sel{width:100%;padding:10px;border:1.5px solid var(--ink);border-radius:2px;background:transparent;
  font:inherit;font-size:14px;color:var(--ink)}
.block{margin-bottom:22px}
.card{background:#fff;border:2px solid var(--ink);border-radius:3px;
  box-shadow:5px 5px 0 rgba(20,23,26,.1)}
.card-h{padding:16px 18px 12px;border-bottom:1px dashed var(--rule);
  display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.fmt{font-size:32px;font-weight:700}
.tag{font-size:10.5px;letter-spacing:.14em;color:var(--ink-2);text-transform:uppercase;white-space:nowrap}
.rows{padding:6px 8px 10px}
.row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:2px}
.row+.row{border-top:1px solid #EFEEE9}
.row:hover{background:#FAFAF7}
.minute{font-size:10px;letter-spacing:.1em;color:var(--ink-2);width:40px;flex:0 0 40px}
.reps{font-size:19px;font-weight:600;min-width:52px;flex:0 0 auto}
.nm{font-size:15px;line-height:1.25;flex:1 1 auto}
.nm em{font-style:normal;color:var(--ink-2);font-size:12.5px}
.ico{border:0;background:transparent;cursor:pointer;padding:6px;border-radius:2px;
  color:var(--ink-2);opacity:.55;line-height:0}
.ico:hover{opacity:1;background:#F0EFEA}
.ico[aria-pressed="true"]{opacity:1;color:var(--red)}
.cue{padding:0 18px 16px;font-size:13px;color:var(--ink-2);font-style:italic}
.meter{border-top:2px solid var(--ink);padding:16px 18px}
.mhead{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px}
.work{font-size:26px;font-weight:700}
.mtoggle{margin-right:auto;margin-left:10px;border:0;background:transparent;padding:2px 4px;
  font:inherit;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-2);
  cursor:pointer;opacity:.65;border-bottom:1px solid var(--rule)}
.mtoggle:hover{opacity:1;color:var(--ink)}
.mtoggle:focus-visible{outline:2px solid var(--ink);outline-offset:2px;opacity:1}
.axis{display:grid;grid-template-columns:104px 1fr 34px;align-items:center;gap:10px;margin-top:7px}
.axis .an{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.bar{height:7px;background:#EDECE6;border-radius:1px;overflow:hidden}
.bar i{display:block;height:100%;background:var(--ink)}
.bar i.hot{background:var(--red)}
.pct{font-size:11px;color:var(--ink-2);text-align:right}
.warn{margin:14px 18px 0;border-left:3px solid var(--yellow);padding:8px 0 8px 11px;
  font-size:12.5px;color:var(--ink-2);line-height:1.45}
.acts{display:flex;gap:8px;flex-wrap:wrap;padding:16px 18px 18px}
.btn{border:1.5px solid var(--ink);background:transparent;border-radius:2px;padding:11px 15px;
  font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;color:var(--ink);
  display:inline-flex;align-items:center;gap:7px}
.btn:hover{background:#F1F0EB}
.btn.pri{background:var(--ink);color:var(--board);flex:1 1 140px;justify-content:center}
.btn.pri:hover{background:#000}
.pop{margin:0 18px 18px;border:1.5px dashed var(--rule);border-radius:2px;padding:14px}
.pop label{display:block;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--ink-2);margin-bottom:5px}
.pop input{width:100%;padding:9px;border:1.5px solid var(--ink);border-radius:2px;font:inherit;
  background:transparent;color:var(--ink)}
.pop .two{display:flex;gap:10px;margin-bottom:12px}
.pop .two>div{flex:1}
a.btn{text-decoration:none}
button:focus-visible,a:focus-visible,select:focus-visible,input:focus-visible{
  outline:2px solid var(--blue);outline-offset:2px}
@media(prefers-reduced-motion:no-preference){
  .card{transition:box-shadow .2s ease}
}
`;

const IconLock = ({ on }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d={on ? "M8 11V7a4 4 0 0 1 8 0v4" : "M8 11V7a4 4 0 0 1 7.5-2"} />
  </svg>
);
const IconSwap = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
  </svg>
);

export default function App() {
  const [lang, setLang] = useState(() => loadPref("lang", "es"));
  const [meterOpen, setMeterOpen] = useState(() => loadPref("meterOpen", true));
  const [env, setEnv] = useState("gym");
  /* What you lifted before this: one row per ticked lift. `kg` is what you put
     on the bar; `pct` only carries a preset's intent when no 1RM is on file to
     turn it into kilos. */
  const [liftRows, setLiftRows] = useState(() => loadPref("liftRows", []));
  /* One-rep maxes are a fact about you, not about today, so they outlive the
     session and the reload. */
  const [oneRM, setOneRM] = useState(() => loadPref("oneRM", {}));
  const [wod, setWod] = useState(null);
  const [locks, setLocks] = useState({});
  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime] = useState("09:45");

  useEffect(() => { savePref("lang", lang); }, [lang]);
  useEffect(() => { savePref("meterOpen", meterOpen); }, [meterOpen]);
  useEffect(() => { savePref("liftRows", liftRows); }, [liftRows]);
  useEffect(() => { savePref("oneRM", oneRM); }, [oneRM]);
  const t = T[lang];

  const pctFor = (r) => (oneRM[r.liftId] > 0 && r.kg > 0 ? r.kg / oneRM[r.liftId] : r.pct);
  const arriving = useMemo(
    () => arrivingFromLifts(liftRows.map((r) => ({ ...r, pct: pctFor(r) }))),
    // eslint-disable-next-line
    [liftRows, oneRM]);

  const toggleLift = (liftId) => setLiftRows((rows) =>
    rows.some((r) => r.liftId === liftId)
      ? rows.filter((r) => r.liftId !== liftId)
      : [...rows, { liftId, sets: 5, reps: 5, kg: 0, pct: undefined }]);

  const editRow = (liftId, field, value) => setLiftRows((rows) =>
    rows.map((r) => (r.liftId === liftId
      ? { ...r, [field]: value === "" ? 0 : Number(value), ...(field === "kg" ? { pct: undefined } : {}) }
      : r)));

  const applyPreset = (id) => setLiftRows(
    PRESET_ROWS[id].map((r) => ({ ...r, kg: oneRM[r.liftId] > 0 ? Math.round(oneRM[r.liftId] * r.pct) : 0 })));

  const roll = (keepLocks = false) => {
    const locked = keepLocks && wod ? wod.items.filter((it) => locks[it.move.id]) : [];
    const c = generate(env, arriving, locked);
    if (!c) return;
    c.cue = pick(CUES[lang][c.fmt.id]);
    setWod(c);
    if (!keepLocks) setLocks({});
    setCopied(false);
  };

  useEffect(() => { roll(false); /* eslint-disable-next-line */ }, [env, arriving]);
  useEffect(() => { if (wod) setWod({ ...wod, cue: pick(CUES[lang][wod.fmt.id]) }); /* eslint-disable-next-line */ }, [lang]);

  const text = useMemo(() => (wod ? asText(wod, lang, env) : ""), [wod, lang, env]);

  const shares = useMemo(() => {
    const sum = wod ? AXES.reduce((s, a) => s + wod.vec[a], 0) || 1 : 1;
    return wod ? Object.fromEntries(AXES.map((a) => [a, wod.vec[a] / sum])) : {};
  }, [wod]);

  const dayWork = useMemo(() => (wod ? Math.round(sessionLoad(wod).total) : 0), [wod]);

  const doCopy = async () => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand("copy"); document.body.removeChild(ta);
    }
    setCopied(true); setTimeout(() => setCopied(false), 1600);
  };

  const doShare = async () => {
    if (navigator.share) { try { await navigator.share({ title: headline(wod, lang), text }); return; } catch {} }
    doCopy();
  };

  const icsHref = useMemo(() => {
    if (!wod) return "";
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const esc = (s) => s.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WOD Generator//ES", "BEGIN:VEVENT",
      `UID:${Date.now()}@wodgen`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      `SUMMARY:${esc(headline(wod, lang))}`, `DESCRIPTION:${esc(text)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [wod, date, time, text, lang]);

  const gcalHref = useMemo(() => {
    if (!wod) return "";
    const start = new Date(`${date}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(headline(wod, lang))}&dates=${z(start)}/${z(end)}&details=${encodeURIComponent(text)}`;
  }, [wod, date, time, text, lang]);

  const swapOne = (id) => {
    const removed = wod.items.find((it) => it.move.id === id);
    const keep = wod.items.filter((it) => it.move.id !== id);
    const fixed = { fmt: wod.fmt, cap: wod.cap, rounds: wod.rounds, slots: [removed.move.pat] };
    const c = generate(env, arriving, keep, fixed);
    if (!c) return;
    c.cue = wod.cue;
    setWod(c);
  };

  const warnList = useMemo(() => {
    if (!wod) return [];
    const seen = new Set();
    return wod.faults.filter((f) => {
      const k = f.k + (f.a || "");
      if (seen.has(k)) return false; seen.add(k); return true;
    }).map((f) => (f.k === "axis" ? t.warn.axis(t.axisName[f.a]) : t.warn[f.k]));
  }, [wod, lang]);

  return (
    <div className="wg">
      <style>{CSS}</style>
      <div className="wg-in">
        <header className="top">
          <div>
            <h1 className="h1 disp">{t.title}</h1>
            <div className="sub disp">{t.sub}</div>
          </div>
          <div className="lang">
            {["es", "en"].map((l) => (
              <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </header>

        <div className="grid">
          <aside>
            <div className="block">
              <p className="lbl">{t.where}</p>
              <div className="chips">
                {["gym", "parque", "casa"].map((e) => (
                  <button key={e} className="chip" aria-pressed={env === e} onClick={() => setEnv(e)}>
                    <b>{t[e]}</b><span>{t.whereHint[e]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="block">
              <p className="lbl">{t.before}</p>

              <div className="shortcuts">
                {STRENGTH.map((sp) => (
                  <button key={sp.id} className="scut" onClick={() => applyPreset(sp.id)}>
                    {t.strength[sp.id]}
                  </button>
                ))}
              </div>

              <ul className="lifts">
                {LIFTS.map((lift) => {
                  const row = liftRows.find((r) => r.liftId === lift.id);
                  const rm = oneRM[lift.id] || 0;
                  const pct = row ? pctFor(row) : undefined;
                  return (
                    <li key={lift.id} className={row ? "lift on" : "lift"}>
                      <label className="lname">
                        <input type="checkbox" checked={!!row} onChange={() => toggleLift(lift.id)} />
                        <span>{lift[lang]}</span>
                      </label>
                      {row && (
                        <div className="lfields">
                          <input className="num mono" type="number" min="1" max="20" value={row.sets || ""}
                            aria-label={t.sets} onChange={(e) => editRow(lift.id, "sets", e.target.value)} />
                          <span className="x">&times;</span>
                          <input className="num mono" type="number" min="1" max="30" value={row.reps || ""}
                            aria-label={t.reps} onChange={(e) => editRow(lift.id, "reps", e.target.value)} />
                          <input className="num kg mono" type="number" min="0" step="2.5" value={row.kg || ""}
                            aria-label="kg" placeholder="kg" onChange={(e) => editRow(lift.id, "kg", e.target.value)} />
                          <span className="unit">kg</span>
                          <span className="rm">
                            {t.oneRM}
                            <input className="num mono" type="number" min="0" step="2.5" value={rm || ""}
                              aria-label={`${t.oneRM} ${lift[lang]}`}
                              onChange={(e) => setOneRM({ ...oneRM, [lift.id]: Number(e.target.value) || 0 })} />
                          </span>
                          <span className="pct mono">
                            {pct ? `${Math.round(pct * 100)}%` : t.noRM}
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {arriving.points > 0 && (
                <p className="ltotal">
                  <span className="lbl" style={{ margin: 0 }}>{t.strengthTotal}</span>
                  <span className="mono">{Math.round(arriving.points)}</span>
                  <button className="mtoggle disp" onClick={() => setLiftRows([])}>{t.clearLifts}</button>
                </p>
              )}
            </div>
          </aside>

          {wod && (
            <main className="card">
              <div className="card-h">
                <div className="fmt disp">{headline(wod, lang)}</div>
                <div className="tag mono">
                  {wod.fmt.id === "emom" ? t.perMin : wod.fmt.id === "fortime" || wod.fmt.id === "amrap" ? t.perRound : t.total}
                  {" · "}{Math.round(wod.totalWork)}
                </div>
              </div>

              <div className="rows">
                {wod.items.map((it, i) => (
                  <div className="row" key={it.move.id}>
                    {wod.fmt.id === "emom" && <span className="minute mono disp">Min {i + 1}</span>}
                    <span className="reps mono">
                      {wod.fmt.id === "ladder" ? "10-2"
                        : it.move.unit === "s" ? `${it.reps}"` : it.reps}
                    </span>
                    <span className="nm">
                      {it.move[lang]}
                      {it.move.side && <em> · {t.side}</em>}
                      {env === "gym" && it.move.kg && <em> · {it.move.kg}</em>}
                    </span>
                    <button className="ico" title={t.swap} onClick={() => swapOne(it.move.id)}><IconSwap /></button>
                    <button className="ico" title={t.lock} aria-pressed={!!locks[it.move.id]}
                      onClick={() => setLocks({ ...locks, [it.move.id]: !locks[it.move.id] })}>
                      <IconLock on={!!locks[it.move.id]} />
                    </button>
                  </div>
                ))}
                {wod.fmt.id === "emom" && wod.items.length === 3 && (
                  <div className="row"><span className="minute mono disp">Min 4</span>
                    <span className="reps mono">—</span><span className="nm">{t.rest}</span></div>
                )}
              </div>

              <p className="cue">{wod.cue}</p>

              <div className="meter">
                <div className="mhead">
                  <span className="lbl" style={{ margin: 0 }}>{t.load}</span>
                  <button className="mtoggle disp" onClick={() => setMeterOpen(!meterOpen)}
                    aria-expanded={meterOpen} aria-controls="plate-meter">
                    {meterOpen ? t.hideMeter : t.showMeter}
                  </button>
                  <span className="work mono disp">{dayWork}</span>
                </div>
                <div id="plate-meter" hidden={!meterOpen}><Barbell work={dayWork} /></div>
                <p className="lbl" style={{ marginTop: 14 }}>{t.axes}</p>
                {AXES.map((a) => {
                  const s = shares[a] || 0;
                  const pre = wod.strength.pre[a] || 0;
                  const hot = s > 0.4 || (pre >= 80 && s > 0.24);
                  return (
                    <div className="axis" key={a}>
                      <span className="an">{t.axisName[a]}{pre >= 50 ? " ▪" : ""}</span>
                      <span className="bar"><i className={hot ? "hot" : ""} style={{ width: `${Math.min(100, s * 220)}%` }} /></span>
                      <span className="pct mono">{Math.round(s * 100)}%</span>
                    </div>
                  );
                })}
              </div>

              {warnList.length > 0 && (
                <div className="warn">
                  <strong className="disp" style={{ letterSpacing: ".1em", fontSize: 11 }}>{t.warnHead}</strong>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {warnList.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <div className="acts">
                <button className="btn pri" onClick={() => roll(true)}><IconSwap /> {t.another}</button>
                <button className="btn" onClick={doCopy}>{copied ? t.copied : t.copy}</button>
                <button className="btn" onClick={doShare}>{t.share}</button>
                <button className="btn" onClick={() => setCalOpen(!calOpen)}>{t.cal}</button>
              </div>

              {calOpen && (
                <div className="pop">
                  <div className="two">
                    <div><label>{lang === "es" ? "Fecha" : "Date"}</label>
                      <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                    <div><label>{lang === "es" ? "Hora" : "Time"}</label>
                      <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <a className="btn" href={icsHref} download="wod.ics">{t.download}</a>
                    <a className="btn" href={gcalHref} target="_blank" rel="noreferrer">{t.gcal}</a>
                  </div>
                </div>
              )}
            </main>
          )}
        </div>
      </div>
    </div>
  );
}
