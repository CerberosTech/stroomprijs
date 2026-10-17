// Stroomprijs static site builder. No dependencies (Node >= 18).
// Fetches day-ahead power + gas prices from the public EnergyZero API (no key), falls back to data/prices.json.
import fs from 'node:fs'; import path from 'node:path';
import { logo, writeAssets } from './lib/brand.mjs';
import { frontMatter, markdown } from './lib/markdown.mjs';
const SITE = 'https://cerberostech.github.io/stroomprijs';
const BASE = '/stroomprijs';
const OUT = 'dist';
const API = 'https://api.energyzero.nl/v1/energyprices';
const TZ = 'Europe/Amsterdam';
const VAT = 1.21;

// ---------- time helpers (Amsterdam) ----------
const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
const parts = d => Object.fromEntries(dtf.formatToParts(d).map(p => [p.type, p.value]));
const ymd = d => { const p = parts(d); return `${p.year}-${p.month}-${p.day}`; };
const hourOf = d => +parts(d).hour;
const nlDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

async function fetchType(usageType, from, till) {
  const u = `${API}?fromDate=${from}&tillDate=${till}&interval=4&usageType=${usageType}&inclBtw=false`;
  const r = await fetch(u, { headers: { 'user-agent': 'stroomprijs (github.com/CerberosTech/stroomprijs)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
  const j = await r.json(); if (!Array.isArray(j.Prices)) throw new Error('no Prices');
  return j.Prices.map(p => ({ t: p.readingDate, p: p.price }));
}
async function getData() {
  const now = new Date(); const today = ymd(now);
  const from = new Date(Date.parse(addDays(today, -1) + 'T12:00:00Z')).toISOString();
  const till = new Date(Date.parse(addDays(today, 2) + 'T12:00:00Z')).toISOString();
  try {
    const [power, gas] = await Promise.all([fetchType(1, from, till), fetchType(3, from, till)]);
    if (power.length < 20) throw new Error('too few power prices');
    const d = { fetched: now.toISOString(), source: 'EnergyZero API (api.energyzero.nl), day-ahead EPEX/ENTSO-E', power, gas, status: 'ok' };
    fs.mkdirSync('data', { recursive: true }); fs.writeFileSync('data/prices.json', JSON.stringify(d));
    return d;
  } catch (e) {
    console.warn('fetch failed, using committed copy:', e.message);
    const d = JSON.parse(fs.readFileSync('data/prices.json', 'utf8')); d.status = 'stale: ' + e.message; return d;
  }
}

const data = await getData();
const now = new Date(); const TODAY = ymd(now); const TOMORROW = addDays(TODAY, 1);
const byDay = (arr, day) => arr.filter(x => ymd(new Date(x.t)) === day).map(x => ({ ...x, h: hourOf(new Date(x.t)), inc: x.p * VAT }));
const P = { today: byDay(data.power, TODAY), tomorrow: byDay(data.power, TOMORROW) };
const G = { today: byDay(data.gas, TODAY), tomorrow: byDay(data.gas, TOMORROW) };
console.log(`power today ${P.today.length}h, tomorrow ${P.tomorrow.length}h; gas today ${G.today.length}h; status ${data.status}`);

// ---------- analysis ----------
const avg = a => a.reduce((s, x) => s + x.p, 0) / (a.length || 1);
function cheapestBlock(a, n) {
  let best = null;
  for (let i = 0; i + n <= a.length; i++) { const s = a.slice(i, i + n); const m = avg(s); if (!best || m < best.avg) best = { start: s[0].h, end: (s[n - 1].h + 1) % 24, avg: m, hours: s, i }; }
  return best;
}
const minOf = a => a.reduce((m, x) => (!m || x.p < m.p ? x : m), null);
const maxOf = a => a.reduce((m, x) => (!m || x.p > m.p ? x : m), null);
const hh = h => String(h).padStart(2, '0') + ':00';
const span = h => `${hh(h)}–${hh((h + 1) % 24)}`;
const nf = (v, d = 1) => v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const ct = (v, d = 1) => nf(v * 100, d) + ' ct';
const eur = (v, d = 3) => '€ ' + v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fetchedNl = new Date(data.fetched).toLocaleString('nl-NL', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });

// ---------- price chart (HTML bars: text stays readable at every screen width) ----------
// Y axis in eurocent with "nice" ticks, zero baseline, daily average line, cheapest 3-hour block, current hour.
// Interactive readout (pointer, touch, arrow keys) is progressive enhancement; the summary and the table carry the data without JS.
let chartId = 0;
function niceStep(range) { const raw = range / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw - 1e-9); }
function chart(a, label, nowH = -1, day = '') {
  if (!a.length) return '<p class="empty">Nog geen prijzen beschikbaar. De day-ahead prijzen voor morgen komen meestal rond 13:00–15:00 uur binnen.</p>';
  const id = `c${++chartId}`, v = a.map(x => x.p * 100), vmax = Math.max(0, ...v), vmin = Math.min(0, ...v);
  const step = niceStep(vmax - vmin || 1), hi = Math.ceil(vmax / step - 1e-9) * step || step, lo = Math.floor(vmin / step + 1e-9) * step;
  const y = c => ((c - lo) / (hi - lo) * 100).toFixed(2);
  const n = Math.min(3, a.length), cb = cheapestBlock(a, n), ni = a.findIndex(x => x.h === nowH), mn = minOf(a), mx = maxOf(a), sel = ni >= 0 ? ni : a.indexOf(mn);
  const ticks = []; for (let t = lo; t <= hi + 1e-9; t += step) ticks.push(Math.abs(t) < 1e-9 ? 0 : t);
  const grid = ticks.map(t => `<span class="gl${t === 0 ? ' z' : ''}" style="bottom:${y(t)}%"><em>${nf(t, step < 1 ? 1 : 0)}</em></span>`).join('');
  const cols = a.map((x, i) => {
    const c = x.p * 100, cls = ['col', i === ni && 'now', i >= cb.i && i < cb.i + n && 'cheap', c < 0 && 'neg'].filter(Boolean).join(' ');
    return `<span class="${cls}" style="--i:${i}" data-h="${x.h}" data-l="${span(x.h)}" data-n="${nf(c)}" data-i="${nf(x.inc * 100)}"><i style="bottom:${y(Math.min(c, 0))}%;height:${(Math.abs(c) / (hi - lo) * 100).toFixed(2)}%"></i></span>`;
  }).join('');
  const quiet = ni >= cb.i - 2 && ni <= cb.i + n + 1; // "nu" pin too close: drop the bracket text, keep the bracket
  const marks = `<span class="mk-cb${quiet ? ' q' : ''}" style="grid-column:${cb.i + 1}/span ${n}"><em>goedkoopst</em></span>${ni >= 0 ? `<span class="mk-nu" style="grid-column:${ni + 1}">nu</span>` : ''}`;
  const s = a[sel], first = ni >= 0 ? 'Nu' : 'Laagste uur';
  const summary = `${label}. Gemiddeld ${ct(avg(a))} per kWh. Laagste prijs ${ct(mn.p)} van ${span(mn.h)}, hoogste ${ct(mx.p)} van ${span(mx.h)}. Goedkoopste blok van ${n} uur: ${hh(cb.start)}–${hh(cb.end)}, gemiddeld ${ct(cb.avg)}.${ni >= 0 ? ` Nu (${span(nowH)}): ${ct(a[ni].p)}.` : ''}`;
  const neg = v.some(c => c < 0);
  return `<figure class="chart">
<p class="ro" aria-live="polite"><span class="ro-t">${first}, ${span(s.h)}</span> <b class="ro-v">${ct(s.p)}</b> <span class="ro-i">per kWh excl. btw, ${ct(s.inc)} incl. btw</span></p>
<div class="plot" tabindex="0" role="group" aria-label="${esc(label)}: staafdiagram per uur. Gebruik de pijltjestoetsen om per uur de prijs te lezen." aria-describedby="${id}-s" data-day="${day}" data-sel="${sel}" style="--n:${a.length}">
<span class="yt" aria-hidden="true">ct/kWh</span><div class="mk" aria-hidden="true">${marks}</div>
<div class="area" aria-hidden="true">${grid}<div class="bars">${cols}</div><span class="avg" style="bottom:${y(avg(a) * 100)}%"></span></div>
<div class="xa" aria-hidden="true">${a.map(x => `<span${x.h % 3 ? '' : ' class="k"'}>${String(x.h).padStart(2, '0')}</span>`).join('')}</div>
</div>
<p class="sr" id="${id}-s">${esc(summary)}</p>
<figcaption class="lg"><span><i class="sw cheap"></i>Goedkoopste ${n} uur</span>${ni >= 0 ? '<span><i class="sw now"></i>Nu</span>' : ''}<span><i class="sw bar"></i>Overige uren</span>${neg ? '<span><i class="sw neg"></i>Negatieve prijs</span>' : ''}<span><i class="sw avgk"></i>Daggemiddelde</span><span class="lg-u">Eurocent per kWh, excl. btw</span></figcaption>
</figure>`;
}
function table(a, unit = 'kWh') {
  if (!a.length) return '';
  return `<details class="tbl"><summary>Alle uurprijzen in een tabel</summary><div class="tbl-w"><table><thead><tr><th scope="col">Uur</th><th scope="col">Excl. btw</th><th scope="col">Incl. 21% btw</th></tr></thead><tbody>${a.map(x => `<tr><td>${hh(x.h)}–${hh((x.h + 1) % 24)}</td><td>${eur(x.p, 4)}</td><td>${eur(x.inc, 4)}</td></tr>`).join('')}</tbody></table></div><p class="note">Prijs per ${unit}. Kale marktprijs; zonder energiebelasting, netbeheerkosten en opslag van je leverancier.</p></details>`;
}
function stats(a) {
  if (a.length < 3) return '';
  const mn = minOf(a), mx = maxOf(a), cb = cheapestBlock(a, 3);
  return `<dl class="stats"><div><dt>Gemiddeld</dt><dd>${ct(avg(a))}</dd><dd class="s">per kWh</dd></div><div><dt>Laagste</dt><dd>${ct(mn.p)}</dd><dd class="s">${span(mn.h)}</dd></div><div><dt>Hoogste</dt><dd>${ct(mx.p)}</dd><dd class="s">${span(mx.h)}</dd></div><div class="hl"><dt>Goedkoopste 3 uur</dt><dd>${hh(cb.start)}–${hh(cb.end)}</dd><dd class="s">gem. ${ct(cb.avg)}</dd></div></dl>`;
}
const ICON = {
  was: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><circle cx="12" cy="13.5" r="4.5"/><path d="M7.5 6h2"/>',
  auto: '<path d="M9 2.5v4.5M15 2.5v4.5M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0zM12 16v5.5"/>',
  vaat: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><path d="M4 8h16M7.5 5.2h1.5M9 12.5v5M12 12.5v5M15 12.5v5"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
function advice(a, dayWord) {
  if (a.length < 4) return '';
  const w = cheapestBlock(a, 2), c = cheapestBlock(a, 4), d = cheapestBlock(a, 3);
  const tip = (k, title, b, n) => `<li><span class="ti">${ico(k)}</span><div><b>${title}</b><span class="tr">${hh(b.start)}–${hh(b.end)}</span><span class="td">${n} uur, gem. ${ct(b.avg)}/kWh</span></div></li>`;
  return `<ul class="tips">${tip('was', `Wasmachine ${dayWord}`, w, 2)}${tip('auto', `Auto laden ${dayWord}`, c, 4)}${tip('vaat', 'Vaatwasser / droger', d, 3)}</ul><p class="note">Berekend op de kale day-ahead prijs. Belasting en opslag zijn per kWh gelijk over de dag, dus het goedkoopste moment blijft hetzelfde.</p>`;
}

// ---------- dagband: 48 hours at a glance, coloured from cheap to expensive ----------
function dagband(rows, nowH) {
  const all = rows.flatMap(r => r[1]); if (!all.length) return '';
  const lo = minOf(all).p, hi = maxOf(all).p, lvl = p => (hi === lo ? 2 : Math.min(4, Math.floor((p - lo) / (hi - lo) * 5)));
  const said = [];
  const html = rows.map(([name, a, day, isToday]) => {
    if (a.length < 3) return `<div class="db-row"><span class="db-l">${name}</span><p class="db-empty">De prijzen voor morgen komen meestal rond 13:00–15:00 uur binnen.</p></div>`;
    const cb = cheapestBlock(a, 3), ni = isToday ? a.findIndex(x => x.h === nowH) : -1, mx = maxOf(a);
    said.push(`${name} goedkoopst van ${hh(cb.start)} tot ${hh(cb.end)}, het duurst van ${span(mx.h)}`);
    return `<div class="db-row"><span class="db-l">${name}</span><div class="db-g" data-day="${day}" style="--n:${a.length}"><span class="db-cb" style="grid-column:${cb.i + 1}/span 3"></span>${a.map((x, i) => `<i class="l${lvl(x.p)}${i === ni ? ' now' : ''}" data-h="${x.h}" style="grid-column:${i + 1}"></i>`).join('')}${ni >= 0 ? `<span class="db-nu" style="grid-column:${ni + 1}">nu</span>` : ''}</div></div>`;
  }).join('');
  return `<div class="db" role="img" aria-label="${esc(`Prijsniveau per uur. ${said.join('. ')}.`)}">${html}<div class="db-row db-xr" aria-hidden="true"><span></span><div class="db-x">${[0, 6, 12, 18].map(h => `<span>${hh(h)}</span>`).join('')}</div></div></div>
<p class="db-lg" aria-hidden="true"><span class="db-sc">Goedkoop <i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i> Duur</span><span class="db-k">Goedkoopste 3 uur</span></p>`;
}

// ---------- layout ----------
const NAV = [['/', 'Dashboard'], ['/stroomprijs-vandaag/', 'Vandaag'], ['/stroomprijs-morgen/', 'Morgen'], ['/gasprijs-vandaag/', 'Gas'], ['/dynamisch-vs-vast-contract/', 'Dynamisch vs vast'], ['/gidsen/', 'Gidsen'], ['/veelgestelde-vragen/', 'FAQ']];
const LOGO = logo();
// Tokens: paper/surface/ink for structure, one teal for "cheap" and links, volt yellow only in the brand and the main action,
// a teal-to-orange diverging scale (grey midpoint) for price levels. Dark mode gets its own steps, not an inversion.
const CSS = `
:root{--paper:#f3f5f6;--surface:#fff;--ink:#0f2230;--ink-2:#4a5c6a;--line:#e1e7ea;--line-2:#c3ced5;--brand:#0a7563;--bar:#7c8f9d;--cheap:#0a7563;--now:#0f2230;--neg:#2f5fc4;--hover:rgba(15,34,48,.06);--band:rgba(10,117,99,.07);--hero:#0f2230;--volt:#ffd23f;
--l0:#1fb595;--l1:#8fd3c1;--l2:#8796a3;--l3:#f4b585;--l4:#f0843a;
--display:"Avenir Next",Avenir,"Segoe UI Variable Display","Segoe UI",system-ui,sans-serif;--text:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--paper:#0a1621;--surface:#102131;--ink:#e8eef2;--ink-2:#9db0be;--line:#1f3546;--line-2:#36536a;--brand:#3cc4a6;--bar:#5f7889;--cheap:#3cc4a6;--now:#f4f7f9;--neg:#86a8f2;--hover:rgba(255,255,255,.07);--band:rgba(60,196,166,.09);--hero:#15293b}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:1rem/1.6 var(--text);background:var(--paper);color:var(--ink);-webkit-font-smoothing:antialiased}
a{color:var(--brand);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--brand);outline-offset:3px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:1rem;top:-3rem;background:var(--ink);color:var(--paper);padding:.5rem .8rem;border-radius:8px;z-index:9}
.skip:focus{top:.6rem}
.in{max-width:68rem;margin:0 auto;padding:0 1rem}
@media(min-width:640px){.in{padding:0 1.5rem}}
h1,h2,h3{font-family:var(--display);line-height:1.15;letter-spacing:-.015em;text-wrap:balance}
h1{font-size:clamp(2rem,1.4rem + 3vw,3rem);font-weight:700;margin:0}
h2{font-size:1.375rem;font-weight:650;margin:2.25rem 0 .75rem}
p{margin:.75rem 0}
.top{border-bottom:1px solid var(--line);background:var(--paper)}
.top .in{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1.5rem;padding-top:.75rem;padding-bottom:.5rem}
.brand{display:inline-flex;color:var(--ink);padding:.25rem 0}
.logo{height:2rem;width:auto;display:block}
.top nav{display:flex;gap:.25rem;overflow-x:auto;scrollbar-width:none;margin:0 -1rem;padding:0 1rem .25rem;width:calc(100% + 2rem)}
.top nav::-webkit-scrollbar{display:none}
.top nav a{color:var(--ink-2);text-decoration:none;font-size:.9375rem;padding:.45rem .7rem;border-radius:999px;white-space:nowrap}
.top nav a:hover{color:var(--ink);background:var(--hover)}
.top nav a[aria-current]{color:var(--ink);background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);font-weight:600}
@media(min-width:880px){.top nav{width:auto;margin:0 0 0 auto;padding:0}}
main{padding-top:1.25rem;padding-bottom:3rem}
.hero{background:var(--hero);color:#fff;border-radius:1.75rem;padding:1.5rem 1.25rem 1.25rem;margin:0 -.5rem}
@media(min-width:640px){.hero{padding:2rem 2rem 1.5rem;margin:0}}
.hero-top{display:grid;gap:.5rem 2rem;align-items:end}
@media(min-width:880px){.hero-top{grid-template-columns:auto 1fr}}
.hero h1{font-size:1.0625rem;font-weight:600;letter-spacing:0;color:#cfdbe4;font-family:var(--text)}
.hero h1 span{font-variant-numeric:tabular-nums}
.price{font-family:var(--display);font-weight:700;font-size:clamp(4.25rem,3rem + 9vw,7rem);line-height:.95;letter-spacing:-.045em;margin:.35rem 0 .5rem;display:flex;align-items:baseline;gap:.6rem;flex-wrap:wrap}
.price .u{font-size:1.125rem;letter-spacing:0;font-weight:600;color:#b7c6d2}
.hero-sub{color:#b7c6d2;margin:0;font-size:.9375rem}
.hero-say{margin:0;font-size:1.0625rem;line-height:1.5;color:#e9f0f4;max-width:34rem}
@media(min-width:880px){.hero-say{justify-self:end;padding-bottom:.4rem}}
.db{margin:1.75rem 0 .5rem;display:grid;gap:.6rem}
.db-row{display:grid;grid-template-columns:minmax(0,1fr);gap:.3rem;align-items:center}
@media(min-width:640px){.db-row{grid-template-columns:5rem minmax(0,1fr);gap:1rem}}
.db-l{font-size:.875rem;font-weight:600;color:#cfdbe4}
.db-g{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));grid-template-rows:.6rem 2.25rem auto;column-gap:2px}
.db-g i{grid-row:2;border-radius:3px;background:var(--l2)}
.db-g i:first-of-type{border-radius:8px 3px 3px 8px}.db-g i:last-of-type{border-radius:3px 8px 8px 3px}
.db-g .l0{background:var(--l0)}.db-g .l1{background:var(--l1)}.db-g .l3{background:var(--l3)}.db-g .l4{background:var(--l4)}
.db-g i.now{box-shadow:0 0 0 2px var(--hero),0 0 0 4px #fff;z-index:1}
.db-cb{grid-row:1;border:2px solid var(--volt);border-bottom:0;border-radius:4px 4px 0 0;margin:0 1px .2rem}
.db-nu{grid-row:3;font-size:.75rem;font-weight:700;text-align:center;margin-top:.2rem;white-space:nowrap;justify-self:center}
.db-empty{margin:0;font-size:.875rem;color:#b7c6d2;border:1px dashed rgba(255,255,255,.25);border-radius:10px;padding:.55rem .8rem}
.db-x{display:grid;grid-template-columns:repeat(4,1fr);font-size:.75rem;color:#9fb1bf;font-variant-numeric:tabular-nums}
.db-lg{display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;font-size:.8125rem;color:#b7c6d2;margin:.75rem 0 0}
@media(min-width:640px){.db-lg{padding-left:6rem}}
.db-sc{display:inline-flex;align-items:center;gap:3px}
.db-sc i{width:.9rem;height:.75rem;border-radius:2px;display:inline-block}
.db-sc i:first-child{margin-left:.35rem}.db-sc i:last-child{margin-right:.35rem}
.db-sc .l0{background:var(--l0)}.db-sc .l1{background:var(--l1)}.db-sc .l2{background:var(--l2)}.db-sc .l3{background:var(--l3)}.db-sc .l4{background:var(--l4)}
.db-k{display:inline-flex;align-items:center;gap:.45rem}
.db-k:before{content:"";width:1.6rem;height:.45rem;border:2px solid var(--volt);border-bottom:0;border-radius:3px 3px 0 0}
.btns{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.5rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;min-height:2.75rem;padding:.55rem 1.05rem;border-radius:.75rem;font-weight:650;text-decoration:none;background:var(--volt);color:#0f2230}
.btn svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.btn.alt{background:transparent;color:#fff;box-shadow:inset 0 0 0 1.5px rgba(255,255,255,.3)}
.btn.alt:hover{box-shadow:inset 0 0 0 1.5px #fff}
.btn:hover{text-decoration:none;filter:brightness(1.05)}
.sec{background:var(--surface);border:1px solid var(--line);border-radius:1.25rem;padding:1.25rem 1rem;margin:1.25rem -.5rem 0}
@media(min-width:640px){.sec{padding:1.75rem 2rem;margin:1.5rem 0 0}}
.sec-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:.25rem 1rem;margin-bottom:.5rem}
.sec-h h2{margin:0}
.sec-h p{margin:0;color:var(--ink-2);font-size:.9375rem}
.sec-h a{margin-left:auto;font-size:.9375rem;font-weight:600}
.pg-h{margin:1rem 0 1.25rem}
.pg-h p{color:var(--ink-2);margin:.4rem 0 0;font-size:1.0625rem}
.chart{margin:.5rem 0 0}
.ro{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .6rem;margin:0 0 .75rem;min-height:3.4rem;font-variant-numeric:tabular-nums}
.ro-t{flex-basis:100%;font-size:.875rem;color:var(--ink-2)}
.ro-v{font-family:var(--display);font-size:1.75rem;font-weight:700;letter-spacing:-.02em}
.ro-i{font-size:.875rem;color:var(--ink-2)}
.plot{display:grid;grid-template-columns:2.25rem minmax(0,1fr);grid-template-rows:auto 1.5rem clamp(10.5rem,40vw,15.5rem) auto;touch-action:pan-y;border-radius:.5rem;cursor:crosshair}
.plot:focus-visible{outline-offset:6px}
.yt{grid-row:1;grid-column:1/-1;font-size:.75rem;color:var(--ink-2)}
.mk{grid-row:2;grid-column:2;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));align-items:end;font-size:.75rem;line-height:1}
.mk-cb{grid-row:1;border:2px solid var(--cheap);border-bottom:0;border-radius:4px 4px 0 0;height:.45rem;margin:0 2px .25rem;position:relative}
.mk-cb em{position:absolute;bottom:.55rem;left:50%;transform:translateX(-50%);font-style:normal;font-weight:600;color:var(--ink-2);white-space:nowrap}
.mk-cb.q em{display:none}
.mk-nu{grid-row:1;justify-self:center;align-self:end;background:var(--now);color:var(--surface);font-weight:700;padding:.18rem .35rem;border-radius:4px;margin-bottom:.2rem;position:relative;z-index:1}
.area{grid-row:3;grid-column:1/-1;position:relative}
.gl{position:absolute;left:2.25rem;right:0;border-top:1px solid var(--line);height:0}
.gl.z{border-top-color:var(--line-2)}
.gl em{position:absolute;right:calc(100% + .45rem);top:0;transform:translateY(-50%);font-style:normal;font-size:.75rem;color:var(--ink-2);font-variant-numeric:tabular-nums}
.bars{position:absolute;inset:0 0 0 2.25rem;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr))}
.col{position:relative;border-radius:4px}
.col i{position:absolute;left:50%;width:min(72%,1.5rem);margin-left:max(-36%,-.75rem);min-height:2px;background:var(--bar);border-radius:4px 4px 0 0;transform-origin:bottom;animation:grow .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(var(--i) * 18ms)}
.col.neg i{background:var(--neg);border-radius:0 0 4px 4px;transform-origin:top}
.col.cheap i{background:var(--cheap)}
.col.now i{background:var(--now)}
.col.sel{background:var(--hover)}
.avg{position:absolute;left:2.25rem;right:0;border-top:1.5px solid var(--ink);opacity:.55;pointer-events:none}
@keyframes grow{from{transform:scaleY(0)}}
@media(prefers-reduced-motion:reduce){.col i{animation:none}}
.xa{grid-row:4;grid-column:2;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));font-size:.75rem;color:var(--ink-2);text-align:center;padding-top:.4rem;font-variant-numeric:tabular-nums}
@media(max-width:639px){.xa span:not(.k){visibility:hidden}}
.lg{display:flex;flex-wrap:wrap;gap:.35rem 1.1rem;font-size:.8125rem;color:var(--ink-2);margin-top:.85rem}
.lg span{display:inline-flex;align-items:center;gap:.4rem}
.sw{width:.8rem;height:.8rem;border-radius:3px;display:inline-block}
.sw.cheap{background:var(--cheap)}.sw.now{background:var(--now)}.sw.bar{background:var(--bar)}.sw.neg{background:var(--neg)}
.sw.avgk{height:0;border-top:1.5px solid var(--ink);opacity:.55;border-radius:0;width:1.1rem}
.lg-u{flex-basis:100%}
@media(min-width:880px){.lg-u{flex-basis:auto;margin-left:auto}}
.empty{border:1px dashed var(--line-2);border-radius:.75rem;padding:1rem;color:var(--ink-2);margin:.5rem 0 0}
.stats{display:grid;grid-template-columns:repeat(2,1fr);margin:1.5rem 0 0;border-top:1px solid var(--line)}
@media(min-width:880px){.stats{grid-template-columns:repeat(4,1fr)}}
.stats div{padding:.85rem 0 .85rem .9rem;border-bottom:1px solid var(--line);border-left:1px solid var(--line)}
.stats div:nth-child(odd){border-left:0;padding-left:0}
@media(min-width:880px){.stats div{border-bottom:0}.stats div:nth-child(odd){border-left:1px solid var(--line);padding-left:.9rem}.stats div:first-child{border-left:0;padding-left:0}}
.stats dt{font-size:.8125rem;color:var(--ink-2)}
.stats dd{margin:0;font-family:var(--display);font-size:1.375rem;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.stats dd.s{font-family:var(--text);font-size:.8125rem;font-weight:400;color:var(--ink-2);letter-spacing:0}
.stats .hl dd:not(.s){color:var(--cheap)}
.tips{list-style:none;padding:0;margin:1.5rem 0 0;display:grid;gap:.75rem}
.sec>.tips:first-child{margin-top:0}
@media(min-width:640px){.tips{grid-template-columns:repeat(3,1fr)}}
.tips li{display:flex;gap:.8rem;align-items:flex-start;background:var(--band);border-radius:1rem;padding:.9rem 1rem}
.ti{flex:none;width:2.4rem;height:2.4rem;border-radius:.7rem;background:var(--surface);display:grid;place-items:center;color:var(--cheap);box-shadow:inset 0 0 0 1px var(--line)}
.ti svg{width:1.4rem;height:1.4rem;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.tips b{display:block;font-size:.875rem;font-weight:600;color:var(--ink-2)}
.tr{display:block;font-family:var(--display);font-size:1.3rem;font-weight:700;letter-spacing:-.01em;font-variant-numeric:tabular-nums}
.td{display:block;font-size:.8125rem;color:var(--ink-2)}
.note{font-size:.8125rem;color:var(--ink-2);margin:.85rem 0 0;max-width:46rem}
.tbl{margin-top:1.25rem;border-top:1px solid var(--line);padding-top:.75rem}
.tbl summary{cursor:pointer;font-weight:600;color:var(--brand);padding:.35rem 0;min-height:2.75rem;display:flex;align-items:center;gap:.7rem;list-style:none}
.tbl summary::-webkit-details-marker{display:none}
.tbl summary:before{content:"";width:.5rem;height:.5rem;border:solid currentColor;border-width:0 2px 2px 0;transform:rotate(-45deg);transition:transform .15s}
.tbl[open] summary:before{transform:rotate(45deg)}
.tbl-w{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:.9375rem;font-variant-numeric:tabular-nums}
th,td{padding:.55rem .6rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{font-size:.8125rem;font-weight:600;color:var(--ink-2)}
tbody tr:hover td{background:var(--hover)}
.ph{border:2px dashed var(--line-2);border-radius:1.25rem;padding:1.25rem;margin:1.5rem 0 0;color:var(--ink-2);display:grid;gap:.3rem;text-align:left}
.ph b{color:var(--ink);font-family:var(--display);font-size:1.0625rem}
.ph .small{font-size:.875rem}
.duo{display:grid;gap:1.25rem;margin-top:1.5rem}
@media(min-width:880px){.duo{grid-template-columns:1fr 1fr}}
.duo .sec{margin-top:0}
.duo h2{margin-top:0}
.fig{font-family:var(--display);font-size:clamp(2.5rem,2rem + 3vw,3.5rem);font-weight:700;letter-spacing:-.03em;line-height:1;margin:.25rem 0 .5rem}
.fig small{font-size:1rem;font-weight:600;letter-spacing:0;color:var(--ink-2);margin-left:.4rem}
.links{list-style:none;padding:0;margin:0}
.links li{border-top:1px solid var(--line)}
.links li:first-child{border-top:0}
.links a{display:block;padding:.7rem 0;font-weight:600;text-decoration:none}
.links a:hover{text-decoration:underline}
.updated{font-size:.8125rem;color:var(--ink-2);margin:1.5rem 0 0}
.prose{max-width:42rem}
.prose p,.prose li{font-size:1.0625rem}
.prose ul{padding-left:1.2rem}
.prose li{margin:.35rem 0}
.prose ol{padding-left:1.4rem}
.prose h3{font-size:1.125rem;font-weight:650;margin:1.75rem 0 .5rem}
.prose blockquote{margin:1.25rem 0;padding:.1rem 0 .1rem 1rem;border-left:3px solid var(--brand);color:var(--ink-2)}
.prose code{font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--hover);padding:.1em .35em;border-radius:4px}
.prose pre{background:var(--surface);border:1px solid var(--line);border-radius:.75rem;padding:.9rem 1rem;overflow-x:auto}
.prose pre code{background:none;padding:0;font-size:.875rem}
.prose hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.prose .ai-note{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.875rem;color:var(--ink-2)}
.crumb{margin:0 0 .4rem;font-size:.9375rem}
.sec.gi{margin-bottom:2.5rem}
.guides{list-style:none;padding:0;margin:0;display:grid;gap:1rem}
.guides li{border-top:1px solid var(--line);padding-top:1rem}
.guides li:first-child{border-top:0;padding-top:0}
.guides h2{margin:0;font-size:1.25rem}
.guides h2 a{text-decoration:none}
.guides h2 a:hover{text-decoration:underline}
.guides p{margin:.35rem 0 0;color:var(--ink)}
.guides time{font-size:.8125rem;color:var(--ink-2)}
.cmp th[scope=row]{color:var(--ink);font-size:.9375rem}
.cmp thead th{font-family:var(--display);font-size:1rem;color:var(--ink)}
@media(max-width:639px){.cmp thead{display:none}.cmp tr{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;border-bottom:1px solid var(--line);padding:.6rem 0}.cmp tr:last-child{border-bottom:0}.cmp th,.cmp td{border:0;padding:.2rem 0}.cmp th[scope=row]{grid-column:1/-1;font-family:var(--display);font-size:1rem}.cmp td:before{content:attr(data-l);display:block;font-size:.75rem;font-weight:600;color:var(--ink-2)}}
.faq{max-width:46rem;margin-top:1rem}
.qa{border-top:1px solid var(--line);padding:1.25rem 0 .5rem}
.qa h2{margin:0;font-size:1.25rem}
.qa p{color:var(--ink);margin:.5rem 0 0}
.foot{border-top:1px solid var(--line);padding:2rem 0 2.5rem;font-size:.875rem;color:var(--ink-2)}
.foot .in{display:grid;gap:.25rem}
.foot .logo{height:1.6rem;margin-bottom:.5rem;color:var(--ink)}
.foot p{margin:.35rem 0;max-width:46rem}
.foot a{color:var(--ink-2)}
.foot a:hover{color:var(--ink)}
@media(forced-colors:active){.col i,.db-g i,.sw{forced-color-adjust:none}}
@media print{.top nav,.btns,.ph,.skip{display:none}.hero{color:#000;background:none;border:1px solid #999}}
`.replace(/\s*\n\s*/g, '');

// Client script: interactive chart readout + moves the "nu" markers if the page is served in a later hour than it was built.
const JS = `(()=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Amsterdam',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(x=>[x.type,x.value])),day=p.year+'-'+p.month+'-'+p.day,hr=+p.hour;
document.querySelectorAll('.db-g').forEach(g=>{if(g.dataset.day!==day)return;const c=[...g.querySelectorAll('i')],k=c.findIndex(i=>+i.dataset.h===hr),pin=g.querySelector('.db-nu');if(k<0||c[k].classList.contains('now')||!pin)return;c.forEach(i=>i.classList.toggle('now',i===c[k]));pin.style.gridColumn=k+1});
document.querySelectorAll('.plot').forEach(pl=>{const cols=[...pl.querySelectorAll('.col')],ro=pl.parentElement.querySelector('.ro'),[rt,rv,ri]=ro.children,pin=pl.querySelector('.mk-nu');let def=+pl.dataset.sel,cur=def;
if(pl.dataset.day===day&&pin){const k=cols.findIndex(c=>+c.dataset.h===hr);if(k>=0&&!cols[k].classList.contains('now')){cols.forEach(c=>c.classList.toggle('now',c===cols[k]));pin.style.gridColumn=k+1;def=cur=k;const d=cols[k].dataset,set=(id,t)=>{const e=document.getElementById(id);if(e)e.textContent=t};set('nu-h',d.l);set('nu-v',d.n);set('nu-i',d.i+' ct')}}
const show=(k,mark)=>{const c=cols[k],d=c.dataset;cols.forEach(x=>x.classList.toggle('sel',mark&&x===c));rt.textContent=(c.classList.contains('now')?'Nu, ':k===def?'Laagste uur, ':'')+d.l;rv.textContent=d.n+' ct';ri.textContent='per kWh excl. btw, '+d.i+' ct incl. btw'};
const at=e=>{const r=pl.querySelector('.bars').getBoundingClientRect();return Math.max(0,Math.min(cols.length-1,Math.floor((e.clientX-r.left)/r.width*cols.length)))};
show(def,false);
pl.addEventListener('pointermove',e=>show(cur=at(e),true));pl.addEventListener('pointerdown',e=>show(cur=at(e),true));
pl.addEventListener('pointerleave',e=>{if(e.pointerType!=='touch'&&document.activeElement!==pl)show(cur=def,false)});
pl.addEventListener('focus',()=>show(cur,true));pl.addEventListener('blur',()=>show(cur=def,false));
pl.addEventListener('keydown',e=>{const m={ArrowRight:1,ArrowLeft:-1,ArrowUp:1,ArrowDown:-1}[e.key];if(m)cur=Math.max(0,Math.min(cols.length-1,cur+m));else if(e.key==='Home')cur=0;else if(e.key==='End')cur=cols.length-1;else return;e.preventDefault();show(cur,true)})})})()`.replace(/\n/g, '');

const CAL = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const RSS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.2"/></svg>';
const GOATCOUNTER = '<script data-goatcounter="https://stroomprijs.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>';
const jsonLd = o => JSON.stringify(o).replace(/</g, '\\u003c'); // no "</script>" from content inside the JSON-LD block
function page(p, { title, desc, body, schema, type = 'website', modified }) {
  const url = SITE + p;
  const nav = NAV.map(([h, t]) => `<a href="${BASE}${h}"${h === p || (h !== '/' && p.startsWith(h)) ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const js = /class="(plot|db-g)/.test(body) ? `<script>${JS}</script>` : '';
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f3f5f6" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0a1621" media="(prefers-color-scheme: dark)"><link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml"><link rel="icon" href="${BASE}/favicon.png" sizes="64x64" type="image/png"><link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png"><link rel="manifest" href="${BASE}/site.webmanifest"><meta property="og:type" content="${type}">${modified ? `<meta property="article:modified_time" content="${modified}">` : ''}<meta property="og:locale" content="nl_NL"><meta property="og:site_name" content="Stroomprijs"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Stroomprijs: dynamische stroomprijs per uur, vandaag en morgen, met de goedkoopste uren"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og.png"><link rel="alternate" type="application/rss+xml" title="Goedkoopste uren morgen" href="${SITE}/feed.xml">${schema ? `<script type="application/ld+json">${jsonLd(schema)}</script>` : ''}${GOATCOUNTER}<style>${CSS}</style></head><body><a class="skip" href="#main">Naar de inhoud</a><header class="top"><div class="in"><a class="brand" href="${BASE}/">${LOGO}</a><nav aria-label="Hoofdmenu">${nav}</nav></div></header><main id="main" class="in">${body}</main><footer class="foot"><div class="in">${LOGO}<p>Bron: day-ahead prijzen (EPEX Spot, gepubliceerd via <a href="https://transparency.entsoe.eu/">ENTSO-E</a>) opgehaald via de publieke <a href="https://www.energyzero.nl/">EnergyZero</a>-API. Laatst bijgewerkt: ${esc(fetchedNl)}. Wordt elk uur ververst. Geen advies; controleer de tarieven van je eigen leverancier.</p><p><a href="${BASE}/privacy/">Privacy &amp; disclosure</a> · <a href="${BASE}/feed.xml">RSS</a> · <a href="${BASE}/goedkoopste-uren.ics">Agenda (.ics)</a> · <a href="https://github.com/CerberosTech/stroomprijs">Broncode</a></p><p>Meer gratis tools: <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidiechecker warmtepompen</a> · <a href="https://cerberostech.github.io/deadorsupported/">Dead or Supported</a></p></div></footer>${js}</body></html>`;
  const f = path.join(OUT, p, p.endsWith('/') ? 'index.html' : ''); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html);
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync('static')) fs.copyFileSync(path.join('static', f), path.join(OUT, f));
const assets = writeAssets(fs, path, OUT); // logo mark, favicons, og.png/og.svg: rendered from code, no binary files in the repo
fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({ name: 'Stroomprijs', short_name: 'Stroomprijs', description: 'Dynamische stroomprijs per uur, vandaag en morgen.', lang: 'nl', start_url: `${BASE}/`, scope: `${BASE}/`, display: 'standalone', background_color: '#f3f5f6', theme_color: '#0f2230', icons: [{ src: `${BASE}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: `${BASE}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }, { src: `${BASE}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }] }));
console.log('brand assets:', assets.join(', '));

const nowH = hourOf(now); const cur = P.today.find(x => x.h === nowH);
const placeholder = `<aside class="ph" id="vergelijker"><b>Hier komt later een energievergelijker</b><span class="small">Placeholder voor een toekomstige vergelijkingswidget (Daisycon). Er staat nu niets en we hebben op dit moment geen affiliate-afspraken. <a href="${BASE}/privacy/">Lees de disclosure</a>.</span></aside>`;
const updated = `<p class="updated">Prijzen excl. btw, energiebelasting en leveranciersopslag. Bijgewerkt ${esc(fetchedNl)}${data.status !== 'ok' ? ' (let op: laatste ophaalpoging mislukt, dit zijn de laatst bekende prijzen)' : ''}.</p>`;

// Dashboard
const tAvg = avg(P.today), tBlock = P.today.length >= 3 ? cheapestBlock(P.today, 3) : null, mBlock = P.tomorrow.length >= 3 ? cheapestBlock(P.tomorrow, 3) : null;
function verdict() {
  if (!cur || !tBlock) return '';
  const blk = `${hh(tBlock.start)}–${hh(tBlock.end)}`, inBlock = tBlock.hours.includes(cur), past = tBlock.hours[tBlock.hours.length - 1].h < nowH;
  const rel = inBlock ? `Je zit nu in het goedkoopste blok van 3 uur van vandaag (${blk}).` : `Nu ${ct(Math.abs(cur.p - tAvg))} ${cur.p <= tAvg ? 'onder' : 'boven'} het daggemiddelde van ${ct(tAvg)}.`;
  const next = inBlock ? '' : past ? (mBlock ? ` Het goedkoopste blok van vandaag (${blk}) is voorbij; morgen is dat ${hh(mBlock.start)}–${hh(mBlock.end)}.` : ` Het goedkoopste blok van vandaag (${blk}) is voorbij.`) : ` Het goedkoopste blok van 3 uur is ${blk}.`;
  return `<p class="hero-say">${rel}${next}</p>`;
}
const hero = `<section class="hero" aria-labelledby="nu"><div class="hero-top"><div><h1 id="nu">Stroomprijs nu <span id="nu-h">${span(nowH)}</span></h1>${cur ? `<p class="price"><span id="nu-v">${nf(cur.p * 100)}</span><span class="u">ct/kWh</span></p><p class="hero-sub">Excl. btw. Met 21% btw: <span id="nu-i">${ct(cur.inc)}</span> per kWh.</p>` : '<p class="price">Onbekend</p>'}</div>${verdict()}</div>
${dagband([['Vandaag', P.today, TODAY, true], ['Morgen', P.tomorrow, TOMORROW, false]], nowH)}
<div class="btns"><a class="btn" href="${BASE}/goedkoopste-uren.ics">${CAL}Goedkoopste uren in je agenda</a><a class="btn alt" href="${BASE}/feed.xml">${RSS}RSS-feed</a></div></section>`;
page('/', { title: 'Stroomprijs vandaag en morgen – dynamische energieprijzen per uur', desc: `Actuele dynamische stroomprijs per uur voor vandaag en morgen, het goedkoopste blok van 3 uur en het beste moment om te wassen of je auto te laden.`, schema: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Stroomprijs', url: SITE + '/', inLanguage: 'nl-NL' }, body: `${hero}
<section class="sec" aria-labelledby="vandaag"><div class="sec-h"><h2 id="vandaag">Vandaag</h2><p>${nlDate(TODAY)}</p><a href="${BASE}/stroomprijs-vandaag/">Alle uurprijzen van vandaag</a></div>${chart(P.today, 'Stroomprijs per uur vandaag', nowH, TODAY)}${stats(P.today)}${advice(P.today, 'vandaag')}</section>
<section class="sec" aria-labelledby="morgen"><div class="sec-h"><h2 id="morgen">Morgen</h2><p>${nlDate(TOMORROW)}</p><a href="${BASE}/stroomprijs-morgen/">Alle uurprijzen van morgen</a></div>${chart(P.tomorrow, 'Stroomprijs per uur morgen', -1, TOMORROW)}${stats(P.tomorrow)}${advice(P.tomorrow, 'morgen')}</section>
${placeholder}
<div class="duo"><section class="sec"><h2>Gasprijs vandaag</h2>${G.today.length ? `<p class="fig">${eur(avg(G.today), 3)}<small>per m³</small></p><p class="note">Excl. btw (${eur(avg(G.today) * VAT, 3)} incl.). <a href="${BASE}/gasprijs-vandaag/">Details van de gasprijs</a></p>` : '<p>Geen gasprijs beschikbaar.</p>'}</section><section class="sec"><h2>Meer weten?</h2><ul class="links"><li><a href="${BASE}/dynamisch-vs-vast-contract/">Dynamisch vs vast contract</a></li><li><a href="${BASE}/veelgestelde-vragen/">Veelgestelde vragen</a></li><li><a href="https://cerberostech.github.io/isde-checker/">Subsidie op je warmtepomp checken (ISDE)</a></li></ul></section></div>${updated}` });

// Vandaag / morgen
page('/stroomprijs-vandaag/', { title: `Stroomprijs vandaag (${nlDate(TODAY)}) – prijs per uur`, desc: 'De dynamische stroomprijs van vandaag per uur, met goedkoopste en duurste uur en het goedkoopste blok van 3 uur.', body: `<header class="pg-h"><h1>Stroomprijs vandaag</h1><p>${nlDate(TODAY)}</p></header><section class="sec">${chart(P.today, 'Stroomprijs per uur vandaag', nowH, TODAY)}${stats(P.today)}${table(P.today)}</section><section class="sec">${advice(P.today, 'vandaag')}</section><div class="prose"><p>De prijzen komen uit de day-ahead veiling van EPEX Spot voor het Nederlandse biedgebied. Die veiling vindt de dag ervoor rond 12:00 uur plaats; de uitslag wordt ook gepubliceerd op het ENTSO-E Transparency Platform. Bekijk ook de <a href="${BASE}/stroomprijs-morgen/">stroomprijs van morgen</a>.</p></div>${placeholder}${updated}` });
page('/stroomprijs-morgen/', { title: `Stroomprijs morgen (${nlDate(TOMORROW)}) – prijs per uur`, desc: 'De dynamische stroomprijs van morgen per uur, zodra de day-ahead veiling bekend is (meestal rond 13:00–15:00 uur).', body: `<header class="pg-h"><h1>Stroomprijs morgen</h1><p>${nlDate(TOMORROW)}</p></header><section class="sec">${chart(P.tomorrow, 'Stroomprijs per uur morgen', -1, TOMORROW)}${stats(P.tomorrow)}${table(P.tomorrow)}</section>${P.tomorrow.length >= 4 ? `<section class="sec">${advice(P.tomorrow, 'morgen')}</section>` : ''}<div class="prose"><p>Morgen plannen? Abonneer je op de <a href="${BASE}/goedkoopste-uren.ics">agenda met de goedkoopste uren</a> of de <a href="${BASE}/feed.xml">RSS-feed</a>. De prijzen van morgen worden bekend na de day-ahead veiling (rond 12:00 uur); deze site ververst elk uur.</p></div>${placeholder}${updated}` });

// Gas
const gT = G.today, gMorgen = G.tomorrow;
page('/gasprijs-vandaag/', { title: `Gasprijs vandaag (${nlDate(TODAY)}) – dynamische gasprijs per m³`, desc: 'De dynamische gasprijs van vandaag per m³, gebaseerd op de day-ahead gasmarkt (TTF), via EnergyZero.', body: `<header class="pg-h"><h1>Gasprijs vandaag</h1><p>${nlDate(TODAY)}</p></header><section class="sec">${gT.length ? `<p class="fig">${eur(avg(gT), 3)}<small>per m³</small></p><p class="note">Gemiddeld per m³ excl. btw. Met 21% btw: ${eur(avg(gT) * VAT, 3)}.</p>${gMorgen.length ? `<p>Morgen: <b>${eur(avg(gMorgen), 3)}</b> per m³ excl. btw.</p>` : ''}${table(gT, 'm³')}` : '<p>Geen gasprijs beschikbaar.</p>'}</section><div class="prose"><h2>Hoe werkt een dynamische gasprijs?</h2><p>Bij een dynamisch gascontract betaal je de marktprijs voor aardgas plus een vaste opslag van je leverancier, energiebelasting en btw. De marktprijs volgt de Nederlandse groothandelsmarkt TTF en verandert per dag (niet per uur zoals stroom); leveranciers gebruiken een gasdag van 06:00 tot 06:00 uur. Wil je minder gas gebruiken? Check of je <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidie op een warmtepomp</a> kunt krijgen.</p></div>${placeholder}${updated}` });

// Dynamisch vs vast
const row = (k, a, b) => `<tr><th scope="row">${k}</th><td data-l="Dynamisch">${a}</td><td data-l="Vast">${b}</td></tr>`;
page('/dynamisch-vs-vast-contract/', { title: 'Dynamisch vs vast energiecontract – de verschillen op een rij', desc: 'Feitelijke vergelijking van een dynamisch, variabel en vast energiecontract: hoe de prijs tot stand komt, risico’s en voor wie het past. Met bronnen.', body: `<header class="pg-h"><h1>Dynamisch vs vast energiecontract</h1></header><section class="sec"><div class="tbl-w"><table class="cmp"><thead><tr><td></td><th scope="col">Dynamisch</th><th scope="col">Vast</th></tr></thead><tbody>${row('Prijs stroom', 'Verandert per uur (day-ahead marktprijs + opslag)', 'Vaste prijs per kWh voor de looptijd (1–5 jaar)')}${row('Prijs gas', 'Verandert per dag', 'Vast voor de looptijd')}${row('Risico', 'Je draagt het marktrisico: pieken én dalen', 'Leverancier draagt het risico; je betaalt daar een premie voor')}${row('Opzeggen', 'Meestal maandelijks opzegbaar', 'Opzegvergoeding mogelijk bij vroegtijdig opzeggen')}${row('Slimme meter', 'Nodig', 'Niet nodig')}${row('Voordeel als…', 'Je verbruik kunt verschuiven (EV, warmtepomp, thuisbatterij, wasmachine)', 'Je zekerheid wilt over je maandbedrag')}</tbody></table></div></section>
<div class="prose"><h2>Hoe komt de dynamische prijs tot stand?</h2><p>Elke dag rond 12:00 uur sluit de day-ahead veiling van EPEX Spot. Daarin wordt per tijdsblok de groothandelsprijs voor stroom in Nederland voor de volgende dag bepaald. De uitkomst is openbaar via het ENTSO-E Transparency Platform. Je leverancier rekent die prijs door, plus een opslag (inkoopvergoeding), energiebelasting, en 21% btw. Daarnaast betaal je vaste leveringskosten en netbeheerkosten. Op zonnige of winderige momenten kan de marktprijs zelfs negatief worden.</p>
<h2>Wat zijn de risico’s?</h2><p>Als de groothandelsprijs stijgt, zoals in 2022, stijgt je rekening direct mee. Bij een vast contract ben je daartegen beschermd zolang het contract loopt. Een dynamisch contract loont vooral als je stroom gebruikt wanneer die goedkoop is.</p>
<h2>Terugleveren en de salderingsregeling</h2><p>De salderingsregeling voor zonnepanelen stopt per 1 januari 2027. Daarna krijg je voor teruggeleverde stroom een terugleververgoeding van je leverancier. Bij een dynamisch contract hangt die vergoeding vaak af van de uurprijs, dus op momenten met negatieve prijzen kan terugleveren geld kosten. Check de voorwaarden van je leverancier.</p>
<h2>Bronnen</h2><ul><li><a href="https://www.consuwijzer.nl/energie/energiecontract/dynamisch-energiecontract">ConsuWijzer (ACM): dynamisch energiecontract</a></li><li><a href="https://www.rijksoverheid.nl/onderwerpen/energie-thuis/salderingsregeling">Rijksoverheid: salderingsregeling</a></li><li><a href="https://www.belastingdienst.nl/wps/wcm/connect/nl/energiebelasting/energiebelasting">Belastingdienst: energiebelasting</a></li><li><a href="https://transparency.entsoe.eu/">ENTSO-E Transparency Platform</a></li><li><a href="https://www.epexspot.com/en/market-results">EPEX Spot market results</a></li></ul></div>${placeholder}` });

// FAQ
const faq = [
  ['Waar komen deze prijzen vandaan?', 'Uit de day-ahead veiling van EPEX Spot voor Nederland (ook gepubliceerd op het ENTSO-E Transparency Platform). We halen ze elk uur op via de gratis, publieke API van EnergyZero.'],
  ['Zijn dit de prijzen die ik betaal?', 'Nee, dit is de kale marktprijs. Je betaalt daarbovenop de opslag van je leverancier, energiebelasting, 21% btw, vaste leveringskosten en netbeheerkosten. Het verloop over de dag (wanneer het goedkoop is) is wel gelijk.'],
  ['Hoe laat zijn de prijzen van morgen bekend?', 'De day-ahead veiling sluit rond 12:00 uur. De uitslag is meestal rond 13:00 uur bekend; deze site ververst elk uur, dus uiterlijk een uur later staan ze hier.'],
  ['Waarom is de stroomprijs soms negatief?', 'Als er veel zon- en windstroom is en weinig vraag, is er meer aanbod dan nodig. Producenten betalen dan soms om hun stroom kwijt te raken. Met een dynamisch contract kun je daarvan profiteren.'],
  ['Wanneer kan ik het beste mijn wasmachine aanzetten?', 'Op het dashboard staat per dag het goedkoopste blok van 2 uur (wasmachine), 3 uur (vaatwasser/droger) en 4 uur (auto laden).'],
  ['Hoe gebruik ik de agenda-feed?', 'Voeg de .ics-link toe als geabonneerde agenda in Google Agenda, Outlook of Apple Agenda. Je ziet dan automatisch het goedkoopste blok van 3 uur van vandaag en morgen.'],
  ['Kost deze site geld of verzamelt hij gegevens?', 'Nee. De site is gratis, zonder account en zonder cookies van ons. Zie de privacypagina.'],
];
page('/veelgestelde-vragen/', { title: 'Veelgestelde vragen over dynamische energieprijzen', desc: 'Antwoorden op veelgestelde vragen over dynamische stroom- en gasprijzen, negatieve prijzen en wanneer de prijzen van morgen bekend zijn.', schema: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, body: `<header class="pg-h"><h1>Veelgestelde vragen</h1></header><div class="faq">${faq.map(([q, a]) => `<section class="qa"><h2>${esc(q)}</h2><p>${esc(a)}</p></section>`).join('')}</div>` });

// Privacy
page('/privacy/', { title: 'Privacy & disclosure – Stroomprijs', desc: 'Privacyverklaring en disclosure: geen affiliates, geen account, open bron.', body: `<header class="pg-h"><h1>Privacy &amp; disclosure</h1></header><div class="prose"><h2>Geen affiliates (nog)</h2><p>Deze site heeft op dit moment <b>geen affiliate- of partnerafspraken</b> met energieleveranciers of vergelijkers. We verdienen niets aan je keuze. Op de site staat een duidelijk gemarkeerde lege plek waar in de toekomst mogelijk een vergelijkingswidget (bijvoorbeeld via Daisycon) komt. Als dat gebeurt, passen we deze pagina aan en markeren we die links als affiliate.</p><h2>Privacy</h2><p>Geen account, geen formulieren, geen eigen cookies. De site wordt gehost op GitHub Pages; GitHub kan technische gegevens zoals je IP-adres loggen (zie de <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacyverklaring van GitHub</a>). We tellen bezoeken anoniem met <a href="https://www.goatcounter.com/help/privacy">GoatCounter</a>: zonder cookies en zonder persoonsgegevens.</p><h2>Data</h2><p>Prijzen: EnergyZero publieke API, gebaseerd op EPEX Spot day-ahead (ENTSO-E). We doen ons best, maar geven geen garantie op juistheid. Geen financieel advies.</p><p>Gemaakt door CerberosTech. Broncode: <a href="https://github.com/CerberosTech/stroomprijs">GitHub</a>.</p></div>` });

// 404
page('/404.html', { title: 'Pagina niet gevonden – Stroomprijs', desc: 'Deze pagina bestaat niet.', body: `<header class="pg-h"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet (meer).</p></header><p><a class="btn" href="${BASE}/">Naar de actuele stroomprijs</a></p>` });

// ---------- gidsen: content/gidsen/*.md -> /gidsen/<slug>/ ----------
// Front matter: title, description, slug, optional updated and published (YYYY-MM-DD). A missing folder or a bad file never breaks the build.
// The page h1 is the title, so a leading "# <title>" in the body is dropped; any other "#" heading renders as h2.
const GUIDES_DIR = 'content/gidsen';
const isDay = s => { const d = new Date(s + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const plain = s => s.replace(/[*_`\\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const dropTitleH1 = (body, title) => body.replace(/^\s*#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*(?:\n|$)/, (h, t) => plain(t) === plain(title) ? '' : h);
const shortDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
function loadGuides() {
  let files = [];
  try { files = fs.readdirSync(GUIDES_DIR).filter(f => f.endsWith('.md')).sort(); } catch (e) { if (e.code !== 'ENOENT') console.warn('gidsen: cannot read', GUIDES_DIR, e.message); return []; }
  const seen = new Set(), out = [];
  for (const f of files) {
    try {
      const { meta, body } = frontMatter(fs.readFileSync(path.join(GUIDES_DIR, f), 'utf8'));
      const slug = (meta.slug || '').trim(), title = (meta.title || '').trim();
      if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) { console.warn(`gidsen: skip ${f} (needs a title and a slug of a-z, 0-9 and "-")`); continue; }
      if (seen.has(slug)) { console.warn(`gidsen: skip ${f} (slug "${slug}" already used)`); continue; }
      const day = k => { const v = (meta[k] || '').trim(); if (v && !isDay(v)) console.warn(`gidsen: ${f} has an invalid ${k} date "${v}" (use YYYY-MM-DD); ignored`); return isDay(v) ? v : ''; };
      const updated = day('updated'), published = day('published') || updated;
      seen.add(slug);
      out.push({ f, slug, title, desc: (meta.description || '').trim() || title, updated, published, html: markdown(dropTitleH1(body, title), { base: BASE }) });
    } catch (e) { console.warn(`gidsen: skip ${f}:`, e.message); }
  }
  return out.sort((a, b) => (b.updated || '').localeCompare(a.updated || '') || a.title.localeCompare(b.title, 'nl'));
}
const guides = loadGuides();
for (const g of guides) for (const [, s] of g.html.matchAll(new RegExp(`href="${BASE}/gidsen/([^/"]+)/`, 'g'))) if (!guides.some(x => x.slug === s)) console.warn(`gidsen: ${g.f} links to unknown guide "${s}"`);
const AI_NOTE = '<p class="ai-note">Deze gids is geschreven met hulp van AI en gecontroleerd op bronnen.</p>';
const publisher = { '@type': 'Organization', name: 'Stroomprijs', url: SITE + '/', logo: { '@type': 'ImageObject', url: `${SITE}/icon-512.png` } };
for (const g of guides) {
  const p = `/gidsen/${g.slug}/`;
  page(p, { title: `${g.title} – Stroomprijs`, desc: g.desc, type: 'article', modified: g.updated || undefined, schema: { '@context': 'https://schema.org', '@type': 'Article', headline: g.title, description: g.desc, ...(g.published ? { datePublished: g.published } : {}), ...(g.updated ? { dateModified: g.updated } : {}), url: SITE + p, mainEntityOfPage: SITE + p, inLanguage: 'nl-NL', image: `${SITE}/og.png`, author: { '@type': 'Organization', name: 'CerberosTech', url: 'https://github.com/CerberosTech' }, publisher }, body: `<header class="pg-h"><p class="crumb"><a href="${BASE}/gidsen/">Gidsen</a></p><h1>${esc(g.title)}</h1><p>${esc(g.desc)}</p></header><article class="prose">${g.html}${AI_NOTE}</article>${g.updated ? `<p class="updated">Bijgewerkt op <time datetime="${g.updated}">${shortDate(g.updated)}</time>.</p>` : ''}` });
}
page('/gidsen/', { title: 'Gidsen over dynamische energieprijzen – Stroomprijs', desc: 'Praktische gidsen over dynamische stroom- en gasprijzen: hoe ze werken en hoe je slim je verbruik verschuift.', body: `<header class="pg-h"><h1>Gidsen</h1><p>Uitleg over dynamische energieprijzen, stap voor stap.</p></header><section class="sec gi">${guides.length ? `<ul class="guides">${guides.map(g => `<li><h2><a href="${BASE}/gidsen/${g.slug}/">${esc(g.title)}</a></h2><p>${esc(g.desc)}</p>${g.updated ? `<time datetime="${g.updated}">Bijgewerkt ${shortDate(g.updated)}</time>` : ''}</li>`).join('')}</ul>` : `<p class="empty">Er staan nog geen gidsen online. We werken eraan. Kijk intussen bij de <a href="${BASE}/veelgestelde-vragen/">veelgestelde vragen</a> of de <a href="${BASE}/dynamisch-vs-vast-contract/">vergelijking dynamisch vs vast</a>.</p>`}</section>` });
console.log(`gidsen: ${guides.length} guide(s)`);

// ---------- ICS + RSS ----------
const icsT = s => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const evs = [[TODAY, P.today], [TOMORROW, P.tomorrow]].filter(([, a]) => a.length >= 3).map(([d, a]) => { const b = cheapestBlock(a, 3); const s = b.hours[0].t, e = new Date(Date.parse(b.hours[2].t) + 3600e3).toISOString();
  return ['BEGIN:VEVENT', `UID:goedkoopste-3u-${d}@cerberostech.github.io`, `DTSTAMP:${icsT(now.toISOString())}`, `DTSTART:${icsT(new Date(s).toISOString())}`, `DTEND:${icsT(e)}`, `SUMMARY:⚡ Goedkoopste stroom ${hh(b.start)}-${hh(b.end)} (gem. ${ct(b.avg).replace(',', '.')}/kWh)`, `DESCRIPTION:Goedkoopste blok van 3 uur op ${d} (kale day-ahead prijs excl. btw). Bron: EnergyZero/EPEX. ${SITE}/`, `URL:${SITE}/`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n'); });
fs.writeFileSync(path.join(OUT, 'goedkoopste-uren.ics'), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CerberosTech//Stroomprijs//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Goedkoopste stroom-uren', 'X-WR-TIMEZONE:Europe/Amsterdam', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', ...evs, 'END:VCALENDAR'].join('\r\n') + '\r\n');
const rssItems = [[TOMORROW, P.tomorrow], [TODAY, P.today]].filter(([, a]) => a.length >= 3).map(([d, a]) => { const b = cheapestBlock(a, 3), mn = minOf(a), sorted = [...a].sort((x, y) => x.p - y.p).slice(0, 5);
  return `<item><title>${esc(`Goedkoopste stroom ${nlDate(d)}: ${hh(b.start)}–${hh(b.end)}`)}</title><link>${SITE}/${d === TODAY ? 'stroomprijs-vandaag' : 'stroomprijs-morgen'}/</link><guid isPermaLink="false">stroomprijs-${d}</guid><pubDate>${now.toUTCString()}</pubDate><description>${esc(`Goedkoopste blok van 3 uur: ${hh(b.start)}–${hh(b.end)}, gemiddeld ${ct(b.avg)}/kWh. Goedkoopste uur: ${hh(mn.h)} (${ct(mn.p)}). Top 5 goedkoopste uren: ${sorted.map(x => `${hh(x.h)} (${ct(x.p)})`).join(', ')}. Kale day-ahead prijzen excl. btw, bron EnergyZero/EPEX.`)}</description></item>`; }).join('');
fs.writeFileSync(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Goedkoopste stroom-uren</title><link>${SITE}/</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><description>Dagelijks de goedkoopste uren voor stroom in Nederland (day-ahead).</description><language>nl-nl</language><image><url>${SITE}/icon-192.png</url><title>Goedkoopste stroom-uren</title><link>${SITE}/</link></image><lastBuildDate>${now.toUTCString()}</lastBuildDate>${rssItems}</channel></rss>`);

// ---------- data, sitemap, robots ----------
fs.writeFileSync(path.join(OUT, 'prices.json'), JSON.stringify({ fetched: data.fetched, source: data.source, status: data.status, unit: 'EUR/kWh (power), EUR/m3 (gas), excl. VAT', today: TODAY, tomorrow: TOMORROW, power: { today: P.today.map(({ t, p }) => ({ t, p })), tomorrow: P.tomorrow.map(({ t, p }) => ({ t, p })) }, gas: { today: G.today.map(({ t, p }) => ({ t, p })), tomorrow: G.tomorrow.map(({ t, p }) => ({ t, p })) } }, null, 1));
const urls = ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/', '/gasprijs-vandaag/', '/dynamisch-vs-vast-contract/', '/veelgestelde-vragen/', '/privacy/', '/gidsen/'].map(u => [u, TODAY]);
for (const g of guides) urls.push([`/gidsen/${g.slug}/`, g.updated]); // no updated date: no lastmod, rather than a false "changed today"
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `<url><loc>${SITE}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('built', fs.readdirSync(OUT).length, 'entries');
