import React, { useState, useMemo, useEffect } from "react";
import { AXES, ENVS } from "./moves.js";
import { INTENSITY, STRENGTH, cueFor } from "./formats.js";
import {
  ACCESSORY, LIFTS, accessoryRepMax, defaultAccessoryRow, moveById, pctFor, splitRows,
} from "./lifts.js";
import { T } from "./i18n.js";
import { sessionLoad } from "./generator.js";
import { asText, headline, repParts, strengthLine } from "./text.js";
import { platesFor } from "./plates.js";
import { loadPref, savePref } from "./prefs.js";
import {
  defaultWeekConfig, editWeekDay, normaliseWeek, planWeek, weekCount, weekSummary, withPreset,
} from "./planner.js";
import WeekPlanner from "./WeekPlanner.jsx";

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
/* The title sets the page's minimum width, so it has to scale rather than
   push the language toggle off the right edge on a phone. */
.h1{font-size:clamp(26px,8.5vw,42px);font-weight:700;margin:0}
.sub{font-size:clamp(10px,2.8vw,12px);color:var(--ink-2);letter-spacing:.14em;
  text-transform:uppercase;margin-top:2px}
.top{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;
  border-bottom:2px solid var(--ink);padding-bottom:10px;margin-bottom:20px}
.top>div:first-child{min-width:0}
.lang{display:flex;border:1px solid var(--ink);border-radius:2px;overflow:hidden;flex:0 0 auto}
.lang button{border:0;background:transparent;padding:5px 9px;font-size:11px;font-weight:600;
  letter-spacing:.08em;cursor:pointer;color:var(--ink)}
