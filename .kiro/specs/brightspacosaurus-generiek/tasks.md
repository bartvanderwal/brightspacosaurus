# Implementation Plan: Brightspacosaurus Generiek

## Overview

Refactor Brightspacosaurus van een cursusspecifieke build-tool naar een generieke, configureerbare CLI-tool die via `brightspacosaurus.config.json` wordt aangestuurd. De implementatie volgt een bottom-up benadering: eerst het config-fundament, dan refactoring van bestaande modules, vervolgens tests en backwards-compatibiliteit, en tot slot publicatie-voorbereiding.

## Tasks

- [x] 1. Config Loader: types, interfaces en kernfunctionaliteit
  - [x] 1.1 Definieer config-interfaces in `src/types.ts`
    - Voeg `BssConfig`, `DocentenHandleidingConfig`, `ResolvedConfig`, `ResolvedDocentenConfig` en `CliOverrides` interfaces toe aan `src/types.ts`
    - Verplichte velden: `courseName`, `version`, `sourcesDir`
    - Optionele velden: `readersDir`, `assetsDir`, `outputDir`, `customCss`, `name`, `docentenHandleiding`
    - _Requirements: 1.3, 1.7_

  - [x] 1.2 Implementeer `src/config-loader.ts`
    - Implementeer `findConfigFile(repoRoot, explicitPath?)`: zoekt `brightspacosaurus.config.json` in cwd of op het opgegeven `--config` pad
    - Implementeer `loadConfig(configPath)`: laadt en parst JSON, gooit fout bij ongeldige JSON
    - Implementeer `validateConfig(config)`: valideert verplichte velden, retourneert type guard
    - Implementeer `resolveConfig(config, cliOverrides, repoRoot)`: merget CLI > config > defaults, resolvet alle paden naar absoluut
    - Implementeer de merge-strategie: CLI-argument wint van Config_File, Config_File wint van standaardwaarde
    - Foutmelding met voorbeeldconfiguratie als config niet gevonden en geen `--sources`
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 5.7_

  - [x] 1.3 Voeg `--config` argument toe aan de CLI-parser in `src/main.ts`
    - Breid `parseArgs()` uit met `--config <pad>` optie
    - Update `USAGE`-tekst met de nieuwe optie
    - _Requirements: 1.2_

- [x] 2. Refactor main.ts om ResolvedConfig te gebruiken
  - [x] 2.1 Refactor `main()` entry point in `src/main.ts`
    - Vervang directe parameter-passing door config-loading flow: `findConfigFile` → `loadConfig` → `resolveConfig`
    - Fallback naar `resolveFromCliOnly()` als er geen configbestand is maar wel `--sources`
    - Toon foutmelding + voorbeeldconfig als beide ontbreken
    - Verwijder `DEFAULT_SOURCES` en `DEFAULT_READERS` constanten
    - _Requirements: 1.1, 1.4, 1.5, 5.1, 5.7_

  - [x] 2.2 Refactor `runPrepare()` in `src/main.ts`
    - Wijzig signatuur naar `runPrepare(config: ResolvedConfig, readersOnly: boolean)`
    - Gebruik `config.sourcesDir` in plaats van hardcoded bronpad
    - Gebruik `config.readersDir` (null-check → overslaan zonder melding)
    - Gebruik `config.outputDir` voor build-map
    - Gebruik `config.docentenHandleiding` (null-check → overslaan zonder melding)
    - Verwijder hardcoded `6.3.Studentenmateriaal/`, `6.1.Docentenhandleiding/` paden
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.6, 11.1, 11.2_

  - [x] 2.3 Refactor `runPack()` in `src/main.ts`
    - Wijzig signatuur naar `runPack(config: ResolvedConfig)`
    - Gebruik `config.version` en `config.name` in plaats van `package.json`-afhankelijkheid
    - Gebruik `config.courseName` als parameter voor `buildManifest()`
    - Gebruik `config.outputDir` voor het bepalen van het .imscc-pad
    - _Requirements: 5.5, 5.6, 6.1_

