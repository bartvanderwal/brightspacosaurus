# Vendored libraries for the Voortgangsverkenner

These files are shipped inside the course package instead of loaded from a CDN, so the page in Brightspace runs no third-party code fetched at runtime. Versions match the prototype (owe-1 `scripts/voortgangsverkenner-prototype/`).

| File | Version | Source | License | SHA-256 |
|---|---|---|---|---|
| `react.production.min.js` | 18.3.1 | https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js | MIT | `d949f1c3687aedadcedac85261865f29b17cd273997e7f6b2bfc53b2f9d4c4dd` |
| `react-dom.production.min.js` | 18.3.1 | https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js | MIT | `35f4f974f4b2bcd44da73963347f8952e341f83909e4498227d4e26b98f66f0d` |
| `htm.umd.js` | 3.1.1 | https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js | Apache-2.0 | `7a31776e04bd4afde0d4308177d26f377716fcf7e4bd70be590746d6aa594f08` |

React 18 is the last major version with UMD builds; React 19 dropped them. Upgrading means switching to ES modules or a build step.

To update: download the new files, update this table (including `shasum -a 256 vendor/*.js`), and test the dashboard locally and in Brightspace.
