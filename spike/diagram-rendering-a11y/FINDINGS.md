# SPIKE FINDINGS — diagram-rendering-a11y, task 1.1 (Beslissing 1)

**Goal (informative prototype, not the real feature).** Determine whether
`remark-kroki-a11y` runs **in-process under Deno** (Option A) or whether a Node
subprocess is needed (Option B, pure fallback). No production code under `src/`,
existing tests, or the production parts of `deno.json` were modified.

**Environment.** Deno 2.9.6 (aarch64-apple-darwin). Dependency pinned to
`remark-kroki-a11y@0.6.2` (`npm view remark-kroki-a11y@0.6.2 version` → `0.6.2`;
the `latest` tag has since caught up to `0.6.2`). Kroki server: the public
`https://kroki.io` (HTTP 200, ~90 ms), so both PlantUML and Mermaid render
**without** a local Docker companion.

---

## DECISION: GO → Option A (in-process plugin)

The in-process npm-compat path **works** under Deno 2.9.6. The CJS a11y wrapper
loaded, its dynamic `import('remark-kroki')` (ESM backend) resolved, its Node
`fs`/`path`/`process.env` usage worked, and the async unified pipeline produced
valid diagram HTML for **both** PlantUML and Mermaid in **both** output modes,
with **no `<script>`** and native `<details>`/`<summary>`.

→ Task 4 should register `remark-kroki-a11y` **in-process** in the BSO unified
pipeline. **Option B (Node subprocess) is NOT needed.** The no-JS adaptation
layer (Option C, task 5) is still required regardless (see "Gotchas").

---

## How the spike was run

Scripts (isolated under `spike/diagram-rendering-a11y/`):

- `spike.ts` — main: 1 PlantUML + 1 Mermaid fixture × 2 output modes, async pipeline.
- `inspect-details.ts` — dumps the `<details>`/`<summary>` + description structure.
- `inspect-notabs.ts` — probes the non-tabs (separate `<details>`) branch (network-free, `skipKrokiRender: true`).

Exact run command (main spike):

```sh
deno run \
  --allow-net \
  --allow-read \
  --allow-env=KROKI_BASE_URL \
  --node-modules-dir=auto \
  --min-dep-age=0 \
  spike/diagram-rendering-a11y/spike.ts
```

### Required Deno flags / permissions (verified)

| Flag | Why it is needed |
|---|---|
| `--allow-net` | Kroki render is an HTTP call to `kroki.io`; npm downloads hit `registry.npmjs.org`. For a warm cache, `--allow-net=kroki.io` suffices at runtime. |
| `--allow-read` | Deno reads the materialized npm packages from `node_modules`/cache; the CJS wrapper uses `fs`. |
| `--allow-env=KROKI_BASE_URL` | **Required.** The wrapper's `defaultOptions.kroki.krokiBase` reads `process.env.KROKI_BASE_URL`. Without env access it throws `NotCapable: Requires env access to "KROKI_BASE_URL"`. Scoping to the single var is enough. |
| `--node-modules-dir=auto` | Makes Deno materialize a real `node_modules/` so the CJS `require(...)` graph and dynamic `import('remark-kroki')` resolve cleanly. (`node_modules/` is already gitignored.) |
| `--min-dep-age=0` | **Spike-only.** Deno 2.9's minimum-dependency-age policy blocks freshly published versions; `0.6.2` was just published, so the age gate must be lifted to pin exactly `0.6.2`. Drops away once the version ages past the default 24 h (or set `minimumDependencyAge` in config). This is a policy gate, **not** an npm-compat failure. |

No import map was needed. `rehype-raw` was added to the pipeline (see below).

---

## Per-fixture / per-output-mode results

All four combinations **PASS**.

| Fixture | Output mode | base64 `<img>` | inline `<svg>` | `<img alt>` | `<details>`/`<summary>` | `<script>` |
|---|---|---|---|---|---|---|
| PlantUML | `img-html-base64` (default) | ✅ | – | ✅ | ✅ | ❌ (none) |
| Mermaid  | `img-html-base64` (default) | ✅ | – | ✅ | ✅ | ❌ (none) |
| PlantUML | `inline-svg`                | – | ✅ | – (uses `data-alt`) | ✅ | ❌ (none) |
| Mermaid  | `inline-svg`                | – | ✅ | – (uses `data-alt`) | ✅ | ❌ (none) |

### `img-html-base64` (default) — snippet

