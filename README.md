<p align="center">
  <img src="docs/images/bsosaurus-logo.png" alt="Brightspacosaurus logo" width="200">
</p>

# Brightspacosaurus

*Remark/TODO*: Documentation will be rewritten to English at some point now that this is (more) generic and open sourced. Voor nu Nederlands; weer eens wat anders. Have your browser or favorourite LLM translate it for now.

Brightspacosaurus is een CLI-tool die Markdown-cursusmateriaal omzet naar een Brightspace Common Cartridge (`.imscc`)-pakket. Gerealiseerd door Bart van der Wal, docent Software Engineering aan de HAN University of Applied Science, Academie IT en Media Design. 

📖 Zie de [uitgebreide handleiding](docs/brightspacosaurus-handleiding.md) voor een diepgaande uitleg over het datamodel, de werkwijze en het Brightspace-importproces.

## Vereisten

- [Deno](https://deno.com/) ≥ 2.0 — zie [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md) voor de motivatie
- [pandoc](https://pandoc.org/) (optioneel) — vereist voor reader-PDF-generatie en docentenhandleiding

## Installatie

### Via JSR (toekomstig)

```sh
deno add @han-ict/brightspacosaurus
```

### Lokaal

```sh
git clone <repository-url>
cd brightspacosaurus
deno task prepare
```

## Quickstart

1. Maak een `brightspacosaurus.config.json` in de root van je cursusproject:

```json
{
  "courseName": "Mijn Cursus",
  "version": "1.0.0",
  "sourcesDir": "bronmateriaal/lessen/"
}
```

2. Genereer HTML en QTI uit je Markdown-bronbestanden:

```sh
deno run --allow-read --allow-write --allow-run --allow-env src/main.ts prepare
```

3. Verpak de build-output tot een `.imscc`-archief:

```sh
deno run --allow-read --allow-write --allow-env src/main.ts pack
```

Het resultaat is een bestand zoals `build/brightspace/mijn-cursus.v1.0.0.imscc` dat je kunt importeren in Brightspace.

## Configuratie

Alle projectspecifieke instellingen worden beheerd via `brightspacosaurus.config.json`. CLI-argumenten prevaleren boven waarden uit het configuratiebestand.

### Verplichte velden

| Veld | Type | Beschrijving |
|------|------|-------------|
| `courseName` | `string` | Cursusnaam zoals weergegeven in het manifest |
| `version` | `string` | Versienummer (semver), gebruikt in .imscc-bestandsnaam en HTML-badge |
| `sourcesDir` | `string` | Bronmap voor lespagina's en quizzen (relatief aan werkdirectory) |

### Optionele velden

| Veld | Type | Standaard | Beschrijving |
|------|------|-----------|-------------|
| `name` | `string` | afgeleid van `courseName` | Projectnaam voor het .imscc-bestand |
| `readersDir` | `string` | `null` (overslaan) | Bronmap voor reader-Markdown (PDF-conversie via pandoc) |
| `assetsDir` | `string` | `null` (geen extra assets) | Map met statische assets (banners, logo's) |
| `outputDir` | `string` | `"build/brightspace"` | Build-uitvoermap |
| `customCss` | `string` | `null` (alleen standaard-CSS) | Pad naar een custom CSS-bestand |
| `docentenHandleiding` | `object` | `null` (overslaan) | Configuratie voor docentenhandleiding-PDF |

### DocentenHandleiding-object

| Veld | Type | Standaard | Beschrijving |
|------|------|-----------|-------------|
| `inputFiles` | `string[]` | (verplicht) | Lijst van Markdown-bronbestanden (relatief aan werkdirectory) |
| `outputName` | `string` | `"docentenhandleiding.pdf"` | Bestandsnaam voor de output-PDF |
| `outputDir` | `string` | `<outputDir>/docenten/` | Output-directory voor de PDF |

### Volledig voorbeeld

```json
{
  "courseName": "Software Engineering",
  "version": "2.1.0",
  "name": "SE",
  "sourcesDir": "studentenmateriaal/lessen/",
  "readersDir": "studentenmateriaal/readers/",
  "assetsDir": "images/",
  "outputDir": "build/brightspace",
  "customCss": "assets/custom.css",
  "docentenHandleiding": {
    "inputFiles": [
      "docentenhandleiding/hoofdstuk-1.md",
      "docentenhandleiding/hoofdstuk-2.md"
    ],
    "outputName": "docentenhandleiding-se.pdf",
    "outputDir": "build/brightspace/docenten"
  }
}
```

## CLI-opties

```
Gebruik: brightspacosaurus <commando> [opties]

Commando's:
  prepare   Zet Markdown-bronbestanden om naar HTML en quiz-Markdown naar QTI
  pack      Verpak build-map tot een .imscc-archief

Opties:
  --config <pad>     Pad naar configuratiebestand (standaard: brightspacosaurus.config.json in cwd)
  --sources <map>    Bronmap voor les- en quiz-Markdown (override van config.sourcesDir)
  --output <pad>     Uitvoerpad (override van config.outputDir)
  --readers-only     Genereer alleen reader- en docenten-PDF's
```

CLI-argumenten prevaleren altijd boven waarden uit het configuratiebestand.

## Commando's

### Tests draaien

```sh
deno task test
```

Voert alle unit- en property-based tests uit.

### Prepare (Markdown → HTML + QTI)

```sh
deno task prepare
```

Scant de geconfigureerde bronmap en:
- Zet les-Markdown om naar standalone HTML
- Zet quiz-Markdown (prefix `quiz-`) om naar QTI 1.2 XML
- Zet reader-Markdown (prefix `reader-`) om naar PDF via pandoc (indien geconfigureerd)
- Genereert de docentenhandleiding-PDF (indien geconfigureerd)
- Kopieert gerefereerde afbeeldingen naar de build-map

### Pack (HTML + QTI → .imscc)

```sh
deno task pack
```

Verpakt de inhoud van de build-map tot een `.imscc`-archief inclusief `imsmanifest.xml`.

## Importeren in Brightspace

Na het genereren van het `.imscc`-bestand importeer je het als volgt in Brightspace:

1. Ga naar de cursus waarin je wilt importeren.
2. Open **Cursus tools** → **Componenten importeren/exporteren/kopiëren**.
3. Scroll naar het onderdeel **Onderdelen importeren** en selecteer de radiobutton.
4. Kies **van een cursuspakket** (niet "uit opslagplaats voor cursusobjecten").
5. Klik **Starten**.
6. Sleep het `.imscc`-bestand (bijv. `cursus.v1.0.0.imscc`) naar het uploadblok (of klik om te bladeren).
7. Kies **Alle onderdelen importeren**.
8. Wacht tot de import is voltooid (dit kan enkele minuten duren; de voortgang wordt getoond met groene vinkjes).

## Beperkingen van Brightspace-import

Brightspace Common Cartridge import is additief voor content-modules en quizzen: het voegt items toe, maar verwijdert of overschrijft bestaande modules of quizzen niet. Er is geen deduplicatie op basis van identifier of titel.

De importwizard biedt wel de optie **"Bestaande bestanden overschrijven"**. Deze geldt voor bestanden in Manage Files (afbeeldingen, PDF's, HTML-bestanden) — niet voor content-modules of quizzen als geheel.

Dit betekent:

- Opnieuw importeren in dezelfde cursus levert duplicaten op voor modules en quizzen.
- Bestanden (afbeeldingen, PDF's) worden wél overschreven als de optie is aangevinkt en het pad overeenkomt.
- Verwijderen van eerder geïmporteerde content-modules moet handmatig in Brightspace.
- Er is geen "sync" of "deploy" — alleen een one-way push.

### Aanbevolen werkwijze

- **Itereren/testen**: importeer in een schone cursus (maak een nieuwe sandbox aan of reset de bestaande).
- **Productie**: importeer eenmalig in de doelcursus. Bij wijzigingen: gebruik "Geselecteerde onderdelen importeren" om alleen gewijzigde modules toe te voegen, en verwijder handmatig wat vervangen is.
- **Alternatief**: genereer per-module pakketten in plaats van één cursuspakket, zodat je selectief kunt importeren met beperkte schade bij duplicaten.

### Opruimen vóór herimport

Omdat import additief is voor modules en quizzen, moet je oude items handmatig verwijderen voordat je opnieuw importeert.

#### Content (lesmateriaal)

1. Ga naar **Content** in de cursus.
2. Navigeer naar de module(s) die je opnieuw wilt importeren.
3. Klik op het dropdown-menu (⋮) bij de module → **Module verwijderen**.
4. Bevestig. Dit verwijdert de module inclusief alle topics erin.

#### Quizzen

1. Ga naar **Assessment** → **Quizzes**.
2. Vink de quizzen aan die bij de vorige import horen (herkenbaar aan naam/prefix).
3. Klik **Verwijderen** (bovenaan de lijst).
4. Bevestig de verwijdering.

Let op: als een quiz al pogingen bevat (studentresultaten), waarschuwt Brightspace je. Verwijder in dat geval alleen in een test-/sandboxcursus, of archiveer de resultaten eerst.

#### Volgorde

1. Verwijder eerst de oude content en quizzen.
2. Importeer daarna het nieuwe `.imscc`-pakket.
3. Controleer of de nieuwe items correct zijn verschenen.

De source of truth blijft Git. Brightspace is het distributiekanaal, niet de bewaarplaats.

## Projectstructuur

```text
brightspacosaurus/
├── deno.json                  # taken, imports en JSR-publicatie config
├── README.md                  # dit bestand
├── SKILL.md                   # agent-instructies voor Kiro
├── src/
│   ├── types.ts               # TypeScript-interfaces
│   ├── config-loader.ts       # configuratie laden, valideren, mergen
│   ├── source-scanner.ts      # bronmappen scannen
│   ├── markdown-converter.ts  # Markdown → HTML (unified/remark)
│   ├── manifest-builder.ts    # imsmanifest.xml genereren
│   ├── quiz-converter.ts      # quiz-Markdown → QTI XML
│   ├── reader-pdf-converter.ts # reader-Markdown → PDF (pandoc)
│   ├── packer.ts              # HTML + QTI → .imscc
│   └── main.ts                # CLI-entry point
├── assets/
│   ├── brightspacosaurus.css  # standaard-stylesheet (HAN-huisstijl)
│   ├── reader-header.tex      # pandoc LaTeX-header voor readers
│   └── include-filter.lua     # pandoc Lua-filter
├── tests/
│   ├── config-loader.test.ts
│   ├── config-loader.property.test.ts
│   ├── source-scanner.test.ts
│   ├── markdown-converter.test.ts
│   ├── manifest-builder.test.ts
│   ├── quiz-converter.test.ts
│   ├── packer.test.ts
│   └── cli.test.ts
├── utils/
│   └── verwijder-brightspace-paginas.js  # experimentele opschoningsutility
├── adr/                       # Architecture Decision Records
├── docs/
│   └── brightspacosaurus-handleiding.md
└── examples/
    └── *.config.json          # voorbeeldconfiguraties
```

## Ontwerpbeslissingen

- **Deno als runtime** i.p.v. Node.js — zie [ADR 008](adr/adr008-brightspacosaurus-runtime-deno-vs-nodejs.md)
- **unified (remark/rehype)** voor Markdown → HTML — zie [ADR 010](adr/adr010-brightspacosaurus-unified-pipeline-markdown-conversie.md)
- **Property-based testing** met fast-check — zie [ADR 011](adr/adr011-brightspacosaurus-rijke-inhoud-quizvragen.md)
- **Reader-PDF-conversie via pandoc** — zie [ADR 014](adr/adr014-reader-pdf-conversie-via-brightspacosaurus.md)
- **JSR als primair distributiekanaal** — zie [ADR 015](adr/adr015-brightspacosaurus-publicatie-via-jsr.md)
- **Config-driven met sensible defaults** — projectspecifieke instellingen via `brightspacosaurus.config.json`, CLI-argumenten prevaleren boven config
- Alle uitvoer in `build/`, nooit naast bronbestanden
- Deterministische bestandsvolgorde voor reproduceerbare archieven

## Spec

BSOsaurus is opgezet met AWS' Kiro, een Spec-Driven-Development tool (AI tool). 

De volledige feature-spec (requirements, ontwerp, taken) staat in Kiro specs in deze repo:
- [`.kiro/specs/brightspacosaurus-generiek/`](.kiro/specs/brightspacosaurus/), originele opstart
- [`.kiro/specs/brightspacosaurus-generiek/`](.kiro/specs/brightspacosaurus-generiek/), latere stap naar een aparte generiekere tool en JSR module
- Wellicht later meer...

<p align="center">
  <img src="docs/images/brightspacosaurus-big.png" alt="Brightspacosaurus hero" width="600">
</p>
