// Stroomprijs static site builder. No dependencies (Node >= 18).
// Fetches day-ahead power + gas prices from the public EnergyZero API (no key), falls back to data/prices.json.
import fs from 'node:fs'; import path from 'node:path';
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
  for (let i = 0; i + n <= a.length; i++) { const s = a.slice(i, i + n); const m = avg(s); if (!best || m < best.avg) best = { start: s[0].h, end: (s[n - 1].h + 1) % 24, avg: m, hours: s }; }
  return best;
}
const minOf = a => a.reduce((m, x) => (!m || x.p < m.p ? x : m), null);
const maxOf = a => a.reduce((m, x) => (!m || x.p > m.p ? x : m), null);
const hh = h => String(h).padStart(2, '0') + ':00';
const ct = (v, d = 1) => (v * 100).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' ct';
const eur = (v, d = 3) => '€\u00a0' + v.toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fetchedNl = new Date(data.fetched).toLocaleString('nl-NL', { timeZone: TZ, dateStyle: 'medium', timeStyle: 'short' });

// ---------- SVG chart ----------
function chart(a, label, nowH = -1) {
  if (!a.length) return '<p class="muted">Nog geen prijzen beschikbaar. De day-ahead prijzen voor morgen komen meestal rond 13:00–15:00 uur binnen.</p>';
  const W = 720, H = 240, pl = 40, pb = 26, pt = 12, bw = (W - pl) / a.length;
  const lo = Math.min(0, ...a.map(x => x.p)), hi = Math.max(...a.map(x => x.p)) * 1.1 || 0.01;
  const y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const cb = cheapestBlock(a, 3); const cheap = new Set(cb ? cb.hours.map(x => x.h) : []);
  const ticks = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pl - 4}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}</text>`).join('');
  const bars = a.map((x, i) => { const top = y(Math.max(x.p, 0)), h = Math.abs(y(x.p) - y(0)) || 1; const cls = x.h === nowH ? 'now' : cheap.has(x.h) ? 'cheap' : x.p < 0 ? 'neg' : 'bar';
    return `<rect x="${(pl + i * bw + 1).toFixed(1)}" y="${top.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" class="${cls}"><title>${hh(x.h)}: ${ct(x.p, 2)}/kWh excl. btw</title></rect>` + (i % 3 === 0 ? `<text x="${(pl + i * bw + bw / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${x.h}</text>` : ''); }).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${ticks}${bars}</svg><figcaption>${esc(label)} · ct/kWh excl. btw · <span class="lg cheap"></span> goedkoopste 3 uur${nowH >= 0 ? ' · <span class="lg now"></span> nu' : ''}</figcaption></figure>`;
}
function table(a, unit = 'kWh') {
  if (!a.length) return '';
  return `<details><summary>Alle uurprijzen in een tabel</summary><table><thead><tr><th>Uur</th><th>Excl. btw</th><th>Incl. 21% btw</th></tr></thead><tbody>${a.map(x => `<tr><td>${hh(x.h)}–${hh((x.h + 1) % 24)}</td><td>${eur(x.p, 4)}</td><td>${eur(x.inc, 4)}</td></tr>`).join('')}</tbody></table><p class="muted small">Prijs per ${unit}. Kale marktprijs; zonder energiebelasting, netbeheerkosten en opslag van je leverancier.</p></details>`;
}
function stats(a, title) {
  if (!a.length) return '';
  const mn = minOf(a), mx = maxOf(a), cb = cheapestBlock(a, 3);
  return `<div class="stats"><div><span>Gemiddeld</span><b>${ct(avg(a))}</b></div><div><span>Laagste</span><b>${ct(mn.p)}</b><small>${hh(mn.h)}</small></div><div><span>Hoogste</span><b>${ct(mx.p)}</b><small>${hh(mx.h)}</small></div><div class="hl"><span>Goedkoopste 3 uur</span><b>${hh(cb.start)}–${hh(cb.end)}</b><small>gem. ${ct(cb.avg)}</small></div></div>`;
}
function advice(a, dayWord) {
  if (a.length < 4) return '';
  const w = cheapestBlock(a, 2), c = cheapestBlock(a, 4), d = cheapestBlock(a, 3);
  return `<div class="tips"><div class="tip"><span aria-hidden="true">🧺</span><div><b>Wasmachine ${dayWord}</b><p>${hh(w.start)}–${hh(w.end)} (2 uur, gem. ${ct(w.avg)}/kWh)</p></div></div><div class="tip"><span aria-hidden="true">🔌</span><div><b>Auto laden ${dayWord}</b><p>${hh(c.start)}–${hh(c.end)} (4 uur, gem. ${ct(c.avg)}/kWh)</p></div></div><div class="tip"><span aria-hidden="true">🍽️</span><div><b>Vaatwasser / droger</b><p>${hh(d.start)}–${hh(d.end)} (3 uur, gem. ${ct(d.avg)}/kWh)</p></div></div></div><p class="muted small">Berekend op de kale day-ahead prijs. Belasting en opslag zijn per kWh gelijk over de dag, dus het goedkoopste moment blijft hetzelfde.</p>`;
}