```html
<p><img class="kroki-image" alt="Bestellingdomein" data-type="plantuml"
    src="data:image/svg+xml;base64,PHN2ZyB4bWxu…"></p>
<details class="diagram-expandable-source" lang="nl">
  <summary>PlantUML broncode voor "Bestellingdomein"</summary>
  <!-- ...see "a11y structure" below... -->
</details>
```

The `alt` comes from the `imgTitle`/`summaryText`/`a11ySummaryText` templates
(single source of truth — BSO does not compose label text). The natural-language
description is generated (rich Dutch class-diagram prose) and present as text.

### `inline-svg` — snippet

```html
<p class="kroki-inline-svg" data-type="plantuml" data-alt="Bestellingdomein">
  <svg xmlns="http://www.w3.org/2000/svg" data-diagram-type="CLASS" ...>…</svg>
</p>
<details ...>…</details>
```

Note: in `inline-svg` mode `remark-kroki` puts the accessible name on the wrapper
`<p data-alt>`, **not** yet as an in-SVG `<title>`/`role="img"`/`aria-labelledby`.
That in-SVG ARIA wiring (Requirement 3.3) is exactly the adapter's job (task 5),
which confirms Option C is needed. This also confirms the output mode is
**configurable** end-to-end.

### a11y structure (from `inspect-details.ts`, base64 elided)

When **both** source and a11y are shown together, 0.6.2 emits a **tabs** block *inside* a native `<details>`:

```html
<details class="diagram-expandable-source" lang="nl">
  <summary>PlantUML broncode voor "Bestellingdomein"</summary>
  <div class="diagram-expandable-source-tabs">
    <div class="...-tab-buttons" role="tablist">
      <button ... role="tab" data-tab="source" aria-selected="true">Bron</button>
      <button ... role="tab" data-tab="a11y"   aria-selected="false">In natuurlijke taal</button>
    </div>
    <section role="tabpanel" data-tab="source"><pre><code>@startuml…</code></pre></section>
    <section role="tabpanel" data-tab="a11y" aria-label="Klassendiagram met 2 klasse(n)…">
      <div class="diagram-a11y-description-text" id="diagram-a11y-text-0">
        <p>Klassendiagram met 2 klasse(n) en 1 relatie(s).</p> …
      </div>
    </section>
  </div>
</details>
```

**No `<script>` is emitted** — the `<details>` disclosure itself is native/no-JS.
Only the *tab switching* between the two panels needs JS; the content of both
panels is plain HTML that is fully present without JS.

When only ONE of source/a11y is shown (from `inspect-notabs.ts`), 0.6.2 emits
**two clean standalone `<details>` blocks with no tab wiring at all** — the ideal
no-JS Brightspace form:

```html
<details class="diagram-expandable-source">
  <summary>PlantUML broncode voor "Bestellingdomein"</summary>
  <pre><code>@startuml…@enduml</code></pre>
</details>
<details class="diagram-a11y-description" lang="nl">
  <summary>"Bestellingdomein" in natuurlijke taal</summary>
  <div class="diagram-a11y-description-content" id="diagram-a11y-content-0"
       aria-label="Klassendiagram met 2 klasse(n)…">
    <div class="diagram-a11y-description-text" id="diagram-a11y-text-0">…</div>
  </div>
</details>
```

---

## npm-compat investigation (the risky part) — verified working

`remark-kroki-a11y@0.6.2` is **CommonJS** (`package.json` has no `"type"`, `main`
= `src/index.js`). It exercises every risky Deno npm-compat path, all of which
resolved:

- `require('unist-util-visit')`, `require('fs')`, `require('path')` — OK.
- Multiple `require('./parsers/...')` (mixed `.js` / `.cjs`) — OK.
- `module.exports.__internal = require('./runtime/a11yRuntime.cjs')` — OK.
- **Dynamic `import('remark-kroki')`** — the a11y wrapper lazily imports its ESM rendering backend (`remark-kroki@0.3.8`, `"type": "module"`, `lib/index.mjs`) via a Promise. Deno resolved the CJS→dynamic-ESM boundary correctly. This was the single biggest unknown from Beslissing 1 and it works.
- `process.env.KROKI_BASE_URL` — works with `--allow-env`.

No load errors were observed. (For the record, the dependency tree `remark-kroki`
still transitively pulls the archived `remark-kroki-plugin` as a sub-dependency,
but it did not break loading under Deno.)

### Version / peer-dep pinning notes

- Pin `remark-kroki-a11y@0.6.2` exactly. It resolves `remark-kroki@^0.3.8` and
  `unist-util-visit@^5` transitively; no manual peer pinning was required.
