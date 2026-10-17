// Shared renderers for the price components (hero, planner, chart, hour list, stats, gas).
// They run twice: in Node at build time (first paint, works without JavaScript) and in the browser
// (real current hour in Europe/Amsterdam, price mode, planner input).
// makeRender must stay self-contained (no imports, no outer variables): build.mjs inlines its source
// into the page with Function.prototype.toString.
export function makeRender() {
  const TZ = 'Europe/Amsterdam', H = 3600e3, LET = 'ABCDEFG';
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const at = ms => { const o = {}; for (const x of fmt.formatToParts(new Date(ms))) o[x.type] = x.value; return { day: `${o.year}-${o.month}-${o.day}`, h: +o.hour, m: +o.minute }; };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = n => String(n).padStart(2, '0');
  const nf = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toLocaleString('nl-NL', { minimumFractionDigits: d, maximumFractionDigits: d });
  const eur = (v, d = 2) => '€\u00a0' + nf(v, d);
  const hh = ms => { const a = at(ms); return `${pad(a.h)}:${pad(a.m)}`; };
  const span = ms => `${hh(ms)}–${hh(ms + H)}`;
  const addDay = (s, n = 1) => new Date(Date.parse(s + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const nlDate = (s, o = { weekday: 'long', day: 'numeric', month: 'long' }) => new Date(s + 'T12:00:00Z').toLocaleDateString('nl-NL', { ...o, timeZone: 'UTC' });
  const mean = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  // Gas day runs 06:00–06:00 local time (also on DST days, so no fixed-offset arithmetic).
  const gasDay = t => { const a = at(t); return a.h < 6 ? addDay(a.day, -1) : a.day; };
  const dur = ms => { const m = Math.max(0, Math.round(ms / 6e4)), h = Math.floor(m / 60); return h ? `${h} u${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };

  // ---------- context: data + settings + "now" ----------
  // D: { power: [[ms, eur/kWh]], gas: [[ms, eur/m3]], tax: { vat, rates: { year: { e, g } }, fallback } }
  // S: { mode: 'kaal' | 'all', opE: eur/kWh, opG: eur/m3 } (supplier markup, excl. btw, only used in 'all')
  function ctx(D, S, now) {
    const T = D.tax, hours = D.power.map(([t, p]) => ({ t, p })), gas = D.gas.map(([t, p]) => ({ t, p }));
    const today = at(now).day, tomorrow = addDay(today), byDay = {};
    for (const x of hours) (byDay[at(x.t).day] ||= []).push(x);
    const rate = t => T.rates[at(t).day.slice(0, 4)] || T.rates[T.fallback];
    const all = S.mode === 'all';
    const c = {
      D, S, T, now, nowT: Math.floor(now / H) * H, today, tomorrow, hours, gas, all,
      key: k => (k === 'today' ? today : k === 'tomorrow' ? tomorrow : k),
      day: k => byDay[c.key(k)] || [],
      // Price per kWh (or m3) in the chosen mode. 'all' = (market + markup + energy tax) x VAT: a linear map, so the ranking of hours never changes.
      v: x => (all ? (x.p + S.opE + rate(x.t).e) * T.vat : x.p),
      vg: x => (all ? (x.p + S.opG + rate(x.t).g) * T.vat : x.p),
      cache: new Map(),
    };
    return c;
  }
  const modeNote = c => (c.all ? 'Schatting incl. energiebelasting en 21% btw' : 'Kale marktprijs, excl. btw');
  const modeShort = c => (c.all ? 'schatting all-in' : 'kale marktprijs excl. btw');

  // Price class A–G within one day: 7 equal steps between the day's lowest and highest market price.
  function lv(c, a) {
    const k = a.length && at(a[0].t).day;
    if (c.cache.has(k)) return c.cache.get(k);
    const ps = a.map(x => x.p), lo = Math.min(...ps), hi = Math.max(...ps), w = (hi - lo) / 7;
    const r = { lo, hi, w, of: p => (hi - lo < 1e-9 ? 3 : Math.min(6, Math.floor((p - lo) / w))) };
    c.cache.set(k, r); return r;
  }
  const lvOf = (c, x) => lv(c, c.day(at(x.t).day)).of(x.p);

  // Consecutive blocks of n hours (no gaps), cheapest / dearest by average market price.
  function blocks(a, n) {
    const out = [];
    for (let i = 0; i + n <= a.length; i++) if (a[i + n - 1].t - a[i].t === (n - 1) * H) { const hs = a.slice(i, i + n); out.push({ start: hs[0].t, end: hs[n - 1].t + H, hours: hs, avg: mean(hs.map(x => x.p)) }); }
    return out;
  }
  const pick = (a, n, sign) => blocks(a, n).reduce((b, x) => (!b || sign * (x.avg - b.avg) < -1e-12 ? x : b), null);
  const cheapest = (a, n) => pick(a, n, 1), dearest = (a, n) => pick(a, n, -1);
  const bavg = (c, b) => mean(b.hours.map(c.v));
  const dayWord = (c, t) => { const d = at(t).day; return d === c.today ? 'vandaag' : d === c.tomorrow ? 'morgen' : nlDate(d, { weekday: 'long' }); };

  // ---------- hero: price now + the A–G ladder ----------
  function verdict(c, cur, a) {
    const L = lv(c, a), tb = cheapest(a, 3), fut = c.hours.filter(x => x.t >= c.nowT), fb = cheapest(fut, 3);
    let k, t, s;
    if (tb && tb.hours.includes(cur)) { k = 'ok'; t = 'Goed moment'; s = `Dit uur valt in het goedkoopste blok van 3 uur van vandaag (${hh(tb.start)}–${hh(tb.end)}).`; }
    else if (fb && fb.start > cur.t && (c.v(cur) - bavg(c, fb)) * 100 >= 2) { k = 'wait'; t = 'Wacht als het kan'; s = `Vanaf ${hh(fb.start)} ${dayWord(c, fb.start)} (over ${dur(fb.start - c.now)}) kost stroom 3 uur lang gemiddeld ${nf((c.v(cur) - bavg(c, fb)) * 100)} ct per kWh minder.`; }
    else {
      const l = L.of(cur.p); k = l <= 1 ? 'ok' : l >= 5 ? 'wait' : 'mid'; t = l <= 1 ? 'Goedkoop uur' : l >= 5 ? 'Duur uur' : 'Gemiddeld uur';
      s = fb && fb.start > cur.t ? 'De komende uren wordt het niet veel goedkoper (minder dan 2 ct per kWh verschil).' : 'Het wordt hierna niet goedkoper dan nu.';
      if (!c.day('tomorrow').length) s += ' De prijzen voor morgen zijn nog niet bekend; ze komen meestal tussen 13:00 en 15:00 uur.';
    }
    if ((L.hi - L.lo) * 100 < 3) s += ` De uurprijzen liggen vandaag dicht bij elkaar (${nf((L.hi - L.lo) * 100)} ct verschil): verschuiven levert weinig op.`;
    return `<div class="vd vd-${k}"><p class="vd-t">${t}</p><p class="vd-s">${s}</p></div>`;
  }
  function hero(c) {
    const a = c.day('today'), cur = a.find(x => x.t === c.nowT);
    if (!cur) return `<div class="nu-main"><h1 class="nu-h" id="nu">Stroomprijs nu</h1><p class="nu-none">Voor dit uur staat nog geen prijs in deze pagina. Herlaad de pagina; de prijzen worden elk uur ververst.</p></div>`;
    const L = lv(c, a), k = L.of(cur.p), conv = p => c.v({ t: cur.t, p }) * 100;
    const rungs = [...LET].map((l, i) => {
      const lo = L.lo + i * L.w, hi = i === 6 ? L.hi : lo + L.w, here = i === k;
      return `<li class="l${i}${here ? ' here' : ''}"><span class="arw" style="--w:${38 + i * 10}%"><b>${l}</b><small>${L.w ? `${nf(conv(lo))}–${nf(conv(hi))}` : nf(conv(lo))}</small></span>${here ? `<span class="ptr"><b>${l}</b>${nf(conv(cur.p))}</span>` : ''}</li>`;
    }).join('');
    const nx = c.hours.filter(x => x.t > c.nowT).slice(0, 8).map(x => `<li class="l${lvOf(c, x)}"><span class="nx-h">${hh(x.t).slice(0, 2)}</span><b>${LET[lvOf(c, x)]}</b><span class="nx-v">${nf(c.v(x) * 100)}</span></li>`).join('');
    return `<div class="nu-main"><h1 class="nu-h" id="nu">Stroomprijs nu <span class="nu-t">${span(cur.t)}</span></h1>
<p class="nu-p"><span class="nu-v">${nf(c.v(cur) * 100)}</span><span class="nu-u">ct per kWh</span></p>
<p class="nu-m">${modeNote(c)}. ${c.all ? `Kale marktprijs: ${nf(cur.p * 100)} ct.` : `Met 21% btw: ${nf(cur.p * c.T.vat * 100)} ct.`}</p>
${verdict(c, cur, a)}
${nx ? `<div class="nx-w"><h2 class="nx-t">De komende uren</h2><ol class="nx" aria-label="Prijs en prijsklasse per uur, de komende ${Math.min(8, c.hours.filter(x => x.t > c.nowT).length)} uur, in ct per kWh">${nx}</ol></div>` : ''}</div>
<div class="lab"><p class="lab-h" id="lab-h">Prijsklasse van dit uur</p><p class="sr">Klasse ${LET[k]} op een schaal van A (goedkoopste uren van vandaag) tot G (duurste uren van vandaag).</p><ol class="lad" aria-hidden="true">${rungs}</ol><p class="lab-f">A = goedkoopst van vandaag, G = duurst. Bedragen in ct per kWh.</p></div>`;
  }

  // ---------- planner: cheapest consecutive block for an appliance ----------
  function pool(c, w) {
    if (w === 'tomorrow') return c.day('tomorrow');
    if (w === 'today') return c.day('today').filter(x => x.t >= c.nowT);
    return c.hours.filter(x => x.t >= c.nowT);
  }
  const best = (c, q) => (q ? cheapest(pool(c, q.w), q.n) : null);
  function plan(c, q) {
    const a = pool(c, q.w), b = cheapest(a, q.n);
    if (!b) return `<p class="pr-none">${q.w === 'tomorrow' && !a.length ? 'De prijzen voor morgen zijn nog niet bekend. Ze komen meestal tussen 13:00 en 15:00 uur binnen.' : `Er zijn te weinig uren met een bekende prijs voor een blok van ${q.n} uur. Kies een kortere duur of een ander moment.`}</p>`;
    const cost = x => mean(x.hours.map(c.v)) * q.kwh, worst = dearest(a, q.n), nowB = a[0] && a[0].t === c.nowT ? blocks(a.slice(0, q.n), q.n)[0] || null : null;
    const isNow = b.start === c.nowT, save = nowB && !isNow ? cost(nowB) - cost(b) : worst ? cost(worst) - cost(b) : 0;
    const rows = [[`Goedkoopste blok (${hh(b.start)}–${hh(b.end)})`, cost(b), 'best']];
    if (nowB && !isNow) rows.push([`Als je nu start (${hh(nowB.start)}–${hh(nowB.end)})`, cost(nowB), '']);
    if (worst && worst.start !== b.start) rows.push([`Duurste blok (${hh(worst.start)}–${hh(worst.end)} ${dayWord(c, worst.start)})`, cost(worst), '']);
    const when = isNow ? 'Start <b>nu</b>' : `Start ${dayWord(c, b.start)} om`;
    return `<div class="pr-when"><p class="pr-k">${esc(q.label)}, ${q.n} uur</p><p class="pr-t">${when} ${isNow ? '' : `<b>${hh(b.start)}</b>`}</p><p class="pr-s">${isNow ? `Het goedkoopste blok begint nu en loopt tot ${hh(b.end)}.` : `Over ${dur(b.start - c.now)}. Klaar om ${hh(b.end)}${at(b.end).day !== at(b.start).day ? ' (volgende dag)' : ''}.`} Gemiddeld ${nf(bavg(c, b) * 100)} ct per kWh.</p></div>
<div class="pr-cost"><table><caption>Kosten voor ${nf(q.kwh, q.kwh % 1 ? 1 : 0)} kWh, ${modeShort(c)}</caption><tbody>${rows.map(([k, v, cl]) => `<tr${cl ? ` class="${cl}"` : ''}><th scope="row">${k}</th><td>${eur(v)}</td></tr>`).join('')}</tbody></table>
${save > 0.005 ? `<p class="pr-save">Je bespaart ${eur(save)} ten opzichte van ${nowB && !isNow ? 'nu starten' : 'het duurste moment'}.</p>` : '<p class="pr-save">Het maakt nu weinig uit wanneer je start.</p>'}</div>`;
  }

  // ---------- chart: bars for one day, the other day as a step line, current hour, planned block ----------
  function niceStep(r) { const raw = r / 4, p = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw - 1e-9); }
  function chart(c, k, pb) {
    const a = c.day(k), other = c.day(k === 'tomorrow' ? 'today' : 'tomorrow'), isT = c.key(k) === c.today;
    if (!a.length) return `<p class="empty">${k === 'tomorrow' ? 'De prijzen voor morgen zijn nog niet bekend. De day-ahead veiling sluit om 12:00 uur; de prijzen staan hier meestal tussen 13:00 en 15:00 uur.' : 'Voor deze dag zijn geen prijzen beschikbaar.'}</p>`;
    const L = lv(c, a), n = a.length, ct = x => c.v(x) * 100, vs = a.map(ct), os = other.map(ct);
    const vmax = Math.max(0, ...vs, ...os), vmin = Math.min(0, ...vs, ...os), st = niceStep(vmax - vmin || 1);
    const hi = Math.ceil(vmax / st - 1e-9) * st || st, lo = Math.floor(vmin / st + 1e-9) * st, y = v => (hi - (v)) / (hi - lo) * 100;
    const ticks = []; for (let t = lo; t <= hi + 1e-9; t += st) ticks.push(Math.abs(t) < 1e-9 ? 0 : t);
    const ni = isT ? a.findIndex(x => x.t === c.nowT) : -1;
    const inPlan = x => pb && x.t >= pb.start && x.t < pb.end;
    const band = pb ? a.map((x, i) => (inPlan(x) ? i : -1)).filter(i => i >= 0) : [];
    const bars = a.map((x, i) => { const v = vs[i], t = y(Math.max(v, 0)), b = y(Math.min(v, 0)); return `<rect class="b l${L.of(x.p)}${i === ni ? ' now' : ''}${isT && x.t < c.nowT ? ' past' : ''}" x="${i * 10 + 1.5}" y="${t.toFixed(2)}" width="7" height="${Math.max(b - t, 0.8).toFixed(2)}"/>`; }).join('');
    const step = other.length ? 'M' + other.map((x, i) => `${i * 10} ${y(os[i]).toFixed(2)}H${i * 10 + 10}`).join('L') : '';
    const sel = ni >= 0 ? ni : a.indexOf(a.reduce((m, x) => (x.p < m.p ? x : m)));
    const oname = k === 'tomorrow' ? 'vandaag' : 'morgen', mn = a.reduce((m, x) => (x.p < m.p ? x : m)), mx = a.reduce((m, x) => (x.p > m.p ? x : m));
    const sum = `${k === 'tomorrow' ? 'Morgen' : 'Vandaag'} gemiddeld ${nf(mean(vs))} ct per kWh (${modeShort(c)}). Laagste prijs ${nf(ct(mn))} ct van ${span(mn.t)}, hoogste ${nf(ct(mx))} ct van ${span(mx.t)}.${ni >= 0 ? ` Nu: ${nf(vs[ni])} ct.` : ''}${pb && band.length ? ` Gepland blok: ${hh(pb.start)}–${hh(pb.end)}.` : ''} Alle uurprijzen staan in de tabel bij deze grafiek.`;
    return `<figure class="ch" data-k="${k}"><p class="ro" aria-live="polite">${readout(c, k, sel)}</p>
<div class="plot" tabindex="0" role="group" aria-roledescription="grafiek" aria-label="Stroomprijs per uur ${k === 'tomorrow' ? 'morgen' : 'vandaag'}. Gebruik de pijltjestoetsen om per uur de prijs te lezen." data-sel="${sel}" data-def="${sel}" style="--n:${n}">
<div class="pa"><div class="yt" aria-hidden="true">${ticks.map(t => `<span class="${t === 0 ? 'z' : ''}" style="top:${y(t).toFixed(2)}%"><em>${nf(t, Number.isInteger(st) ? 0 : Number.isInteger(+(st * 10).toFixed(6)) ? 1 : 2)}</em></span>`).join('')}</div>
<svg viewBox="0 0 ${n * 10} 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">${band.length ? `<rect class="band" x="${band[0] * 10}" y="0" width="${band.length * 10}" height="100"/>` : ''}${bars}${step ? `<path class="cmp" d="${step}"/>` : ''}<line class="avg" x1="0" x2="${n * 10}" y1="${y(mean(vs)).toFixed(2)}" y2="${y(mean(vs)).toFixed(2)}"/><rect class="hov" x="${sel * 10}" y="0" width="10" height="100"/></svg>
${ni >= 0 ? `<span class="pin" style="left:${((ni + 0.5) / n * 100).toFixed(2)}%" aria-hidden="true">nu</span>` : ''}</div>
<div class="xa" aria-hidden="true">${a.map(x => { const h = at(x.t).h; return `<span${h % 3 ? '' : ' class="k"'}>${pad(h)}</span>`; }).join('')}</div></div>
<p class="sr">${esc(sum)}</p>
<figcaption class="lg"><span class="lg-s"><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><i class="l5"></i><i class="l6"></i> klasse A tot G</span>${other.length ? `<span><i class="sw-cmp"></i>${oname} ter vergelijking</span>` : ''}<span><i class="sw-avg"></i>daggemiddelde</span>${pb && band.length ? '<span><i class="sw-band"></i>jouw geplande blok</span>' : ''}<span class="lg-u">ct per kWh, ${modeShort(c)}</span></figcaption></figure>`;
  }
  function readout(c, k, i) {
    const a = c.day(k), x = a[i]; if (!x) return '';
    const l = lv(c, a).of(x.p), tag = x.t === c.nowT ? 'Nu, ' : x.t < c.nowT ? 'Voorbij, ' : x.p === lv(c, a).lo ? 'Laagste uur, ' : '';
    return `<span class="ro-t">${tag}${span(x.t)}</span> <b class="ro-v">${nf(c.v(x) * 100)}</b> <span class="ro-u">ct per kWh</span> <span class="ro-c l${l}">klasse ${LET[l]}</span>`;
  }

  // ---------- hour list: one energy-label arrow per hour (also the table fallback for the chart) ----------
  function list(c, k, pb) {
    const a = c.day(k); if (!a.length) return '';
    const L = lv(c, a), vs = a.map(x => c.v(x) * 100), lo = Math.min(...vs), hi = Math.max(...vs), isT = c.key(k) === c.today;
    const cb = cheapest(a, 3);
    const rows = a.map((x, i) => {
      const l = L.of(x.p), now = x.t === c.nowT, past = isT && x.t < c.nowT, pl = pb && x.t >= pb.start && x.t < pb.end, inCb = cb && cb.hours.includes(x);
      const tags = [now && '<span class="tag now">nu</span>', pl && '<span class="tag gp">gepland</span>', !pl && inCb && '<span class="tag cb">goedkoopste 3 uur</span>'].filter(Boolean).join('');
      return `<tr class="${[now && 'is-now', past && 'is-past', pl && 'is-pl'].filter(Boolean).join(' ')}"><th scope="row">${span(x.t)}</th><td class="hl-a"><span class="arw l${l}" style="--w:${(hi - lo < 1e-9 ? 60 : 24 + (vs[i] - lo) / (hi - lo) * 76).toFixed(1)}%"><b>${LET[l]}</b></span>${tags}</td><td class="hl-v">${nf(vs[i], 2)}</td></tr>`;
    }).join('');
    return `<table class="hl"><caption>Uurprijzen ${nlDate(c.key(k))}, in ct per kWh (${modeShort(c)})</caption><thead><tr><th scope="col">Uur</th><th scope="col">Prijsklasse</th><th scope="col">ct/kWh</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  // ---------- stats ----------
  function stats(c, k) {
    const a = c.day(k); if (a.length < 3) return '';
    const mn = a.reduce((m, x) => (x.p < m.p ? x : m)), mx = a.reduce((m, x) => (x.p > m.p ? x : m)), cb = cheapest(a, 3);
    const d = (t, v, s, cl = '') => `<div${cl ? ` class="${cl}"` : ''}><dt>${t}</dt><dd>${v}</dd><dd class="s">${s}</dd></div>`;
    return `<dl class="stats">${d('Gemiddeld', nf(mean(a.map(c.v)) * 100) + ' ct', 'per kWh')}${d('Laagste uur', nf(c.v(mn) * 100) + ' ct', span(mn.t), 'lo')}${d('Hoogste uur', nf(c.v(mx) * 100) + ' ct', span(mx.t), 'hi')}${d('Goedkoopste 3 uur', `${hh(cb.start)}–${hh(cb.end)}`, `gem. ${nf(bavg(c, cb) * 100)} ct`, 'lo')}</dl>`;
  }

  // ---------- gas: one price per gas day (06:00–06:00) ----------
  function gas(c) {
    const gd = gasDay, cur = c.gas.find(x => x.t === c.nowT);
    if (!cur) return '<p class="empty">Voor dit moment is geen gasprijs beschikbaar.</p>';
    const day = gd(cur.t), hs = c.gas.filter(x => gd(x.t) === day), nxt = c.gas.filter(x => gd(x.t) === addDay(day));
    const v = mean(hs.map(c.vg)), nv = nxt.length ? mean(nxt.map(c.vg)) : null;
    return `<p class="fig">${eur(v, 3)}<small>per m³</small></p><p class="fig-m">${modeNote(c)}. Gasdag ${nlDate(day, { day: 'numeric', month: 'long' })} 06:00 tot ${nlDate(addDay(day), { day: 'numeric', month: 'long' })} 06:00.</p>${nv !== null ? `<p class="fig-n">Volgende gasdag: <b>${eur(nv, 3)}</b> per m³ (${nv > v ? '+' : nv < v ? '−' : '±'}${nf(Math.abs(nv - v) * 100)} ct).</p>` : '<p class="fig-n">De gasprijs voor de volgende gasdag is nog niet bekend.</p>'}`;
  }

  const date = (c, k) => nlDate(c.key(k));
  // Short sentence for the screen-reader live region after a planner change.
  const planSay = (c, q) => { const b = best(c, q); return b ? `${q.label}: goedkoopste blok ${b.start === c.nowT ? 'begint nu' : `start ${dayWord(c, b.start)} om ${hh(b.start)}`}, tot ${hh(b.end)}.` : `${q.label}: geen blok van ${q.n} uur gevonden.`; };
  return { gasDay, planSay, at, esc, nf, eur, hh, span, nlDate, addDay, ctx, lv, blocks, cheapest, dearest, best, hero, plan, chart, readout, list, stats, gas, date, H, LET };
}
