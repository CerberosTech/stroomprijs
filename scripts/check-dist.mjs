#!/usr/bin/env node
// Checks a build in dist/ (run after `node build.mjs`): every NL/EN route exists, lang, self canonical, reciprocal hreflang
// (nl/en/x-default), header switcher, GoatCounter, og:locale, #vergelijker on both languages, no decimal commas or Dutch
// UI words on EN pages, valid JSON-LD, sitemap URLs + xhtml:link alternates, required static files, and no broken internal
// links or anchors. Usage: node scripts/check-dist.mjs (exit code 1 on any problem). No dependencies.
import fs from 'node:fs'; import path from 'node:path';
const SITE = 'https://cerberostech.github.io/stroomprijs', BASE = '/stroomprijs', OUT = 'dist';
const errs = [], ok = m => console.log('ok  ', m), err = m => errs.push(m);
const file = u => { let p = u.replace(SITE, '').replace(/^\/stroomprijs(?=\/|$)/, '').split('#')[0].split('?')[0]; if (p === '') p = '/'; return path.join(OUT, p.endsWith('/') ? p + 'index.html' : p); };
const pages = []; (function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (f.endsWith('.html')) pages.push(p); } })(OUT);
const urlOf = f => { const r = '/' + path.relative(OUT, f).replace(/index\.html$/, ''); return r; };
const PAIRS = { '/': '/en/', '/stroomprijs-vandaag/': '/en/electricity-price-today/', '/stroomprijs-morgen/': '/en/electricity-price-tomorrow/', '/gasprijs-vandaag/': '/en/gas-price-today/', '/dynamisch-vs-vast-contract/': '/en/dynamic-vs-fixed-contract/', '/veelgestelde-vragen/': '/en/faq/', '/zo-rekenen-we/': '/en/methodology/', '/privacy/': '/en/privacy/', '/affiliate-disclosure/': '/en/affiliate-disclosure/', '/gidsen/': '/en/guides/', '/over/': '/en/about/', '/gidsen/dynamische-stroomprijs-hoe-werkt-het/': '/en/guides/dynamic-electricity-price-how-it-works/', '/gidsen/goedkoopste-uren-stroom-vandaag/': '/en/guides/cheapest-electricity-hours-today/', '/gidsen/einde-salderingsregeling-2027-dynamisch-contract/': '/en/guides/end-of-net-metering-2027-dynamic-contract/' };
// 1. routes
for (const [nl, en] of Object.entries(PAIRS)) for (const u of [nl, en]) fs.existsSync(file(u)) ? 0 : err(`missing route ${u}`);
ok(`${Object.keys(PAIRS).length * 2} paired routes checked`);
const html = {}; for (const f of pages) html[urlOf(f)] = fs.readFileSync(f, 'utf8');
const attr = (tag, a) => (new RegExp(`${a}="([^"]*)"`).exec(tag) || [])[1];
for (const [u, h] of Object.entries(html)) {
  if (u.startsWith('/google') || u.startsWith('/a95c')) continue; // verification files
  const en = u.startsWith('/en/'), is404 = u === '/404.html';
  const lang = /<html lang="([^"]+)"/.exec(h)?.[1];
  if (lang !== (en ? 'en' : 'nl')) err(`${u}: html lang=${lang}`);
  const canon = /<link rel="canonical" href="([^"]+)"/.exec(h)?.[1];
  if (canon !== SITE + u) err(`${u}: canonical ${canon}`);
  if (!h.includes('data-goatcounter="https://stroomprijs.goatcounter.com/count"')) err(`${u}: no GoatCounter`);
  const og = /og:locale" content="([^"]+)"/.exec(h)?.[1]; if (og !== (en ? 'en_GB' : 'nl_NL')) err(`${u}: og:locale ${og}`);
  // hreflang
  const hl = Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(m => [m[1], m[2]]));
  const nlU = en ? Object.keys(PAIRS).find(k => PAIRS[k] === u) : u, enU = PAIRS[nlU];
  if (enU && !is404) {
    const want = { nl: SITE + nlU, en: SITE + enU, 'x-default': SITE + nlU };
    if (JSON.stringify(hl) !== JSON.stringify(want)) err(`${u}: hreflang ${JSON.stringify(hl)}`);
    const other = html[en ? nlU : enU]; // reciprocity: the other page points back here
    if (!other || !other.includes(`hreflang="${en ? 'en' : 'nl'}" href="${SITE + u}"`)) err(`${u}: hreflang not reciprocal`);
  } else if (!is404) err(`${u}: page has no pair`);
  // switcher
  const sw = /<a class="lang"[^>]*>(EN|NL)<\/a>/.exec(h);
  if (!sw) err(`${u}: no language switcher`); else {
    const t = sw[0], target = attr(t, 'href').replace(BASE, '');
    const want = is404 ? '/en/' : en ? nlU : enU;
    if (target !== want || attr(t, 'hreflang') !== (en ? 'nl' : 'en') || attr(t, 'lang') !== (en ? 'nl' : 'en') || !attr(t, 'aria-label')) err(`${u}: switcher ${t}`);
  }
  // vergelijker placeholder on the same pages in both languages
  if (enU && /id="vergelijker"/.test(html[nlU]) !== /id="vergelijker"/.test(html[enU])) err(`${u}: vergelijker mismatch`);
  if (en) {
    const text = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
    const comma = text.match(/€\s?\d+,\d|\d,(?!\d{3}\b)\d+ ?(ct|€|kWh)/g); if (comma) err(`${u}: decimal comma: ${comma.slice(0, 3)}`);
    const dutch = text.match(/\b(btw|Kale marktprijs|vandaag|morgen|Bijgewerkt|Gidsen|Veelgestelde|Zo rekenen)\b/g); if (dutch && !u.includes('/guides/')) err(`${u}: Dutch words: ${[...new Set(dutch)]}`);
    if (u !== '/en/privacy/' && u !== '/en/guides/' && !/guides\/./.test(u) && !/market price excl\. VAT|excl\. VAT/.test(text) && /€/.test(text)) err(`${u}: shows € but never says excl. VAT`);
    if (!/goedkoopste-uren\.ics/.test(h)) err(`${u}: no .ics link`);
  }
  // internal links
  for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let l = m[1].replace(/&amp;/g, '&');
    if (l.startsWith(SITE)) l = BASE + l.slice(SITE.length);
    if (!l.startsWith(BASE)) { if (l.startsWith('/') && !l.startsWith('//')) err(`${u}: link outside base ${l}`); continue; }
    if (!fs.existsSync(file(l))) err(`${u}: broken link ${l}`);
    const id = l.split('#')[1]; if (id && !new RegExp(`id="${id}"`).test(fs.readFileSync(file(l), 'utf8'))) err(`${u}: missing anchor ${l}`);
  }
}
ok(`${Object.keys(html).length} html files checked (lang, canonical, hreflang, switcher, GoatCounter, links)`);
// JSON-LD parses
for (const [u, h] of Object.entries(html)) for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) { try { JSON.parse(m[1]); } catch (e) { err(`${u}: bad JSON-LD`); } }
ok('JSON-LD parses');
// sitemap
const sm = fs.readFileSync(path.join(OUT, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
for (const [nl, en] of Object.entries(PAIRS)) for (const u of [nl, en]) {
  if (!locs.includes(SITE + u)) err(`sitemap misses ${u}`);
  const entry = new RegExp(`<url><loc>${(SITE + u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>(.*?)</url>`).exec(sm)?.[1] || '';
  for (const [l, h] of [['nl', nl], ['en', en], ['x-default', nl]]) if (!entry.includes(`<xhtml:link rel="alternate" hreflang="${l}" href="${SITE}${h}"/>`)) err(`sitemap ${u}: no ${l} alternate`);
}
for (const l of locs) if (!fs.existsSync(file(l))) err(`sitemap URL without file: ${l}`);
if (new Set(locs).size !== locs.length) err('sitemap has duplicate URLs');
ok(`sitemap: ${locs.length} URLs`);
// files that must stay
for (const f of ['google8042a96498438aa5.html', 'a95c544e83c4d4b.html', 'c667032fb1681709c6c250736a94b6b9.txt', 'goedkoopste-uren.ics', 'feed.xml', 'prices.json', 'robots.txt', '.nojekyll', 'site.webmanifest']) fs.existsSync(path.join(OUT, f)) ? 0 : err(`missing ${f}`);
ok('verification, IndexNow key, ics, feed, prices.json present');
if (/<aside class="ph" id="vergelijker"><b>Hier komt later een energievergelijker<\/b>/.test(html['/'])) ok('NL vergelijker placeholder unchanged'); else err('NL vergelijker changed');
// "Last modified" dates are never the build date: live price pages = price data timestamp (dist/prices.json "fetched"),
// guides = front matter updated (else date), guide index = its newest guide, static pages = STATIC_UPDATED in build.mjs.
// The sitemap <lastmod> and every JSON-LD dateModified on the page must equal that date.
const fetched = JSON.parse(fs.readFileSync(path.join(OUT, 'prices.json'), 'utf8')).fetched, LIVE = new Date(fetched).toISOString().replace(/\.\d{3}Z$/, 'Z');
const STATIC = /const STATIC_UPDATED = '(\d{4}-\d{2}-\d{2})'/.exec(fs.readFileSync('build.mjs', 'utf8'))?.[1]; if (!STATIC) err('build.mjs has no STATIC_UPDATED date');
const fm = dir => fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => { const t = fs.readFileSync(path.join(dir, f), 'utf8'), g = k => (new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(t.split(/^---$/m)[1] || '') || [])[1]?.trim(); return { slug: g('slug'), day: g('updated') || g('date') }; });
const want = {};
for (const u of ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/', '/gasprijs-vandaag/']) want[u] = want[PAIRS[u]] = LIVE;
for (const u of ['/dynamisch-vs-vast-contract/', '/veelgestelde-vragen/', '/zo-rekenen-we/', '/privacy/', '/affiliate-disclosure/', '/over/']) want[u] = want[PAIRS[u]] = STATIC;
for (const [dir, base] of [['content/gidsen', '/gidsen/'], ['content/guides-en', '/en/guides/']]) { const gs = fm(dir); for (const g of gs) want[`${base}${g.slug}/`] = g.day; want[base] = gs.map(g => g.day).filter(Boolean).sort().pop() || STATIC; }
const ldNodes = h => [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].flatMap(m => { try { const j = JSON.parse(m[1]); return j['@graph'] || [j]; } catch (e) { return []; } });
for (const [u, d] of Object.entries(want)) {
  const lm = new RegExp(`<loc>${(SITE + u).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</loc>(?:<lastmod>([^<]+)</lastmod>)?`).exec(sm)?.[1];
  if (lm !== d) err(`sitemap ${u}: lastmod ${lm}, want ${d}`);
  const mods = ldNodes(html[u] || '').filter(n => n.dateModified);
  if (d && !mods.length) err(`${u}: no JSON-LD dateModified`);
  for (const n of mods) if (n.dateModified !== d) err(`${u}: ${n['@type']} dateModified ${n.dateModified}, want ${d}`);
}
for (const u of Object.keys(want).filter(u => /guides?\/.|gidsen\/./.test(u))) { const t = /<p class="updated">[^<]*<time datetime="([^"]+)"/.exec(html[u])?.[1]; if (t !== want[u]) err(`${u}: visible updated date ${t}, want ${want[u]}`); }
const fNl = new Date(fetched).toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short' }), fEn = new Date(fetched).toLocaleString('en-GB', { timeZone: 'Europe/Amsterdam', dateStyle: 'medium', timeStyle: 'short' });
for (const u of ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/', '/gasprijs-vandaag/']) for (const [x, s] of [[u, fNl], [PAIRS[u], fEn]]) { const t = /<p class="updated">([\s\S]*?)<\/p>/.exec(html[x])?.[1] || ''; if (!t.includes(s)) err(`${x}: visible "updated" line does not show the data time ${s}`); }
ok(`dates: ${Object.keys(want).length} pages, lastmod + JSON-LD dateModified (live ${LIVE}, static ${STATIC})`);
// Structured data: Dataset on the dashboard and the today/tomorrow pages, FAQPage on the FAQ pages (both languages).
for (const u of ['/', '/stroomprijs-vandaag/', '/stroomprijs-morgen/']) for (const x of [u, PAIRS[u]]) { const ds = ldNodes(html[x]).find(n => n['@type'] === 'Dataset'); if (!ds || !ds.name || !ds.description || ds.description.length < 50 || ds.url !== SITE + x || !ds.temporalCoverage || !ds.distribution) err(`${x}: no complete Dataset JSON-LD`); }
for (const x of ['/veelgestelde-vragen/', '/en/faq/']) { const f = ldNodes(html[x]).find(n => n['@type'] === 'FAQPage'), n = (html[x].match(/<section class="qa">/g) || []).length; if (!f || f.mainEntity.length !== n) err(`${x}: FAQPage JSON-LD does not match the ${n} visible questions`); }
ok('Dataset (dashboard, today, tomorrow) and FAQPage (FAQ) JSON-LD in both languages');
// GoatCounter click events on bol.com partner links, .ics links, feed links, the JSON data link, links to the other
// CerberosTech tools (tool-<name> in the page, footer-<name> in the footer), the vergelijker disclosure link, every .btn
// link and the planner's .ics button.
let clicks = 0; const events = {};
for (const [u, h] of Object.entries(html)) {
  const foot = h.indexOf('<footer');
  for (const m of h.matchAll(/<a [^>]*>/g)) {
    const a = m[0], href = (attr(a, 'href') || '').replace(/&amp;/g, '&'), ev = attr(a, 'data-goatcounter-click'), tool = /^https:\/\/cerberostech\.github\.io\/(isde-checker|deadorsupported|belastingcalculator|woningmarkt)\//.exec(href)?.[1];
    const w = href.startsWith('https://partner.bol.com/') ? 'bol-' + new URL(href).searchParams.get('name') : /\.ics(?:[?#]|$)/.test(href) ? 'ics-download' : /\/feed\.xml(?:[?#]|$)/.test(href) ? 'rss-feed' : /\/prices\.json(?:[?#]|$)/.test(href) ? 'data-json' : tool ? (foot >= 0 && m.index > foot ? 'footer-' : 'tool-') + tool : null;
    if (w && ev !== w) err(`${u}: ${href.slice(0, 60)} has click event ${ev}, want ${w}`);
    if (/class="btn[ "]/.test(a) && !ev) err(`${u}: CTA button ${href} has no click event`);
    if (ev) { clicks++; events[ev] = (events[ev] || 0) + 1; }
  }
  if (/id="vergelijker"/.test(h) && !/id="vergelijker">[\s\S]*?<a [^>]*data-goatcounter-click="vergelijker-disclosure"[\s\S]*?<\/aside>/.test(h)) err(`${u}: vergelijker link has no click event`);
  if (h.includes('id="plan-ics"')) { if (!/<button [^>]*id="plan-ics"[^>]*data-goatcounter-click="plan-ics"/.test(h)) err(`${u}: #plan-ics has no plan-ics click event`); if (!/goatcounterBound && typeof window\.goatcounter\?\.count === 'function'\) window\.goatcounter\.count\(\{ path: 'plan-ics', event: true \}\)/.test(h)) err(`${u}: generated .ics download is not counted`); }
}
ok(`GoatCounter click events: ${clicks} links tagged: ${Object.entries(events).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`);
// Sister-site footer: one plain followed link to each of the four CerberosTech tools, on every generated page.
// English woningmarkt points at /en/ (that path returned HTTP 200). Verification files are not pages.
const SISTER_LINKS = {
  nl: [['https://cerberostech.github.io/belastingcalculator/', 'Belastingcalculator 2026 (netto salaris, zzp)'], ['https://cerberostech.github.io/isde-checker/', 'ISDE-subsidie warmtepomp checker'], ['https://cerberostech.github.io/woningmarkt/', 'Woningmarkt per gemeente'], ['https://cerberostech.github.io/deadorsupported/', 'DeadOrSupported: is your device still getting updates?']],
  en: [['https://cerberostech.github.io/belastingcalculator/en/', 'Dutch tax calculator 2026'], ['https://cerberostech.github.io/isde-checker/en/', 'ISDE heat pump subsidy checker'], ['https://cerberostech.github.io/woningmarkt/en/', 'Dutch housing market by municipality'], ['https://cerberostech.github.io/deadorsupported/', 'DeadOrSupported: is your device still getting updates?']],
};
let sisterPages = 0;
for (const [u, h] of Object.entries(html)) {
  if (u.startsWith('/google') || u.startsWith('/a95c')) continue;
  sisterPages++;
  const en = u.startsWith('/en/'), title = en ? 'More free tools' : 'Meer gratis tools';
  const foot = h.slice(h.indexOf('<footer'));
  const nav = /<nav class="sisters"[\s\S]*?<\/nav>/.exec(foot)?.[0];
  if (!nav) { err(`${u}: no sister-sites footer`); continue; }
  if (!nav.includes(`<h2>${title}</h2>`) || !nav.includes(`aria-label="${title}"`)) err(`${u}: sister title, want ${title}`);
  if ((nav.match(/<nav class="sisters"/g) || []).length !== 1 || (foot.match(/<nav class="sisters"/g) || []).length !== 1) err(`${u}: sister nav is not exactly once`);
  for (const [href, text] of SISTER_LINKS[en ? 'en' : 'nl']) {
    const n = nav.split(href).length - 1;
    if (n !== 1) err(`${u}: ${href} appears ${n} times in the sister nav`);
    if (!nav.includes(`>${text}</a>`)) err(`${u}: missing anchor “${text}”`);
  }
  if (/rel="[^"]*(nofollow|sponsored)/.test(nav)) err(`${u}: sister link is nofollow or sponsored`);
  if (/[?&](utm_|awin|clickref|fbclid)/.test(nav)) err(`${u}: sister link has tracking parameters`);
}
ok(`sister footer on ${sisterPages} pages: 4 plain links each`);
const enPages = pages.filter(f => f.startsWith(path.join(OUT, 'en') + path.sep)), noGc = enPages.filter(f => !/<script data-goatcounter="https:\/\/stroomprijs\.goatcounter\.com\/count" async src="\/\/gc\.zgo\.at\/count\.js"><\/script>/.test(fs.readFileSync(f, 'utf8')));
for (const f of noGc) err(`${f}: no GoatCounter script tag`);
ok(`GoatCounter script tag on ${enPages.length - noGc.length} of ${enPages.length} English pages (dist/en/**/*.html)`);
// Coolblue Energie affiliate links (Awin). Parsed as strings only: never request awin1.com or coolblue.nl.
// Every such link is a tracked cread.php URL with the approved ids, rel="sponsored", and a GoatCounter event
// aff-coolblue-<clickref>. Cards only on the home page and the contract / switch / saldering guides.
const COOLBLUE = { awinmid: '85163', awinaffid: '3125920', landing: 'https://www.coolblue.nl/energie' };
const COOLBLUE_PAGES = {
  '/': 'sp-home', '/en/': 'sp-en-home',
  '/dynamisch-vs-vast-contract/': 'sp-dynamisch-vs-vast-contract', '/en/dynamic-vs-fixed-contract/': 'sp-dynamic-vs-fixed-contract',
  '/gidsen/dynamische-stroomprijs-hoe-werkt-het/': 'sp-dynamische-stroomprijs-hoe-werkt-het', '/en/guides/dynamic-electricity-price-how-it-works/': 'sp-dynamic-electricity-price-how-it-works',
  '/gidsen/einde-salderingsregeling-2027-dynamisch-contract/': 'sp-einde-salderingsregeling-2027', '/en/guides/end-of-net-metering-2027-dynamic-contract/': 'sp-end-of-net-metering-2027',
};
const DISC = { nl: 'Advertentie: via deze link ontvangen we mogelijk een vergoeding van Coolblue Energie, zonder extra kosten voor jou.', en: 'Sponsored: we may earn a fee from Coolblue Energie via this link, at no extra cost to you.' };
const discHref = en => `${BASE}${en ? '/en/affiliate-disclosure/' : '/affiliate-disclosure/'}`;
let coolblue = 0; const coolblueBefore = errs.length;
for (const [u, h] of Object.entries(html)) {
  if (u.startsWith('/google') || u.startsWith('/a95c')) continue;
  const en = u.startsWith('/en/'), want = COOLBLUE_PAGES[u];
  const cards = h.match(/<aside class="aff-card"[\s\S]*?<\/aside>/g) || [];
  if (cards.length !== (want ? 1 : 0)) err(`${u}: ${cards.length} Coolblue cards, want ${want ? 1 : 0}`);
  const anchors = [...h.matchAll(/<a\s[^>]*>/g)].map(m => ({ tag: m[0], href: (attr(m[0], 'href') || '').replace(/&amp;/g, '&') }));
  const tracked = anchors.filter(a => /awin1\.com|coolblue\.nl/i.test(a.href));
  if (tracked.length !== (want ? 1 : 0)) err(`${u}: ${tracked.length} Coolblue/Awin links, want ${want ? 1 : 0}`);
  for (const a of tracked) {
    coolblue++;
    let parsed; try { parsed = new URL(a.href); } catch (e) { err(`${u}: Coolblue href is not a URL`); continue; }
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'www.awin1.com' || parsed.pathname !== '/cread.php') err(`${u}: Coolblue link is not the Awin tracking URL (${parsed.hostname}${parsed.pathname})`);
    if (parsed.searchParams.get('awinmid') !== COOLBLUE.awinmid) err(`${u}: awinmid ${parsed.searchParams.get('awinmid')}`);
    if (parsed.searchParams.get('awinaffid') !== COOLBLUE.awinaffid) err(`${u}: awinaffid ${parsed.searchParams.get('awinaffid')}`);
    if (parsed.searchParams.get('ued') !== COOLBLUE.landing) err(`${u}: ued ${parsed.searchParams.get('ued')}`);
    const clickref = parsed.searchParams.get('clickref') || '';
    if (clickref !== want) err(`${u}: clickref ${clickref}, want ${want}`);
    if (!/^sp-[a-z0-9-]+$/.test(clickref) || clickref.length > 50) err(`${u}: clickref ${clickref} is empty, odd, or longer than 50 characters`);
    const rel = (attr(a.tag, 'rel') || '').split(/\s+/).filter(Boolean);
    if (rel.join(' ') !== 'sponsored nofollow noopener') err(`${u}: rel="${rel.join(' ')}", want "sponsored nofollow noopener"`);
    if (attr(a.tag, 'target') !== '_blank') err(`${u}: Coolblue link target ${attr(a.tag, 'target')}`);
    if (attr(a.tag, 'data-goatcounter-click') !== `aff-coolblue-${clickref}`) err(`${u}: GoatCounter event ${attr(a.tag, 'data-goatcounter-click')}`);
  }
  if (want && cards[0]) {
    const card = cards[0];
    const sentence = en ? DISC.en : DISC.nl, other = en ? DISC.nl : DISC.en;
    if (!card.includes(sentence) || card.includes(other)) err(`${u}: disclosure sentence missing or in the wrong language`);
    const disc = [...card.matchAll(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].find(m => m[2] === sentence);
    if (!disc || disc[1] !== discHref(en)) err(`${u}: disclosure line does not link to ${discHref(en)}`);
    const cta = en ? 'Compare / switch to Coolblue Energie' : 'Vergelijk / overstappen naar Coolblue Energie';
    if (!new RegExp(`<a class="btn"[^>]*>${cta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</a>`).test(card)) err(`${u}: CTA text missing`);
    if ((u === '/' || u === '/en/') && !(h.indexOf('data-c="chart"') < h.indexOf('class="aff-card"') && h.indexOf('class="aff-card"') < h.indexOf('data-c="stats"'))) err(`${u}: card is not under the price chart`);
    if (h.indexOf('class="aff-card"') > h.indexOf('<footer')) err(`${u}: card is in the footer`);
  }
}
for (const [nl, en] of [['/affiliate-disclosure/', '/en/affiliate-disclosure/']]) for (const u of [nl, en]) {
  const h = html[u] || '';
  if (!h.includes(u.startsWith('/en/') ? DISC.en : DISC.nl)) err(`${u}: disclosure page does not repeat the card sentence`);
  if (/<aside class="aff-card"/.test(h)) err(`${u}: disclosure page should explain the card, not repeat it`);
}
if (errs.length === coolblueBefore) ok(`Coolblue Energie: ${coolblue} tracked links, rel=sponsored, awinmid ${COOLBLUE.awinmid}, awinaffid ${COOLBLUE.awinaffid}`);
console.log(errs.length ? `\n${errs.length} PROBLEMS:\n` + errs.join('\n') : '\nALL CHECKS PASSED');
process.exit(errs.length ? 1 : 0);