// ---------- layout ----------
const NAV = [['/', 'Dashboard'], ['/stroomprijs-vandaag/', 'Vandaag'], ['/stroomprijs-morgen/', 'Morgen'], ['/gasprijs-vandaag/', 'Gas'], ['/dynamisch-vs-vast-contract/', 'Dynamisch vs vast'], ['/veelgestelde-vragen/', 'FAQ']];
const CSS = `:root{--bg:#f6f7f9;--card:#fff;--ink:#0f172a;--mut:#64748b;--pri:#0f766e;--acc:#fde047;--bd:#e2e8f0}*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--ink)}a{color:var(--pri)}header{background:var(--pri);color:#fff}header .in{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;padding:.7rem 1rem}header a{color:#fff;text-decoration:none}.brand{font-weight:800;font-size:1.15rem;display:flex;align-items:center;gap:.4rem}.brand img{width:28px;height:28px}nav{display:flex;gap:.2rem;overflow-x:auto;width:100%;padding-bottom:.2rem}nav a{padding:.3rem .6rem;border-radius:99px;white-space:nowrap;font-size:.92rem;opacity:.9}nav a[aria-current]{background:rgba(255,255,255,.18);opacity:1}@media(min-width:760px){nav{width:auto;margin-left:auto}}.in{max-width:980px;margin:0 auto}main.in{padding:1rem}h1{font-size:1.7rem;line-height:1.2;margin:.6rem 0}h2{font-size:1.25rem;margin:1.6rem 0 .6rem}.card{background:var(--card);border:1px solid var(--bd);border-radius:16px;padding:1rem 1.1rem;margin:1rem 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}.hero{display:grid;gap:1rem}@media(min-width:760px){.hero{grid-template-columns:1.1fr 2fr}}.big{font-size:2.6rem;font-weight:800;color:var(--pri);line-height:1}.muted{color:var(--mut)}.small{font-size:.85rem}.stats{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem;margin:.8rem 0}@media(min-width:760px){.stats{grid-template-columns:repeat(4,1fr)}}.stats div{background:var(--bg);border-radius:12px;padding:.6rem .8rem;display:flex;flex-direction:column}.stats span{font-size:.8rem;color:var(--mut)}.stats b{font-size:1.2rem}.stats small{color:var(--mut)}.stats .hl{background:#ccfbf1}.chart{margin:0}.chart svg{width:100%;height:auto;font:11px system-ui;fill:var(--mut)}.grid{stroke:var(--bd)}.bar{fill:#94a3b8}.cheap{fill:#0f766e;background:#0f766e}.now{fill:#f59e0b;background:#f59e0b}.neg{fill:#2563eb}.lg{display:inline-block;width:.8em;height:.8em;border-radius:2px;vertical-align:middle}figcaption{font-size:.8rem;color:var(--mut);margin-top:.3rem}.tips{display:grid;gap:.6rem}@media(min-width:760px){.tips{grid-template-columns:repeat(3,1fr)}}.tip{display:flex;gap:.6rem;background:var(--bg);border-radius:12px;padding:.7rem}.tip span{font-size:1.6rem}.tip p{margin:.1rem 0 0}table{width:100%;border-collapse:collapse;font-size:.9rem;margin-top:.5rem}td,th{padding:.3rem .4rem;border-bottom:1px solid var(--bd);text-align:left}summary{cursor:pointer;font-weight:600;margin-top:.6rem}.ph{border:2px dashed #cbd5e1;background:#f8fafc;border-radius:16px;padding:1rem;text-align:center;color:var(--mut)}.btns{display:flex;flex-wrap:wrap;gap:.5rem}.btn{display:inline-block;background:var(--pri);color:#fff;padding:.5rem .9rem;border-radius:10px;text-decoration:none;font-weight:600}.btn.alt{background:#fff;color:var(--pri);border:1px solid var(--pri)}footer{border-top:1px solid var(--bd);margin-top:2rem;padding:1.2rem 1rem;font-size:.88rem;color:var(--mut)}footer a{color:var(--mut)}.cols{display:grid;gap:1rem}@media(min-width:760px){.cols{grid-template-columns:1fr 1fr}}`;
function page(p, { title, desc, body, schema }) {
  const url = SITE + p;
  const nav = NAV.map(([h, t]) => `<a href="${BASE}${h}"${h === p ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta name="theme-color" content="#0f766e"><link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml"><link rel="icon" href="${BASE}/favicon.png" sizes="64x64"><link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png"><meta property="og:type" content="website"><meta property="og:locale" content="nl_NL"><meta property="og:site_name" content="Stroomprijs"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png"><meta name="twitter:card" content="summary_large_image"><link rel="alternate" type="application/rss+xml" title="Goedkoopste uren morgen" href="${SITE}/feed.xml">${schema ? `<script type="application/ld+json">${JSON.stringify(schema)}</script>` : ''}<style>${CSS}</style></head><body><header><div class="in"><a class="brand" href="${BASE}/"><img src="${BASE}/icon.svg" alt="" width="28" height="28">Stroomprijs</a><nav>${nav}</nav></div></header><main class="in">${body}</main><footer><div class="in"><p>Bron: day-ahead prijzen (EPEX Spot, gepubliceerd via <a href="https://transparency.entsoe.eu/">ENTSO-E</a>) opgehaald via de publieke <a href="https://www.energyzero.nl/">EnergyZero</a>-API. Laatst bijgewerkt: ${esc(fetchedNl)}. Wordt elk uur ververst. Geen advies; controleer de tarieven van je eigen leverancier.</p><p><a href="${BASE}/privacy/">Privacy &amp; disclosure</a> · <a href="${BASE}/feed.xml">RSS</a> · <a href="${BASE}/goedkoopste-uren.ics">Agenda (.ics)</a> · <a href="https://github.com/CerberosTech/stroomprijs">Broncode</a></p><p>Meer gratis tools: <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidiechecker warmtepompen</a> · <a href="https://cerberostech.github.io/deadorsupported/">Dead or Supported</a></p></div></footer></body></html>`;
  const f = path.join(OUT, p, p.endsWith('/') ? 'index.html' : ''); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html);
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync('static')) fs.copyFileSync(path.join('static', f), path.join(OUT, f));

