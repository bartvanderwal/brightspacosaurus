# ADR 010 — unified (remark/rehype) voor Markdown→HTML-conversie in Brightspacosaurus

## Status

Geaccepteerd (herzien mei 2026)

## Context

Brightspacosaurus moet Markdown-bronbestanden omzetten naar HTML die importeerbaar is in Brightspace via een Common Cartridge-pakket. Brightspace accepteert in geïmporteerde content uitsluitend HTML en CSS — JavaScript wordt niet uitgevoerd. Dit beperkt de keuze van conversietools: de output moet statische, zelfstandige HTML zijn zonder runtime-afhankelijkheden.

Tegelijkertijd gebruiken we Docusaurus als lokale preview-tool (zie ADR 009). Docusaurus gebruikt intern de unified-stack (remark voor Markdown-parsing, rehype voor HTML-transformatie; Docusaurus, z.d.-b). Dev/prod parity — dezelfde Markdown op dezelfde manier parsen in beide omgevingen — is een expliciet ontwerpprincipe.

### Herziening mei 2026

De oorspronkelijke ADR koos voor unified via JSR (`jsr:@unified/...`). In de praktijk bleek JSR geen volwaardige unified-stack te bieden: de kernpakketten (`unified`, `remark-parse`, `remark-rehype`, `rehype-stringify`) zijn alleen beschikbaar via npm, niet via JSR. Als tijdelijke oplossing werd `marked` geïmplementeerd via `npm:marked`.

Dit leidde tot twee problemen:

1. **Pariteitsrisico**: `marked` gebruikt een andere parser dan Docusaurus (remark/micromark). Subtiele parsing-verschillen zijn mogelijk.
2. **Beperkte uitbreidbaarheid**: `marked` heeft een renderer/extension API, maar geen volwaardige AST-plugin-architectuur. Voor rijke inhoud in quizvragen (code-blokken, diagrammen, geneste opmaak in vraag- en antwoordteksten) is een plugin-gebaseerde pipeline nodig.

Omdat zowel `marked` als `unified` via `npm:` worden geladen, vervalt het JSR-voordeel voor beide opties. De keuze valt daarmee terug op inhoudelijke criteria: pariteit en uitbreidbaarheid.

### Criteria

- Brightspace voert geen JavaScript uit in geïmporteerde content; alleen HTML en CSS zijn toegestaan
- Dev/prod parity: de lokale preview (Docusaurus) en de Brightspace-export moeten dezelfde Markdown op dezelfde manier parsen
- Uitbreidbaarheid: plugins voor afbeeldingsverwerking, QTI-sectie-filtering, diagramrendering (Mermaid/PlantUML), en rijke inhoud in quizvragen (code-blokken, opmaak in vraag- en antwoordteksten)
- De conversie moet draaien in Deno; beide opties zijn beschikbaar via `npm:`
- JSR biedt geen volwaardige Markdown-conversiepipeline

## Overwogen opties

### Optie A — Docusaurus-converter hergebruiken

De `@docusaurus/mdx-loader` direct aanroepen voor HTML-generatie.

**Voordelen:**

- Maximale pariteit met de lokale preview.

**Nadelen:**

- Produceert React-componenten (JSX), geen statische HTML. Vereist een React-renderpass om HTML te krijgen.
- Diep verweven met het Docusaurus-ecosysteem (bundler, routing, theme-systeem). Niet los aan te roepen. Docusaurus gebruikt momenteel webpack als standaardbundler, met Rspack als opt-in via "Docusaurus Faster" (stabiel vanaf v3.10; Docusaurus, 2025). Vite is geen onderdeel van de Docusaurus-roadmap.
- Vereist Node.js; draait niet in Deno.
- De React-output bevat JavaScript dat Brightspace niet uitvoert.

### Optie B — unified (remark-parse → remark-rehype → rehype-stringify) via `npm:` (gekozen)

Dezelfde parsing-stack die Docusaurus onder de motorkap gebruikt, maar zonder de MDX/React-laag.

**Voordelen:**

- Produceert statische HTML zonder JavaScript — direct bruikbaar in Brightspace.
- Dezelfde Markdown-parser (micromark/remark) als Docusaurus; parsing-gedrag is identiek.
- Draait in Deno via `npm:`-compatibiliteitslaag.
- Plugin-architectuur: uitbreidbaar met transformaties (afbeeldingspaden aanpassen, QTI-secties filteren, diagramrendering, rijke inhoud in quizvragen). Unified beschrijft zichzelf als "an interface for processing content with syntax trees" (Unified, z.d.), wat deze uitbreidbaarheid mogelijk maakt.
- Geen runtime-afhankelijkheden in de output.

**Nadelen:**