- [x] 3. Checkpoint - Basisrefactoring valideren
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Verwijder OWE-1-specifieke logica uit modules
  - [x] 4.1 Maak manifest-builder generiek (`src/manifest-builder.ts`)
    - Verwijder `getNiveau()` functie (OWE-1-specifieke week→niveau mapping)
    - Vervang `getWeekLabel()` door generieke groepering op basis van eerste submap-naam (bijv. `week-1/`, `module-a/`)
    - De `buildManifest(courseTitle, entries)` signatuur blijft gelijk — `courseTitle` komt nu vanuit config
    - _Requirements: 5.5, 9.6_

  - [x] 4.2 Verwijder `package.json`-afhankelijkheid uit packer-flow
    - In `runPack()`: gebruik `config.version` en `config.name` direct
    - Verwijder de `packageJsonPath`-lezing en `.brightspacosaurus.json`-fallback
    - _Requirements: 6.1, 6.3_

  - [x] 4.3 Breid `src/markdown-converter.ts` uit met config-parameters
    - Voeg `version?: string` en `customCssPath?: string` toe aan `ConvertOptions` interface in `src/types.ts`
    - Pas `convertMarkdown()` aan om `version` uit options te gebruiken (in plaats van package.json)
    - Voeg ondersteuning toe voor custom CSS naast de standaard-stylesheet
    - _Requirements: 8.2, 8.4_

- [x] 5. Checkpoint - Modules gerefactored
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Property-based tests voor config-loader
  - [ ]* 6.1 Schrijf property test: Config parse round-trip
    - Maak `tests/config-loader.property.test.ts`
    - **Property 1: Config parse round-trip** — Voor elk geldig BssConfig-object: serialiseer naar JSON, parseer terug, valideer → structureel equivalent
    - Gebruik fast-check arbitraries voor het genereren van geldige config-objecten
    - **Validates: Requirements 1.3, 1.7**

  - [ ]* 6.2 Schrijf property test: CLI-argumenten prevaleren boven config
    - **Property 2: CLI-argumenten prevaleren** — Voor elke combinatie van config + overrides: resolved veld = CLI-waarde
    - Test specifiek `overrides.sources` → `resolvedConfig.sourcesDir` eindigt met override-waarde
    - **Validates: Requirements 1.6**

  - [ ]* 6.3 Schrijf property test: Config-resolutie produceert absolute paden
    - **Property 3: Absolute paden** — Voor elk geldig config + repoRoot: alle pad-velden in ResolvedConfig beginnen met repoRoot
    - Geen enkel pad in het resultaat is relatief
    - **Validates: Requirements 5.1, 5.5, 5.6**

  - [ ]* 6.4 Schrijf property test: Manifest bevat geconfigureerde cursusnaam
    - **Property 4: Cursusnaam in manifest** — Voor elke niet-lege courseName: buildManifest output bevat die naam als `<lomimscc:string>` waarde
    - **Validates: Requirements 5.5**

  - [ ]* 6.5 Schrijf property test: Optionele configuratie resulteert in null
    - **Property 5: Null bij afwezigheid** — Voor elk config zonder readersDir/docentenHandleiding/customCss: corresponderende ResolvedConfig velden zijn null
    - **Validates: Requirements 5.3, 5.4, 11.2**

- [ ] 7. Unit tests voor config-loader
  - [ ]* 7.1 Schrijf unit tests in `tests/config-loader.test.ts`
    - Test: laden van geldig configuratiebestand
    - Test: foutmelding bij ontbrekend verplicht veld (courseName, version, sourcesDir)
    - Test: foutmelding bij ongeldige JSON
    - Test: laden vanaf expliciet `--config`-pad
    - Test: standaard zoekpad (`brightspacosaurus.config.json` in cwd)
    - Test: `docentenHandleiding`-object correct geparseerd met inputFiles en outputName
    - Test: `assetsDir` en `customCss` correct geresolveerd naar absolute paden
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.7_

  - [ ]* 7.2 Update bestaande tests voor gewijzigde interfaces
    - Update `tests/manifest-builder.test.ts`: test generieke groepering op mapnamen (niet week/niveau)
    - Update `tests/cli.test.ts`: test `--config` argument parsing
    - Voeg test toe: foutmelding zonder config en zonder `--sources`
    - _Requirements: 5.5, 1.4_

