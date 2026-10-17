// Stroomprijs static site builder. No dependencies (Node >= 18).
// Fetches day-ahead power + gas prices from the public EnergyZero API (no key), falls back to data/prices.json.
// The price components (hero, planner, chart, hour list, stats, gas) come from lib/render.mjs: rendered here for the
// first paint and the no-JS fallback, and again in the browser for the real current hour and the chosen price mode.
import fs from 'node:fs'; import path from 'node:path';
import { logo, writeAssets } from './lib/brand.mjs';
import { frontMatter, markdown } from './lib/markdown.mjs';
import { makeRender } from './lib/render.mjs';
import { CSS } from './lib/style.mjs';
const SITE = 'https://cerberostech.github.io/stroomprijs';
const BASE = '/stroomprijs';
const OUT = 'dist';
const API = 'https://api.energyzero.nl/v1/energyprices';
const R = makeRender();

// Energiebelasting (energy tax) per year, excl. btw, first bracket (electricity 0–10.000 kWh, gas 0–170.000 m³).
// Source: Belastingdienst, tabel energiebelasting. Checked 2026-10-17. Add the next year when it is published;
// until then the latest known year is used and the method page says so.
const TAX = {
  vat: 1.21, fallback: '2026', checked: '2026-10-17',
  source: 'https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/zakelijk/overige_belastingen/belastingen_op_milieugrondslag/energiebelasting',
  rates: { 2026: { e: 0.09161, g: 0.60066 } },
  reduction: { 2026: 519.80 }, // belastingvermindering per elektriciteitsaansluiting per jaar, excl. btw
};

