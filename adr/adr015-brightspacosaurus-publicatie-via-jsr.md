# ADR 015 — Publicatie van Brightspacosaurus via JSR

## Status

Geaccepteerd

## Context

Brightspacosaurus is een CLI-tool en bibliotheek geschreven in TypeScript, draaiend op Deno (zie ADR 008). Om de tool herbruikbaar te maken — zowel als uitvoerbaar script als als importeerbare module — moet er een distributiestrategie worden gekozen.

De keuze van een pakketregister raakt aan vindbaarheid, versiebeheer, type-informatie, en consistentie met de al gekozen runtime en toolchain.

### Criteria

- Native ondersteuning voor Deno zonder een aparte build- of transpilatiestap
- Automatisch geïndexeerde TypeScript-types (geen `@types`-pakketten nodig)
- Versiebeheer met changelog-ondersteuning
- Minimale impedance mismatch met de bestaande Deno-toolchain
- Geen onnodige koppeling aan een extern platform of vendor

## Overwogen opties

### Optie A — npm registry (npmjs.com)

Publicatie naar de standaard npm-registry, bereikbaar via `npm:brightspacosaurus` in Deno.

**Voordelen:**

- Groot bereik; gebruikt door het brede JavaScript/TypeScript-ecosysteem.
- Bekend bij de meeste ontwikkelaars.

**Nadelen:**

- Vereist een build-stap: TypeScript moet worden getranspileerd naar CommonJS en/of ESM, inclusief `package.json` en declaration files.
- Geen native Deno-ondersteuning; imports werken wel via de `npm:`-specifier, maar de tooling gaat tegen de grain van Deno in.
- Grotere aanvalsoppervlakte (zie ADR 008): npm is een primair doelwit voor supply chain-aanvallen.
- Omgekeerd: Deno-specifieke features (permissiemodel, top-level await zonder wrapper) worden niet goed uitgedrukt in een npm-pakket.

### Optie B — GitHub Packages (npm-compatibel)

Publicatie naar het npm-compatibele pakketregister van GitHub.

**Voordelen:**

- Geïntegreerd met de GitHub-repository; releases en packages zijn gekoppeld.
- Ondersteunt npm-compatibele installatie.

**Nadelen:**

- Zelfde build-stap vereist als optie A.
- Authenticatie is verplicht bij installatie, ook voor publieke pakketten — dit bemoeilijkt gebruik door derden.
- Geen native Deno-ondersteuning.
- Koppelt de tool sterk aan het GitHub-platform.

### Optie C — URL-distributie via git-tag

Deno ondersteunt imports via HTTPS, waardoor modules direct via een raw URL of een git-tag kunnen worden gedistribueerd, zonder registry.

**Voordelen:**

- Geen externe registry nodig.
- Werkt native in Deno.
- Geen extra configuratie of account vereist.

**Nadelen:**

- Geen gecentraliseerde versie-index; gebruikers moeten de exacte URL of tag kennen.
- Geen geïndexeerde type-informatie; auto-complete en type-checking werken minder goed.
- Geen dependency graph-visualisatie of afhankelijkheidsanalyse.
- deno.land/x (de voorgaande Deno-registry op basis van dit model) is officieel deprecated ten gunste van JSR.

### Optie D — JSR (jsr.io) (gekozen)

Publicatie naar het JavaScript Registry (JSR), ontwikkeld en beheerd door het Deno-team, maar ontworpen als runtime-agnostisch register voor moderne JavaScript en TypeScript.

**Voordelen:**

- Native Deno-ondersteuning: `deno publish` publiceert direct vanuit de bestaande `deno.json`, zonder build-stap of extra configuratie.
- TypeScript-broncode wordt direct gepubliceerd; JSR genereert automatisch declaration files en indexeert types voor documentatie en auto-complete.
- Versiebeheer met semver, yanking van defecte versies, en een openbare versie-index.
- Pakket is ook bruikbaar vanuit Node.js, Bun en browsers via de npm-compatibiliteitslaag van JSR — geen lock-in.
- Kleinere aanvalsoppervlakte dan npm (zie ADR 008): minder pakketten, minder transitieve afhankelijkheden.
- Geen postinstall-scripts (Deno voert ze niet uit); dit geldt ook voor pakketten die via JSR worden geïnstalleerd.

**Nadelen:**

- JSR is jonger dan npm en heeft een kleinere gebruikersbasis.
- Zoekbaarheid en bekendheid zijn lager dan npm voor ontwikkelaars buiten het Deno-ecosysteem.
- Vereist een JSR-account en het instellen van een scope (`@scope/brightspacosaurus`).

## Beslissing

We kiezen voor publicatie via JSR (optie D). JSR is de logische voortzetting van ADR 008: dezelfde argumenten die Deno boven Node.js plaatsen — geen postinstall-scripts, geen `node_modules`, native TypeScript — gelden ook voor JSR boven npm. De tool wordt gepubliceerd als `@soro/brightspacosaurus` op jsr.io.

Publicatie verloopt via `deno publish` in de CI/CD-pipeline, gebaseerd op de bestaande `deno.json`. Er is geen aparte build-stap nodig.

### Bewust niet gekozen

- npm registry: vereist een build-stap en introduceert npm-risico's die ADR 008 juist wil vermijden.
- GitHub Packages: verplichte authenticatie voor publieke pakketten bemoeilijkt gebruik door derden.
- URL-distributie: geen registry-voordelen (typeindex, versiebeheer, zoekbaarheid); deno.land/x is bovendien deprecated.

## Gevolgen

Positief:

- Publicatie is volledig geautomatiseerd via `deno publish` zonder transpilatiestap.
- Gebruikers krijgen automatisch gegenereerde API-documentatie en type-informatie op jsr.io.
- Het pakket is bruikbaar vanuit Deno, Node.js en Bun zonder aanpassingen.

Negatief:

- Een JSR-scope (`@soro`) moet worden aangemaakt en beheerd.
- Ontwikkelaars die uitsluitend npm kennen, moeten wennen aan de JSR-workflow.
- JSR's kleinere gebruikersbasis betekent dat community-ondersteuning beperkter is dan bij npm.

## Bronnen

- Deno. (z.d.). *JSR: the JavaScript Registry*. https://jsr.io/docs

- Deno. (z.d.). *Publishing packages with deno publish*. https://docs.deno.com/runtime/reference/cli/publish/

- Deno. (2024). *Introducing JSR - the JavaScript Registry*. https://deno.com/blog/jsr_open_beta
