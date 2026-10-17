// Minimal markdown + front matter parser for content/gidsen/*.md. No dependencies.
// Blocks: headings, paragraphs, ul/ol lists (nested by indent), blockquotes, fenced code, hr.
// Inline: code spans, links, **bold**, *italic* (and _/__), backslash escapes, two-space line breaks.
// All text is HTML-escaped; raw HTML in the source is shown as text, not rendered.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Front matter: "---" line, "key: value" lines, "---" line. The key ends at the first colon, so values may contain colons.
// Quotes around values are optional and stripped ('it''s' and "say \"hi\"" unescape as in YAML).
export function frontMatter(src) {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/.exec(line); if (!kv) continue;
    let v = kv[2];
    if (v.length >= 2 && (v[0] === '"' || v[0] === "'") && v.at(-1) === v[0]) v = v[0] === "'" ? v.slice(1, -1).replace(/''/g, "'") : v.slice(1, -1).replace(/\\(["\\])/g, '$1');
    meta[kv[1].toLowerCase()] = v;
  }
  return { meta, body: text.slice(m[0].length) };
}

// Only web, mail and phone links. Root-relative links ("/stroomprijs-vandaag/") get the site base path unless they have it.
// A bare guide link ("andere-gids", "andere-gids/", "../andere-gids/", optionally with "#anker") points to <base><guides>/<slug>/
// (guides: "/gidsen" by default, "/en/guides" for the English guides). Anything else (anchors, "x.pdf", "a/b") stays as written.
function href(url, base, guides = '/gidsen') {
  const u = url.trim();
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return /^(https?|mailto|tel):/i.test(u) ? u : null;
  if (u.startsWith('//')) return u;
  if (u.startsWith('/')) return base && (u === base || u.startsWith(base + '/') || u.startsWith(base + '#')) ? u : base + u;
  const g = /^(?:\.\.?\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\/?(#.*)?$/i.exec(u);
  return g ? `${base}${guides}/${g[1].toLowerCase()}/${g[2] || ''}` : u;
}

export function inline(s, base = '', inLink = false, guides = '/gidsen') {
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i], rest = s.slice(i);
    if (c === '\\' && /^[\\`*_{}[\]()#+\-.!>~|]$/.test(s[i + 1] ?? '')) { out += esc(s[i + 1]); i += 2; continue; }
    if (c === '\\' && s[i + 1] === '\n') { out += '<br>'; i += 2; continue; }
    if (c === ' ' && /^ {2,}\n/.test(rest)) { const n = /^ +\n/.exec(rest)[0].length; out += '<br>'; i += n; continue; }
    if (c === '`') {
      const m = /^(`+)([\s\S]*?[^`])\1(?!`)/.exec(rest);
      if (m) { out += `<code>${esc(m[2].replace(/\n/g, ' ').replace(/^ (.*) $/, '$1'))}</code>`; i += m[0].length; continue; }
      const run = /^`+/.exec(rest)[0]; out += esc(run); i += run.length; continue;
    }
    if (c === '[') {
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '[') depth++; else if (s[j] === ']' && --depth === 0) break; }
      const m = j < s.length && /^\(\s*(<[^>]*>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+("[^"]*"|'[^']*'))?\s*\)/.exec(s.slice(j + 1));
      if (m) {
        const url = href(m[1].replace(/^<|>$/g, ''), base, guides), label = inline(s.slice(i + 1, j), base, true, guides);
        out += url === null ? label : `<a href="${esc(url)}"${m[2] ? ` title="${esc(m[2].slice(1, -1))}"` : ''}>${label}</a>`;
        i = j + 1 + m[0].length; continue;
      }
    }
    if (c === 'h' && !inLink && !/[\p{L}\p{N}]/u.test(s[i - 1] ?? '') && /^https?:\/\/[^\s<>]/.test(rest)) {
      // Bare web address (for example in a source list): link it, without trailing punctuation.
      let url = /^https?:\/\/[^\s<>]+/.exec(rest)[0];
      while (/[.,;:!?'"*_\]]$/.test(url) || (url.endsWith(')') && url.split('(').length < url.split(')').length)) url = url.slice(0, -1);
      out += `<a href="${esc(url)}">${esc(url)}</a>`; i += url.length; continue;
    }
    if (c === '*' || c === '_') {
      const run = new RegExp(`^\\${c}+`).exec(rest)[0], prev = s[i - 1] ?? ' ';
      const opens = /\S/.test(s[i + run.length] ?? ' ') && !(c === '_' && /[\p{L}\p{N}]/u.test(prev));
      let done = false;
      for (let n = Math.min(run.length, 3); opens && n >= 1 && !done; n--) {
        const d = c.repeat(n);
        for (let j = s.indexOf(d, i + n); j !== -1; j = s.indexOf(d, j + 1)) {
          if (j === i + n || /\s/.test(s[j - 1])) continue;
          if (s[j - 1] === c || s[j + n] === c) continue; // part of a longer run: not our closer
          if (c === '_' && /[\p{L}\p{N}]/u.test(s[j + n] ?? '')) continue;
          const inner = inline(s.slice(i + n, j), base, inLink, guides);
          out += n === 3 ? `<strong><em>${inner}</em></strong>` : n === 2 ? `<strong>${inner}</strong>` : `<em>${inner}</em>`;
          i = j + n; done = true; break;
        }
      }
      if (done) continue;
      out += esc(run); i += run.length; continue;
    }
    out += esc(c); i++;
  }
  return out;
}

const indentOf = l => /^ */.exec(l.replace(/\t/g, '    '))[0].length;
const isBlank = l => !l.trim();
const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*).*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}> ?/,
  item: /^( {0,3})([-*+]|\d{1,9}[.)])([ \t]+|$)/,
};
const startsBlock = l => RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l) || RE.item.test(l);
// Inside a paragraph only a bullet or an ordered item numbered 1 starts a list ("2024. was een jaar" stays text).
const interrupts = l => { const m = RE.item.exec(l); return m ? !/\d/.test(m[2]) || parseInt(m[2], 10) === 1 : startsBlock(l); };

