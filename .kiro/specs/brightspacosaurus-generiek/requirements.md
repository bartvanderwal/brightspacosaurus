# Requirements Document

## Introduction

Brightspacosaurus is een build-tool die Markdown cursusmateriaal omzet naar een `.imscc`-pakket (IMS Common Cartridge) voor import in Brightspace. De tool draait momenteel als onderdeel van de `owe-1-fusten` monorepo en bevat OWE-1-specifieke content (niveau-visuals, naamgeving, Canva-instructies). Dit document beschrijft de requirements voor het generiek maken van Brightspacosaurus zodat de tool herbruikbaar wordt voor andere OWE's en uiteindelijk als zelfstandig npm-package of CLI kan worden gepubliceerd.

De kern van de wijziging: scheiding van de generieke build-tool (Markdown → IMSCC) van de OWE-specifieke content en configuratie.

## Glossary

- **BSS**: Brightspacosaurus — de build-tool
- **OWE**: Onderwijs- en Werkeenheid — een cursusmodule binnen HBO-ICT
- **IMSCC**: IMS Common Cartridge — open standaard voor uitwisseling van cursusmateriaal
- **QTI**: Question and Test Interoperability — standaard voor quizzen/assessments
- **Config_File**: Het configuratiebestand (`brightspacosaurus.config.json` of `brightspacosaurus.config.ts`) dat per project de bronmappen, assets en output definieert
- **Source_Scanner**: Het BSS-component dat bronmappen scant en bestanden classificeert
- **Manifest_Builder**: Het BSS-component dat `imsmanifest.xml` genereert
- **Packer**: Het BSS-component dat de build-map verpakt tot een `.imscc`-archief
- **Asset_Pipeline**: Het proces dat afbeeldingen en andere statische bestanden kopieert naar de build-output
- **Repo_Root**: De root-directory van het project dat BSS gebruikt

## Requirements

### Requirement 1: Configuratiebestand voor projectspecifieke instellingen

**User Story:** Als cursusontwikkelaar wil ik Brightspacosaurus configureren via een projectspecifiek configuratiebestand, zodat ik de tool kan gebruiken zonder de broncode aan te passen.

#### Acceptance Criteria