// ---------- data ----------
const addDays = (s, n) => R.addDay(s, n);
async function fetchType(usageType, from, till) {
  const u = `${API}?fromDate=${from}&tillDate=${till}&interval=4&usageType=${usageType}&inclBtw=false`;
  const r = await fetch(u, { headers: { 'user-agent': 'stroomprijs (github.com/CerberosTech/stroomprijs)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`);
  const j = await r.json(); if (!Array.isArray(j.Prices)) throw new Error('no Prices');
  return j.Prices.map(p => ({ t: p.readingDate, p: p.price }));
}
async function getData() {
  const now = new Date(); const today = R.at(+now).day;
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
const now = new Date(); const TODAY = R.at(+now).day; const TOMORROW = addDays(TODAY, 1);
const toH = a => a.map(x => ({ t: Date.parse(x.t), p: x.p })).filter(x => isFinite(x.t) && typeof x.p === 'number').sort((a, b) => a.t - b.t);
const POWER = toH(data.power).filter(x => [TODAY, TOMORROW].includes(R.at(x.t).day));
const GASD = toH(data.gas).filter(x => R.gasDay(x.t) >= addDays(TODAY, -1)); // gas days run 06:00–06:00; keep the one running now
const byDay = (a, d) => a.filter(x => R.at(x.t).day === d);
const P = { today: byDay(POWER, TODAY), tomorrow: byDay(POWER, TOMORROW) };
console.log(`power today ${P.today.length}h, tomorrow ${P.tomorrow.length}h; gas ${GASD.length}h; status ${data.status}`);
for (const y of new Set(POWER.map(x => R.at(x.t).day.slice(0, 4)))) if (!TAX.rates[y]) console.warn(`tax: no energiebelasting rates for ${y}, using ${TAX.fallback}. Update TAX in build.mjs.`);
const D = { power: POWER.map(x => [x.t, x.p]), gas: GASD.map(x => [x.t, x.p]), tax: { vat: TAX.vat, rates: TAX.rates, fallback: TAX.fallback } };
const S0 = { mode: 'kaal', opE: 0, opG: 0 };
const C = R.ctx(D, S0, +now); // build-time context: the first paint until the browser takes over

// ---------- helpers ----------
const { esc, nf, hh, span, nlDate } = R;
const ct = (v, d = 1) => nf(v * 100, d) + ' ct';
const eur = (v, d = 3) => '€\u00a0' + nf(v, d);
const fetchedNl = new Date(data.fetched).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short' });
const yearRate = TAX.rates[TODAY.slice(0, 4)] || TAX.rates[TAX.fallback], rateYear = TAX.rates[TODAY.slice(0, 4)] ? TODAY.slice(0, 4) : TAX.fallback;
const shortDate = s => new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// ---------- icons ----------
const ICON = {
  was: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><circle cx="12" cy="13.5" r="4.5"/><path d="M7.5 6h2"/>',
  vaat: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><path d="M4 8h16M7.5 5.2h1.5M9 12.5v5M12 12.5v5M15 12.5v5"/>',
  droog: '<rect x="4" y="2.5" width="16" height="19" rx="3"/><circle cx="12" cy="13.5" r="4.5"/><path d="M10 12.2c1-.8 3-.8 4 0M10 14.8c1-.8 3-.8 4 0M7.5 6h2"/>',
  auto: '<path d="M9 2.5v4.5M15 2.5v4.5M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0zM12 16v5.5"/>',
  eigen: '<path d="M13 2.5 6 13h6l-1 8.5 7-10.5h-6z"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  rss: '<path d="M5 11a8 8 0 0 1 8 8M5 5a14 14 0 0 1 14 14"/><circle cx="6" cy="18" r="1.2"/>',
};
const ico = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

// ---------- shared blocks ----------
// Typical use per run: rough example values, editable in the planner and labelled as such.
const DEVICES = [['was', 'Wasmachine', 2, 1], ['vaat', 'Vaatwasser', 3, 1], ['droog', 'Wasdroger', 2, 2], ['auto', 'Elektrische auto', 4, 20], ['eigen', 'Eigen apparaat', 1, 1]];
function planner(w = 'nu') {
  const [, label, n, kwh] = DEVICES[0], q = { label, n, kwh, w };
  const opt = (v, t) => `<option value="${v}"${v === w ? ' selected' : ''}>${t}</option>`;
  return `<section class="sec" aria-labelledby="plan-h"><div class="sec-h"><h2 id="plan-h">Wanneer zet je hem aan?</h2></div>
<p class="lede">Het goedkoopste aaneengesloten blok uren voor je apparaat${w === 'nu' ? ', ook over middernacht heen' : ''}, en wat het kost.</p>
<form id="planner" class="pl js-only"><fieldset class="dev"><legend class="sr">Apparaat</legend>${DEVICES.map(([k, t, dn, dk], i) => `<label><input type="radio" name="dev" value="${k}" data-label="${t}" data-n="${dn}" data-kwh="${dk}"${i ? '' : ' checked'}><span>${ico(k)}${t}</span></label>`).join('')}</fieldset>
<div class="pl-row"><label for="pl-n">Hoe lang<select id="pl-n" name="n">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${i + 1 === n ? ' selected' : ''}>${i + 1} uur</option>`).join('')}</select></label><label for="pl-kwh">Verbruik in kWh<input id="pl-kwh" name="kwh" type="text" inputmode="decimal" autocomplete="off" value="${kwh}"></label><label for="pl-w">Wanneer<select id="pl-w" name="w">${opt('nu', 'Vanaf nu')}${opt('today', 'Rest van vandaag')}${opt('tomorrow', 'Morgen')}</select></label></div></form>
<p class="sr" id="plan-say" aria-live="polite"></p><div class="pl-out" data-c="plan">${R.plan(C, q)}</div>
<div class="pl-act js-only"><button class="btn" id="plan-ics" type="button">${ico('cal')}Zet dit blok in je agenda</button></div>
<p class="note">Het verbruik per keer is een voorbeeldwaarde. Pas het aan voor je eigen apparaat; het staat in de handleiding of op het energielabel. We rekenen alsof het apparaat gelijkmatig verbruikt over het blok.</p></section>`;
}
const modebar = (gas = false) => `<div class="modebar js-only" role="group" aria-label="Prijzen tonen als"><div class="seg"><label><input type="radio" name="mode" value="kaal" checked><span>Kale marktprijs</span></label><label><input type="radio" name="mode" value="all"><span>Schatting all-in</span></label></div><p class="mb-n"><a href="${BASE}/zo-rekenen-we/">Zo rekenen we</a></p>
<div class="mode-opt" hidden><span>Schatting = (marktprijs + opslag + energiebelasting) × 1,21. Energiebelasting ${rateYear}: ${gas ? `${eur(yearRate.g, 5)} per m³` : `${nf(yearRate.e * 100, 3)} ct per kWh`}, excl. btw.</span>${gas ? '' : '<label for="opE">Opslag van je leverancier<input id="opE" type="text" inputmode="decimal" autocomplete="off" value="0"> ct/kWh</label>'}${gas ? '<label for="opG">Opslag van je leverancier<input id="opG" type="text" inputmode="decimal" autocomplete="off" value="0"> €/m³</label>' : ''}<span>Opslag excl. btw, zie je contract. Vaste kosten zitten er niet in.</span></div></div>`;
const daySec = (k, title) => `<section class="sec" aria-labelledby="dag-h"><div class="sec-h"><h2 id="dag-h">${title}</h2>${k === 'sel' ? '<div class="tabs js-only" role="group" aria-label="Kies de dag"><button type="button" data-day-tab="today" aria-pressed="true">Vandaag</button><button type="button" data-day-tab="tomorrow" aria-pressed="false">Morgen</button></div>' : ''}<p class="d" data-c="date" data-day="${k}">${R.date(C, k === 'sel' ? 'today' : k)}</p></div>
<div class="day-g"><div><div data-c="chart" data-day="${k}">${R.chart(C, k === 'sel' ? 'today' : k, null)}</div><div data-c="stats" data-day="${k}">${R.stats(C, k === 'sel' ? 'today' : k)}</div></div><div class="hl-w" data-c="list" data-day="${k}">${R.list(C, k === 'sel' ? 'today' : k, null)}</div></div>
<p class="note">Prijsklasse A tot G: zeven gelijke stappen tussen het goedkoopste en het duurste uur van die dag. A is dus relatief goedkoop voor die dag, geen vaste grens.</p></section>`;
const stale = `<p class="stale" id="stale" hidden>Deze pagina heeft nog geen prijs voor het huidige uur. Herlaad de pagina om de nieuwste prijzen te zien.</p>`;
const placeholder = `<aside class="ph" id="vergelijker"><b>Hier komt later een energievergelijker</b><span class="small">Placeholder voor een toekomstige vergelijkingswidget (Daisycon). Er staat nu niets en we hebben op dit moment geen affiliate-afspraken met energieleveranciers of vergelijkers. <a href="${BASE}/privacy/">Lees de disclosure</a>.</span></aside>`;
// bol.com partner search links (affiliate, disclosed on /privacy/). Only on the dashboard and the guide pages.
const bol = (query, name) => `https://partner.bol.com/click/click?t=url&s=1550553&url=${encodeURIComponent('https://www.bol.com/nl/nl/s/?searchtext=' + encodeURIComponent(query))}&f=txl&name=${name}`;
const meet = `<aside class="sec meet" aria-labelledby="meet-h"><h2 id="meet-h">Handig om je stroomverbruik te meten</h2><p>Zie wat je verbruikt, zodat je het naar de goedkope uren kunt verschuiven.</p><ul class="links">${[['HomeWizard P1-meter', 'homewizard p1 meter', 'homewizard-p1-meter'], ['Slimme stekker met energiemeter', 'slimme stekker energiemeter', 'slimme-stekker-energiemeter'], ['Energiemonitor', 'energiemonitor', 'energiemonitor']].map(([t, q, n]) => `<li><a href="${esc(bol(q, n))}" rel="sponsored nofollow noopener" target="_blank">${t} bekijken bij bol</a></li>`).join('')}</ul><p class="aff"><a href="${BASE}/privacy/">Affiliatelinks: wij krijgen een kleine commissie, jij betaalt niets extra</a></p></aside>`;
const updated = `<p class="updated">Bron: EnergyZero (day-ahead EPEX Spot). Kale marktprijzen excl. btw; de schatting all-in is een benadering. Bijgewerkt ${esc(fetchedNl)}${data.status !== 'ok' ? ' (let op: laatste ophaalpoging mislukt, dit zijn de laatst bekende prijzen)' : ''}.</p>`;
const dataTag = `<script type="application/json" id="sp-data">${JSON.stringify(D).replace(/</g, '\\u003c')}</script>`;

// ---------- layout ----------
const NAV = [['/', 'Dashboard'], ['/stroomprijs-vandaag/', 'Vandaag'], ['/stroomprijs-morgen/', 'Morgen'], ['/gasprijs-vandaag/', 'Gas'], ['/dynamisch-vs-vast-contract/', 'Dynamisch vs vast'], ['/gidsen/', 'Gidsen'], ['/veelgestelde-vragen/', 'FAQ']];
const LOGO = logo();
const GOATCOUNTER = '<script data-goatcounter="https://stroomprijs.goatcounter.com/count" async src="//gc.zgo.at/count.js"></script>';
// Before first paint: stored theme (no flash) and the "js" class that reveals the interactive controls.
const HEAD_JS = `<script>(function(d){try{var t=localStorage.getItem('sp-theme');if(t==='light'||t==='dark')d.dataset.theme=t}catch(e){}d.classList.add('js')})(document.documentElement)</script>`;
const THEME_JS = `(()=>{const b=document.getElementById('theme');if(!b)return;const T=['auto','light','dark'],L={auto:'Automatisch',light:'Licht',dark:'Donker'},h=document.documentElement;
const set=t=>{if(t==='auto')delete h.dataset.theme;else h.dataset.theme=t;b.dataset.t=t;b.querySelector('.tt-l').textContent=L[t];b.setAttribute('aria-label','Kleurenschema: '+L[t].toLowerCase()+'. Klik om te wisselen.')};
let t='auto';try{t=localStorage.getItem('sp-theme')||'auto'}catch(e){}set(T.includes(t)?t:'auto');
b.addEventListener('click',()=>{const n=T[(T.indexOf(b.dataset.t)+1)%3];try{localStorage.setItem('sp-theme',n)}catch(e){}set(n)})})();`.replace(/\n/g, '');
const APP_JS = `(()=>{const R=(${makeRender.toString()})();\n${fs.readFileSync('lib/app.js', 'utf8')}\n})();`;
const THEME_BTN = `<button class="tt js-only" id="theme" type="button" data-t="auto" aria-label="Kleurenschema: automatisch. Klik om te wisselen."><svg class="i-a" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor"/></svg><svg class="i-l" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg><svg class="i-d" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg><span class="tt-l">Automatisch</span></button>`;
const jsonLd = o => JSON.stringify(o).replace(/</g, '\\u003c'); // no "</script>" from content inside the JSON-LD block
const ORG = { '@type': 'Organization', '@id': SITE + '/#org', name: 'CerberosTech', url: 'https://github.com/CerberosTech' };
const crumbs = (...items) => ({ '@type': 'BreadcrumbList', itemListElement: [['Stroomprijs', '/'], ...items].map(([name, p], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + p })) });
const graph = (...nodes) => ({ '@context': 'https://schema.org', '@graph': nodes });

function page(p, { title, desc, body, schema, type = 'website', modified, app = false }) {
  const url = SITE + p;
  const nav = NAV.map(([h, t]) => `<a href="${BASE}${h}"${h === p || (h !== '/' && p.startsWith(h)) ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  const html = `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${url}"><meta name="color-scheme" content="light dark"><meta name="theme-color" content="#f2f4f3" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0b1520" media="(prefers-color-scheme: dark)">${HEAD_JS}<link rel="icon" href="${BASE}/icon.svg" type="image/svg+xml"><link rel="icon" href="${BASE}/favicon.png" sizes="64x64" type="image/png"><link rel="apple-touch-icon" href="${BASE}/apple-touch-icon.png"><link rel="manifest" href="${BASE}/site.webmanifest"><meta property="og:type" content="${type}">${modified ? `<meta property="article:modified_time" content="${modified}">` : ''}<meta property="og:locale" content="nl_NL"><meta property="og:site_name" content="Stroomprijs"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og.png"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Stroomprijs: dynamische stroomprijs per uur, vandaag en morgen, met de goedkoopste uren"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${SITE}/og.png"><link rel="alternate" type="application/rss+xml" title="Goedkoopste uren morgen" href="${SITE}/feed.xml">${schema ? `<script type="application/ld+json">${jsonLd(schema)}</script>` : ''}${GOATCOUNTER}<style>${CSS}</style></head><body><a class="skip" href="#main">Naar de inhoud</a><header class="top"><div class="in"><a class="brand" href="${BASE}/" aria-label="Stroomprijs, naar het dashboard">${LOGO}</a><nav aria-label="Hoofdmenu">${nav}</nav>${THEME_BTN}</div></header><main id="main" class="in">${body}</main><footer class="foot"><div class="in">${LOGO}<p>Bron: day-ahead prijzen (EPEX Spot, gepubliceerd via <a href="https://transparency.entsoe.eu/">ENTSO-E</a>) opgehaald via de publieke <a href="https://www.energyzero.nl/">EnergyZero</a>-API. Laatst bijgewerkt: ${esc(fetchedNl)}. Wordt elk uur ververst. Geen advies; controleer de tarieven van je eigen leverancier.</p><p><a href="${BASE}/zo-rekenen-we/">Zo rekenen we</a> · <a href="${BASE}/privacy/">Privacy &amp; disclosure</a> · <a href="${BASE}/feed.xml">RSS</a> · <a href="${BASE}/goedkoopste-uren.ics">Agenda (.ics)</a> · <a href="${BASE}/prices.json">Data (JSON)</a> · <a href="https://github.com/CerberosTech/stroomprijs">Broncode</a></p><p>Meer gratis tools: <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidiechecker warmtepompen</a> · <a href="https://cerberostech.github.io/deadorsupported/">Dead or Supported</a> · <a href="https://cerberostech.github.io/belastingcalculator/">Belastingcalculator 2026</a></p></div></footer>${app ? dataTag : ''}<script>${THEME_JS}</script>${app ? `<script>${APP_JS}</script>` : ''}</body></html>`;
  const f = path.join(OUT, p, p.endsWith('/') ? 'index.html' : ''); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, html);
}

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync('static')) fs.copyFileSync(path.join('static', f), path.join(OUT, f));
const assets = writeAssets(fs, path, OUT); // logo mark, favicons, og.png/og.svg: rendered from code, no binary files in the repo
fs.writeFileSync(path.join(OUT, 'site.webmanifest'), JSON.stringify({ name: 'Stroomprijs', short_name: 'Stroomprijs', description: 'Dynamische stroomprijs per uur, vandaag en morgen.', lang: 'nl', start_url: `${BASE}/`, scope: `${BASE}/`, display: 'standalone', background_color: '#f2f4f3', theme_color: '#0f2230', icons: [{ src: `${BASE}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }, { src: `${BASE}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }, { src: `${BASE}/icon.svg`, sizes: 'any', type: 'image/svg+xml' }] }));
console.log('brand assets:', assets.join(', '));

// ---------- dashboard ----------
const btns = `<div class="btns"><a class="btn" href="${BASE}/goedkoopste-uren.ics">${ico('cal')}Goedkoopste uren in je agenda</a><a class="btn alt" href="${BASE}/feed.xml">${ico('rss')}RSS-feed</a></div>`;
const gasCard = `<section class="sec" aria-labelledby="gas-h"><h2 id="gas-h">Gasprijs nu</h2><div data-c="gas">${R.gas(C)}</div><p class="note"><a href="${BASE}/gasprijs-vandaag/">Meer over de gasprijs</a></p></section>`;
const dataset = { '@type': 'Dataset', name: 'Dynamische stroom- en gasprijzen Nederland, vandaag en morgen', description: 'Day-ahead uurprijzen voor stroom (EUR per kWh) en dagprijzen voor gas (EUR per m³) in Nederland, excl. btw, voor vandaag en morgen. Bron: EPEX Spot day-ahead via de publieke EnergyZero-API. Elk uur ververst.', url: SITE + '/', inLanguage: 'nl-NL', isAccessibleForFree: true, creator: { '@id': ORG['@id'] }, isBasedOn: 'https://www.energyzero.nl/', temporalCoverage: `${TODAY}/${TOMORROW}`, spatialCoverage: { '@type': 'Place', name: 'Nederland' }, dateModified: data.fetched, distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/json', contentUrl: SITE + '/prices.json' }] };
page('/', { app: true, title: 'Stroomprijs nu, vandaag en morgen – dynamische energieprijzen per uur', desc: 'De dynamische stroomprijs van nu, per uur voor vandaag en morgen. Met prijsklasse A–G, de goedkoopste uren voor je wasmachine of auto, een kostenberekening en een schatting incl. belasting.', schema: graph({ '@type': 'WebSite', '@id': SITE + '/#site', name: 'Stroomprijs', url: SITE + '/', inLanguage: 'nl-NL', publisher: { '@id': ORG['@id'] } }, ORG, dataset), body: `${stale}${modebar()}
<section class="hero" data-c="hero" aria-labelledby="nu">${R.hero(C)}</section>${btns}
${planner('nu')}
${daySec('sel', 'Prijs per uur')}
<p class="no-js note">De prijzen van morgen staan op <a href="${BASE}/stroomprijs-morgen/">Stroomprijs morgen</a>.</p>
<div class="duo">${gasCard}<section class="sec"><h2>Meer weten?</h2><ul class="links"><li><a href="${BASE}/zo-rekenen-we/">Zo schatten we de prijs incl. belasting</a></li><li><a href="${BASE}/dynamisch-vs-vast-contract/">Dynamisch vs vast contract</a></li><li><a href="${BASE}/gidsen/">Gidsen over dynamische prijzen</a></li><li><a href="${BASE}/veelgestelde-vragen/">Veelgestelde vragen</a></li><li><a href="https://cerberostech.github.io/isde-checker/">Subsidie op je warmtepomp checken (ISDE)</a></li></ul></section></div>
${placeholder}${meet}${updated}` });

// ---------- vandaag / morgen ----------
page('/stroomprijs-vandaag/', { app: true, title: `Stroomprijs vandaag (${nlDate(TODAY)}) – prijs per uur`, desc: 'De dynamische stroomprijs van vandaag per uur, met prijsklasse A–G, het goedkoopste en duurste uur, het goedkoopste blok en een schatting incl. belasting.', schema: graph(crumbs(['Stroomprijs vandaag', '/stroomprijs-vandaag/'])), body: `<header class="pg-h"><h1>Stroomprijs vandaag</h1><p>${nlDate(TODAY)}</p></header>${stale}${modebar()}${daySec('today', 'Prijs per uur')}${planner('today')}<div class="prose"><p>De prijzen komen uit de day-ahead veiling van EPEX Spot voor het Nederlandse biedgebied. Die veiling vindt de dag ervoor rond 12:00 uur plaats; de uitslag wordt ook gepubliceerd op het ENTSO-E Transparency Platform. Bekijk ook de <a href="${BASE}/stroomprijs-morgen/">stroomprijs van morgen</a>.</p></div>${placeholder}${updated}` });
page('/stroomprijs-morgen/', { app: true, title: `Stroomprijs morgen (${nlDate(TOMORROW)}) – prijs per uur`, desc: 'De dynamische stroomprijs van morgen per uur, zodra de day-ahead veiling bekend is (meestal rond 13:00–15:00 uur). Met de goedkoopste uren en een planner.', schema: graph(crumbs(['Stroomprijs morgen', '/stroomprijs-morgen/'])), body: `<header class="pg-h"><h1>Stroomprijs morgen</h1><p>${nlDate(TOMORROW)}</p></header>${modebar()}${daySec('tomorrow', 'Prijs per uur')}${planner('tomorrow')}<div class="prose"><p>Morgen plannen? Abonneer je op de <a href="${BASE}/goedkoopste-uren.ics">agenda met de goedkoopste uren</a> of de <a href="${BASE}/feed.xml">RSS-feed</a>. De prijzen van morgen worden bekend na de day-ahead veiling (rond 12:00 uur); deze site ververst elk uur.</p></div>${placeholder}${updated}` });

// ---------- gas ----------
const gasDays = [...new Set(GASD.map(x => R.gasDay(x.t)))].filter(d => d >= R.gasDay(+now)).map(d => { const hs = GASD.filter(x => R.gasDay(x.t) === d); return { d, p: hs.reduce((s, x) => s + x.p, 0) / hs.length }; });
const gRate = yearRate.g;
page('/gasprijs-vandaag/', { app: true, title: `Gasprijs vandaag (${nlDate(TODAY)}) – dynamische gasprijs per m³`, desc: 'De dynamische gasprijs van vandaag per m³, gebaseerd op de day-ahead gasmarkt (TTF), via EnergyZero. Met een schatting incl. energiebelasting en btw.', schema: graph(crumbs(['Gasprijs vandaag', '/gasprijs-vandaag/'])), body: `<header class="pg-h"><h1>Gasprijs vandaag</h1><p>${nlDate(TODAY)}</p></header>${modebar(true)}<section class="sec" aria-labelledby="gas-h"><h2 id="gas-h" class="sr">Gasprijs nu</h2><div data-c="gas">${R.gas(C)}</div>
${gasDays.length ? `<div class="tbl tbl-w"><table class="rates"><caption>Gasprijs per m³ per gasdag (06:00 tot 06:00 uur)</caption><thead><tr><th scope="col">Gasdag</th><th scope="col">Excl. btw</th><th scope="col">Incl. btw</th><th scope="col">All-in*</th></tr></thead><tbody>${gasDays.map(g => `<tr><th scope="row">${nlDate(g.d, { weekday: 'short', day: 'numeric', month: 'short' })}</th><td>${eur(g.p)}</td><td>${eur(g.p * TAX.vat)}</td><td>${eur((g.p + gRate) * TAX.vat)}</td></tr>`).join('')}</tbody></table></div><p class="note">* Marktprijs + energiebelasting ${rateYear} (${eur(gRate, 5)} per m³) + 21% btw, zonder opslag van je leverancier en zonder vaste kosten. <a href="${BASE}/zo-rekenen-we/">Zo rekenen we</a>.</p>` : ''}</section>
<div class="prose"><h2>Hoe werkt een dynamische gasprijs?</h2><p>Bij een dynamisch gascontract betaal je de marktprijs voor aardgas plus een vaste opslag van je leverancier, energiebelasting en btw. De marktprijs volgt de Nederlandse groothandelsmarkt TTF en verandert per dag (niet per uur zoals stroom); leveranciers gebruiken een gasdag van 06:00 tot 06:00 uur. Wil je minder gas gebruiken? Check of je <a href="https://cerberostech.github.io/isde-checker/">ISDE-subsidie op een warmtepomp</a> kunt krijgen.</p></div>${placeholder}${updated}` });

// ---------- zo rekenen we ----------
const red = TAX.reduction[rateYear];
page('/zo-rekenen-we/', { title: 'Zo rekenen we – schatting van je stroomprijs incl. belasting', desc: `Hoe Stroomprijs de prijs incl. energiebelasting en btw schat: de formule, de tarieven voor ${rateYear} met bron, wat er niet in zit en hoe de prijsklassen A–G werken.`, schema: graph(crumbs(['Zo rekenen we', '/zo-rekenen-we/'])), body: `<header class="pg-h"><h1>Zo rekenen we</h1><p>Wat de getallen op deze site betekenen, en wat ze niet zijn.</p></header><div class="prose">
<h2>Kale marktprijs</h2><p>Standaard zie je de <b>kale marktprijs</b>: de uitkomst van de day-ahead veiling van EPEX Spot voor Nederland, opgehaald via de publieke API van EnergyZero. Die prijs is <b>exclusief btw</b>, energiebelasting en de opslag van je leverancier. Dit is de enige prijs die we echt meten.</p>
<h2>Schatting all-in</h2><p>Kies je ‘Schatting all-in’, dan rekenen we per uur:</p><p class="formula">(marktprijs + opslag leverancier + energiebelasting) × 1,21</p><p>De 1,21 is 21% btw. De opslag is standaard 0; vul de inkoopvergoeding van je eigen contract in voor een betere schatting. Je instelling blijft alleen in je eigen browser bewaard.</p>
<table class="rates"><caption>Energiebelasting ${rateYear}, eerste schijf, excl. btw</caption><thead><tr><th scope="col">Soort</th><th scope="col">Tarief</th><th scope="col">Incl. 21% btw</th></tr></thead><tbody><tr><th scope="row">Elektriciteit (0–10.000 kWh)</th><td>€&nbsp;${nf(yearRate.e, 5)} per kWh</td><td>€&nbsp;${nf(yearRate.e * TAX.vat, 5)}</td></tr><tr><th scope="row">Aardgas (0–170.000 m³)</th><td>€&nbsp;${nf(yearRate.g, 5)} per m³</td><td>€&nbsp;${nf(yearRate.g * TAX.vat, 5)}</td></tr></tbody></table>
<p>Bron: <a href="${TAX.source}">Belastingdienst, energiebelasting</a> (gecontroleerd op ${shortDate(TAX.checked)}).${TAX.rates[TODAY.slice(0, 4)] ? '' : ` Let op: de tarieven voor ${TODAY.slice(0, 4)} zijn nog niet verwerkt; we gebruiken die van ${TAX.fallback}.`}</p>
<h2>Wat er niet in zit</h2><ul><li>Vaste leveringskosten van je leverancier.</li><li>Netbeheerkosten (vast bedrag per maand).</li><li>De vermindering energiebelasting: een vast bedrag per jaar per aansluiting${red ? ` (${rateYear}: €&nbsp;${nf(red, 2)} excl. btw)` : ''}. Die hangt niet af van het uur, dus we trekken hem niet af per kWh.</li><li>Kwartierprijzen: sommige leveranciers rekenen per kwartier. Wij tonen uurprijzen.</li></ul><p>De schatting is dus een benadering van wat één extra kWh je op dat uur kost. Je echte rekening staat bij je leverancier.</p>
<h2>Waarom het goedkoopste moment niet verandert</h2><p>Belasting en opslag zijn per kWh op elk uur van de dag gelijk. Daardoor blijft het goedkoopste uur in beide weergaven hetzelfde uur. Alleen de bedragen veranderen.</p>
<h2>Prijsklasse A tot G</h2><p>Per dag delen we het verschil tussen het goedkoopste en het duurste uur in zeven gelijke stappen. Een uur in klasse A hoort bij de goedkoopste stap van die dag, klasse G bij de duurste. De kleuren en letters lijken op het energielabel, maar ze zijn relatief per dag: klasse A is niet altijd goedkoop in euro’s. Liggen de prijzen op een dag dicht bij elkaar, dan zeggen we dat erbij.</p>
<h2>De planner</h2><p>De planner zoekt het aaneengesloten blok uren met de laagste gemiddelde prijs. Het verbruik per apparaat is een voorbeeldwaarde die je zelf aanpast. We rekenen alsof het apparaat gelijkmatig verbruikt; een wasmachine verbruikt in werkelijkheid het meest aan het begin (opwarmen).</p></div>` });

// ---------- dynamisch vs vast ----------
const row = (k, a, b) => `<tr><th scope="row">${k}</th><td data-l="Dynamisch">${a}</td><td data-l="Vast">${b}</td></tr>`;
page('/dynamisch-vs-vast-contract/', { title: 'Dynamisch vs vast energiecontract – de verschillen op een rij', desc: 'Feitelijke vergelijking van een dynamisch, variabel en vast energiecontract: hoe de prijs tot stand komt, risico’s en voor wie het past. Met bronnen.', schema: graph(crumbs(['Dynamisch vs vast contract', '/dynamisch-vs-vast-contract/'])), body: `<header class="pg-h"><h1>Dynamisch vs vast energiecontract</h1></header><section class="sec"><div class="tbl-w"><table class="cmp-t"><thead><tr><td></td><th scope="col">Dynamisch</th><th scope="col">Vast</th></tr></thead><tbody>${row('Prijs stroom', 'Verandert per uur (day-ahead marktprijs + opslag)', 'Vaste prijs per kWh voor de looptijd (1–5 jaar)')}${row('Prijs gas', 'Verandert per dag', 'Vast voor de looptijd')}${row('Risico', 'Je draagt het marktrisico: pieken én dalen', 'Leverancier draagt het risico; je betaalt daar een premie voor')}${row('Opzeggen', 'Meestal maandelijks opzegbaar', 'Opzegvergoeding mogelijk bij vroegtijdig opzeggen')}${row('Slimme meter', 'Nodig', 'Niet nodig')}${row('Voordeel als…', 'Je verbruik kunt verschuiven (EV, warmtepomp, thuisbatterij, wasmachine)', 'Je zekerheid wilt over je maandbedrag')}</tbody></table></div></section>
<div class="prose"><h2>Hoe komt de dynamische prijs tot stand?</h2><p>Elke dag rond 12:00 uur sluit de day-ahead veiling van EPEX Spot. Daarin wordt per tijdsblok de groothandelsprijs voor stroom in Nederland voor de volgende dag bepaald. De uitkomst is openbaar via het ENTSO-E Transparency Platform. Je leverancier rekent die prijs door, plus een opslag (inkoopvergoeding), energiebelasting, en 21% btw. Daarnaast betaal je vaste leveringskosten en netbeheerkosten. Op zonnige of winderige momenten kan de marktprijs zelfs negatief worden. <a href="${BASE}/zo-rekenen-we/">Zo schatten wij de prijs incl. belasting</a>.</p>
<h2>Wat zijn de risico’s?</h2><p>Als de groothandelsprijs stijgt, zoals in 2022, stijgt je rekening direct mee. Bij een vast contract ben je daartegen beschermd zolang het contract loopt. Een dynamisch contract loont vooral als je stroom gebruikt wanneer die goedkoop is.</p>
<h2>Terugleveren en de salderingsregeling</h2><p>De salderingsregeling voor zonnepanelen stopt per 1 januari 2027. Daarna krijg je voor teruggeleverde stroom een terugleververgoeding van je leverancier. Bij een dynamisch contract hangt die vergoeding vaak af van de uurprijs, dus op momenten met negatieve prijzen kan terugleveren geld kosten. Check de voorwaarden van je leverancier.</p>
<h2>Bronnen</h2><ul><li><a href="https://www.consuwijzer.nl/energie/energiecontract/dynamisch-energiecontract">ConsuWijzer (ACM): dynamisch energiecontract</a></li><li><a href="https://www.rijksoverheid.nl/onderwerpen/energie-thuis/salderingsregeling">Rijksoverheid: salderingsregeling</a></li><li><a href="https://www.belastingdienst.nl/wps/wcm/connect/nl/energiebelasting/energiebelasting">Belastingdienst: energiebelasting</a></li><li><a href="https://transparency.entsoe.eu/">ENTSO-E Transparency Platform</a></li><li><a href="https://www.epexspot.com/en/market-results">EPEX Spot market results</a></li></ul></div>${placeholder}` });

// ---------- FAQ ----------
const faq = [
  ['Waar komen deze prijzen vandaan?', 'Uit de day-ahead veiling van EPEX Spot voor Nederland (ook gepubliceerd op het ENTSO-E Transparency Platform). We halen ze elk uur op via de gratis, publieke API van EnergyZero.'],
  ['Zijn dit de prijzen die ik betaal?', 'Nee, standaard zie je de kale marktprijs excl. btw. Je betaalt daarbovenop de opslag van je leverancier, energiebelasting, 21% btw, vaste leveringskosten en netbeheerkosten. Het verloop over de dag (wanneer het goedkoop is) is wel gelijk.'],
  ['Wat is de schatting all-in?', `Met de knop ‘Schatting all-in’ tellen we per kWh de energiebelasting (${rateYear}: ${nf(yearRate.e * 100, 3)} ct excl. btw) en eventueel je eigen leveranciersopslag op bij de marktprijs, en rekenen we 21% btw. Vaste kosten en de vermindering energiebelasting zitten er niet in. Het is een benadering; de pagina ‘Zo rekenen we’ legt het uit.`],
  ['Wat betekenen de letters A tot G?', 'Per dag verdelen we het verschil tussen het goedkoopste en het duurste uur in zeven gelijke stappen. A is de goedkoopste stap van die dag, G de duurste. De letters zijn relatief per dag, dus geen vaste prijsgrens.'],
  ['Hoe laat zijn de prijzen van morgen bekend?', 'De day-ahead veiling sluit rond 12:00 uur. De uitslag is meestal rond 13:00 uur bekend; deze site ververst elk uur, dus uiterlijk een uur later staan ze hier.'],
  ['Waarom is de stroomprijs soms negatief?', 'Als er veel zon- en windstroom is en weinig vraag, is er meer aanbod dan nodig. Producenten betalen dan soms om hun stroom kwijt te raken. Met een dynamisch contract kun je daarvan profiteren, al betaal je over elke kWh nog wel energiebelasting.'],
  ['Wanneer kan ik het beste mijn wasmachine aanzetten?', 'Gebruik de planner op het dashboard. Kies je apparaat, pas de duur en het verbruik aan, en je ziet het goedkoopste aaneengesloten blok vanaf nu, wat het kost en hoeveel je bespaart. Je kunt het blok ook in je agenda zetten.'],
  ['Hoe gebruik ik de agenda-feed?', 'Voeg de .ics-link toe als geabonneerde agenda in Google Agenda, Outlook of Apple Agenda. Je ziet dan automatisch het goedkoopste blok van 3 uur van vandaag en morgen.'],
  ['Kost deze site geld of verzamelt hij gegevens?', 'Nee. De site is gratis, zonder account en zonder cookies van ons. Je instellingen (weergave, opslag, kleurenschema) blijven alleen in je eigen browser. Zie de privacypagina.'],
];
page('/veelgestelde-vragen/', { title: 'Veelgestelde vragen over dynamische energieprijzen', desc: 'Antwoorden op veelgestelde vragen over dynamische stroom- en gasprijzen, de schatting incl. belasting, prijsklassen, negatieve prijzen en wanneer de prijzen van morgen bekend zijn.', schema: graph({ '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) }, crumbs(['Veelgestelde vragen', '/veelgestelde-vragen/'])), body: `<header class="pg-h"><h1>Veelgestelde vragen</h1></header><div class="faq">${faq.map(([q, a]) => `<section class="qa"><h2>${esc(q)}</h2><p>${esc(a)}</p></section>`).join('')}</div>` });

// ---------- privacy ----------
page('/privacy/', { title: 'Privacy & disclosure – Stroomprijs', desc: 'Privacyverklaring en disclosure: bol.com-partnerlinks, geen account, open bron.', body: `<header class="pg-h"><h1>Privacy &amp; disclosure</h1></header><div class="prose"><h2>Affiliatelinks van bol.com</h2><p>Wij zijn <b>partner van bol.com</b>. In het blok ‘Handig om je stroomverbruik te meten’ staan links naar zoekresultaten op bol.com, bijvoorbeeld voor een P1-meter of een slimme stekker met energiemeter. Koop je via zo’n link iets, dan krijgen wij een kleine commissie van bol.com. Jij betaalt daarvoor niets extra.</p><p>Die links staan alleen op het <a href="${BASE}/">dashboard</a> en onder elke <a href="${BASE}/gidsen/">gids</a>. Ze zijn gemarkeerd als gesponsord (<code>rel="sponsored"</code>) en hebben het label ‘Affiliatelinks’. De commissie heeft <b>geen invloed op de prijzen</b> die we tonen: die komen rechtstreeks uit de day-ahead markt (zie hieronder).</p><p>Met energieleveranciers of energievergelijkers hebben we geen affiliate- of partnerafspraken. We verdienen niets aan je keuze voor een energiecontract. Op de site staat een duidelijk gemarkeerde lege plek waar in de toekomst mogelijk een vergelijkingswidget (bijvoorbeeld via Daisycon) komt. Als dat gebeurt, passen we deze pagina aan en markeren we die links als affiliate.</p><h2>Privacy</h2><p>Geen account, geen formulieren, geen eigen cookies. De site wordt gehost op GitHub Pages; GitHub kan technische gegevens zoals je IP-adres loggen (zie de <a href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement">privacyverklaring van GitHub</a>). We tellen bezoeken anoniem met <a href="https://www.goatcounter.com/help/privacy">GoatCounter</a>: zonder cookies en zonder persoonsgegevens. Klik je op een bol.com-link, dan ga je naar de site van bol.com; daar geldt het privacy- en cookiebeleid van bol.com.</p><p>Je instellingen op deze site (kale prijs of schatting, je leveranciersopslag, licht of donker) bewaren we met <code>localStorage</code> in je eigen browser. Ze worden nergens naartoe gestuurd. Wis ze via de instellingen van je browser.</p><h2>Data</h2><p>Prijzen: EnergyZero publieke API, gebaseerd op EPEX Spot day-ahead (ENTSO-E). We doen ons best, maar geven geen garantie op juistheid. Geen financieel advies. <a href="${BASE}/zo-rekenen-we/">Zo rekenen we</a>.</p><p>Gemaakt door CerberosTech. Broncode: <a href="https://github.com/CerberosTech/stroomprijs">GitHub</a>.</p></div>` });

// ---------- 404 ----------
page('/404.html', { title: 'Pagina niet gevonden – Stroomprijs', desc: 'Deze pagina bestaat niet.', body: `<header class="pg-h"><h1>Pagina niet gevonden</h1><p>Deze pagina bestaat niet (meer).</p></header><p><a class="btn" href="${BASE}/">Naar de actuele stroomprijs</a></p>` });

// ---------- gidsen: content/gidsen/*.md -> /gidsen/<slug>/ ----------
// Front matter: title, description, slug, optional updated and published (YYYY-MM-DD). A missing folder or a bad file never breaks the build.
// The page h1 is the title, so a leading "# <title>" in the body is dropped; any other "#" heading renders as h2.
const GUIDES_DIR = 'content/gidsen';
const isDay = s => { const d = new Date(s + 'T12:00:00Z'); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d) && d.toISOString().slice(0, 10) === s; };
const plain = s => s.replace(/[*_`\\]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const dropTitleH1 = (body, title) => body.replace(/^\s*#[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*(?:\n|$)/, (h, t) => plain(t) === plain(title) ? '' : h);
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
  page(p, { title: `${g.title} – Stroomprijs`, desc: g.desc, type: 'article', modified: g.updated || undefined, schema: graph({ '@type': 'Article', headline: g.title, description: g.desc, ...(g.published ? { datePublished: g.published } : {}), ...(g.updated ? { dateModified: g.updated } : {}), url: SITE + p, mainEntityOfPage: SITE + p, inLanguage: 'nl-NL', image: `${SITE}/og.png`, author: { '@type': 'Organization', name: 'CerberosTech', url: 'https://github.com/CerberosTech' }, publisher }, crumbs(['Gidsen', '/gidsen/'], [g.title, p])), body: `<header class="pg-h"><p class="crumb"><a href="${BASE}/gidsen/">Gidsen</a></p><h1>${esc(g.title)}</h1><p>${esc(g.desc)}</p></header><article class="prose">${g.html}${AI_NOTE}</article>${meet}${g.updated ? `<p class="updated">Bijgewerkt op <time datetime="${g.updated}">${shortDate(g.updated)}</time>.</p>` : ''}` });
}
page('/gidsen/', { title: 'Gidsen over dynamische energieprijzen – Stroomprijs', desc: 'Praktische gidsen over dynamische stroom- en gasprijzen: hoe ze werken en hoe je slim je verbruik verschuift.', schema: graph(crumbs(['Gidsen', '/gidsen/'])), body: `<header class="pg-h"><h1>Gidsen</h1><p>Uitleg over dynamische energieprijzen, stap voor stap.</p></header><section class="sec gi">${guides.length ? `<ul class="guides">${guides.map(g => `<li><h2><a href="${BASE}/gidsen/${g.slug}/">${esc(g.title)}</a></h2><p>${esc(g.desc)}</p>${g.updated ? `<time datetime="${g.updated}">Bijgewerkt ${shortDate(g.updated)}</time>` : ''}</li>`).join('')}</ul>` : `<p class="empty">Er staan nog geen gidsen online. We werken eraan. Kijk intussen bij de <a href="${BASE}/veelgestelde-vragen/">veelgestelde vragen</a> of de <a href="${BASE}/dynamisch-vs-vast-contract/">vergelijking dynamisch vs vast</a>.</p>`}</section>` });
console.log(`gidsen: ${guides.length} guide(s)`);

// ---------- ICS + RSS ----------
const icsT = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const evs = [[TODAY, P.today], [TOMORROW, P.tomorrow]].filter(([, a]) => R.cheapest(a, 3)).map(([d, a]) => { const b = R.cheapest(a, 3);
  return ['BEGIN:VEVENT', `UID:goedkoopste-3u-${d}@cerberostech.github.io`, `DTSTAMP:${icsT(+now)}`, `DTSTART:${icsT(b.start)}`, `DTEND:${icsT(b.end)}`, `SUMMARY:⚡ Goedkoopste stroom ${hh(b.start)}-${hh(b.end)} (gem. ${ct(b.avg).replace(',', '.')}/kWh)`, `DESCRIPTION:Goedkoopste blok van 3 uur op ${d} (kale day-ahead prijs excl. btw). Bron: EnergyZero/EPEX. ${SITE}/`, `URL:${SITE}/`, 'TRANSP:TRANSPARENT', 'END:VEVENT'].join('\r\n'); });
fs.writeFileSync(path.join(OUT, 'goedkoopste-uren.ics'), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CerberosTech//Stroomprijs//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Goedkoopste stroom-uren', 'X-WR-TIMEZONE:Europe/Amsterdam', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', ...evs, 'END:VCALENDAR'].join('\r\n') + '\r\n');
const rssItems = [[TOMORROW, P.tomorrow], [TODAY, P.today]].filter(([, a]) => R.cheapest(a, 3)).map(([d, a]) => { const b = R.cheapest(a, 3), mn = a.reduce((m, x) => (x.p < m.p ? x : m)), sorted = [...a].sort((x, y) => x.p - y.p).slice(0, 5);
  return `<item><title>${esc(`Goedkoopste stroom ${nlDate(d)}: ${hh(b.start)}–${hh(b.end)}`)}</title><link>${SITE}/${d === TODAY ? 'stroomprijs-vandaag' : 'stroomprijs-morgen'}/</link><guid isPermaLink="false">stroomprijs-${d}</guid><pubDate>${now.toUTCString()}</pubDate><description>${esc(`Goedkoopste blok van 3 uur: ${hh(b.start)}–${hh(b.end)}, gemiddeld ${ct(b.avg)}/kWh. Goedkoopste uur: ${hh(mn.t)} (${ct(mn.p)}). Top 5 goedkoopste uren: ${sorted.map(x => `${hh(x.t)} (${ct(x.p)})`).join(', ')}. Kale day-ahead prijzen excl. btw, bron EnergyZero/EPEX.`)}</description></item>`; }).join('');
fs.writeFileSync(path.join(OUT, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Goedkoopste stroom-uren</title><link>${SITE}/</link><atom:link href="${SITE}/feed.xml" rel="self" type="application/rss+xml"/><description>Dagelijks de goedkoopste uren voor stroom in Nederland (day-ahead).</description><language>nl-nl</language><image><url>${SITE}/icon-192.png</url><title>Goedkoopste stroom-uren</title><link>${SITE}/</link></image><lastBuildDate>${now.toUTCString()}</lastBuildDate>${rssItems}</channel></rss>`);

// ---------- data, sitemap, robots ----------
const iso = a => a.map(({ t, p }) => ({ t: new Date(t).toISOString().replace('.000Z', 'Z'), p }));
const gasDayOf = d => GASD.filter(x => R.at(x.t).day === d);
fs.writeFileSync(path.join(OUT, 'prices.json'), JSON.stringify({ fetched: data.fetched, source: data.source, status: data.status, unit: 'EUR/kWh (power), EUR/m3 (gas), excl. VAT', today: TODAY, tomorrow: TOMORROW, power: { today: iso(P.today), tomorrow: iso(P.tomorrow) }, gas: { today: iso(gasDayOf(TODAY)), tomorrow: iso(gasDayOf(TOMORROW)) } }, null, 1));
const urls = ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/', '/gasprijs-vandaag/', '/dynamisch-vs-vast-contract/', '/veelgestelde-vragen/', '/privacy/', '/gidsen/', '/zo-rekenen-we/'].map(u => [u, TODAY]);
for (const g of guides) urls.push([`/gidsen/${g.slug}/`, g.updated]); // no updated date: no lastmod, rather than a false "changed today"
fs.writeFileSync(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `<url><loc>${SITE}${u}</loc>${d ? `<lastmod>${d}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log('built', fs.readdirSync(OUT).length, 'entries');
