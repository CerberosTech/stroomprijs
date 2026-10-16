# Stroomprijs

Dutch dynamic energy price tracker: https://cerberostech.github.io/stroomprijs/

- Data: EnergyZero public API (api.energyzero.nl, no key), EPEX Spot day-ahead / ENTSO-E. Power `usageType=1`, gas `usageType=3`, `interval=4` (hourly), excl. VAT.
- `node build.mjs` fetches prices (falls back to `data/prices.json`) and writes the static site to `dist/`.
- `.github/workflows/pages.yml` rebuilds and deploys hourly (cron `7 * * * *`), IndexNow ping on push/manual.
- Outputs: dashboard, SEO pages, `goedkoopste-uren.ics`, `feed.xml`, `prices.json`, sitemap.
- No affiliates. A placeholder (`#vergelijker`) is reserved for a future comparison widget.
