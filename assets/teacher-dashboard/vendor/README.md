# Vendored libraries for the Voortgangsverkenner

These files are shipped inside the course package instead of loaded from a CDN or Google Fonts, so the page in Brightspace makes no requests to third parties. Versions match the prototype (owe-1 `scripts/voortgangsverkenner-prototype/`).

| File | Version | Source | License | SHA-256 |
|---|---|---|---|---|
| `react.production.min.js` | 18.3.1 | https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js | MIT | `d949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd` |
| `react-dom.production.min.js` | 18.3.1 | https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js | MIT | `35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d` |
| `fonts/atkinson-hyperlegible-next-latin.woff2` | Google Fonts v7 (variable, latin) | https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next | SIL OFL 1.1 (`fonts/OFL.txt`) | `1e4cea71d75ec427581d6259fc07148a2e60d60d16cabf4b4f5360487b3f9dc3` |
| `fonts/atkinson-hyperlegible-mono-latin.woff2` | Google Fonts v8 (variable, latin) | https://fonts.google.com/specimen/Atkinson+Hyperlegible+Mono | SIL OFL 1.1 (`fonts/OFL.txt`) | `f0230cab68ecdc96766fde00a89cf3167e668c3a8756f844cab554dc3bcfd030` |
| `htm.umd.js` | 3.1.1 | https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js | Apache-2.0 | `7a31776e04bd4afde0d4308177d26f377716fcf7e4bd70be590746d6aa594f08` |

React 18 is the last major version with UMD builds; React 19 dropped them. Upgrading means switching to ES modules or a build step.

To update: download the new files, update this table (including `shasum -a 256 vendor/*.js`), and test the dashboard locally and in Brightspace.
