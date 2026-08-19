# Requirements Document

## Introduction

Brightspacosaurus (BSS) is een build-tool die Markdown cursusmateriaal omzet naar een `.imscc`-pakket (IMS Common Cartridge 1.3) voor import in Brightspace, en optioneel reader-Markdown naar PDF converteert via pandoc. De tool is oorspronkelijk ontstaan binnen een monorepo voor één specifieke cursus en bevat momenteel cursusspecifieke content (niveau-visuals, naamgeving, hardcoded paden). Dit document beschrijft de requirements voor het generiek maken van BSS zodat de tool herbruikbaar wordt voor willekeurige cursusprojecten en uiteindelijk als zelfstandig CLI-tool kan worden gepubliceerd.

De kern van de wijziging: scheiding van de generieke build-tool (Markdown → HTML + QTI + PDF → IMSCC) van cursusspecifieke content, configuratie en mappenstructuur.

**Scope-afbakening:** BSS is een build-tool die `.imscc`-pakketten en PDF's genereert. Docusaurus-preview, browserautomatisering voor Brightspace-opschoning en andere tooling rond de publicatieworkflow vallen buiten de scope van de BSS-kern, maar kunnen als optionele utilities meegeleverd worden.

## Glossary

- **BSS**: Brightspacosaurus — de build-tool
- **Client_Project**: Een cursusproject dat BSS gebruikt om cursusmateriaal te bouwen tot een IMSCC-pakket (bijv. een OWE-repository, een minor, een losse cursus)
- **OWE**: Onderwijs- en Werkeenheid — een cursusmodule binnen HBO-ICT
- **IMSCC**: IMS Common Cartridge — open standaard voor uitwisseling van cursusmateriaal
- **QTI**: Question and Test Interoperability — standaard voor quizzen/assessments (BSS genereert QTI 1.2)
- **Config_File**: Het configuratiebestand (`brightspacosaurus.config.json`) dat per project de bronmappen, assets en output definieert
- **Source_Scanner**: Het BSS-component dat bronmappen scant en bestanden classificeert op basis van bestandsnaamprefix
- **Quiz_Converter**: Het BSS-component dat quiz-Markdown (prefix `quiz-`) omzet naar QTI 1.2 XML
- **Markdown_Converter**: Het BSS-component dat les-Markdown omzet naar HTML
- **Reader_Converter**: Het BSS-component dat reader-Markdown omzet naar PDF via pandoc
- **Manifest_Builder**: Het BSS-component dat `imsmanifest.xml` genereert op basis van content-entries
- **Packer**: Het BSS-component dat de build-map verpakt tot een `.imscc`-archief
- **Asset_Pipeline**: Het proces dat afbeeldingen en andere statische bestanden kopieert naar de build-output
- **JSR**: JavaScript Registry — Deno's package registry voor het publiceren en installeren van TypeScript/JavaScript modules (https://jsr.io)
- **Repo_Root**: De werkdirectory (`cwd`) van waaruit BSS wordt aangeroepen

## Requirements

### Requirement 1: Configuratiebestand voor projectspecifieke instellingen

**User Story:** Als cursusontwikkelaar wil ik Brightspacosaurus configureren via een projectspecifiek configuratiebestand, zodat ik de tool kan gebruiken zonder de broncode aan te passen.

#### Acceptance Criteria