- [ ] 8. Checkpoint - Tests valideren
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Voorbeeldconfiguraties voor Client_Projects
  - [ ] 9.1 Maak voorbeeldconfiguraties voor twee Client_Projects
    - Maak `examples/owe-1.config.json` met de huidige OWE-1 standaardwaarden
    - Maak `examples/oose-dt.config.json` met OOSE-DT standaardwaarden
    - Valideer de "rule of two": beide projecten moeten correct bouwen met dezelfde generieke tool
    - `courseName`, `version`, `sourcesDir`, `readersDir`, `docentenHandleiding` per project
    - _Requirements: 2.1, 2.2, 7.4, 7.5_

  - [ ] 9.2 Verwijder cursusspecifieke content uit assets
    - Verwijder alle cursusspecifieke visuele assets uit `assets/`
    - Verwijder cursusspecifieke selectors uit `assets/brightspacosaurus.css`
    - Behoud de generieke HAN-huisstijl basis-CSS
    - _Requirements: 2.1, 2.2, 8.1, 8.3_

- [ ] 10. JSR-publicatie voorbereiding
  - [ ] 10.1 Update `deno.json` voor JSR-publicatie
    - Voeg `name: "@han-ict/brightspacosaurus"` toe (of passende scope)
    - Voeg `version` veld toe
    - Voeg `exports` veld toe met entry points voor individuele modules
    - Voeg `publish.include` toe om alleen relevante bestanden te publiceren
    - Verwijder `--allow-write=../../build/` uit tasks (vervang door generieke `--allow-write`)
    - Verwijder OWE-1-specifieke paden uit task-definities
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

  - [ ] 10.2 Valideer dat BSS geen externe imports heeft
    - Controleer dat geen imports verwijzen naar bestanden buiten de BSS directory-structuur
    - Verwijder eventuele relatieve imports naar parent-directories (`../../`)
    - _Requirements: 6.3_

- [ ] 11. Checkpoint - Publicatie-gereedheid
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. ADR-migratie en documentatie
  - [ ] 12.1 Migreer relevante ADR's naar BSS-repository
    - Maak `adr/` directory aan
    - Kopieer ADR-008 (Deno runtime), ADR-010 (Brightspace packaging), ADR-011 (property-based testing), ADR-014 (onderhoud branches) naar `adr/`
    - _Requirements: 14.1, 14.2_

  - [ ] 12.2 Maak generieke handleiding
    - Herschrijf `docs/brightspacosaurus-handleiding.md` zonder cursusspecifieke verwijzingen
    - Beschrijf: installatie, configuratie, `prepare`-commando, `pack`-commando, quiz-conversie, reader-PDF-conversie, IMSCC-formaat, Brightspace-importprocedure
    - Gebruik generieke voorbeeldnamen ("Cursus X", "Module A")
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 12.3 Update `README.md` met installatie en quickstart
    - Installatie-instructies (Deno, JSR)
    - Quickstart: minimaal configuratiebestand + eerste build
    - Configuratievoorbeeld met alle opties
    - _Requirements: 6.4_

- [ ] 13. Optionele utilities separatie
  - [ ] 13.1 Verplaats Brightspace-opschoningsscript naar `utils/`
    - Maak `utils/` directory aan
    - Verplaats `verwijder-brightspace-paginas.js` naar `utils/`
    - Zorg dat het script onafhankelijk functioneert (geen gedeelde imports)
    - Markeer als experimenteel in een commentaar-header
    - _Requirements: 12.3, 13.1, 13.2, 13.4_

  - [ ] 13.2 Documenteer de opschoningsutility in de handleiding
    - Beschrijf dat Brightspace-import additief is
    - Beschrijf hoe de opschoningsutility als workaround kan worden gebruikt
    - _Requirements: 13.3_

- [ ] 14. Final checkpoint - Alle tests en integratie
  - Ensure all tests pass, ask the user if questions arise.
  - Valideer met OWE-1 config: `deno task prepare` en `deno task pack` produceren werkend IMSCC
  - Valideer met OOSE-DT config: `prepare --sources sad --output build/OOSE-DT-SAD` produceert werkend IMSCC

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- De implementatietaal is TypeScript (Deno) conform het bestaande project
- De config-loader is het fundament: alle andere wijzigingen bouwen hierop voort
- Stabiliteit wordt gevalideerd door twee Client_Projects (OWE-1 en OOSE-DT) te bouwen met de generieke tool

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["4.1", "4.2", "4.3"] },
    { "id": 5, "tasks": ["6.1", "6.2", "6.3", "6.5", "7.1"] },
    { "id": 6, "tasks": ["6.4", "7.2"] },
    { "id": 7, "tasks": ["9.1", "9.2"] },
    { "id": 8, "tasks": ["10.1", "10.2"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 10, "tasks": ["13.1", "13.2"] }
  ]
}
```