const nowH = hourOf(now); const cur = P.today.find(x => x.h === nowH);
const placeholder = `<aside class="ph" id="vergelijker"><b>Hier komt later een energievergelijker</b><br><span class="small">Placeholder voor een toekomstige vergelijkingswidget (Daisycon). Er staat nu niets en we hebben op dit moment geen affiliate-afspraken. <a href="${BASE}/privacy/">Lees de disclosure</a>.</span></aside>`;
const updated = `<p class="muted small">Prijzen excl. btw, energiebelasting en leveranciersopslag. Bijgewerkt ${esc(fetchedNl)}${data.status !== 'ok' ? ' (let op: laatste ophaalpoging mislukt, dit zijn de laatst bekende prijzen)' : ''}.</p>`;

// Dashboard
page('/', { title: 'Stroomprijs vandaag en morgen – dynamische energieprijzen per uur', desc: `Actuele dynamische stroomprijs per uur voor vandaag en morgen, het goedkoopste blok van 3 uur en het beste moment om te wassen of je auto te laden.`, schema: { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Stroomprijs', url: SITE + '/', inLanguage: 'nl-NL' }, body: `
<div class="hero"><div class="card"><p class="muted">Stroomprijs nu (${hh(nowH)}–${hh((nowH + 1) % 24)})</p>${cur ? `<div class="big">${ct(cur.p)}</div><p class="muted">per kWh excl. btw · ${ct(cur.inc)} incl. 21% btw</p>` : '<p>Onbekend</p>'}<p class="small muted">${nlDate(TODAY)}</p><div class="btns"><a class="btn" href="${BASE}/goedkoopste-uren.ics">📅 Agenda</a><a class="btn alt" href="${BASE}/feed.xml">RSS</a></div></div>
<div class="card"><h2 style="margin-top:0">Vandaag</h2>${chart(P.today, 'Stroomprijs per uur vandaag', nowH)}</div></div>
<section class="card"><h2 style="margin-top:0">Vandaag in cijfers</h2>${stats(P.today)}${advice(P.today, 'vandaag')}</section>
<section class="card"><h2 style="margin-top:0">Morgen – ${nlDate(TOMORROW)}</h2>${chart(P.tomorrow, 'Stroomprijs per uur morgen')}${stats(P.tomorrow)}${advice(P.tomorrow, 'morgen')}</section>
${placeholder}
<section class="cols"><div class="card"><h2 style="margin-top:0">Gasprijs vandaag</h2>${G.today.length ? `<div class="big">${eur(avg(G.today), 3)}</div><p class="muted">per m³ excl. btw (${eur(avg(G.today) * VAT, 3)} incl.). <a href="${BASE}/gasprijs-vandaag/">Details</a></p>` : '<p>Geen gasprijs beschikbaar.</p>'}</div><div class="card"><h2 style="margin-top:0">Meer weten?</h2><p><a href="${BASE}/dynamisch-vs-vast-contract/">Dynamisch vs vast contract</a><br><a href="${BASE}/veelgestelde-vragen/">Veelgestelde vragen</a><br><a href="https://cerberostech.github.io/isde-checker/">Subsidie op je warmtepomp checken (ISDE)</a></p></div></section>${updated}` });

// Vandaag / morgen
page('/stroomprijs-vandaag/', { title: `Stroomprijs vandaag (${nlDate(TODAY)}) – prijs per uur`, desc: 'De dynamische stroomprijs van vandaag per uur, met goedkoopste en duurste uur en het goedkoopste blok van 3 uur.', body: `<h1>Stroomprijs vandaag</h1><p class="muted">${nlDate(TODAY)}</p><div class="card">${chart(P.today, 'Stroomprijs per uur vandaag', nowH)}${stats(P.today)}${table(P.today)}</div><div class="card">${advice(P.today, 'vandaag')}</div><p>De prijzen komen uit de day-ahead veiling van EPEX Spot voor het Nederlandse biedgebied. Die veiling vindt de dag ervoor rond 12:00 uur plaats; de uitslag wordt ook gepubliceerd op het ENTSO-E Transparency Platform. Bekijk ook de <a href="${BASE}/stroomprijs-morgen/">stroomprijs van morgen</a>.</p>${placeholder}${updated}` });
page('/stroomprijs-morgen/', { title: `Stroomprijs morgen (${nlDate(TOMORROW)}) – prijs per uur`, desc: 'De dynamische stroomprijs van morgen per uur, zodra de day-ahead veiling bekend is (meestal rond 13:00–15:00 uur).', body: `<h1>Stroomprijs morgen</h1><p class="muted">${nlDate(TOMORROW)}</p><div class="card">${chart(P.tomorrow, 'Stroomprijs per uur morgen')}${stats(P.tomorrow)}${table(P.tomorrow)}</div><div class="card">${advice(P.tomorrow, 'morgen')}</div><p>Morgen plannen? Abonneer je op de <a href="${BASE}/goedkoopste-uren.ics">agenda met de goedkoopste uren</a> of de <a href="${BASE}/feed.xml">RSS-feed</a>. De prijzen van morgen worden bekend na de day-ahead veiling (rond 12:00 uur); deze site ververst elk uur.</p>${placeholder}${updated}` });

// Gas
const gT = G.today, gMorgen = G.tomorrow;
page('/gasprijs-vandaag/', { title: `Gasprijs vandaag (${nlDate(TODAY)}) – dynamische gasprijs per m³`, desc: 'De dynamische gasprijs van vandaag per m³, gebaseerd op de day-ahead gasmarkt (TTF), via EnergyZero.', body: `<h1>Gasprijs vandaag</h1><p class="muted">${nlDate(TODAY)}</p><div class="card">${gT.length ? `<div class="big">${eur(avg(gT), 3)}</div><p class="muted">gemiddeld per m³ excl. btw · ${eur(avg(gT) * VAT, 3)} incl. 21% btw</p>${gMorgen.length ? `<p>Morgen: <b>${eur(avg(gMorgen), 3)}</b> per m³ excl. btw.</p>` : ''}${table(gT, 'm³')}` : '<p>Geen gasprijs beschikbaar.</p>'}</div><h2>Hoe werkt een dynamische gasprijs?</h2><p>Bij een dynamisch gascontract betaal je de marktprijs voor aardgas plus een vaste opslag van je leverancier, energiebelasting en btw. De marktprijs volgt de Nederlandse groothandelsmarkt TTF en verandert per dag (niet per uur zoals stroom); leveranciers gebruiken een gasdag van 06:00 tot 06:00 uur. Wil je minder gas gebruiken? Check of je <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidie op een warmtepomp</a> kunt krijgen.</p>${placeholder}${updated}` });

// Dynamisch vs vast
page('/dynamisch-vs-vast-contract/', { title: 'Dynamisch vs vast energiecontract – de verschillen op een rij', desc: 'Feitelijke vergelijking van een dynamisch, variabel en vast energiecontract: hoe de prijs tot stand komt, risico’s en voor wie het past. Met bronnen.', body: `<h1>Dynamisch vs vast energiecontract</h1><div class="card"><table><thead><tr><th></th><th>Dynamisch</th><th>Vast</th></tr></thead><tbody><tr><td>Prijs stroom</td><td>Verandert per uur (day-ahead marktprijs + opslag)</td><td>Vaste prijs per kWh voor de looptijd (1–5 jaar)</td></tr><tr><td>Prijs gas</td><td>Verandert per dag</td><td>Vast voor de looptijd</td></tr><tr><td>Risico</td><td>Je draagt het marktrisico: pieken én dalen</td><td>Leverancier draagt het risico; je betaalt daar een premie voor</td></tr><tr><td>Opzeggen</td><td>Meestal maandelijks opzegbaar</td><td>Opzegvergoeding mogelijk bij vroegtijdig opzeggen</td></tr><tr><td>Slimme meter</td><td>Nodig</td><td>Niet nodig</td></tr><tr><td>Voordeel als…</td><td>Je verbruik kunt verschuiven (EV, warmtepomp, thuisbatterij, wasmachine)</td><td>Je zekerheid wilt over je maandbedrag</td></tr></tbody></table></div>
<h2>Hoe komt de dynamische prijs tot stand?</h2><p>Elke dag rond 12:00 uur sluit de day-ahead veiling van EPEX Spot. Daarin wordt per tijdsblok de groothandelsprijs voor stroom in Nederland voor de volgende dag bepaald. De uitkomst is openbaar via het ENTSO-E Transparency Platform. Je leverancier rekent die prijs door, plus een opslag (inkoopvergoeding), energiebelasting, en 21% btw. Daarnaast betaal je vaste leveringskosten en netbeheerkosten. Op zonnige of winderige momenten kan de marktprijs zelfs negatief worden.</p>
<h2>Wat zijn de risico’s?</h2><p>Als de groothandelsprijs stijgt, zoals in 2022, stijgt je rekening direct mee. Bij een vast contract ben je daartegen beschermd zolang het contract loopt. Een dynamisch contract loont vooral als je stroom gebruikt wanneer die goedkoop is.</p>
<h2>Terugleveren en de salderingsregeling</h2><p>De salderingsregeling voor zonnepanelen stopt per 1 januari 2027. Daarna krijg je voor teruggeleverde stroom een terugleververgoeding van je leverancier. Bij een dynamisch contract hangt die vergoeding vaak af van de uurprijs, dus op momenten met negatieve prijzen kan terugleveren geld kosten. Check de voorwaarden van je leverancier.</p>
<h2>Bronnen</h2><ul><li><a href="https://www.consuwijzer.nl/energie/energiecontract/dynamisch-energiecontract">ConsuWijzer (ACM): dynamisch energiecontract</a></li><li><a href="https://www.rijksoverheid.nl/onderwerpen/energie-thuis/salderingsregeling">Rijksoverheid: salderingsregeling</a></li><li><a href="https://www.belastingdienst.nl/wps/wcm/connect/nl/energiebelasting/energiebelasting">Belastingdienst: energiebelasting</a></li><li><a href="https://transparency.entsoe.eu/">ENTSO-E Transparency Platform</a></li><li><a href="https://www.epexspot.com/en/market-results">EPEX Spot market results</a></li></ul>${placeholder}` });

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
page('/veelgestelde-vragen/', { title: 'Veelgestelde vragen over dynamische energieprijzen', desc: 'Antwoorden op veelgestelde vragen over dynamische stroom- en gasprijzen, negatieve prijzen en wanneer de prijzen van morgen bekend zijn.', schema: { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, body: `<h1>Veelgestelde vragen</h1>${faq.map(([q, a]) => `<div class="card"><h2 style="margin-top:0">${esc(q)}</h2><p>${esc(a)}</p></div>`).join('')}` });

// Privacy
page('/privacy/', { title: 'Privacy & disclosure – Stroomprijs', desc: 'Privacyverklaring en disclosure: geen affiliates, geen account, open bron.', body: `<h1>Privacy &amp; disclosure</h1><div class="card"><h2 style="margin-top:0">Geen affiliates (nog)</h2><p>Deze site heeft op dit moment <b>geen affiliate- of partnerafspraken</b> met energieleveranciers of vergelijkers. We verdienen niets aan je keuze. Op de site staat een duidelijk gemarkeerde lege plek waar in de toekomst mogelijk een vergelijkingswidget (bijvoorbeeld via Daisycon) komt. Als dat gebeurt, passen we deze pagina aan en markeren we die links als affiliate.</p><h2>Privacy</h2><p>Geen account, geen formulieren, geen eigen cookies. De site wordt gehost op GitHub Pages; GitHub kan technische gegevens zoals je IP-adres loggen (zie de <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacyverklaring van GitHub</a>). Eventuele anonieme bezoekersstatistieken zonder cookies vermelden we hier.</p><h2>Data</h2><p>Prijzen: EnergyZero publieke API, gebaseerd op EPEX Spot day-ahead (ENTSO-E). We doen ons best, maar geven geen garantie op juistheid. Geen financieel advies.</p><p>Gemaakt door CerberosTech. Broncode: <a href="https://github.com/CerberosTech/stroomprijs">GitHub</a>.</p></div>` });

// 404
page('/404.html', { title: 'Pagina niet gevonden – Stroomprijs', desc: 'Deze pagina bestaat niet.', body: `<h1>Pagina niet gevonden</h1><p><a href="${BASE}/">Naar de actuele stroomprijs</a></p>` });

// ---------- ICS + RSS ----------
const icsT = s => s.replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const evs = [[TODAY, P.today], [TOMORROW, P.tomorrow]].filter(([, a]) => a.length >= 3).map(([d, a]) => { const b = cheapestBlock(a, 3); const s = b.hours[0].t, e = new Date(Date.parse(b.hours[2].t) + 3600e3).toISOString();
  return ['BEGIN:VEVENT', `UID:goedkoopste-3u-${d}@cerberostech.github.io`, `DTSTAMP:${icsT(now.toISOString())}`, `DTSTART:${icsT(new Date(s).toISOString())}`, `DTEND:${icsT(e)}`, `SUMMARY:⚡ Goedkoopste stroom ${hh(b.start)}-${hh(b.end)} (gem. ${ct(b.avg).replace(',', '.')}/kWh)`, `DESCRIPTION:Goedkoopste blok van 3 uur op ${d} (kale day-ahead prijs excl. btw). Bron: EnergyZero/EPEX. ${SITE}/`, `URL:${SITE}/`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n'); });
fs.writeFileSync(path.join(OUT, 'goedkoopste-uren.ics'), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CerberosTech//Stroomprijs//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Goedkoopste stroom-uren', 'X-WR-TIMEZONE:Europe/Amsterdam', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', ...evs, 'END:VCALENDAR'].join('\r\n') + '\r\n');
const rssItems = [[TOMORROW, P.tomorrow], [TODAY, P.today]].filter(([, a]) => a.length >= 3).map(([d, a]) => { const b = cheapestBlock(a, 3), mn = minOf(a), sorted = [...a].sort((x, y) => x.p - y.p).slice(0, 5);
  return `<item><title>${esc(`Goedkoopste stroom ${nlDate(d)}: ${hh(b.start)}–${hh(b.end)}`)}</title><link>${SITE}/${d === TODAY ? 'stroomprijs-vandaag' : 'stroomprijs-morgen'}/</link><guid isPermaLink="false">stroomprijs-${d}</guid><pubDate>${now.toUTCString()}</pubDate><description>${esc(`Goedkoopste blok van 3 uur: ${hh(b.start)}–${hh(b.end)}, gemiddeld ${ct(b.avg)}/kWh. Goedkoopste uur: ${hh(mn.h)} (${ct(mn.p)}). Top 5 goedkoopste uren: ${sorted.map(x => `${hh(x.h)} (${ct(x.p)})`).join(', ')}. Kale day-ahead prijzen excl. btw, bron EnergyZero/EPEX.`)}</description></item>`; }).join('');
fs.writeFileSync(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Goedkoopste stroom-uren</title><link>${SITE}/</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><description>Dagelijks de goedkoopste uren voor stroom in Nederland (day-ahead).</description><language>nl-nl</language><lastBuildDate>${now.toUTCString()}</lastBuildDate>${rssItems}</channel></rss>`);

// ---------- data, sitemap, robots ----------
fs.writeFileSync(path.join(OUT, 'prices.json'), JSON.stringify({ fetched: data.fetched, source: data.source, status: data.status, unit: 'EUR/kWh (power), EUR/m3 (gas), excl. VAT', today: TODAY, tomorrow: TOMORROW, power: { today: P.today.map(({ t, p }) => ({ t, p })), tomorrow: P.tomorrow.map(({ t, p }) => ({ t, p })) }, gas: { today: G.today.map(({ t, p }) => ({ t, p })), tomorrow: G.tomorrow.map(({ t, p }) => ({ t, p })) } }, null, 1));
const urls = ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/', '/gasprijs-vandaag/', '/dynamisch-vs-vast-contract/', '/veelgestelde-vragen/', '/privacy/'];
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `<url><loc>${SITE}${u}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('built', fs.readdirSync(OUT).length, 'entries');