- Styling-pariteit met Docusaurus moet apart worden gerealiseerd via CSS in de HTML-output.
- Navigatie en sidebar zijn Brightspace's verantwoordelijkheid via het manifest.
- Geladen via `npm:`, niet via JSR; de supply chain-voordelen van JSR gelden hier niet (zie ADR 008 voor de bredere afweging).

### Optie C — marked via `npm:`

Lichtgewicht Markdown→HTML-converter.

**Voordelen:**

- Eenvoudig, snel, weinig afhankelijkheden.
- Was al geïmplementeerd als tijdelijke oplossing.

**Nadelen:**

- Andere parser dan Docusaurus; subtiele parsing-verschillen mogelijk (dev/prod parity risico).
- Beperkte plugin-architectuur; onvoldoende voor rijke inhoud in quizvragen (code-blokken, diagrammen, geneste opmaak).
- Snelheidsvoordeel ten opzichte van unified is irrelevant bij build-time gebruik.
- Ook via `npm:` geladen; geen voordeel ten opzichte van unified op het gebied van supply chain.

## Beslissing

We kiezen voor unified via `npm:` (optie B). De parsing-laag is identiek aan wat Docusaurus gebruikt (remark/micromark), waardoor Markdown op dezelfde manier wordt geïnterpreteerd in de lokale preview en in de Brightspace-export. Het verschil zit in de rendering-laag: Docusaurus rendert naar React-componenten (met JavaScript), Brightspacosaurus rendert naar statische HTML (zonder JavaScript) — precies wat Brightspace vereist.

De plugin-architectuur van unified is noodzakelijk voor de geplande uitbreidingen: diagramrendering (Mermaid/PlantUML via Kroki), QTI-sectie-filtering, en rijke inhoud in quizvragen (code-blokken en opmaak in vraag- en antwoordteksten).

### Bewust niet gekozen

- Docusaurus-converter, omdat de output React/JavaScript bevat dat Brightspace niet uitvoert, en omdat het niet los van het Docusaurus-ecosysteem draait.
- marked, vanwege het risico op parsing-verschillen met de lokale preview, beperkte uitbreidbaarheid voor rijke quizinhoud, en geen voordeel ten opzichte van unified op het gebied van supply chain (beide via `npm:`).

### JSR-beschikbaarheid

Er is geen JSR-native Markdown-conversiepipeline beschikbaar die vergelijkbaar is met unified of marked. De keuze is daarmee beperkt tot `npm:`-pakketten. De supply chain-overwegingen uit ADR 008 (geen postinstall-scripts, permissiemodel) gelden onverminderd voor `npm:`-pakketten in Deno.

## Gevolgen

Positief:

- Eén Markdown-parser voor beide output-paden (Docusaurus en Brightspace); parsing-bugs worden op beide plekken zichtbaar.
- Statische HTML-output zonder JavaScript; direct importeerbaar in Brightspace.
- Plugin-architectuur maakt toekomstige transformaties (diagramrendering, quiz-integratie met rijke inhoud) eenvoudig toe te voegen.

Negatief:

- Visuele pariteit tussen Docusaurus en Brightspace moet via CSS worden gerealiseerd; dit is een iteratief proces.
- Navigatiestructuur in Brightspace wordt bepaald door het `imsmanifest.xml`, niet door de converter.
- `npm:`-afhankelijkheden brengen supply chain-risico's mee; zie ADR 008 voor mitigaties (versiepinning, dependency cooldown).

## Bronnen

- Unified. (z.d.). *unified — interface for processing content with syntax trees*. Geraadpleegd op 10 mei 2026, van https://unifiedjs.com/
  - Geciteerd bij de keuze voor unified (optie B, plugin-architectuur): "unified is an interface for processing content with syntax trees" — de kern van de uitbreidbaarheid die de plugin-architectuur mogelijk maakt.
- Docusaurus. (z.d.-b). *Markdown Features*. Geraadpleegd op 10 mei 2026, van https://docusaurus.io/docs/markdown-features
  - Bevestigt dat Docusaurus intern remark/rehype gebruikt voor Markdown-verwerking, wat de pariteitsredenering in de Context-sectie onderbouwt: "Docusaurus uses remark and rehype under the hood."
- Docusaurus. (2025). *Docusaurus 3.10*. Geraadpleegd op 10 mei 2026, van https://docusaurus.io/blog/releases/3.10
  - Over de bundler-keuze: "Docusaurus Faster lets you opt in for our modernized build infrastructure. This includes Rspack, SWC, LightningCSS, and other optimizations." en "In #11802, we marked Docusaurus Faster as stable." — Docusaurus stapt over op Rspack (niet Vite) als vervanging van webpack.
- D2L. (z.d.). *Import a course package*. Geraadpleegd op 10 mei 2026, van https://documentation.brightspace.com/EN/le/course_administration/instructor/import_course_package.htm
