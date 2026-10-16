// Stroomprijs brand assets: logo mark, wordmark, favicons and the OG image. No dependencies (node:zlib only).
// One scene description renders to both SVG (inline logo, icon.svg, og.svg) and PNG (favicons, og.png),
// so the raster and vector versions can never drift apart.
import zlib from 'node:zlib';

export const C = { ink: '#0f2230', volt: '#ffd23f', mist: '#8fa4b5', slate: '#2b4559', white: '#ffffff', sub: '#b7c6d2' };

// ---------- geometric monoline font ----------
// Glyphs are polylines in em units: baseline y=0, x-height 1, ascender 1.45, descender -0.5, y up.
const arc = (cx, cy, r, a0, a1, n = 28) => Array.from({ length: n + 1 }, (_, i) => { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
const O = () => arc(.5, .5, .5, 0, 360, 44);
const dot = (x, y) => [[x, y], [x + .001, y]];
const GL = {
  a: [1, [O(), [[1, 1], [1, 0]]]],
  b: [1, [[[0, 1.45], [0, 0]], O()]],
  c: [.92, [arc(.5, .5, .5, 42, 318)]],
  d: [1, [O(), [[1, 1.45], [1, 0]]]],
  e: [1, [[[0, .5], ...arc(.5, .5, .5, 0, 318)]]],
  f: [.62, [[[.22, 0], ...arc(.52, 1.15, .3, 180, 40, 14)], [[0, 1], [.6, 1]]]],
  g: [1, [O(), [[1, 1], ...arc(.5, 0, .5, 0, -160)]]],
  h: [.9, [[[0, 1.45], [0, 0]], [...arc(.45, .55, .45, 180, 0), [.9, 0]]]],
  i: [0, [[[0, 0], [0, 1]], dot(0, 1.38)]],
  j: [.25, [[[.25, 1], ...arc(0, -.2, .25, 0, -150, 14)], dot(.25, 1.38)]],
  k: [.72, [[[0, 1.45], [0, 0]], [[.72, 1], [0, .36]], [[.26, .56], [.74, 0]]]],
  l: [0, [[[0, 1.45], [0, 0]]]],
  m: [1.2, [[[0, 1], [0, 0]], [...arc(.3, .65, .3, 180, 0, 16), [.6, 0]], [...arc(.9, .65, .3, 180, 0, 16), [1.2, 0]]]],
  n: [.9, [[[0, 1], [0, 0]], [...arc(.45, .55, .45, 180, 0), [.9, 0]]]],
  o: [1, [O()]],
  p: [1, [[[0, 1], [0, -.5]], O()]],
  q: [1, [O(), [[1, 1], [1, -.5]]]],
  r: [.58, [[[0, 1], [0, 0]], arc(.52, .48, .52, 180, 92, 14)]],
  s: [.74, [[...arc(.4, .75, .25, 12, 270, 18), ...arc(.4, .25, .25, 90, -168, 18).slice(1)]]],
  t: [.6, [[[.25, 1.32], [.25, 0]], [[0, 1], [.6, 1]]]],
  u: [.9, [[[0, 1], ...arc(.45, .45, .45, 180, 360), [.9, 1]], [[.9, .45], [.9, 0]]]],
  v: [.9, [[[0, 1], [.45, 0], [.9, 1]]]],
  w: [1.3, [[[0, 1], [.32, 0], [.65, .8], [.98, 0], [1.3, 1]]]],
  x: [.85, [[[0, 1], [.85, 0]], [[.85, 1], [0, 0]]]],
  y: [.9, [[[0, 1], [.45, 0]], [[.9, 1], [.27, -.5]]]],
  z: [.8, [[[0, 1], [.8, 1], [0, 0], [.8, 0]]]],
  ' ': [.42, []], '-': [.5, [[[0, .5], [.5, .5]]]], '.': [0, [dot(0, 0)]], ',': [0, [[[0, 0], [-.08, -.25]]]], '/': [.55, [[[0, -.2], [.55, 1.45]]]],
};
const GAP = .17; // side bearing between glyphs, in em
// Polylines in px (y down) for `str` with x-height `size`, starting at x, baseline y. Returns { lines, width }.
export function text(str, x, y, size, weight = .14) {
  const lines = []; let cx = x;
  for (const ch of str.toLowerCase()) {
    const g = GL[ch] || GL[' ']; lines.push(...g[1].map(pl => pl.map(([u, v]) => [cx + u * size, y - v * size])));
    cx += (g[0] + GAP + 2 * weight) * size;
  }
  return { lines, width: cx - x - (GAP + 2 * weight) * size, r: weight * size };
}

// ---------- scene → SVG / PNG ----------
// Items: { t:'rect', x,y,w,h,r, fill, top? (only top corners rounded) } and { t:'lines', lines, r, fill }.
export function mark(x, y, s, { bg = true, full = false, tile = C.ink } = {}) {
  const k = s / 64, it = [];
  if (bg) it.push({ t: 'rect', x, y, w: s, h: s, r: full ? 0 : 15 * k, fill: tile });
  const inset = full ? .7 : 1, ox = x + s / 2 - 32 * k * inset, oy = y + s / 2 - 32 * k * inset, kk = k * inset;
  for (const [bx, by, fill] of [[13, 15, C.mist], [27, 37, C.volt], [41, 25, C.mist]]) it.push({ t: 'rect', x: ox + bx * kk, y: oy + by * kk, w: 10 * kk, h: (50 - by) * kk, r: 3 * kk, fill, top: true });
  return it;
}
const f2 = n => +n.toFixed(2);
export function svg(items, w, h, { title = '', cls = '', bg } = {}) {
  const body = items.map(i => i.t === 'rect'
    ? (i.top ? `<path d="M${f2(i.x)} ${f2(i.y + i.h)}V${f2(i.y + i.r)}a${f2(i.r)} ${f2(i.r)} 0 0 1 ${f2(i.r)}-${f2(i.r)}h${f2(i.w - 2 * i.r)}a${f2(i.r)} ${f2(i.r)} 0 0 1 ${f2(i.r)} ${f2(i.r)}V${f2(i.y + i.h)}z" fill="${i.fill}"/>`
      : `<rect x="${f2(i.x)}" y="${f2(i.y)}" width="${f2(i.w)}" height="${f2(i.h)}"${i.r ? ` rx="${f2(i.r)}"` : ''} fill="${i.fill}"/>`)
    : `<path d="${i.lines.map(pl => 'M' + pl.map(([a, b]) => `${f2(a)} ${f2(b)}`).join('L')).join('')}" fill="none" stroke="${i.fill}" stroke-width="${f2(2 * i.r)}" stroke-linecap="round" stroke-linejoin="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${cls ? ` class="${cls}"` : ''}${title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"'}>${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;
}

// Signed distance helpers (px). Negative inside.
const sdBox = (px, py, x, y, w, h) => { const dx = Math.max(x - px, px - x - w), dy = Math.max(y - py, py - y - h); return dx > 0 || dy > 0 ? Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) : Math.max(dx, dy); };
const sdRRect = (px, py, x, y, w, h, r) => sdBox(px, py, x + r, y + r, w - 2 * r, h - 2 * r) - r;
const sdSeg = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy, t = l ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l)) : 0; return Math.hypot(px - ax - t * vx, py - ay - t * vy); };
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export function png(items, w, h, bg) {
  const buf = new Float32Array(w * h * 4); // premultiplied RGBA
  if (bg) { const [r, g, b] = rgb(bg); for (let i = 0; i < w * h; i++) buf.set([r, g, b, 1], i * 4); }
  const paint = (x0, y0, x1, y1, sd, fill) => {
    const [r, g, b] = rgb(fill);
    for (let py = Math.max(0, Math.floor(y0)); py < Math.min(h, Math.ceil(y1)); py++) for (let px = Math.max(0, Math.floor(x0)); px < Math.min(w, Math.ceil(x1)); px++) {
      const a = Math.max(0, Math.min(1, .5 - sd(px + .5, py + .5))); if (!a) continue;
      const o = (py * w + px) * 4, k = 1 - a; buf[o] = r * a + buf[o] * k; buf[o + 1] = g * a + buf[o + 1] * k; buf[o + 2] = b * a + buf[o + 2] * k; buf[o + 3] = a + buf[o + 3] * k;
    }
  };
  for (const i of items) {
    if (i.t === 'rect') paint(i.x - 1, i.y - 1, i.x + i.w + 1, i.y + i.h + 1, i.top ? (px, py) => Math.max(sdRRect(px, py, i.x, i.y, i.w, i.h + i.r, i.r), sdBox(px, py, i.x, i.y, i.w, i.h)) : (px, py) => sdRRect(px, py, i.x, i.y, i.w, i.h, i.r), i.fill);
    else for (const pl of i.lines) { // one pass per polyline, bounded by its own box
      const xs = pl.map(p => p[0]), ys = pl.map(p => p[1]), m = i.r + 1.5;
      paint(Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m, (px, py) => { let d = Infinity; for (let j = 0; j < pl.length - 1; j++) d = Math.min(d, sdSeg(px, py, ...pl[j], ...pl[j + 1])); return d - i.r; }, i.fill);
    }
  }
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4, a = buf[o + 3], q = y * (w * 4 + 1) + 1 + x * 4;
    for (let c = 0; c < 3; c++) raw[q + c] = Math.round((a ? buf[o + c] / a : 0) * 255); raw[q + 3] = Math.round(a * 255);
  }
  const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4); len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
const CRC = Array.from({ length: 256 }, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = ~0; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };

// ---------- composed assets ----------
// Header logo: mark + wordmark, coloured by CSS (currentColor) so it follows light/dark mode.
export function logo() {
  const wm = text('stroomprijs', 44, 25.5, 13.2, .13);
  const it = [...mark(0, 2, 32), { t: 'lines', lines: wm.lines, r: wm.r, fill: 'currentColor' }];
  return svg(it, Math.ceil(44 + wm.width + wm.r + 1), 36, { title: 'Stroomprijs', cls: 'logo' });
}
export const icon = () => svg(mark(0, 0, 64), 64, 64);
export function og() {
  const W = 1200, H = 630, it = [...mark(80, 80, 104, { tile: '#1c374c' })];
  const wm = text('stroomprijs', 220, 166, 62, .135); it.push({ t: 'lines', lines: wm.lines, r: wm.r, fill: C.white });
  for (const [s, y] of [['dynamische stroomprijs per uur,', 258], ['vandaag en morgen, met de goedkoopste uren', 308]]) { const t = text(s, 84, y, 19.5, .12); it.push({ t: 'lines', lines: t.lines, r: t.r, fill: C.sub }); }
  // A typical Dutch day-ahead curve (ct/kWh); the cheapest 3 hours in volt yellow.
  const day = [9, 8.4, 8, 7.8, 8.2, 9.6, 13, 17, 15.4, 11, 8, 6, 4.6, 4, 5, 7.2, 11, 18, 24, 22, 18.2, 14.5, 12, 10.2], bw = 1040 / 24;
  day.forEach((v, i) => { const hgt = v / 24 * 170; it.push({ t: 'rect', x: 80 + i * bw + 4, y: 560 - hgt, w: bw - 8, h: hgt, r: 6, fill: i >= 12 && i <= 14 ? C.volt : C.slate, top: true }); });
  const url = text('cerberostech.github.io/stroomprijs', 84, 598, 13, .12); it.push({ t: 'lines', lines: url.lines, r: url.r, fill: C.mist });
  return { items: it, W, H };
}
// Writes every brand file into `out`. Returns the list of written names.
export function writeAssets(fs, path, out) {
  const files = {
    'icon.svg': icon(),
    'favicon.png': png(mark(0, 0, 64), 64, 64),
    'apple-touch-icon.png': png(mark(0, 0, 180, { full: true }), 180, 180),
    'icon-192.png': png(mark(0, 0, 192, { full: true }), 192, 192),
    'icon-512.png': png(mark(0, 0, 512, { full: true }), 512, 512),
  };
  const o = og(); files['og.svg'] = svg(o.items, o.W, o.H, { title: 'Stroomprijs: dynamische stroomprijs per uur', bg: C.ink }); files['og.png'] = png(o.items, o.W, o.H, C.ink);
  for (const [n, d] of Object.entries(files)) fs.writeFileSync(path.join(out, n), d);
  return Object.keys(files);
}
