# Stroomprijs

Dutch dynamic energy price tracker: https://cerberostech.github.io/stroomprijs/

- Data: EnergyZero public API (api.energyzero.nl, no key), EPEX Spot day-ahead / ENTSO-E. Power `usageType=1`, gas `usageType=3`, `interval=4` (hourly), excl. VAT.
- `node build.mjs` fetches prices (falls back to `data/prices.json`) and writes the static site to `dist/`.
- `.github/workflows/pages.yml` rebuilds and deploys hourly (cron `7 * * * *`), IndexNow ping on push/manual.
- Brand assets (logo mark, wordmark, `icon.svg`, `favicon.png`, `apple-touch-icon.png`, manifest icons, `og.png`/`og.svg`) are rendered from code in `lib/brand.mjs` on every build (own PNG encoder on `node:zlib`, no deps). `static/` only holds files copied as-is (IndexNow key).
- Outputs: dashboard, SEO pages, `goedkoopste-uren.ics`, `feed.xml`, `prices.json`, sitemap.
- bol.com partner search links (affiliate, `rel="sponsored nofollow noopener"`) in a box on the dashboard and the guide pages, disclosed on `/privacy/`. No affiliates with energy suppliers; a placeholder (`#vergelijker`) is reserved for a future comparison widget.
