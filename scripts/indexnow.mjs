#!/usr/bin/env node
// IndexNow ping: tells Bing, Yandex, Seznam, Naver (and other IndexNow engines) about new/changed URLs.
// Free, no account. The key is public by design (served at KEY_LOCATION). No deps, Node >= 18.
//
// Usage:
//   node scripts/indexnow.mjs                 submit every URL in the LIVE sitemap
//   node scripts/indexnow.mjs <url> [<url>..] submit only these URLs
//   node scripts/indexnow.mjs --dry           show what would be sent, send nothing
//   node scripts/indexnow.mjs --local --dry   read dist/sitemap.xml instead of the live one (check a build before deploy)
//
// The sitemap lists every Dutch and English (/en/) page, so both languages are submitted. Only <loc> entries are read;
// the xhtml:link hreflang alternates in the sitemap point to the same URLs and are not counted twice.
//
// The key file must stay published at KEY_LOCATION (keep c667032fb1681709c6c250736a94b6b9.txt in the build output).
// Because the key lives under /stroomprijs/, only URLs starting with SITE are accepted.
const SITE = 'https://cerberostech.github.io/stroomprijs/';
const KEY = 'c667032fb1681709c6c250736a94b6b9';
const KEY_LOCATION = `${SITE}${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX = 10000; // IndexNow limit per request

const args = process.argv.slice(2);
const dry = args.includes('--dry'), local = args.includes('--local');
const explicit = args.filter(a => !a.startsWith('--'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function keyLive() {
  // Pages can lag a minute after deploy, so retry for up to ~5 minutes.
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch(`${KEY_LOCATION}?v=${Date.now()}`, { cache: 'no-store' });
      if (r.ok && (await r.text()).trim() === KEY) return true;
      console.log(`key file not ready (HTTP ${r.status}), retry ${i + 1}/10`);
    } catch (e) { console.log(`key file fetch error: ${e.message}`); }
    await sleep(30000);
  }
  return false;
}

async function sitemapUrls() {
  let xml;
  if (local) xml = (await import('node:fs')).readFileSync(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
  else { const r = await fetch(`${SITE}sitemap.xml?v=${Date.now()}`, { cache: 'no-store' }); if (!r.ok) throw new Error(`sitemap HTTP ${r.status}`); xml = await r.text(); }
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'));
}

const urls = [...new Set(explicit.length ? explicit : await sitemapUrls())].filter(u => u.startsWith(SITE));
console.log(`${urls.length} URLs to submit for ${SITE}`);
if (!urls.length) process.exit(0);
if (dry || local) { console.log(urls.slice(0, 40).join('\n'), urls.length > 40 ? '\n…' : ''); process.exit(0); } // --local is for checking only, never sent
if (!(await keyLive())) { console.error(`key file ${KEY_LOCATION} not serving the key, aborting`); process.exit(1); }

let ok = true;
for (let i = 0; i < urls.length; i += MAX) {
  const urlList = urls.slice(i, i + MAX);
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'cerberostech.github.io', key: KEY, keyLocation: KEY_LOCATION, urlList }),
  });
  const body = (await r.text()).slice(0, 300);
  console.log(`IndexNow batch ${i / MAX + 1}: ${urlList.length} URLs -> HTTP ${r.status} ${body}`);
  if (r.status !== 200 && r.status !== 202) ok = false;
}
process.exit(ok ? 0 : 1);
