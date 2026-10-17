// Client glue. build.mjs wraps this in an IIFE after "const R = (makeRender)();" (see lib/render.mjs).
// Everything here is progressive enhancement: without JavaScript the page shows the build-time render.
// Language from <html lang> (R is made for the same language): English shows the markup in €/kWh with a decimal point,
// Dutch in ct/kWh with a decimal comma. The stored value is always ct/kWh, so both languages share the setting.
const EN = R.en;
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode: keep it for this visit only */ } },
};
const num = (v, d = 0) => { const n = parseFloat(String(v).replace(',', '.')); return isFinite(n) ? n : d; };

const dataEl = $('#sp-data');
if (dataEl) {
  const D = JSON.parse(dataEl.textContent);
  const S = { mode: store.get('sp-mode', 'kaal') === 'all' ? 'all' : 'kaal', opE: num(store.get('sp-opE', '0')) / 100, opG: num(store.get('sp-opG', '0')) };
  const st = { day: 'today' };
  let c, pb, hourShown = -1;

  // ---------- settings: price mode + supplier markup ----------
  $$('input[name="mode"]').forEach(r => { r.checked = r.value === S.mode; r.addEventListener('change', () => { if (!r.checked) return; S.mode = r.value; store.set('sp-mode', S.mode); syncMode(); render(); }); });
  const opE = $('#opE'), opG = $('#opG');
  if (opE) { opE.value = EN ? String(+S.opE.toFixed(5)) : String(+(S.opE * 100).toFixed(3)).replace('.', ','); opE.addEventListener('input', () => { S.opE = Math.max(0, Math.min(50, num(opE.value) * (EN ? 100 : 1))) / 100; store.set('sp-opE', String(S.opE * 100)); render(); }); }
  if (opG) { opG.value = EN ? String(+S.opG.toFixed(4)) : String(+S.opG.toFixed(4)).replace('.', ','); opG.addEventListener('input', () => { S.opG = Math.max(0, Math.min(5, num(opG.value))); store.set('sp-opG', String(S.opG)); render(); }); }
  function syncMode() { $$('.mode-opt').forEach(o => { o.hidden = S.mode !== 'all'; }); document.documentElement.dataset.mode = S.mode; }
  syncMode();

  // ---------- day switch (dashboard) ----------
  $$('[data-day-tab]').forEach(b => b.addEventListener('click', () => { st.day = b.dataset.dayTab; $$('[data-day-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); render(); }));

  // ---------- planner ----------
  const form = $('#planner');
  function query() {
    if (!form) return null;
    const dev = $('input[name="dev"]:checked', form) || $('input[name="dev"]', form);
    return { label: dev.dataset.label, n: Math.max(1, Math.min(12, parseInt(form.n.value, 10) || 1)), kwh: Math.max(0.1, Math.min(500, num(form.kwh.value, 1))), w: form.w.value };
  }
  if (form) {
    form.addEventListener('submit', e => e.preventDefault());
    $$('input[name="dev"]', form).forEach(r => r.addEventListener('change', () => { form.n.value = r.dataset.n; form.kwh.value = EN ? String(r.dataset.kwh) : String(r.dataset.kwh).replace('.', ','); render(); say(); }));
    ['n', 'w'].forEach(k => form[k].addEventListener('change', () => { render(); say(); }));
    form.kwh.addEventListener('input', render); form.kwh.addEventListener('change', () => say());
    const ics = $('#plan-ics');
    if (ics) ics.addEventListener('click', () => {
      const q = query(); if (!pb) return;
      const t = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CerberosTech//Stroomprijs//NL', 'BEGIN:VEVENT', `UID:plan-${pb.start}-${q.n}@cerberostech.github.io`, `DTSTAMP:${t(Date.now())}`, `DTSTART:${t(pb.start)}`, `DTEND:${t(pb.end)}`, EN ? `SUMMARY:Switch on: ${q.label} (cheapest ${q.n} hour${q.n === 1 ? '' : 's'})` : `SUMMARY:${q.label} aanzetten (goedkoopste ${q.n} uur)`, EN ? `DESCRIPTION:Cheapest block according to the day-ahead prices. ${location.href.split('#')[0]}` : `DESCRIPTION:Goedkoopste blok volgens de day-ahead prijzen. ${location.href.split('#')[0]}`, 'BEGIN:VALARM', 'ACTION:DISPLAY', EN ? 'DESCRIPTION:Cheapest electricity starts' : 'DESCRIPTION:Goedkoopste stroom begint', 'TRIGGER:-PT10M', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body + '\r\n'], { type: 'text/calendar' })); a.download = EN ? 'cheapest-block.ics' : 'goedkoopste-blok.ics'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      // GoatCounter event "plan-ics". When count.js has bound the button's data-goatcounter-click, it already counted
      // this click; count here only if it has not, so each download is counted once. No GoatCounter (blocked): no-op.
      try { if (!ics.dataset.goatcounterBound && typeof window.goatcounter?.count === 'function') window.goatcounter.count({ path: 'plan-ics', event: true }); } catch (e) { /* analytics must never break the download */ }
    });
  }

  // ---------- render all components ----------
  const put = (el, html) => { if (el.innerHTML !== html) el.innerHTML = html; };
  const say = () => { const el = $('#plan-say'), q = query(); if (el && q) el.textContent = R.planSay(R.ctx(D, S, Date.now()), q); };
  const dayOf = el => (el.dataset.day === 'sel' ? st.day : el.dataset.day);
  function render() {
    c = R.ctx(D, S, Date.now()); hourShown = c.nowT;
    const q = query(); pb = R.best(c, q);
    $$('[data-c]').forEach(el => {
      const k = dayOf(el);
      switch (el.dataset.c) {
        case 'hero': put(el, R.hero(c)); break;
        case 'plan': put(el, q ? R.plan(c, q) : ''); break;
        case 'chart': el.innerHTML = R.chart(c, k, pb); break;
        case 'list': el.innerHTML = R.list(c, k, pb); break;
        case 'stats': el.innerHTML = R.stats(c, k); break;
        case 'gas': el.innerHTML = R.gas(c); break;
        case 'date': el.textContent = R.date(c, k); break;
        case 'unit': el.textContent = EN ? (S.mode === 'all' ? 'all-in estimate' : 'market price excl. VAT') : S.mode === 'all' ? 'schatting all-in' : 'kale marktprijs excl. btw'; break;
      }
    });
    const ics = $('#plan-ics'); if (ics) ics.hidden = !pb;
    const stale = $('#stale'); if (stale) stale.hidden = c.day('today').some(x => x.t === c.nowT);
  }
  render();
  // Keep "now" and the countdowns right when the tab stays open; full redraw when the hour changes.
  const tick = () => { if (Math.floor(Date.now() / R.H) * R.H !== hourShown) render(); else { c = R.ctx(D, S, Date.now()); $$('[data-c="hero"]').forEach(el => put(el, R.hero(c))); const q = query(); $$('[data-c="plan"]').forEach(el => { if (q) put(el, R.plan(c, q)); }); } };
  setInterval(tick, 60e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });

  // ---------- chart readout: pointer, touch and keyboard ----------
  const show = (pl, i, mark) => {
    const fig = pl.closest('.ch'), k = fig.dataset.k, n = +getComputedStyle(pl).getPropertyValue('--n');
    i = Math.max(0, Math.min(n - 1, i)); pl.dataset.sel = i;
    $('.ro', fig).innerHTML = R.readout(c, k, i);
    const hv = $('.hov', pl); if (hv) { hv.setAttribute('x', i * 10); hv.classList.toggle('on', mark); }
  };
  const idx = (pl, e) => { const r = $('svg', pl).getBoundingClientRect(), n = +getComputedStyle(pl).getPropertyValue('--n'); return Math.floor((e.clientX - r.left) / r.width * n); };
  document.addEventListener('pointermove', e => { const pl = e.target.closest && e.target.closest('.plot'); if (pl) show(pl, idx(pl, e), true); });
  document.addEventListener('pointerdown', e => { const pl = e.target.closest && e.target.closest('.plot'); if (pl) show(pl, idx(pl, e), true); });
  document.addEventListener('pointerout', e => { const pl = e.target.closest && e.target.closest('.plot'); if (pl && e.pointerType !== 'touch' && !pl.contains(e.relatedTarget) && document.activeElement !== pl) show(pl, +pl.dataset.def, false); });
  document.addEventListener('focusin', e => { if (e.target.classList && e.target.classList.contains('plot')) show(e.target, +e.target.dataset.sel, true); });
  document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('plot')) show(e.target, +e.target.dataset.def, false); });
  document.addEventListener('keydown', e => {
    const pl = document.activeElement; if (!pl || !pl.classList || !pl.classList.contains('plot')) return;
    const n = +getComputedStyle(pl).getPropertyValue('--n'), cur = +pl.dataset.sel;
    const m = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
    const nx = m ? cur + m : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
    if (nx === null) return; e.preventDefault(); show(pl, nx, true);
  });
}