1. WHEN BSS wordt gestart zonder expliciet `--config` argument, THE Config_File SHALL worden gezocht in de Repo_Root als `brightspacosaurus.config.json`
2. WHEN een `--config <pad>` argument wordt meegegeven, THE Config_File SHALL worden geladen vanaf het opgegeven pad
3. THE Config_File SHALL minimaal de volgende velden ondersteunen: `sourcesDir` (bronmap voor lespagina's), `readersDir` (bronmap voor readers), `assetsDir` (map met statische assets), `outputDir` (build-uitvoermap), `courseName` (cursusnaam voor het manifest), `version` (versienummer)
4. IF het Config_File niet gevonden wordt en geen `--sources` argument is meegegeven, THEN THE BSS SHALL een duidelijke foutmelding tonen met een voorbeeld-configuratie
5. WHEN een Config_File aanwezig is, THE BSS SHALL de waarden uit het configuratiebestand gebruiken in plaats van de huidige hardcoded standaardwaarden

### Requirement 2: Verwijderen van OWE-1-specifieke content uit BSS

**User Story:** Als beheerder van Brightspacosaurus wil ik dat de tool geen OWE-1-specifieke content bevat, zodat de repository niet vervuild raakt met cursusspecifiek materiaal.

#### Acceptance Criteria

1. THE BSS SHALL geen niveau-visual afbeeldingen (`niveau-*-*.png`) bevatten in de `assets/`-map
2. THE BSS SHALL geen OWE-1-specifieke visuals (`owe-1-visual-*.png`) bevatten in de `assets/`-map
3. THE BSS SHALL geen Canva-instructies of niveaunaam-beschrijvingen bevatten in de handleiding
4. WHEN de niveau-visuals uit BSS zijn verwijderd, THE OWE-1 project SHALL de niveau-visuals bevatten in `6.3.Studentenmateriaal/images/` of een vergelijkbare lesmateriaal-map
5. THE BSS handleiding SHALL uitsluitend generieke tool-documentatie bevatten over hoe de build-pipeline werkt

### Requirement 3: Configureerbare asset-pipeline

**User Story:** Als cursusontwikkelaar wil ik zelf bepalen welke assets worden meegenomen in de build, zodat ik per cursus eigen banners, logo's en afbeeldingen kan gebruiken.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL de te kopiëren assets lezen uit het `assetsDir`-veld in het Config_File
2. WHEN het `assetsDir`-veld ontbreekt in het Config_File, THE Asset_Pipeline SHALL geen extra assets kopiëren buiten de afbeeldingen die vanuit Markdown worden gerefereerd
3. THE Asset_Pipeline SHALL alle afbeeldingen die via Markdown `![alt](pad)` worden gerefereerd automatisch meenemen in het IMSCC-pakket, ongeacht de configuratie
4. WHEN een gerefereerde afbeelding niet bestaat op het opgegeven pad, THE Asset_Pipeline SHALL een waarschuwing loggen met het bronbestand en het ontbrekende pad

### Requirement 4: Opsplitsing van de BSS-handleiding

**User Story:** Als cursusontwikkelaar wil ik een generieke handleiding die uitlegt hoe BSS werkt, gescheiden van OWE-specifieke documentatie over welke content ermee wordt gebouwd.

#### Acceptance Criteria

1. THE BSS SHALL een generieke handleiding bevatten die beschrijft: installatie, configuratie, het `prepare`-commando, het `pack`-commando, het IMSCC-formaat en de importprocedure in Brightspace
2. THE BSS handleiding SHALL geen verwijzingen bevatten naar specifieke cursusnamen, niveaunamen of OWE-specifieke structuren
3. WHEN de handleiding verwijst naar voorbeelden, THE BSS SHALL generieke voorbeeldnamen gebruiken (bijv. "Cursus X", "Module A") in plaats van "OWE-1", "Solo Starter" of "Backend Builder"
4. THE OWE-1 project SHALL een eigen documentatiebestand behouden dat beschrijft hoe BSS specifiek voor OWE-1 FUSTEN wordt ingezet, inclusief de niveau-visuals en weekstructuur

### Requirement 5: Ontkoppeling van hardcoded paden

**User Story:** Als cursusontwikkelaar in een ander project wil ik BSS kunnen gebruiken zonder de mappenstructuur van OWE-1 te hoeven nabootsen.

#### Acceptance Criteria

1. THE Source_Scanner SHALL de bronmap bepalen op basis van het Config_File of CLI-argument, niet op basis van een hardcoded pad
2. THE BSS SHALL geen hardcoded verwijzingen bevatten naar `6.3.Studentenmateriaal/`, `6.1.Docentenhandleiding/` of andere OWE-1-specifieke mappaden
3. WHEN de `readersDir` niet is geconfigureerd, THE BSS SHALL de reader-scan overslaan zonder foutmelding
4. WHEN de docentenhandleiding-generatie niet is geconfigureerd, THE BSS SHALL de docentenhandleiding-PDF-stap overslaan zonder foutmelding
5. THE BSS SHALL de cursusnaam voor het manifest lezen uit het Config_File in plaats van de hardcoded waarde "OWE 1 - Full Stack Engineering"

### Requirement 6: Voorbereiding op extractie naar eigen repository

**User Story:** Als open-source-bijdrager wil ik dat BSS als zelfstandig project kan functioneren, zodat het als npm-package of Deno-module gepubliceerd kan worden.

#### Acceptance Criteria

1. THE BSS SHALL een eigen `package.json` of `deno.json` bevatten met alle benodigde dependencies, zonder afhankelijkheid van de parent-repo
2. THE BSS SHALL aanroepbaar zijn als CLI-tool via een entry point (bijv. `npx brightspacosaurus prepare`)
3. THE BSS SHALL geen imports bevatten die verwijzen naar bestanden buiten de eigen directory-structuur
4. THE BSS SHALL een `README.md` bevatten met installatie-instructies, quickstart en configuratievoorbeeld
5. IF BSS als npm-package wordt gepubliceerd, THEN THE BSS SHALL de package-naam `brightspacosaurus` of `docusaurus-plugin-brightspace-export` gebruiken

### Requirement 7: Backwards-compatibiliteit voor OWE-1

**User Story:** Als OWE-1-docent wil ik dat de bestaande build-workflow blijft werken na de refactoring, zodat ik zonder onderbreking kan blijven publiceren.

#### Acceptance Criteria

1. WHEN BSS wordt aangeroepen vanuit de OWE-1 repo met een geldig Config_File, THE BSS SHALL dezelfde output genereren als de huidige implementatie
2. THE OWE-1 repo SHALL een `brightspacosaurus.config.json` bevatten dat de huidige standaardwaarden expliciet configureert
3. WHEN de `npm run build` of `deno task prepare` commando's worden uitgevoerd in de OWE-1 repo, THE BSS SHALL het IMSCC-pakket genereren zonder handmatige aanpassingen
4. THE `copy-assets` script in `scripts/docusaurus/package.json` SHALL verwijzen naar de nieuwe locatie van de niveau-visuals in de lesmateriaal-map

### Requirement 8: Generieke CSS-stylesheet

**User Story:** Als cursusontwikkelaar wil ik de meegeleverde CSS-stylesheet kunnen gebruiken als basis voor mijn cursus-styling, zodat ik niet vanaf nul hoef te beginnen.

#### Acceptance Criteria

1. THE BSS SHALL een standaard CSS-stylesheet (`brightspacosaurus.css`) meeleveren die gebaseerd is op de HAN-huisstijl
2. WHEN een `customCss`-pad is geconfigureerd in het Config_File, THE BSS SHALL de custom stylesheet toevoegen naast de standaard-stylesheet
3. THE standaard-stylesheet SHALL geen OWE-1-specifieke kleuren, niveaunamen of cursusspecifieke selectors bevatten
4. WHEN geen `customCss` is geconfigureerd, THE BSS SHALL uitsluitend de standaard-stylesheet gebruiken bij HTML-conversie