function slugify(s, used) {
  const b = s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/<[^>]*>/g, '').replace(/&[a-z#0-9]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sectie';
  let id = b, n = 1; while (used.has(id)) id = `${b}-${++n}`; used.add(id); return id;
}

function blocks(lines, ctx) {
  const out = []; let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) { i++; continue; }
    let m;
    if ((m = RE.fence.exec(line))) {
      const fence = m[1], pad = indentOf(line), code = []; i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${fence[0] === '`' ? '`' : '~'}{${fence.length},}\\s*$`).test(lines[i])) { code.push(lines[i].replace(new RegExp(`^ {0,${pad}}`), '')); i++; }
      i++; // closing fence (or end of input)
      out.push(`<pre><code${m[2] ? ` class="language-${esc(m[2])}"` : ''}>${esc(code.join('\n'))}</code></pre>`); continue;
    }
    if ((m = RE.heading.exec(line))) {
      // The page title is the only h1, so "#" and "##" both become h2.
      const lvl = Math.max(2, m[1].length), text = inline((m[2] || '').trim(), ctx.base, false, ctx.guides);
      out.push(`<h${lvl} id="${slugify(text, ctx.ids)}">${text}</h${lvl}>`); i++; continue;
    }
    if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }
    if (RE.quote.test(line)) {
      const q = [];
      while (i < lines.length && !isBlank(lines[i]) && (RE.quote.test(lines[i]) || !startsBlock(lines[i]))) { q.push(lines[i].replace(RE.quote, '')); i++; }
      out.push(`<blockquote>${blocks(q, ctx)}</blockquote>`); continue;
    }
    if ((m = RE.item.exec(line))) { i = list(lines, i, ctx, out); continue; }
    const para = [];
    while (i < lines.length && !isBlank(lines[i]) && !(para.length && interrupts(lines[i]))) { para.push(lines[i].replace(/^[ \t]+/, '')); i++; }
    out.push(`<p>${inline(para.join('\n').replace(/[ \t]+$/, ''), ctx.base, false, ctx.guides)}</p>`);
  }
  return out.join('');
}

function list(lines, i, ctx, out) {
  const first = RE.item.exec(lines[i]), ordered = /\d/.test(first[2]), marker = ordered ? first[2].at(-1) : first[2];
  const same = m => m && (ordered ? /\d/.test(m[2]) && m[2].at(-1) === marker : m[2] === marker);
  const items = []; let loose = false;
  while (i < lines.length) {
    const m = RE.item.exec(lines[i]); if (!same(m) || indentOf(m[1]) > 3) break;
    const content = m[1].length + m[2].length + (m[3] ? Math.min(m[3].replace(/\t/g, '    ').length, 4) : 1);
    const body = [lines[i].slice(m[0].length)]; i++;
    let gap = false;
    while (i < lines.length) {
      const l = lines[i];
      if (isBlank(l)) { body.push(''); gap = true; i++; continue; }
      if (indentOf(l) >= content) { if (gap) loose = true; body.push(l.replace(/\t/g, '    ').slice(content)); gap = false; i++; continue; }
      if (!gap && !startsBlock(l)) { body.push(l.trim()); i++; continue; } // lazy continuation of the item's paragraph
      break;
    }
    while (body.length && isBlank(body.at(-1))) body.pop();
    if (gap && i < lines.length && same(RE.item.exec(lines[i]))) loose = true;
    items.push(body);
  }
  const start = ordered ? parseInt(first[2], 10) : 1;
  const lis = items.map(b => { let h = blocks(b, ctx); if (!loose) h = h.replace(/^<p>([\s\S]*?)<\/p>/, '$1'); return `<li>${h}</li>`; });
  out.push(ordered ? `<ol${start !== 1 ? ` start="${start}"` : ''}>${lis.join('')}</ol>` : `<ul>${lis.join('')}</ul>`);
  return i;
}

export function markdown(src, { base = '', guides = '/gidsen' } = {}) {
  return blocks(src.replace(/\r\n?/g, '\n').split('\n'), { base, guides, ids: new Set() });
}
