# Implementation Plan: Diagram Rendering & Accessibility (a11y)

## Overview

Deze feature voegt diagramrendering en toegankelijkheid toe aan de HTML/Brightspace-route van BSO. PlantUML- en Mermaid-codeblokken worden tijdens `bso prepare` gerenderd tot SVG met een no-JS toegankelijke wrapper, door hergebruik van `remark-kroki-a11y` (single source of truth). De implementatietaal is TypeScript (Deno), conform het bestaande project.

De volgorde is bewust spike-gedreven: de eerste taak is een informatieve spike die verifieert dat de (nu ESM-backed, async) plugin in-process onder Deno werkt (Beslissing 1, Optie A) of dat als terugvaloptie een Node-subproces nodig is (Optie B). Die uitkomst poort de render-integratie. Config- en validatiemodules kunnen grotendeels parallel voortgaan. De adaptatielaag (Optie C) is in beide gevallen nodig. Alle taken zijn test-first waar mogelijk; tests draaien via `deno task test` (deno test + fast-check, ≥100 iteraties per property).

**Upstream-context (belangrijk voor Beslissing 1) — inmiddels geresolved.** De backend-spike ([remark-kroki-a11y#26](https://github.com/bartvanderwal/remark-kroki-a11y/issues/26), vervolg op [#17](https://github.com/bartvanderwal/remark-kroki-a11y/issues/17)) is DONE: `remark-kroki-a11y` gebruikt intern nu het actief onderhouden, ESM-first [`show-docs/remark-kroki`](https://github.com/show-docs/remark-kroki) (o.a. `unist-util-visit@5`, `target: 'mdx3'`, `output`-modi met `img-html-base64` als standaard en `inline-svg` als alternatief) in plaats van het gearchiveerde `remark-kroki-plugin`. De keten is nu ESM + modern en de pipeline is in-process + async (Promise doorgegeven aan unified). Er is geen apart proces nodig puur voor Kroki; het resterende Deno-risico betreft alleen de CJS/`fs`/`import()`-npm-compat van de a11y-wrapper zelf, die BSO-specifiek nog door taak 1 wordt geverifieerd. De a11y-kernfunctie (natuurlijketaal-beschrijving) is ongewijzigd; alleen de rendering-backend is gewisseld. Eén open upstream-item: Mermaid toonde op de branch lokaal error-images (lokale Docker-Kroki zonder companion) — te verifiëren met de `yuzutech/kroki-mermaid` companion of via `kroki.io`. Taak 0 legt deze context vast.

Scope: uitsluitend de HTML/Brightspace-route. De PDF/reader-route (`reader-pdf-converter.ts` + `diagram-filter.lua`) blijft ongemoeid (Requirement 10). Een `bso lint`-implementatie valt buiten scope; de validatielogica wordt alleen herbruikbaar gemaakt (Requirement 13, [#11](https://github.com/bartvanderwal/brightspacosaurus/issues/11)).

## Tasks

- [ ] 0. Upstream-context: `remark-kroki-a11y`-backend-spike is DONE (extern, `remark-kroki-a11y`-repo)
  - [ ] 0.1 Registreer de uitkomst van de upstream Kroki-backend-spike als context voor de BSO-spike
    - Deze taak wordt NIET in de BSO-repo uitgevoerd; hij legt de (nu grotendeels afgeronde) upstream-afhankelijkheid vast die taak 1 (de BSO-spike) informeert.
    - **DONE:** de backend-swap in `remark-kroki-a11y` is uitgevoerd ([remark-kroki-a11y#26](https://github.com/bartvanderwal/remark-kroki-a11y/issues/26), vervolg op [#17](https://github.com/bartvanderwal/remark-kroki-a11y/issues/17)): de gearchiveerde interne `remark-kroki-plugin` is vervangen door `show-docs/remark-kroki` (ESM-first). De pipeline is in-process en async; er is geen apart proces nodig puur voor Kroki. De standaard outputmodus is `img-html-base64` (base64 `<img>`), met `inline-svg` als configureerbaar alternatief. PlantUML werkt en zijn tests zijn groen. De a11y-kern (natuurlijketaal-beschrijving) is ongewijzigd.
    - **Open upstream-item:** Mermaid toonde op de branch lokaal error-images (met lokale Docker-Kroki zonder de `yuzutech/kroki-mermaid` companion); dit wordt upstream opgelost/geverifieerd. Met de publieke `https://kroki.io` werkt Mermaid.
    - Optioneel (upstream): TypeScript type-defs aan `remark-kroki-a11y` toevoegen; dat maakt Optie A en de BSO-integratie makkelijker (typecheck, betere Deno-interop).
    - _Requirements: 11.1, 6.1_

- [ ] 1. SPIKE — Verifieer dat de (ESM-backed, async) `remark-kroki-a11y` in-process onder Deno draait (Beslissing 1)
  - [ ] 1.1 Prototype de plugin in een minimale Deno-pipeline en bevestig Optie A (of val terug op B)
    - Dit is een gerichte, informatieve spike (prototype), GEEN wegwerp-experiment: de uitkomst legt de integratieroute vast voor alle rendertaken. De upstream backend-spike (taak 0) is al DONE — deze taak verifieert alleen nog de Deno-npm-compat van de CJS-wrapper specifiek in BSO.
    - Bouw een minimale Deno unified-pipeline die `npm:remark-kroki-a11y` laadt via de npm-compat-specifier en `.use()`t op een `unified()`-processor.
    - Voer de pipeline **asynchroon** uit (await): de Kroki-render is een async netwerkaanroep en de plugin geeft die Promise door aan unified/remark.
    - Voer één PlantUML- en één Mermaid-fixture door de pipeline; Kroki mag gemockt worden of een lokaal/`kroki.io`-endpoint raken (voor Mermaid op lokale Docker-Kroki is de `yuzutech/kroki-mermaid` companion nodig; met `kroki.io` niet).
    - Configureer bij voorkeur `output: 'img-html-base64'` (de standaard) en verifieer dat een base64 `<img>` verschijnt, plus een native `<details>`/`<summary>`-broncode-disclosure en een natuurlijketaal-beschrijving. Probeer óók `output: 'inline-svg'` om te bevestigen dat de outputmodus configureerbaar is.
    - Controleer expliciet de resterende CJS-/npm-compat-risico's van de a11y-wrapper: `require`, Node `fs`/`path`, en de dynamische `import('remark-kroki')`.
    - **Beslissing:** slaagt de in-process npm-compat → Optie A (plugin in-process in de BSO-pipeline) voor taak 4. Alleen als de Deno-npm-compat op de CJS-wrapper faalt → Optie B (Node-subproces) als pure terugvaloptie. Leg de bevindingen vast (kort notitiebestand of ADR-notitie) zodat taak 4 erop kan bouwen.
    - Noteer dat de no-JS-adaptatielaag (Optie C, taak 5) hoe dan ook nodig is, ongeacht de uitkomst.
    - _Requirements: 11.1, 6.1_

- [ ] 2. Config-uitbreiding: `diagrams`-object in types en config-loader
  - [ ] 2.1 Voeg het `diagrams`-configtype toe in `src/types.ts`
    - Voeg een optioneel `diagrams`-veld toe aan het BESTAANDE `BssConfig`-type met een nieuw `DiagramsConfig`-interface (`krokiUrl?: string`, `output?: "img-html-base64" | "inline-svg" | "img-base64" | "object-base64"`, `failOnError?: boolean`).
    - Voeg een `diagrams: ResolvedDiagramConfig`-veld toe aan `ResolvedConfig` (altijd ingevuld met defaults: `krokiUrl`, `output`, `failOnError`, `locale`).
    - NB: het design gebruikt de doelnaam `BsoConfig`, maar het huidige type heet nog `BssConfig`. Breid hier het bestaande `BssConfig`-type uit; HERNOEM NIET — de rename `BssConfig` → `BsoConfig` is een aparte, latere taak.
    - _Requirements: 2.1, 2.4_

  - [ ] 2.2 Valideer en resolve `diagrams` in `src/config-loader.ts`
    - Breid `validateConfig` uit: als `diagrams` aanwezig is, moet het een object zijn; `krokiUrl` (indien aanwezig) een string die als URL parseerbaar is; `output` (indien aanwezig) een van `img-html-base64` | `inline-svg` | `img-base64` | `object-base64`; `failOnError` (indien aanwezig) een boolean. Gooi bij overtreding een duidelijke fout.
    - Breid `resolveConfig` uit met defaults: `krokiUrl` → `"https://kroki.io"`, `output` → `"img-html-base64"`, `failOnError` → `true`, `locale` → `"nl"`.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ]* 2.3 Schrijf property test voor config-resolutie en mapping
    - Maak `tests/diagram-config.property.test.ts`.
    - **Property 6: Config-resolutie en mapping** — Voor elk geldig config-object vult `resolveConfig` bij ontbrekende `diagrams.krokiUrl` de default `"https://kroki.io"` in en bij ontbrekende `diagrams.output` de default `"img-html-base64"`; bij een aanwezige geldige URL exact die URL; de mapping zet de remark-kroki-optie `server` gelijk aan de opgeloste `krokiUrl` en `output` gelijk aan de opgeloste `output`.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 6`.
    - **Validates: Requirements 2.2, 2.3, 2.5**

  - [ ]* 2.4 Schrijf unit tests voor `diagrams`-validatie
    - Test: geldige `diagrams`-config wordt geaccepteerd en geresolved; ontbrekende velden krijgen defaults (`krokiUrl`, `output`, `failOnError`).
    - Test: niet-object `diagrams`, niet-parseerbare `krokiUrl`, ongeldige `output`-waarde, niet-boolean `failOnError` geven een duidelijke fout.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [ ] 3. Diagram-config-mappingmodule (`src/diagram-config.ts`)
  - [ ] 3.1 Implementeer `buildKrokiA11yOptions` en `ResolvedDiagramConfig`
    - Definieer `ResolvedDiagramConfig` (`krokiUrl`, `output`, `failOnError`, `locale`) en `buildKrokiA11yOptions(cfg)` die BSO-config naar plugin-/remark-kroki-opties (`KrokiA11yOptions`) mapt.
    - Map naar de echte `show-docs/remark-kroki`-optienamen: `krokiUrl` → `server`, `output` → `output` (standaard `img-html-base64`), plus `target`, `headers` en `alias` (valt terug op `languages`) waar van toepassing; zet `showDiagramModeToggle: false` (no-JS Brightspace).
    - Behandel `lang`, `imgRefDir` en `imgDir` als legacy/ongebruikt: niet doorgeven aan de backend (base64-embedding schrijft geen SVG's naar schijf), hooguit legacy-tolerant accepteren.
    - Lever gelokaliseerde `summaryText`/`a11ySummaryText`-templates (nl/en) met `{type}`/`{title}`-placeholders; labelteksten komen uit deze plugin-opties, niet uit eigen BSO-labellogica.
    - Exporteer deze functie zodat zowel BSO als de Docusaurus-preview dezelfde bron gebruiken (dev/prod-pariteit).
    - _Requirements: 3.1, 5.5, 6.1, 6.4, 11.2_

  - [ ]* 3.2 Schrijf unit tests voor de config-mapping
    - Test: `krokiUrl` landt in `server`; `output` landt in `output` (default `img-html-base64`); `showDiagramModeToggle` is `false`.
    - Test: `lang`/`imgRefDir`/`imgDir` worden als legacy behandeld en niet als actieve backend-opties doorgegeven.
    - Test: nl- en en-locale leveren de juiste `summaryText`/`a11ySummaryText`-templates met intacte `{type}`/`{title}`-placeholders.
    - _Requirements: 3.1, 5.5, 11.2_

- [ ] 4. Diagram-rendering-integratie (`src/diagram-renderer.ts` + wiring in `src/markdown-converter.ts`)
  - Gate: gebruik de route uit de spike (taak 1) — Optie A (in-process plugin) of Optie B (Node-subproces).
  - [ ] 4.1 Implementeer `withDiagramRendering(processor, cfg)` in `src/diagram-renderer.ts`
    - Registreer `remark-kroki-a11y` als remark-stap (vóór `remark-rehype`) volgens de spike-uitkomst, geconfigureerd via `buildKrokiA11yOptions`.
    - Render `plantuml`- en `mermaid`-fenced blocks tijdens de build (server-side) naar de geconfigureerde outputmodus (standaard `img-html-base64`, een base64 `<img>`); laat niet-diagram-codeblokken ongemoeid.
    - De Kroki-render is async: zorg dat de pipeline de Promise correct doorgeeft/awaiten kan (consumers roepen de pipeline asynchroon aan).
    - _Requirements: 1.1, 1.2, 1.3, 1.5_

  - [ ] 4.2 Wire de diagramrendering in `src/markdown-converter.ts`
    - Roep `withDiagramRendering` aan op de bestaande gedeelde `unified()`-processor met de opgeloste `diagrams`-config; verwerk de pipeline asynchroon (await), omdat de Kroki-render een async netwerkaanroep is.
    - Zorg dat codeblokken met een niet-ondersteunde taalaanduiding ongewijzigd als codeblok in de HTML blijven.
    - _Requirements: 1.1, 1.2, 1.4_

  - [ ]* 4.3 Schrijf property test voor pass-through van niet-diagram-codeblokken
    - **Property 5: Pass-through van niet-diagram-codeblokken** — Voor elk codeblok waarvan de taalaanduiding geen ondersteund diagramtype is, blijft het blok ongewijzigd in de HTML-output.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 5`.
    - **Validates: Requirements 1.4**

- [ ] 5. No-JS Brightspace-output via het juiste `remark-kroki-a11y`-integratiepunt (`src/diagram-adapter.ts`)
  - [ ] 5.1 Zoek het juiste `remark-kroki-a11y`-integratiepunt en hergebruik de bestaande `<details>`/`<summary>`-HTML
    - Zoek eerst uit welk plugin-punt de gewenste output levert ZONDER de React/JS-tab-HTML te hoeven strippen: de plugin genereert al een native `<details>`/`<summary>`-blok met de broncode en (via de a11y-kern) de natuurlijketaal-beschrijving. Voorkeur: die HTML direct hergebruiken.
    - Voorkeursroute: configureer de plugin zo (bijv. `showDiagramModeToggle: false` en de non-tab/native `<details>`-variant) dat de output al no-JS is; dan is er geen naverwerking nodig. Als er tóch een plugin-optie/functie is die alleen de natuurlijketaal-beschrijving teruggeeft, gebruik die als schoon integratiepunt.
    - Alleen als geen enkel plugin-punt de no-JS-vorm rechtstreeks geeft: pas een MINIMALE naverwerking toe die de JS-tab-bekabeling weglaat, en hergebruik het bestaande `<details>`/`<summary>`-blok in plaats van het opnieuw op te bouwen. Documenteer welke route gekozen is (afhankelijk van de spike, taak 1).
    - **Standaardmodus (`img-html-base64`):** het diagram is een base64 `<img>`; de a11y leeft in de omringende HTML. Borg een niet-lege `alt` op de `<img>` (uit `summaryText`/`a11ySummaryText`) en een `aria-describedby` naar het beschrijvingselement.
    - **Configureerbaar alternatief (`inline-svg`):** borg in plaats daarvan `role="img"` op de SVG, `aria-labelledby` naar het `<title>`-element en `aria-describedby` naar het beschrijvingselement.
    - Zorg dat de output de target-HTML-structuur uit het design benadert (`<figure class="bso-diagram">` met de base64 `<img alt>` — of inline SVG-`<title>` — een beschrijving-`<details>`/`<summary>` en een broncode-`<details>`/`<summary>`).
    - Draai de adaptatie op de geawaite (async) plugin-output.
    - Ken deterministische, stabiele id's toe (content-hash of bronbestand+diagramindex) via `ctx.makeId` (Beslissing 2). Dit blijft hergebruik van de plugin-output, geen herimplementatie van de beschrijvings-/labellogica.
    - _Requirements: 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 4.4, 4.5, 8.3, 11.3, 11.4, 1.6, 9.6_

  - [ ]* 5.2 Schrijf property test voor no-JS output
    - **Property 1: No-JS output** — Voor elk gerenderd diagram bevat de HTML geen `<script>` dat nodig is om diagram of disclosure te laten werken; disclosures zijn native `<details>`/`<summary>`. Kroki gemockt.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 1`.
    - **Validates: Requirements 1.3, 4.3, 5.4, 9.5**

  - [ ]* 5.3 Schrijf property test voor deterministische output (double-run)
    - **Property 2: Deterministische output** — Voor elke diagram-broninhoud levert tweemaal verwerken (incl. ARIA-id-toekenning) byte-identieke HTML op. Kroki gemockt.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 2`.
    - **Validates: Requirements 1.6, 9.6**

  - [ ]* 5.4 Schrijf property test voor ARIA-relaties (outputmodus-afhankelijk)
    - **Property 3: ARIA-relaties (outputmodus-afhankelijk)** — Voor elk gerenderd diagram geldt: standaardmodus (`img-html-base64`) → het `<img>` heeft een niet-lege `alt` en (indien beschrijving aanwezig) een `aria-describedby` naar het `id` van het beschrijvingselement; `inline-svg`-modus → het `<svg>` heeft `role="img"`, een `aria-labelledby` naar een `<title>` met dezelfde `id`, en (indien beschrijving aanwezig) een `aria-describedby` naar het beschrijvingselement.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 3`.
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 8.3**

  - [ ]* 5.5 Schrijf property test voor de disclosure-structuur
    - **Property 4: Disclosure-structuur** — Voor elk gerenderd diagram bevat de output een broncode-`<details>` gelijk aan de originele broncode, (indien beschrijving) een beschrijving-`<details>`/`<summary>` met tekstuele inhoud (geen `<img>`), en heeft elke `<details>` een niet-lege `<summary>`.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 4`.
    - **Validates: Requirements 4.1, 4.2, 4.4, 5.2**

- [ ] 6. Checkpoint — Rendering en adaptatie valideren
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Herbruikbare validatiemodule (`src/diagram-validation.ts`)
  - [ ] 7.1 Implementeer `detectDiagramIssues(markdown, sourceFile)`
    - Detecteer statisch (zonder Kroki-aanroep): niet-ondersteunde talen, onbekende fence-opties, ongeldige/niet-lokale `src=`, lege diagramblokken en afgewezen optiewaarden.
    - Retourneer getypeerde `DiagramIssue[]` (met `kind`, `sourceFile`, `position?`, `diagramTitle?`, `message`).
    - Zet de functie zo op dat ze onafhankelijk van de render-stap aanroepbaar is, zodat een toekomstige `bso lint` (#11) haar kan hergebruiken. Implementeer `bso lint` NIET.
    - _Requirements: 13.1, 13.2, 13.3, 12.2_

  - [ ]* 7.2 Schrijf property test voor statische parameterdetectie
    - **Property 7: Statische parameterdetectie** — Voor elk diagram-codeblok met een onbekende fence-optie of ongeldige `src=` retourneert `detectDiagramIssues` een `invalid-parameter`/`invalid-src`-issue dat bronbestand en parameter identificeert; bij uitsluitend geldige opties geen parameterissue.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 7`.
    - **Validates: Requirements 12.2**

- [ ] 8. Foutafhandeling en foutmodel (`src/diagram-renderer.ts` / gedeeld)
  - [ ] 8.1 Implementeer `DiagramError` en de foutbeslissing
    - Definieer `DiagramError` met `category` (`kroki-unreachable` | `invalid-source` | `invalid-parameter`), `sourceFile`, `diagram` (positie/titel) en `reason`.
    - Standaard (`failOnError: true`): laat de build falen (fail-fast, niet-nul exitcode) met een beschrijvende melding die bronbestand + diagram + reden identificeert.
    - `failOnError: false`: schaal af naar een waarschuwing + fallback (oorspronkelijk codeblok behouden) en zet de build voort.
    - Categoriseer auteurfouten (ongeldige bron/parameter) als zodanig, ongeacht Kroki-bereikbaarheid, onderscheiden van de transiente `kroki-unreachable`-conditie.
    - Behandel "geen beschrijving genereerbaar" als waarschuwing (geen fout): render alsnog met naam + broncode-disclosure.
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 2.6, 2.7, 5.3_

  - [ ]* 8.2 Schrijf property test voor de foutbeslissing (fail vs. fallback)
    - **Property 8: Foutbeslissing** — Voor elke combinatie van `DiagramError`-categorie en `failOnError`: bij `true` een echte buildfout (throw/niet-nul exit); bij `false` een waarschuwing met fallback zonder de build te stoppen.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 8`.
    - **Validates: Requirements 12.3, 12.4, 12.6**

  - [ ]* 8.3 Schrijf property test voor auteurfout-categorisatie
    - **Property 9: Auteurfout-categorisatie onafhankelijk van bereikbaarheid** — Voor elke auteurfout-invoer is de categorie `invalid-source` of `invalid-parameter` en nooit `kroki-unreachable`, ongeacht Kroki-bereikbaarheid.
    - fast-check, ≥100 iteraties; tag `// Feature: diagram-rendering-a11y, Property 9`.
    - **Validates: Requirements 12.5**

- [ ] 9. Optionele a11y-styling asset (indien nodig)
  - [ ] 9.1 Voeg `assets/diagram-a11y.css` toe en injecteer via `wrapHtml()`
    - Als extra no-JS-styling voor de `<details>`/`<summary>`-disclosures nodig blijkt: maak `assets/diagram-a11y.css`.
    - Laad de asset via `loadAssetText("diagram-a11y.css")` in `src/assets.ts` — nooit via `import.meta.url` + `Deno.readTextFile()`.
    - Voeg de inhoud toe aan het bestaande `<style>`-blok in `wrapHtml()` van `src/markdown-converter.ts`.
    - Voeg `assets/diagram-a11y.css` toe aan `publish.include` in `deno.json` (JSR-asset-regel).
    - _Requirements: 4.1, 4.3_

- [ ] 10. Docusaurus-preview-configuratie (dev/prod-pariteit)
  - [ ] 10.1 Configureer `remark-kroki-a11y` in de Docusaurus-remark-pipeline
    - Registreer de plugin in de Docusaurus-remark-pipeline met DEZELFDE gedeelde opties via `buildKrokiA11yOptions`, zodat de inhoud identiek is aan BSO.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2_

  - [ ]* 10.2 Schrijf een geautomatiseerde test voor de preview-toegankelijke inhoud
    - Verifieer voor een fixture dat de preview het gerenderde diagram, de broncode en de natuurlijketaal-beschrijving produceert.
    - Documenteer eerlijk dat `remark-kroki-a11y` tot op heden nog niet in de Docusaurus-preview getest was; deze test dekt dat af.
    - _Requirements: 7.2, 7.3_

- [ ] 11. Testfixtures en integratietests
  - [ ] 11.1 Maak diagram-testfixtures
    - Maak `tests/fixtures/diagram-plantuml.md` (lespagina met PlantUML-codeblok) en `tests/fixtures/diagram-mermaid.md` (lespagina met Mermaid-codeblok).
    - _Requirements: 9.1, 9.2_

  - [ ]* 11.2 Schrijf HTML-output-verificatietests op de fixtures
    - Verifieer per fixture: HTML bevat een base64 `<img>`-element (standaardmodus) of een `<svg>`-element (inline-svg-modus) (9.3); bevat de a11y-wrapper — toegankelijke naam (standaardmodus: `<img alt>` + `aria-describedby`; inline-svg: `<title>` + `aria-labelledby`), broncode-disclosure en beschrijving-disclosure (9.4); bevat GEEN vereist `<script>` (9.5); twee runs leveren identieke HTML (9.6).
    - _Requirements: 9.3, 9.4, 9.5, 9.6_

  - [ ]* 11.3 Schrijf integratietests met een echte/lokale Kroki
    - Draai 1–3 representatieve voorbeelden door de volledige conversie (asynchroon geawait) met een echte of lokaal gehoste Kroki om de daadwerkelijke rendering te dekken (geen property-tests voor de netwerk-/renderstap).
    - Gebruik hetzij de publieke `https://kroki.io`, hetzij een lokale Docker-Kroki; bij een lokale Docker-Kroki is voor de Mermaid-fixture de companion-container `yuzutech/kroki-mermaid` vereist. Documenteer dit in de testopzet.
    - _Requirements: 1.1, 1.2, 1.5_

- [ ] 12. Checkpoint — Validatie, foutpaden en fixtures valideren
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Documentatie van de diagram-feature
  - [ ] 13.1 Documenteer de `diagrams`-config en de a11y-intentie
    - Documenteer het `diagrams`-configobject (`krokiUrl`, `output` met default `img-html-base64`, `failOnError`) met defaults.
    - Beschrijf een zelf-gehoste Kroki via Docker en `KROKI_BASE_URL` voor CI/offline, en waarom dit CI-vriendelijk is. Leg het verschil uit tussen de publieke `https://kroki.io` (Mermaid werkt out of the box) en een lokale Docker-Kroki (voor Mermaid is de companion-container `yuzutech/kroki-mermaid` vereist).
    - Beschrijf de a11y-intentie (schermlezer-toegankelijkheid) met de WCAG-caveat: volledige conformiteit vereist handmatige verificatie met hulptechnologie — niet overclaimen.
    - Vermeld dat de PDF/reader-route buiten scope valt.
    - _Requirements: 2.8, 2.9, 8.1, 8.2, 10.3_

- [ ] 14. Versie-bump voor de feature
  - [ ] 14.1 Verhoog de versie in `deno.json`
    - Bump de versie (minor, 0.x-feature) volgens semver, zodat een latere JSR/npm-publicatie correct is (AGENTS.md-conventie).
    - Publiceer NIET — dat doet de gebruiker.
    - _Requirements: N/A (projectconventie)_

- [ ] 15. Final checkpoint — Alle tests en integratie
  - Ensure all tests pass, ask the user if questions arise.
  - Valideer met `deno task test` dat alle unit-, property- en integratietests slagen.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP; kern-implementatietaken zijn nooit optioneel.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate the universal correctness properties (1–9) from the design document; unit/integratietests dekken specifieke voorbeelden, edge cases en foutpaden.
- De implementatietaal is TypeScript (Deno). Property-based tests gebruiken fast-check (via JSR/npm) met ≥100 iteraties per property; verifieer lokaal met `deno task test`.
- De upstream backend-spike (remark-kroki-a11y#26) is DONE: backend geswapt naar `show-docs/remark-kroki` (ESM), in-process + async, `img-html-base64` als standaard outputmodus. Taak 1 (BSO-spike) verifieert nog alleen de Deno-npm-compat van de CJS-wrapper: slaagt dit → Optie A (in-process plugin) voor taak 4; alleen bij falen → Optie B (Node-subproces) als terugvaloptie. De no-JS-adaptatielaag (taak 5, Optie C) is in beide gevallen nodig.
- De remark-pipeline is async (Kroki is een netwerkaanroep): de rendering en tests roepen de pipeline asynchroon aan (await).
- Outputmodus is configureerbaar via `diagrams.output` (standaard `img-html-base64`, base64 `<img>`; `inline-svg` als alternatief met SVG-interne titel/ARIA).
- Scope blijft de HTML/Brightspace-route; de PDF/reader-route blijft ongemoeid (Requirement 10). `bso lint` wordt NIET geïmplementeerd; taak 7 maakt de validatie alleen herbruikbaar (Requirement 13, [#11](https://github.com/bartvanderwal/brightspacosaurus/issues/11)).
- NB: het huidige configtype heet nog `BssConfig`; taak 2 breidt dat uit zonder te hernoemen. De rename `BssConfig` → `BsoConfig` is een aparte, latere taak.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "11.1"] },
    { "id": 1, "tasks": ["2.2", "3.1", "7.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.2", "4.1", "7.2"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["8.1"] },
    { "id": 5, "tasks": ["4.3", "5.2", "5.3", "5.4", "5.5", "8.2", "8.3", "9.1"] },
    { "id": 6, "tasks": ["10.1", "11.2", "11.3", "13.1", "14.1"] },
    { "id": 7, "tasks": ["10.2"] }
  ]
}
```
