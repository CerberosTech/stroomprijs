// Site CSS. Inlined in every page (one request less, no render-blocking file).
// Identity: the EU energy label. Hours get a class A–G (7 equal steps between the day's lowest and highest price),
// drawn as label arrows in the hero ladder, the chart bars and the hour list. Everything around it stays quiet:
// cool grey paper, white surfaces, navy ink (the logo colour), volt yellow only for the main action.
// The letter is always printed next to the colour, so the scale never relies on colour alone.
const LIGHT = '--bg:#f2f4f3;--surface:#fff;--ink:#0f2230;--ink-2:#4b5d6b;--line:#dde3e6;--line-2:#c2ccd2;--link:#0b6e4f;--edge:#0f2230;--hover:rgba(15,34,48,.05);--band:rgba(15,34,48,.08);--bar-edge:rgba(15,34,48,.28);--shade:0 1px 0 rgba(15,34,48,.04);color-scheme:light';
const DARK = '--bg:#0b1520;--surface:#111f2c;--ink:#e9eff3;--ink-2:#9fb2c0;--line:#213445;--line-2:#37526a;--link:#5fd39a;--edge:#5d7b92;--hover:rgba(255,255,255,.06);--band:rgba(255,255,255,.09);--bar-edge:rgba(0,0,0,.35);--shade:none;color-scheme:dark';
export const CSS = `
:root{${LIGHT};--volt:#ffd23f;--navy:#0f2230;
--l0:#22b24c;--l1:#8cc63f;--l2:#c9d72f;--l3:#fde32b;--l4:#fbb829;--l5:#f5813a;--l6:#f05a3c;
--display:"DIN Alternate","DIN Next","Bahnschrift","D-DIN",Barlow,"Roboto Condensed","Avenir Next Condensed","Arial Narrow",system-ui,sans-serif;
--text:system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font:1rem/1.55 var(--text);background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased}
a{color:var(--link);text-underline-offset:.18em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
:focus-visible{outline:3px solid var(--link);outline-offset:2px;border-radius:4px}
[hidden]{display:none!important}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip{position:absolute;left:1rem;top:-3rem;background:var(--ink);color:var(--bg);padding:.5rem .8rem;border-radius:8px;z-index:9}
.skip:focus{top:.6rem}
html:not(.js) .js-only{display:none!important}.js .no-js{display:none!important}
.in{max-width:70rem;margin:0 auto;padding:0 1rem}
@media(min-width:640px){.in{padding:0 1.5rem}}
h1,h2,h3{font-family:var(--display);font-weight:700;line-height:1.1;letter-spacing:-.01em;text-wrap:balance}
h1{font-size:clamp(2rem,1.5rem + 2.4vw,2.9rem);margin:0}
h2{font-size:1.45rem;margin:2.25rem 0 .75rem}
p{margin:.75rem 0}
.num,.nu-v,.fig,.stats dd,.pr-t b,.ro-v{font-family:var(--display);font-variant-numeric:tabular-nums}

/* header */
.top{border-bottom:1px solid var(--line);background:var(--bg)}
.top .in{display:flex;flex-wrap:wrap;align-items:center;gap:.25rem 1rem;padding-top:.7rem;padding-bottom:.45rem}
.brand{display:inline-flex;color:var(--ink);padding:.25rem 0;margin-right:auto}
.logo{height:2rem;width:auto;display:block}
.tt{display:inline-flex;align-items:center;gap:.4rem;min-height:2.5rem;padding:.35rem .75rem;border:1px solid var(--line-2);border-radius:999px;background:var(--surface);color:var(--ink);font:inherit;font-size:.875rem;cursor:pointer}
.tt svg{width:1.1rem;height:1.1rem;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round}
.tt .i-l,.tt .i-d,.tt .i-a{display:none}.tt[data-t=light] .i-l,.tt[data-t=dark] .i-d,.tt[data-t=auto] .i-a{display:block}
.tt:hover{border-color:var(--ink-2)}
.top nav{order:3;display:flex;gap:.2rem;overflow-x:auto;scrollbar-width:none;margin:0 -1rem;padding:0 1rem .2rem;width:calc(100% + 2rem)}
.top nav::-webkit-scrollbar{display:none}
.top nav a{color:var(--ink-2);text-decoration:none;font-size:.9375rem;padding:.45rem .7rem;border-radius:999px;white-space:nowrap}
.top nav a:hover{color:var(--ink);background:var(--hover)}
.top nav a[aria-current]{color:var(--ink);background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2);font-weight:600}
@media(min-width:960px){.top nav{order:0;width:auto;margin:0;padding:0}.brand{margin-right:1rem}.top nav{margin-right:auto}}
main.in{padding-top:1rem;padding-bottom:3rem}

/* price mode bar */
.modebar{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin:0 0 1rem}
.seg{display:inline-flex;padding:3px;border-radius:999px;background:var(--surface);box-shadow:inset 0 0 0 1px var(--line-2)}
.seg label{position:relative;display:inline-flex}
.seg input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.seg span{padding:.42rem .9rem;border-radius:999px;font-size:.9rem;font-weight:600;color:var(--ink-2);white-space:nowrap}
.seg input:checked+span{background:var(--ink);color:var(--surface)}
.seg input:focus-visible+span{outline:3px solid var(--link);outline-offset:2px}
.modebar .mb-n{font-size:.875rem;color:var(--ink-2);margin:0}
.mode-opt{display:flex;flex-wrap:wrap;gap:.5rem 1rem;align-items:center;font-size:.875rem;color:var(--ink-2);flex-basis:100%;background:var(--surface);border:1px solid var(--line);border-radius:.9rem;padding:.6rem .85rem}
.mode-opt label{display:inline-flex;align-items:center;gap:.45rem}
.mode-opt input{width:5.2rem}
input[type=text],input[type=number],select{font:inherit;color:var(--ink);background:var(--surface);border:1px solid var(--line-2);border-radius:.6rem;padding:.45rem .6rem;min-height:2.6rem}
input:focus-visible,select:focus-visible{outline:3px solid var(--link);outline-offset:1px}

/* hero: the label card */
.hero{background:var(--surface);border:2px solid var(--edge);border-radius:1.1rem;padding:1.15rem 1rem 1.25rem;display:grid;gap:1.5rem;box-shadow:var(--shade)}
@media(min-width:640px){.hero{padding:1.6rem 1.75rem}}
@media(min-width:860px){.hero{grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:2.5rem}}
.nu-h{font-family:var(--text);font-size:1rem;font-weight:600;letter-spacing:0;color:var(--ink-2)}
.nu-t{font-variant-numeric:tabular-nums;color:var(--ink)}
.nu-p{display:flex;align-items:baseline;gap:.55rem;flex-wrap:wrap;margin:.2rem 0 .1rem}
.nu-v{font-weight:700;font-size:clamp(4.25rem,3rem + 8vw,6.5rem);line-height:.92;letter-spacing:-.03em}
.nu-u{font-weight:600;color:var(--ink-2)}
.nu-m{margin:.25rem 0 0;font-size:.875rem;color:var(--ink-2)}
.nu-none{color:var(--ink-2)}
.vd{margin:1rem 0 0;padding:.65rem .9rem;border-radius:.75rem;background:var(--hover);border-left:5px solid var(--line-2)}
.vd p{margin:0}
.vd-t{font-weight:700}
.vd-s{font-size:.9375rem}
.vd-ok{border-left-color:var(--l0)}.vd-wait{border-left-color:var(--l5)}.vd-mid{border-left-color:var(--l3)}
.nx-w{margin-top:1.1rem}
.nx-t{font-family:var(--text);font-size:.875rem;font-weight:600;color:var(--ink-2);margin:0 0 .4rem;letter-spacing:0}
.nx{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:4px;font-variant-numeric:tabular-nums;text-align:center}
.nx li{display:grid;gap:2px;font-size:.75rem;color:var(--ink-2)}
.nx b{display:block;font-family:var(--display);font-size:1rem;line-height:1.9rem;border-radius:5px;color:var(--navy);background:var(--lc)}
.nx-v{font-size:.75rem}
.lab{align-self:start}
.lab-h{margin:0 0 .5rem;font-weight:600;font-size:.875rem;color:var(--ink-2)}
.lab-f{margin:.55rem 0 0;font-size:.8125rem;color:var(--ink-2)}
.lad{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.lad li{display:flex;align-items:center;gap:.5rem;min-height:2.05rem}
.arw{display:flex;align-items:center;justify-content:space-between;gap:.5rem;width:var(--w);min-height:2.05rem;padding:0 1.4rem 0 .6rem;background:var(--lc);color:var(--navy);clip-path:polygon(0 0,calc(100% - .9rem) 0,100% 50%,calc(100% - .9rem) 100%,0 100%);border-radius:3px 0 0 3px}
.arw b{font-family:var(--display);font-size:1.25rem;line-height:1}
.arw small{font-size:.75rem;font-variant-numeric:tabular-nums;white-space:nowrap;opacity:.85}
.lad li.here .arw{box-shadow:inset 0 0 0 2px var(--navy)}
.ptr{display:inline-flex;align-items:center;gap:.4rem;margin-left:auto;min-height:2.3rem;padding:0 .7rem 0 1.3rem;background:var(--ink);color:var(--surface);font-family:var(--display);font-weight:700;font-size:1.1rem;font-variant-numeric:tabular-nums;clip-path:polygon(.9rem 0,100% 0,100% 100%,.9rem 100%,0 50%);border-radius:0 4px 4px 0}
.ptr b{font-size:1.35rem}
.l0{--lc:var(--l0)}.l1{--lc:var(--l1)}.l2{--lc:var(--l2)}.l3{--lc:var(--l3)}.l4{--lc:var(--l4)}.l5{--lc:var(--l5)}.l6{--lc:var(--l6)}
.btns{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:1.25rem}
.btn{display:inline-flex;align-items:center;gap:.5rem;min-height:2.75rem;padding:.55rem 1.05rem;border-radius:.75rem;font:inherit;font-weight:650;text-decoration:none;background:var(--volt);color:var(--navy);border:0;cursor:pointer}
.btn svg{width:1.15rem;height:1.15rem;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.btn.alt{background:transparent;color:var(--ink);box-shadow:inset 0 0 0 1.5px var(--line-2)}
.btn.alt:hover{box-shadow:inset 0 0 0 1.5px var(--ink-2)}
.btn:hover{text-decoration:none;filter:brightness(1.04)}

/* sections */
.sec{background:var(--surface);border:1px solid var(--line);border-radius:1.1rem;padding:1.15rem 1rem;margin:1.25rem 0 0;box-shadow:var(--shade)}
@media(min-width:640px){.sec{padding:1.6rem 1.75rem}}
.sec-h{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;margin-bottom:.75rem}
.sec-h h2{margin:0}
.sec-h .d{margin:0;color:var(--ink-2);font-size:.9375rem}
.sec-h .more{margin-left:auto;font-size:.9375rem;font-weight:600}
.lede{margin:.25rem 0 1rem;color:var(--ink-2);max-width:40rem}
.pg-h{margin:1rem 0 1.25rem}
.pg-h p{color:var(--ink-2);margin:.4rem 0 0;font-size:1.0625rem}
.note{font-size:.8125rem;color:var(--ink-2);margin:.85rem 0 0;max-width:46rem}
.empty{border:1px dashed var(--line-2);border-radius:.75rem;padding:1rem;color:var(--ink-2);margin:.5rem 0 0}
.stale{border:2px solid var(--l5);border-radius:.9rem;padding:.75rem 1rem;margin:0 0 1rem;background:var(--surface)}

/* planner */
.pl{display:grid;gap:1rem}
.dev{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.45rem}
.dev label{position:relative;display:inline-flex}
.dev input{position:absolute;opacity:0;inset:0;margin:0;cursor:pointer}
.dev span{display:inline-flex;align-items:center;gap:.45rem;padding:.5rem .85rem .5rem .6rem;border-radius:.8rem;border:1px solid var(--line-2);font-weight:600;font-size:.9375rem;min-height:2.75rem;background:var(--surface)}
.dev svg{width:1.4rem;height:1.4rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.dev input:checked+span{background:var(--ink);color:var(--surface);border-color:var(--ink)}
.dev input:focus-visible+span{outline:3px solid var(--link);outline-offset:2px}
.dev label:hover span{border-color:var(--ink-2)}
.pl-row{display:flex;flex-wrap:wrap;gap:.75rem 1rem}
.pl-row label{display:grid;gap:.25rem;font-size:.875rem;font-weight:600;color:var(--ink-2)}
.pl-row input{width:7rem}
.pl-out{display:grid;gap:1rem;margin-top:1.25rem}
@media(min-width:760px){.pl-out{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}}
.pr-when{background:var(--hover);border-radius:1rem;padding:1rem 1.1rem}
.pr-when p{margin:0}
.pr-k{font-size:.875rem;color:var(--ink-2);font-weight:600}
.pr-t{font-size:1.25rem;font-weight:600;margin:.1rem 0}
.pr-t b{font-size:clamp(2.6rem,2rem + 3vw,3.4rem);line-height:1;letter-spacing:-.02em;margin-left:.25rem;vertical-align:-.12em}
.pr-s{font-size:.9375rem;margin-top:.35rem!important}
.pr-cost table{font-size:.9375rem}
.pr-cost caption{text-align:left;font-size:.875rem;color:var(--ink-2);padding-bottom:.35rem}
.pr-cost td{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.pr-cost th{font-weight:400;color:var(--ink);font-size:.9375rem}
.pr-cost tr.best th,.pr-cost tr.best td{font-weight:700}
.pr-save{font-weight:600;margin:.6rem 0 0}
.pr-none{margin:0;color:var(--ink-2)}
.pl-act{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:.9rem}

/* day: chart + list */
.tabs{display:inline-flex;padding:3px;border-radius:999px;background:var(--bg);box-shadow:inset 0 0 0 1px var(--line)}
.tabs button{font:inherit;font-weight:600;font-size:.9375rem;border:0;background:none;color:var(--ink-2);padding:.4rem 1rem;border-radius:999px;cursor:pointer;min-height:2.4rem}
.tabs button[aria-pressed=true]{background:var(--surface);color:var(--ink);box-shadow:0 0 0 1px var(--line-2)}
.day-g{display:grid;gap:1.5rem}
@media(min-width:1000px){.day-g{grid-template-columns:minmax(0,1.5fr) minmax(19rem,1fr);gap:2.25rem;align-items:start}}
.ch{margin:0}
.ro{display:flex;flex-wrap:wrap;align-items:baseline;gap:0 .5rem;margin:0 0 1.6rem;min-height:3.3rem;font-variant-numeric:tabular-nums}
.ro-t{flex-basis:100%;font-size:.875rem;color:var(--ink-2)}
.ro-v{font-size:1.9rem;font-weight:700;line-height:1.1}
.ro-u{font-size:.875rem;color:var(--ink-2)}
.ro-c{font-size:.8125rem;font-weight:700;padding:.1rem .45rem;border-radius:4px;background:var(--lc);color:var(--navy)}
.plot{touch-action:pan-y;cursor:crosshair;border-radius:.5rem}
.plot:focus-visible{outline-offset:6px}
.pa{position:relative;height:clamp(11rem,42vw,16rem);margin-left:2.4rem}
.pa svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.yt span{position:absolute;left:-2.4rem;right:0;border-top:1px solid var(--line);height:0}
.yt span.z{border-top-color:var(--line-2)}
.yt em{position:absolute;left:0;width:2rem;text-align:right;top:0;transform:translateY(-50%);font-style:normal;font-size:.75rem;color:var(--ink-2);font-variant-numeric:tabular-nums;background:var(--surface);padding-right:.3rem}
.b{fill:var(--lc);stroke:var(--bar-edge);stroke-width:1;vector-effect:non-scaling-stroke}
.b.past{fill:var(--line-2);stroke:none}
.b.now{stroke:var(--ink);stroke-width:2.5}
.band{fill:var(--band)}
.cmp{fill:none;stroke:var(--ink);stroke-width:1.6;stroke-dasharray:5 4;vector-effect:non-scaling-stroke;opacity:.7}
.avg{stroke:var(--ink-2);stroke-width:1.2;vector-effect:non-scaling-stroke}
.hov{fill:var(--ink);opacity:0}
.hov.on{opacity:.08}
.pin{position:absolute;top:-1.45rem;transform:translateX(-50%);font-size:.75rem;font-weight:700;line-height:1;background:var(--ink);color:var(--surface);padding:.2rem .35rem;border-radius:4px}
.xa{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));margin-left:2.4rem;padding-top:.4rem;font-size:.75rem;color:var(--ink-2);text-align:center;font-variant-numeric:tabular-nums}
@media(max-width:639px){.xa span:not(.k){visibility:hidden}}
.lg{display:flex;flex-wrap:wrap;gap:.35rem 1.1rem;font-size:.8125rem;color:var(--ink-2);margin-top:.85rem}
.lg span{display:inline-flex;align-items:center;gap:.4rem}
.lg-s{gap:2px!important}
.lg-s i{width:.7rem;height:.8rem;display:inline-block;background:var(--lc);border-radius:2px}
.lg-s i:last-of-type{margin-right:.35rem}
.sw-cmp{width:1.3rem;border-top:1.6px dashed var(--ink);opacity:.7}
.sw-avg{width:1.3rem;border-top:1.2px solid var(--ink-2)}
.sw-band{width:.9rem;height:.9rem;background:var(--band);border-radius:2px}
.lg-u{flex-basis:100%}
.stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));margin:1.5rem 0 0;border-top:1px solid var(--line)}
@media(min-width:640px){.stats{grid-template-columns:repeat(4,minmax(0,1fr))}}
.stats div{padding:.8rem .5rem .8rem 0;border-bottom:1px solid var(--line)}
.stats dt{font-size:.8125rem;color:var(--ink-2)}
.stats dd{margin:0;font-size:1.4rem;font-weight:700}
.stats dd.s{font-family:var(--text);font-size:.8125rem;font-weight:400;color:var(--ink-2)}

/* hour list */
.hl-w h3{font-family:var(--text);font-size:.9375rem;letter-spacing:0;margin:0 0 .5rem}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:.5rem .55rem;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
thead th{font-size:.8125rem;font-weight:600;color:var(--ink-2)}
table.hl{font-size:.875rem}
table.hl caption{text-align:left;font-size:.8125rem;color:var(--ink-2);padding-bottom:.4rem}
table.hl th,table.hl td{padding:.18rem .4rem;border-bottom:0}
table.hl thead th{border-bottom:1px solid var(--line);padding-bottom:.35rem}
table.hl tbody th{font-weight:400;white-space:nowrap;color:var(--ink-2);width:1%}
.hl-a{width:100%}
.hl-a .arw{display:inline-flex;min-height:1.45rem;padding:0 1rem 0 .45rem;clip-path:polygon(0 0,calc(100% - .7rem) 0,100% 50%,calc(100% - .7rem) 100%,0 100%);vertical-align:middle}
.hl-a .arw b{font-size:.95rem}
.hl-v{text-align:right!important;font-weight:600;white-space:nowrap}
table.hl tr.is-past th,table.hl tr.is-past .hl-v{color:var(--ink-2);font-weight:400}table.hl tr.is-past .arw{background:var(--line);color:var(--ink-2)}
table.hl tr.is-now th,table.hl tr.is-now td{background:var(--hover);font-weight:700;color:var(--ink)}
table.hl tr.is-pl th{box-shadow:inset 3px 0 0 var(--ink)}
.tag{display:inline-block;margin-left:.4rem;font-size:.6875rem;font-weight:700;line-height:1.5;padding:0 .35rem;border-radius:4px;vertical-align:middle;white-space:nowrap}
.tag.now{background:var(--ink);color:var(--surface)}
.tag.gp{box-shadow:inset 0 0 0 1px var(--ink)}
.tag.cb{box-shadow:inset 0 0 0 1px var(--line-2);color:var(--ink-2);font-weight:600}
.tbl{margin-top:1rem}
.tbl-w{overflow-x:auto}

/* gas + misc cards */
.duo{display:grid;gap:1.25rem;margin-top:1.25rem}
@media(min-width:880px){.duo{grid-template-columns:1fr 1fr}}
.duo .sec{margin-top:0}
.duo h2{margin-top:0}
.fig{font-size:clamp(2.6rem,2rem + 3vw,3.4rem);font-weight:700;letter-spacing:-.02em;line-height:1;margin:.25rem 0 .5rem}
.fig small{font-family:var(--text);font-size:1rem;font-weight:600;letter-spacing:0;color:var(--ink-2);margin-left:.45rem}
.fig-m,.fig-n{font-size:.875rem;color:var(--ink-2);margin:.3rem 0}
.fig-n b{color:var(--ink)}
.links{list-style:none;padding:0;margin:0}
.links li{border-top:1px solid var(--line)}
.links li:first-child{border-top:0}
.links a{display:block;padding:.7rem 0;font-weight:600;text-decoration:none}
.links a:hover{text-decoration:underline}
.ph{border:2px dashed var(--line-2);border-radius:1.1rem;padding:1.25rem;margin:1.25rem 0 0;color:var(--ink-2);display:grid;gap:.3rem}
.ph b{color:var(--ink);font-family:var(--display);font-size:1.1rem}
.ph .small{font-size:.875rem}
.meet h2{margin:0 0 .25rem;font-size:1.15rem}
.meet p{margin:0;color:var(--ink-2);font-size:.9375rem}
.meet .links{margin-top:.5rem}
.meet .aff{margin-top:.5rem;font-size:.8125rem}
.updated{font-size:.8125rem;color:var(--ink-2);margin:1.5rem 0 0}
.rates td,.rates th{font-size:.9375rem}
.rates td{white-space:nowrap}
.rates caption{text-align:left;font-size:.875rem;color:var(--ink-2);padding-bottom:.4rem}

/* prose, guides, faq, compare */
.prose{max-width:42rem}
.prose p,.prose li{font-size:1.0625rem}
.prose ul{padding-left:1.2rem}
.prose li{margin:.35rem 0}
.prose ol{padding-left:1.4rem}
.prose h3{font-size:1.15rem;margin:1.75rem 0 .5rem}
.prose blockquote{margin:1.25rem 0;padding:.1rem 0 .1rem 1rem;border-left:3px solid var(--link);color:var(--ink-2)}
.prose code{font:.9em ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;background:var(--hover);padding:.1em .35em;border-radius:4px}
.prose pre{background:var(--surface);border:1px solid var(--line);border-radius:.75rem;padding:.9rem 1rem;overflow-x:auto}
.prose pre code{background:none;padding:0;font-size:.875rem}
.prose hr{border:0;border-top:1px solid var(--line);margin:2rem 0}
.prose .ai-note{margin-top:2rem;padding-top:1rem;border-top:1px solid var(--line);font-size:.875rem;color:var(--ink-2)}
.prose table{margin:1rem 0}
.formula{font-family:var(--display);font-size:1.15rem;background:var(--surface);border:1px solid var(--line);border-radius:.75rem;padding:.8rem 1rem}
.crumb{margin:0 0 .4rem;font-size:.9375rem}
.sec.gi{margin-bottom:2.5rem}
.guides{list-style:none;padding:0;margin:0;display:grid;gap:1rem}
.guides li{border-top:1px solid var(--line);padding-top:1rem}
.guides li:first-child{border-top:0;padding-top:0}
.guides h2{margin:0;font-size:1.3rem}
.guides h2 a{text-decoration:none}
.guides h2 a:hover{text-decoration:underline}
.guides p{margin:.35rem 0 0}
.guides time{font-size:.8125rem;color:var(--ink-2)}
.cmp-t th[scope=row]{font-size:.9375rem}
.cmp-t thead th{font-family:var(--display);font-size:1.05rem;color:var(--ink)}
@media(max-width:639px){.cmp-t thead{display:none}.cmp-t tr{display:grid;grid-template-columns:1fr 1fr;gap:0 1rem;border-bottom:1px solid var(--line);padding:.6rem 0}.cmp-t tr:last-child{border-bottom:0}.cmp-t th,.cmp-t td{border:0;padding:.2rem 0}.cmp-t th[scope=row]{grid-column:1/-1;font-family:var(--display);font-size:1.05rem}.cmp-t td:before{content:attr(data-l);display:block;font-size:.75rem;font-weight:600;color:var(--ink-2)}}
.faq{max-width:46rem;margin-top:1rem}
.qa{border-top:1px solid var(--line);padding:1.25rem 0 .5rem}
.qa h2{margin:0;font-size:1.25rem}
.qa p{margin:.5rem 0 0}

/* footer */
.foot{border-top:1px solid var(--line);padding:2rem 0 2.5rem;font-size:.875rem;color:var(--ink-2);margin-top:1rem}
.foot .in{display:grid;gap:.25rem}
.foot .logo{height:1.6rem;margin-bottom:.5rem;color:var(--ink)}
.foot p{margin:.35rem 0;max-width:46rem}
.foot a{color:var(--ink-2)}
.foot a:hover{color:var(--ink)}

@media(prefers-reduced-motion:no-preference){.b{animation:grow .6s cubic-bezier(.2,.7,.2,1) both;transform-box:fill-box;transform-origin:bottom}}
@keyframes grow{from{transform:scaleY(0)}}
@media(forced-colors:active){.arw,.b,.nx b,.lg-s i,.ro-c,.ptr{forced-color-adjust:none}}
@media print{.top nav,.btns,.ph,.skip,.modebar,.tt,.pl,.tabs{display:none}.hero,.sec{border:1px solid #999;box-shadow:none}}
`.replace(/\/\*[^*]*\*\//g, '').replace(/\s*\n\s*/g, '');