1. WHEN BSS wordt gestart zonder expliciet `--config` argument, THE Config_File SHALL worden gezocht in de Repo_Root als `brightspacosaurus.config.json`
2. WHEN een `--config <pad>` argument wordt meegegeven, THE BSS SHALL het configuratiebestand laden vanaf het opgegeven pad
3. THE Config_File SHALL minimaal de volgende velden ondersteunen: `sourcesDir` (bronmap voor lespagina's en quizzen), `readersDir` (bronmap voor readers), `assetsDir` (map met statische assets), `outputDir` (build-uitvoermap), `courseName` (cursusnaam voor het manifest), `version` (versienummer)
4. IF het Config_File niet gevonden wordt en geen `--sources` argument is meegegeven, THEN THE BSS SHALL een duidelijke foutmelding tonen met een voorbeeld-configuratie
5. WHEN een Config_File aanwezig is, THE BSS SHALL de waarden uit het configuratiebestand gebruiken in plaats van de huidige hardcoded standaardwaarden
6. WHEN CLI-argumenten (`--sources`, `--output`) worden meegegeven naast een Config_File, THE BSS SHALL de CLI-argumenten laten prevaleren boven de Config_File-waarden
7. THE Config_File SHALL optioneel een `docentenHandleiding`-object ondersteunen met `inputFiles` (lijst bronbestanden) en `outputName` (bestandsnaam PDF), zodat de docentenhandleiding-generatie configureerbaar is

### Requirement 2: Geen cursusspecifieke content in BSS

**User Story:** Als cursusontwikkelaar wil ik dat BSS een generieke tool is zonder gebundelde cursusspecifieke content, zodat de repository schoon en herbruikbaar blijft voor elk Client_Project.

#### Acceptance Criteria

1. THE BSS SHALL geen cursusspecifieke visual-afbeeldingen (zoals niveau-visuals of cursusbanners) bevatten in de `assets/`-map
2. THE BSS SHALL uitsluitend generieke assets bevatten die nodig zijn voor de standaard-styling (CSS, eventuele iconen voor het toolframework zelf)
3. THE BSS SHALL geen cursusspecifieke visuele stijlrichtlijnen, Canva-instructies of niveaunaam-beschrijvingen bevatten in de documentatie
4. THE BSS SHALL via het `assetsDir`-configuratieveld het mechanisme bieden waarmee een Client_Project eigen visuals, banners en afbeeldingen kan aanleveren voor de build
5. THE BSS handleiding SHALL uitsluitend generieke tool-documentatie bevatten over hoe de build-pipeline werkt

### Requirement 3: Configureerbare asset-pipeline

**User Story:** Als cursusontwikkelaar wil ik zelf bepalen welke assets worden meegenomen in de build, zodat ik per cursus eigen banners, logo's en afbeeldingen kan gebruiken.

#### Acceptance Criteria

1. THE Asset_Pipeline SHALL de te kopiëren assets lezen uit het `assetsDir`-veld in het Config_File
2. WHEN het `assetsDir`-veld ontbreekt in het Config_File, THE Asset_Pipeline SHALL geen extra assets kopiëren buiten de afbeeldingen die vanuit Markdown worden gerefereerd
3. THE Asset_Pipeline SHALL alle afbeeldingen die via Markdown `![alt](pad)` worden gerefereerd automatisch meenemen in het IMSCC-pakket, ongeacht de configuratie
4. WHEN een gerefereerde afbeelding niet bestaat op het opgegeven pad, THE Asset_Pipeline SHALL een waarschuwing loggen met het bronbestand en het ontbrekende pad

### Requirement 4: Generieke handleiding

**User Story:** Als cursusontwikkelaar wil ik een generieke handleiding die uitlegt hoe BSS werkt, zodat ik de tool kan gebruiken zonder cursusspecifieke kennis.

#### Acceptance Criteria

1. THE BSS SHALL een generieke handleiding bevatten die beschrijft: installatie, configuratie, het `prepare`-commando, het `pack`-commando, quiz-conversie naar QTI, reader-PDF-conversie, het IMSCC-formaat en de importprocedure in Brightspace
2. THE BSS handleiding SHALL geen verwijzingen bevatten naar specifieke cursusnamen, niveaunamen of cursusspecifieke structuren
3. WHEN de handleiding verwijst naar voorbeelden, THE BSS SHALL generieke voorbeeldnamen gebruiken (bijv. "Cursus X", "Module A") in plaats van specifieke cursusnamen
4. THE BSS SHALL een voorbeeldconfiguratie (`brightspacosaurus.config.example.json`) meeleveren die demonstreert hoe een Client_Project BSS kan inzetten, inclusief alle configureerbare velden

### Requirement 5: Ontkoppeling van hardcoded paden

**User Story:** Als cursusontwikkelaar in een willekeurig project wil ik BSS kunnen gebruiken zonder een specifieke mappenstructuur te hoeven nabootsen.

#### Acceptance Criteria

1. THE Source_Scanner SHALL de bronmap bepalen op basis van het Config_File of CLI-argument (`--sources`), niet op basis van een hardcoded pad
2. THE BSS SHALL geen hardcoded verwijzingen bevatten naar cursusspecifieke mappaden
3. WHEN de `readersDir` niet is geconfigureerd in het Config_File en niet via CLI is meegegeven, THE BSS SHALL de reader-scan en PDF-conversie overslaan zonder foutmelding
4. WHEN de `docentenHandleiding`-configuratie ontbreekt in het Config_File, THE BSS SHALL de docentenhandleiding-PDF-stap overslaan zonder foutmelding
5. THE Manifest_Builder SHALL de cursusnaam lezen uit het Config_File (`courseName`) in plaats van een hardcoded waarde
6. THE BSS SHALL het build-uitvoerpad bepalen op basis van het Config_File (`outputDir`) of het `--output` CLI-argument, niet op basis van een hardcoded relatief pad
7. WHEN de `Repo_Root` wordt bepaald, THE BSS SHALL `Deno.cwd()` gebruiken als werkdirectory zodat de tool locatie-onafhankelijk inzetbaar is

### Requirement 6: Voorbereiding op publicatie als zelfstandig CLI-tool via JSR

**User Story:** Als open-source-bijdrager wil ik dat BSS als zelfstandig project kan functioneren en publiceerbaar is naar JSR (Deno's package registry) als primair distributiekanaal, met npm-compatibiliteit via Deno's compatibility layer als secundaire optie, zodat de tool breed inzetbaar is.

#### Acceptance Criteria

1. THE BSS SHALL een eigen `deno.json` bevatten met alle benodigde dependencies, zonder `--allow-write`-paden die verwijzen naar parent-repo-structuren
2. THE BSS SHALL aanroepbaar zijn als CLI-tool via een duidelijk entry point (bijv. `deno run --allow-read --allow-write --allow-run --allow-env src/main.ts prepare`)
3. THE BSS SHALL geen imports bevatten die verwijzen naar bestanden buiten de eigen directory-structuur
4. THE BSS SHALL een `README.md` bevatten met installatie-instructies, quickstart en configuratievoorbeeld
5. THE BSS `deno.json` tasks SHALL generieke paden gebruiken die via Config_File of CLI worden bepaald, niet hardcoded cursusspecifieke paden
6. THE BSS SHALL publiceerbaar zijn naar JSR als Deno-module met een correct geconfigureerd `exports`-veld in `deno.json`
7. THE BSS SHALL compatibel blijven met Node.js/npm-consumers via Deno's npm-compatibiliteitslaag, zonder dat een native npm-publish noodzakelijk is

### Requirement 7: Stabiele CLI-interface en migratiepad

**User Story:** Als cursusontwikkelaar wil ik dat BSS een stabiele CLI-interface en configuratieschema biedt, zodat een versie-upgrade van de BSS-tool zelf (bijv. via JSR) mijn bestaande `brightspacosaurus.config.json` en build-scripts niet breekt.

#### Acceptance Criteria

1. THE BSS SHALL een stabiel CLI-contract bieden: de commando's `prepare` en `pack`, de vlaggen `--config`, `--sources`, `--output` en het Config_File-schema vormen het publieke API-oppervlak
2. WHEN het Config_File-schema wijzigt op een backwards-incompatibele manier, THE BSS SHALL een duidelijke migratie-instructie documenteren in de release notes en een `version`-veld in het Config_File ondersteunen voor schema-versioning
3. THE BSS SHALL bij een major-versie-upgrade een migratie-gids aanbieden die beschrijft welke configuratie-aanpassingen nodig zijn voor bestaande Client_Projects
4. WHEN BSS wordt aangeroepen met een geldig Config_File, THE BSS SHALL dezelfde categorieën output genereren als voorheen (HTML-paginas, QTI-quizzen, reader-PDF's, imsmanifest.xml, .imscc-archief) zonder onverwachte wijzigingen in het outputformaat
5. THE BSS SHALL een voorbeeldconfiguratie meeleveren die demonstreert hoe een bestaand cursusproject kan migreren naar de generieke configuratiestructuur

### Requirement 8: Generieke CSS-stylesheet

**User Story:** Als cursusontwikkelaar wil ik de meegeleverde CSS-stylesheet kunnen gebruiken als basis voor mijn cursus-styling, zodat ik niet vanaf nul hoef te beginnen.

#### Acceptance Criteria

1. THE BSS SHALL een standaard CSS-stylesheet (`brightspacosaurus.css`) meeleveren die gebaseerd is op de HAN-huisstijl
2. WHEN een `customCss`-pad is geconfigureerd in het Config_File, THE BSS SHALL de custom stylesheet toevoegen naast de standaard-stylesheet
3. THE standaard-stylesheet SHALL geen cursusspecifieke kleuren, niveaunamen of cursusspecifieke selectors bevatten
4. WHEN geen `customCss` is geconfigureerd, THE BSS SHALL uitsluitend de standaard-stylesheet gebruiken bij HTML-conversie

### Requirement 9: Generieke quiz-conversie naar QTI

**User Story:** Als cursusontwikkelaar wil ik quizzen in Markdown schrijven en automatisch laten omzetten naar QTI 1.2 XML, zodat ik quizzen kan importeren in Brightspace zonder handmatig werk.

#### Acceptance Criteria

1. THE Source_Scanner SHALL bestanden met het prefix `quiz-` in de bestandsnaam classificeren als quizbestanden
2. THE Source_Scanner SHALL bestanden met het suffix `-antwoorden-docent` in de bestandsnaam uitsluiten van zowel quiz-conversie als HTML-conversie
3. THE Quiz_Converter SHALL een quiz-Markdown bestand parsen op basis van het formaat: H1 als quiztitel, H2 als vragnummer, opties als `- A. tekst` t/m `- D. tekst`, en `Correct antwoord: **X**` als aanduiding van het juiste antwoord
4. THE Quiz_Converter SHALL per quiz-Markdown bestand één geldig QTI 1.2 XML-bestand genereren conform het IMS CC QTI-profiel (`cc.exam.v0p1`)
5. WHEN een quiz-Markdown bestand geen vragen bevat, THE Quiz_Converter SHALL een foutmelding geven met het pad naar het bronbestand
6. THE Manifest_Builder SHALL QTI-bestanden opnemen als resource met type `imsqti_xmlv1p2/imscc_xmlv1p3/assessment` én als organization-item, zodat ze in Brightspace zowel in de Quizzes-tool als in de content-navigatie verschijnen
7. THE Quiz_Converter SHALL de bronmap voor quizzen bepalen op basis van het Config_File (`sourcesDir`), niet op basis van hardcoded paden

### Requirement 10: Generieke reader-PDF-conversie

**User Story:** Als cursusontwikkelaar wil ik reader-Markdown-bestanden automatisch laten omzetten naar PDF, zodat studenten naslagmateriaal als geformatteerd document kunnen downloaden.

#### Acceptance Criteria

1. THE Source_Scanner SHALL bestanden met het prefix `reader-` in de bestandsnaam classificeren als readerbestanden
2. THE Reader_Converter SHALL een reader-Markdown bestand omzetten naar PDF via pandoc met xelatex of lualatex als PDF-engine
3. WHEN pandoc niet beschikbaar is op het systeem, THE BSS SHALL een waarschuwing loggen en de reader-PDF-conversie overslaan zonder de build af te breken
4. THE Reader_Converter SHALL de bronmap voor readers bepalen op basis van het Config_File (`readersDir`) of het CLI-argument
5. WHEN een reader-conversie mislukt, THE BSS SHALL het mislukte bestand rapporteren en doorgaan met de overige readers, maar na afloop een niet-nul exitcode retourneren
6. THE BSS SHALL reader-PDF's opnemen in het IMSCC-pakket als webcontent-resource onder een "Readers"-module in het manifest
7. THE Reader_Converter SHALL de `--resource-path` van pandoc instellen op de directory van het bronbestand, zodat relatieve afbeeldingsreferenties in readers correct worden geresolveerd

### Requirement 11: Configureerbare docentenhandleiding-generatie

**User Story:** Als cursusontwikkelaar wil ik optioneel een samengestelde docentenhandleiding-PDF laten genereren uit meerdere Markdown-bronbestanden, zodat docenten één geïntegreerd document hebben.

#### Acceptance Criteria

1. WHEN het Config_File een `docentenHandleiding`-object bevat met een `inputFiles`-lijst, THE BSS SHALL de opgegeven bestanden combineren tot één PDF via pandoc
2. WHEN het `docentenHandleiding`-object ontbreekt in het Config_File, THE BSS SHALL de docentenhandleiding-generatie overslaan zonder waarschuwing
3. THE BSS SHALL de docentenhandleiding-PDF NIET opnemen in het IMSCC-pakket, omdat docentenmateriaal niet studentzichtbaar mag zijn
4. WHEN de docentenhandleiding-generatie mislukt, THE BSS SHALL een waarschuwing loggen maar de build niet afbreken (niet-blokkerend)
5. THE BSS SHALL de output-locatie voor de docentenhandleiding-PDF bepalen op basis van het Config_File (`docentenHandleiding.outputDir` of een standaard submap `docenten/` in de build-map)

### Requirement 12: Scope-afbakening BSS-kern

**User Story:** Als ontwikkelaar van BSS wil ik een duidelijke afbakening van wat BSS-kern is en wat optionele tooling, zodat de codebase onderhoudbaar en gefocust blijft.

#### Acceptance Criteria

1. THE BSS kern SHALL beperkt zijn tot: het scannen van bronbestanden, converteren van Markdown naar HTML, converteren van quiz-Markdown naar QTI XML, converteren van readers naar PDF, genereren van imsmanifest.xml, en verpakken tot een .imscc-archief
2. THE BSS SHALL geen Docusaurus-configuratie, Docusaurus-plugins of Docusaurus-preview-functionaliteit bevatten als onderdeel van de kern
3. WHEN BSS optionele utilities bevat (bijv. browser-scripts voor Brightspace-opschoning), THE BSS SHALL deze scheiden van de kern in een aparte `utils/`- of `extras/`-map
4. THE BSS SHALL geen Brightspace API-integratie bevatten in de kern; toekomstige API-functionaliteit valt buiten deze scope

### Requirement 13: Optionele Brightspace-opschoningsutility

**User Story:** Als cursusontwikkelaar wil ik een meegeleverd hulpscript kunnen gebruiken om bestaande content in Brightspace te verwijderen vóór herimport, zodat ik geen dubbele items krijg.

#### Acceptance Criteria

1. THE BSS SHALL optioneel een browser-consolescript (`verwijder-brightspace-paginas.js`) meeleveren voor het bulk-verwijderen van content in Brightspace
2. THE opschoningsutility SHALL onafhankelijk functioneren van de BSS-kern (geen gedeelde imports of configuratie)
3. THE BSS handleiding SHALL documenteren dat Brightspace-import additief is en beschrijven hoe de opschoningsutility kan worden gebruikt als workaround
4. THE opschoningsutility SHALL duidelijk gemarkeerd zijn als experimenteel en afhankelijk van Brightspace's interne HTML-structuur

### Requirement 14: Migratie van ADR's naar BSS-repository

**User Story:** Als BSS-ontwikkelaar wil ik dat de relevante Architecture Decision Records (ADR's) onderdeel zijn van de BSS-repository, zodat ontwerpbeslissingen traceerbaar zijn bij het zelfstandige project.

#### Acceptance Criteria

1. THE BSS SHALL een `adr/`-map bevatten met de BSS-relevante ADR's (008, 010, 011, 014)
2. WHEN ADR's worden overgenomen vanuit een oorspronkelijke monorepo, THE BSS SHALL een kopie plaatsen in de eigen `adr/`-map zonder de originelen uit de bronrepo te verwijderen
3. WHEN BSS-documentatie (design.md, README.md of andere docs) verwijst naar ADR's, THE BSS SHALL relatieve paden gebruiken naar de lokale `adr/`-map