.lang button[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.viewtabs{display:flex;gap:4px;margin:-8px 0 20px;border-bottom:1px solid var(--rule)}
.viewtabs button{border:0;border-bottom:3px solid transparent;background:transparent;padding:10px 14px 8px;
  color:var(--ink-2);font:inherit;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
.viewtabs button[aria-pressed="true"]{border-bottom-color:var(--red);color:var(--ink)}
.grid{display:grid;grid-template-columns:minmax(0,1fr);gap:22px}
@media(min-width:880px){.grid{grid-template-columns:288px minmax(0,1fr);gap:32px;align-items:start}}
.lbl{font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);
  margin:0 0 8px;font-weight:600}
.chips{display:flex;gap:8px;flex-wrap:wrap}
.chip{border:1.5px solid var(--ink);background:transparent;border-radius:2px;padding:9px 12px;
  cursor:pointer;text-align:left;flex:1 1 auto;min-width:88px;color:var(--ink);font:inherit}
.chip[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.chip b{display:block;font-size:14px;font-weight:600}
.chip span{display:block;font-size:10.5px;opacity:.7;margin-top:2px;line-height:1.25}
.seg{display:flex;border:1.5px solid var(--ink);border-radius:2px;overflow:hidden}
.seg button{flex:1;border:0;background:transparent;padding:9px 6px;font:inherit;font-size:11px;
  font-weight:600;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;color:var(--ink)}
.seg button[aria-pressed="true"]{background:var(--ink);color:var(--board)}
.seg button+button{border-left:1px solid var(--rule)}
.seg button:focus-visible{outline:2px solid var(--red);outline-offset:-2px}
.shortcuts{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
.scut{border:1px solid var(--rule);background:transparent;border-radius:2px;padding:4px 7px;
  font:inherit;font-size:11px;color:var(--ink-2);cursor:pointer}
.scut:hover{border-color:var(--ink);color:var(--ink)}
.grp{font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-2);
  margin:12px 0 3px;font-weight:600}
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
/* A distance dose runs to four digits, which does not fit a rep counter. */
.num.wide{width:60px}
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
/* The headline and the work tag sit side by side until they cannot: the tag
   is nowrap, so on a narrow phone it has to be allowed onto its own line
   rather than widening the whole card. */
.card-h{padding:16px 18px 12px;border-bottom:1px dashed var(--rule);
  display:flex;align-items:baseline;justify-content:space-between;gap:4px 10px;flex-wrap:wrap}
.fmt{font-size:clamp(24px,7vw,32px);font-weight:700;min-width:0;overflow-wrap:anywhere}
.tag{font-size:10.5px;letter-spacing:.14em;color:var(--ink-2);text-transform:uppercase;white-space:nowrap}
.rows{padding:6px 8px 10px}
.row{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:2px}
.row+.row{border-top:1px solid #EFEEE9}
.row:hover{background:#FAFAF7}
.minute{font-size:10px;letter-spacing:.1em;color:var(--ink-2);width:40px;flex:0 0 40px}
.reps{font-size:19px;font-weight:600;min-width:52px;flex:0 0 auto}
/* A ladder prints every rung, so the dose can be much longer than a rep count. */
/* A ladder prints every rung, so the dose can be much longer than a rep
   count. It is the number you train off, so it keeps one line and the
   movement name takes the wrap instead. */
.reps.long{font-size:12px;letter-spacing:-.02em;white-space:nowrap}
.nm{font-size:15px;line-height:1.25;flex:1 1 auto;min-width:0;overflow-wrap:anywhere}
.nm em{font-style:normal;color:var(--ink-2);font-size:12.5px}
.ico{border:0;background:transparent;cursor:pointer;padding:6px;border-radius:2px;
  color:var(--ink-2);opacity:.55;line-height:0}
.ico:hover{opacity:1;background:#F0EFEA}
.ico[aria-pressed="true"]{opacity:1;color:var(--red)}
.cue{padding:0 18px 16px;font-size:13px;color:var(--ink-2);font-style:italic}
.prev{padding:14px 18px 12px;border-bottom:2px solid var(--ink);background:#FAFAF7}
.prevblock+.prevblock{margin-top:8px}
.prevlist{list-style:none;margin:0;padding:0;font-size:13px;color:var(--ink-2)}
.prevlist li{padding:2px 0}
.prevlist li::before{content:"· ";color:var(--ink-2)}
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
.dayswitch{display:flex;align-items:center;gap:4px;flex-wrap:wrap;margin:0 0 18px}
.dayswitch button{border:1px solid var(--rule);background:#fff;color:var(--ink-2);padding:6px 13px;
  font:inherit;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
.dayswitch button[aria-selected="true"]{background:var(--ink);border-color:var(--ink);color:var(--board)}
.dayswitch-load{margin-left:auto;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.autonote{margin:6px 0 0;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2)}
.day-open{margin-left:auto;border:0;background:transparent;color:var(--red);font:inherit;font-size:10.5px;
  font-weight:700;letter-spacing:.09em;text-transform:uppercase;cursor:pointer;padding:0}
.day-open:hover{text-decoration:underline}
.week{display:grid;gap:18px}
.week-intro,.week-controls{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}
.week-note{max-width:620px;margin:3px 0 0;color:var(--ink-2);font-size:13px;line-height:1.45}
.week-actions{display:flex;gap:8px;flex:0 0 auto}.week-actions .pri{flex:auto}
.week-controls{padding:14px 16px;border:1px solid var(--rule);background:#FAFAF7}
.week-count{min-width:210px}.week-total{display:flex;align-items:baseline;gap:8px;color:var(--ink-2);font-size:12px}
.week-total .lbl{margin:0}.week-total strong{font-size:30px;color:var(--ink)}
.week-balance{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 18px}
.week-axis{display:grid;grid-template-columns:110px 1fr 34px;align-items:center;gap:8px;font-size:10.5px;
  text-transform:uppercase;letter-spacing:.05em;color:var(--ink-2)}
.week-days{display:grid;grid-template-columns:minmax(0,1fr);gap:18px;align-items:start}
@media(min-width:760px){.week-days{grid-template-columns:repeat(2,minmax(0,1fr))}}
.day-card{background:#fff;border:1.5px solid var(--ink);box-shadow:3px 3px 0 rgba(20,23,26,.08)}
.day-head{display:flex;align-items:flex-end;justify-content:space-between;padding:14px 16px 10px;border-bottom:1px solid var(--rule)}
.day-head h2{font-size:27px;margin:2px 0 0}
.day-when{margin:2px 0 0;padding:0 18px 0 0;border:0;background:transparent;color:var(--ink);
  font-size:27px;line-height:1.1;cursor:pointer;appearance:none;-webkit-appearance:none}
.day-when{background-image:linear-gradient(45deg,transparent 50%,var(--ink-2) 50%),linear-gradient(135deg,var(--ink-2) 50%,transparent 50%);
  background-position:right 6px top 15px,right 1px top 15px;background-size:5px 5px;background-repeat:no-repeat}
.day-when:hover{color:var(--red)}.day-kicker{font-size:9px;letter-spacing:.12em;color:var(--ink-2);text-transform:uppercase}
.day-load{font-family:'Barlow Condensed',sans-serif;font-size:28px;font-weight:700}.day-load::after{content:' pts';font-size:10px;color:var(--ink-2)}
.day-config{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:6px;padding:10px 12px;background:#FAFAF7;border-bottom:1px solid var(--rule)}
.day-config label>span{display:block;margin-bottom:3px;font-size:9px;text-transform:uppercase;letter-spacing:.09em;color:var(--ink-2)}
.day-config select{width:100%;min-width:0;padding:6px 5px;border:1px solid var(--rule);background:#fff;color:var(--ink);font:inherit;font-size:11px}
.day-strength{padding:7px 14px;border-bottom:1px dashed var(--rule)}.day-strength .grp{margin:0 0 3px}
.day-strength ul{list-style:none;padding:0;margin:0;color:var(--ink-2);font-size:11.5px}.day-strength li::before{content:'· '}
.day-wod-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:12px 14px 7px}
.day-wod-head h3{font-size:23px;margin:0}.day-wod-head span{font-size:9.5px;text-transform:uppercase;color:var(--ink-2)}
.day-wod ol{list-style:none;padding:0 14px;margin:0}.day-wod li{display:grid;grid-template-columns:auto minmax(0,auto) 1fr;gap:8px;
  align-items:baseline;padding:6px 0;border-top:1px solid #EFEEE9;font-size:12.5px}.day-wod li>span:first-child{font-size:9px;color:var(--ink-2)}
.day-wod li>strong{overflow-wrap:anywhere}
.day-wod .cue{padding:8px 14px 12px;margin:0;font-size:11.5px}
.day-foot{display:flex;gap:10px;flex-wrap:wrap;padding:8px 14px;background:#FAFAF7;border-top:1px solid var(--rule);
  color:var(--ink-2);font-size:10.5px}.day-foot b{color:var(--ink)}
@media(max-width:620px){.week-intro,.week-controls{align-items:stretch;flex-direction:column}.week-actions{width:100%}
  .week-actions .btn{flex:1;justify-content:center}.week-balance{grid-template-columns:1fr}.day-config{grid-template-columns:1fr}}
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
  const [view, setView] = useState(() => (loadPref("view", "day") === "week" ? "week" : "day"));
  const [meterOpen, setMeterOpen] = useState(() => loadPref("meterOpen", true));
  /* A one-rep max is a fact about you rather than about a day, so it stays
     here while everything else about a session lives on the day it belongs
     to. */
  const [oneRM, setOneRM] = useState(() => loadPref("oneRM", {}));

  /* The week is the model and the Day tab is an editor for one of its days,
     so there is one set of configs and both views read and write it. A day is
     addressed by its weekday, not its position: editing one re-sorts the week,
     and an index would then point at a different day than the one you were
     looking at. */
  const [count, setCount] = useState(() => weekCount(loadPref("weekCount", 2)));
  const [configs, setConfigs] = useState(() => normaliseWeek(
    loadPref("weekConfigs", null), weekCount(loadPref("weekCount", 2)),
    { oneRM: loadPref("oneRM", {}), liftRows: loadPref("liftRows", null) },
  ));
  const [weekSeed, setWeekSeed] = useState(() => loadPref("weekSeed", Math.floor(Math.random() * 2 ** 31)));
  const [selectedDay, setSelectedDay] = useState(() => Number(loadPref("selectedDay", -1)));

  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const [time, setTime] = useState("09:45");

  useEffect(() => { savePref("lang", lang); }, [lang]);
  useEffect(() => { savePref("view", view); }, [view]);
  useEffect(() => { savePref("meterOpen", meterOpen); }, [meterOpen]);
  useEffect(() => { savePref("oneRM", oneRM); }, [oneRM]);
  useEffect(() => { savePref("weekCount", count); }, [count]);
  useEffect(() => { savePref("weekConfigs", configs); }, [configs]);
  useEffect(() => { savePref("weekSeed", weekSeed); }, [weekSeed]);
  useEffect(() => { savePref("selectedDay", selectedDay); }, [selectedDay]);
  const t = T[lang];

  const plan = useMemo(() => planWeek(configs, { seed: weekSeed, oneRM }), [configs, weekSeed, oneRM]);
  const summary = useMemo(() => weekSummary(plan), [plan]);

  // An unknown or stale weekday falls back to the first day of the week.
  const index = Math.max(0, configs.findIndex((c) => c.weekday === selectedDay));
  const config = configs[index];
  const env = config.env;
  const liftRows = config.rows;
  const base = plan.find((w) => w.plan.index === index) || null;
  const wod = useMemo(() => (base ? { ...base, cue: cueFor(base, lang) } : null), [base, lang]);

  const patchDay = (patch, at = index) => {
    setConfigs((current) => editWeekDay(current, at, patch));
    if (patch.weekday !== undefined && at === index) setSelectedDay(Number(patch.weekday));
    setCopied(false);
  };

  const changeCount = (next) => {
    const fresh = defaultWeekConfig(next, oneRM);
    setCount(next);
    setConfigs(fresh);
    setSelectedDay(fresh[0].weekday);
  };

  /* Redrawing one day moves that day's seed only. Locks are kept, the way
     "Another" always kept them; pending swaps are dropped, since they name
     movements this draw may not contain. */
  const another = () => patchDay({ nonce: (config.nonce || 0) + 1, swaps: [] });

  const rowKey = (r) => r.liftId || r.moveId;
  const findRow = (id) => liftRows.find((r) => rowKey(r) === id);
  const setRows = (rows) => patchDay({ rows });

  const toggleRow = (id, kind) => setRows(
    liftRows.some((r) => rowKey(r) === id)
      ? liftRows.filter((r) => rowKey(r) !== id)
      : [...liftRows, kind === "lift"
          ? { liftId: id, sets: 5, reps: 5, kg: 0, pct: undefined }
          : defaultAccessoryRow(id)]);

  const editRow = (id, field, value) => setRows(liftRows.map((r) => (rowKey(r) === id
    ? { ...r, [field]: value === "" ? 0 : Number(value), ...(field === "kg" ? { pct: undefined } : {}) }
    : r)));

  // A shortcut swaps the barbell block and leaves the accessory work alone.
  const applyPreset = (id) => setRows(withPreset(liftRows, id, oneRM));

  const isLocked = (moveId) => (config.locks || []).some((l) => l.moveId === moveId);
  const toggleLock = (moveId) => {
    const item = wod?.items.find((i) => i.move.id === moveId);
    patchDay({
      locks: isLocked(moveId)
        ? config.locks.filter((l) => l.moveId !== moveId)
        : [...(config.locks || []), { moveId, reps: item ? item.reps : 0 }],
    });
  };

  /* A swap is stored rather than applied, because the day is rebuilt from its
     config every render. Each one names the movement it replaces and carries
     its own draw, so swapping the same slot twice gives two different answers.
     See applySwaps() in planner.js. */
  const swapOne = (moveId) => patchDay({
    swaps: [...(config.swaps || []), { moveId, nonce: (config.swaps || []).length }],
  });

  const text = useMemo(() => (wod ? asText(wod, lang, env) : ""), [wod, lang, env]);

  const shares = useMemo(() => {
    const sum = wod ? AXES.reduce((s, a) => s + wod.vec[a], 0) || 1 : 1;
    return wod ? Object.fromEntries(AXES.map((a) => [a, wod.vec[a] / sum])) : {};
  }, [wod]);

  const dayWork = useMemo(() => (wod ? Math.round(sessionLoad(wod).total) : 0), [wod]);
  const arriving = wod ? wod.strength : { pre: {}, points: 0 };

  /* The calendar defaults to the next time this weekday comes round, since a
     planned day is a day of the week rather than a date. */
  const date = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + ((config.weekday - d.getDay() + 7) % 7));
    return d.toISOString().slice(0, 10);
  }, [config.weekday]);
  const [dateOverride, setDateOverride] = useState("");
  const useDate = dateOverride || date;

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
    const start = new Date(`${useDate}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    const esc = (v) => v.replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WOD Generator//ES", "BEGIN:VEVENT",
      `UID:${Date.now()}@wodgen`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(start)}`, `DTEND:${z(end)}`,
      `SUMMARY:${esc(headline(wod, lang))}`, `DESCRIPTION:${esc(text)}`, "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [wod, useDate, time, text, lang]);

  const gcalHref = useMemo(() => {
    if (!wod) return "";
    const start = new Date(`${useDate}T${time}:00`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const z = (d) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(headline(wod, lang))}&dates=${z(start)}/${z(end)}&details=${encodeURIComponent(text)}`;
  }, [wod, useDate, time, text, lang]);

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

        <nav className="viewtabs" aria-label={t.planner.title}>
          <button aria-pressed={view === "day"} onClick={() => setView("day")}>{t.planner.today}</button>
          <button aria-pressed={view === "week"} onClick={() => setView("week")}>{t.planner.week}</button>
        </nav>

        {view === "week" ? (
          <WeekPlanner
            lang={lang} oneRM={oneRM} plan={plan} configs={configs} count={count} summary={summary}
            onCount={changeCount} onPatchDay={patchDay}
            onAnotherWeek={() => setWeekSeed(Math.floor(Math.random() * 2 ** 31))}
            onOpenDay={(weekday) => { setSelectedDay(weekday); setView("day"); }}
          />
        ) : (
        <>
        {/* The Day tab is one day of the week, so switching days is how you
            work through it rather than a separate idea. */}
        <div className="dayswitch" role="tablist" aria-label={t.planner.weekday}>
          {configs.map((c, i) => (
            <button key={c.weekday} role="tab" aria-selected={i === index}
              onClick={() => setSelectedDay(c.weekday)}>
              {t.planner.weekdays[c.weekday]}
            </button>
          ))}
          <span className="dayswitch-load mono">{t.planner.weeklyLoad} {Math.round(summary.total)}</span>
        </div>
        <div className="grid">
          <aside>
            <div className="block">
              <p className="lbl">{t.where}</p>
              <div className="chips">
                {ENVS.map((e) => (
                  <button key={e} className="chip" aria-pressed={env === e} onClick={() => patchDay({ env: e })}>
                    <b>{t[e]}</b><span>{t.whereHint[e]}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="block">
              <p className="lbl">{t.effort}</p>
              <div className="seg">
                <button aria-pressed={config.intensity === "auto"}
                  onClick={() => patchDay({ intensity: "auto" })}>{t.planner.auto}</button>
                {INTENSITY.map((i) => (
                  <button key={i.id} aria-pressed={config.intensity === i.id}
                    onClick={() => patchDay({ intensity: i.id })}>{t.intensity[i.id]}</button>
                ))}
              </div>
              {config.intensity === "auto" && wod && (
                <p className="autonote">{t.planner.auto} → {t.intensity[wod.plan.intensity]}</p>
              )}
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

              <p className="grp">{t.mainLifts}</p>
              <ul className="lifts">
                {LIFTS.map((lift) => {
                  const row = findRow(lift.id);
                  const rm = oneRM[lift.id] || 0;
                  const pct = row ? pctFor(row, oneRM) : undefined;
                  return (
                    <li key={lift.id} className={row ? "lift on" : "lift"}>
                      <label className="lname">
                        <input type="checkbox" checked={!!row} onChange={() => toggleRow(lift.id, "lift")} />
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
                          <span className="pct mono">{pct ? `${Math.round(pct * 100)}%` : t.noRM}</span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              <p className="grp">{t.accessory}</p>
              <ul className="lifts">
                {ACCESSORY.map((acc) => {
                  const move = moveById(acc.moveId);
                  const row = findRow(acc.moveId);
                  return (
                    <li key={acc.moveId} className={row ? "lift on" : "lift"}>
                      <label className="lname">
                        <input type="checkbox" checked={!!row} onChange={() => toggleRow(acc.moveId, "acc")} />
                        <span>{move[lang]}</span>
                      </label>
                      {row && (
                        <div className="lfields">
                          <input className="num mono" type="number" min="1" max="20" value={row.sets || ""}
                            aria-label={t.sets} onChange={(e) => editRow(acc.moveId, "sets", e.target.value)} />
                          <span className="x">&times;</span>
                          <input className={move.unit === "reps" ? "num mono" : "num mono wide"}
                            type="number" min="1" max={accessoryRepMax(move)}
                            step={move.step} value={row.reps || ""}
                            aria-label={t.reps} onChange={(e) => editRow(acc.moveId, "reps", e.target.value)} />
                          {move.unit !== "reps" && <span className="unit">{move.unit === "s" ? "s" : move.unit}</span>}
                          {move.side && <span className="unit">{t.perSide}</span>}
                          {acc.refKg > 0 && (
                            <>
                              <input className="num kg mono" type="number" min="0" step="2.5" value={row.kg || ""}
                                aria-label="kg" placeholder={String(acc.refKg)}
                                onChange={(e) => editRow(acc.moveId, "kg", e.target.value)} />
                              <span className="unit">kg</span>
                            </>
                          )}
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
                  <button className="mtoggle disp" onClick={() => setRows([])}>{t.clearLifts}</button>
                </p>
              )}
            </div>
          </aside>

          {wod && (
            <main className="card">
              {/* The barbell work and the accessory work are two blocks of the
                  session, not one: what happens between the lifts and the
                  conditioning piece stands on its own. */}
              {wod.strengthRows?.length > 0 && (
                <div className="prev">
                  {[[t.mainLifts, splitRows(wod.strengthRows).lifts],
                    [t.accessory, splitRows(wod.strengthRows).accessory]]
                    .filter(([, rows]) => rows.length > 0)
                    .map(([label, rows]) => (
                      <div className="prevblock" key={label}>
                        <p className="lbl" style={{ margin: "0 0 4px" }}>{label}</p>
                        <ul className="prevlist">
                          {rows.map((r, i) => <li key={i}>{strengthLine(r, lang, wod.oneRM || {})}</li>)}
                        </ul>
                      </div>
                    ))}
                </div>
              )}
              <div className="card-h">
                <div className="fmt disp">{headline(wod, lang)}</div>
                <div className="tag mono">
                  {wod.fmt.id === "emom" ? t.perMin : wod.fmt.id === "fortime" || wod.fmt.id === "amrap" ? t.perRound : t.total}
                  {" · "}{Math.round(wod.totalWork)}
                </div>
              </div>

              <div className="rows">
                {wod.items.map((it, i) => {
                  const part = repParts(it, lang, env, wod.fmt);
                  return (
                  <div className="row" key={it.move.id}>
                    {wod.fmt.id === "emom" && <span className="minute mono disp">Min {i + 1}</span>}
                    <span className={part.dose.length > 8 ? "reps mono long" : "reps mono"}>{part.dose}</span>
                    <span className="nm">
                      {part.name}
                      {part.side && <em> · {part.side}</em>}
                      {part.kg && <em> · {part.kg}</em>}
                    </span>
                    <button className="ico" title={t.swap} onClick={() => swapOne(it.move.id)}><IconSwap /></button>
                    <button className="ico" title={t.lock} aria-pressed={isLocked(it.move.id)}
                      onClick={() => toggleLock(it.move.id)}>
                      <IconLock on={isLocked(it.move.id)} />
                    </button>
                  </div>
                  );
                })}
                {wod.fmt.id === "emom" && wod.items.length === 3 && (
                  <div className="row"><span className="minute mono disp">Min 4</span>
                    <span className="reps mono">·</span><span className="nm">{t.rest}</span></div>
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
                  const pre = (wod.arriving || wod.strength).pre[a] || 0;
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
                <button className="btn pri" onClick={another}><IconSwap /> {t.another}</button>
                <button className="btn" onClick={doCopy}>{copied ? t.copied : t.copy}</button>
                <button className="btn" onClick={doShare}>{t.share}</button>
                <button className="btn" onClick={() => setCalOpen(!calOpen)}>{t.cal}</button>
              </div>

              {calOpen && (
                <div className="pop">
                  <div className="two">
                    <div><label>{lang === "es" ? "Fecha" : "Date"}</label>
                      <input type="date" value={useDate} onChange={(e) => setDateOverride(e.target.value)} /></div>
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
        </>
        )}
      </div>
    </div>
  );
}