- **Language matching gotcha:** the plugin only transforms fenced blocks whose
  `lang` is in its `languages` option (default `['kroki']`). To render
  ` ```plantuml ` / ` ```mermaid ` blocks, pass
  `languages: ['plantuml', 'mermaid', 'kroki']`. The plugin maps
  `alias = languages.filter(l => l !== 'kroki')` into `remark-kroki`.
- The **diagram type** for the natural-language description comes from an
  `imgType="plantuml"|"mermaid"` fence-meta attribute (and `imgTitle="…"` feeds
  the accessible name). Task 4/5 must decide how BSO supplies these (e.g. derive
  `imgType` from the fence language, and `imgTitle` from a title convention).

---

## Gotchas for the real implementation (tasks 2–5)

1. **Async pipeline is mandatory.** The Kroki render is an async network call;
   the plugin returns a Promise to unified. Consumers **must** `await`
   `processor.process(...)`. `markdown-converter.ts` already awaits, so this fits.
2. **Permissions.** Add `--allow-net` (or scoped `--allow-net=kroki.io`) and
   `--allow-env` (at minimum `KROKI_BASE_URL`) to the `prepare` task. The current
   `deno task prepare` has `--allow-env` but **not** `--allow-net` — this must be
   added for diagram rendering. `--node-modules-dir` (via config or flag) is
   recommended for reliable CJS resolution.
3. **`--min-dep-age`** only matters while `0.6.2` is fresh; not a runtime concern
   once the version ages, but pin it via `deno.json` `minimumDependencyAge` or
   accept the default once ≥24 h old.
4. **`rehype-raw` needed.** The plugin injects raw HTML (`type: 'html'`) nodes.
   To get them into the final HTML, use `remark-rehype({ allowDangerousHtml: true })`
   → `rehype-raw` → `rehype-stringify({ allowDangerousHtml: true })`. BSO's current
   pipeline does not include `rehype-raw`; task 4 must add it (or an equivalent).
5. **Option C (adapter) is required regardless (task 5).** Two things to fix:
   - **De-tab for no-JS parity.** When both source + a11y show, 0.6.2 wraps them
     in a JS-driven **tabs** widget inside `<details>`. Brightspace needs the
     content without tab switching. Cleanest routes: (a) post-process the tabs
     block into two plain `<details>` (the plugin already produces exactly that
     shape when only one panel is shown), or (b) request an upstream option to
     emit non-tab `<details>`. The description/label logic is reused, not rebuilt.
   - **inline-svg ARIA.** In `inline-svg` mode the accessible name lands on a
     `<p data-alt>` wrapper, not as in-SVG `<title>`/`role="img"`/`aria-labelledby`
     (Requirement 3.3). The adapter must add that when `output: 'inline-svg'`.
6. **Deterministic ARIA ids (Beslissing 2).** The plugin derives ids from the AST
   node `index` (e.g. `diagram-a11y-text-0`). That is stable for identical input
   order but the adapter should still assign content-hash/`sourceFile+index` ids
   (`ctx.makeId`) to guarantee idempotence (Requirements 1.6, 9.6).
7. **Mermaid + local Docker Kroki.** With `kroki.io`, Mermaid renders out of the
   box (verified). A self-hosted Docker Kroki needs the `yuzutech/kroki-mermaid`
   companion for Mermaid (Requirement 2.9) — document this. (During the run a
   transient `Error 500` line was logged by a fetch retry but did not affect the
   final output; all fixtures produced valid SVG. kroki.io can occasionally 5xx
   under load, which reinforces the `failOnError`/transient-vs-author-error
   handling in Requirement 2/12.)
8. **Default output mode** is `img-html-base64` (base64 `<img>`), matching the
   design default; `inline-svg` confirmed working as the configurable alternative.

---

## Verified vs. not verified

- **Verified:** in-process load of the CJS wrapper + dynamic ESM import under Deno
  2.9.6; async pipeline resolving; base64-`<img>` and inline-`<svg>` output for
  PlantUML and Mermaid via `kroki.io`; native `<details>`/`<summary>`; no `<script>`;
  generated Dutch natural-language description; exact required permission flags;
  the tabs-vs-standalone `<details>` behavior that scopes the task-5 adapter.
- **Not verified here (out of spike scope):** self-hosted Docker Kroki +
  `yuzutech/kroki-mermaid`; CI/offline behavior; full WCAG conformance (needs
  manual assistive-tech testing per Requirement 8.2); how BSO will source
  `imgType`/`imgTitle` from fenced blocks (a task-4 design choice).
