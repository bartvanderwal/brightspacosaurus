# Implementation Plan

Voor Brightspacosaurus.

Gerelateerd GitLab-issue: [#1 Brightspacosaurus](https://gitlab.aimsites.nl/ontwikkeling/software-and-robotics/owe-1-fusten/owe-1/-/work_items/1)

## Overview

Brightspacosaurus is een Deno/TypeScript CLI-tool met twee subcommando's (`prepare` en `pack`) die Markdown-cursusmateriaal omzet naar een Brightspace Common Cartridge. Daarnaast wordt Docusaurus geconfigureerd voor een lokale studentensite. De implementatie volgt de architectuur uit het ontwerpdocument: SourceScanner → MarkdownConverter → ManifestBuilder → Packer, aangestuurd via een CLI-entry point.

## Tasks

- [x] 1. Projectstructuur en basisopzet
  - Maak de mappenstructuur aan: `scripts/brightspacosaurus/src/`, `scripts/brightspacosaurus/tests/`
  - Maak `scripts/brightspacosaurus/deno.json` aan met taken voor `prepare`, `pack` en `test`
  - Voeg `build/` toe aan `.gitignore`
  - Definieer de TypeScript-interfaces (`ScanOptions`, `ScanResult`, `ConvertOptions`, `ConvertResult`, `ManifestEntry`, `PackOptions`) in `scripts/brightspacosaurus/src/types.ts`
  - _Requirements: 3.1, 3.2, 3.3_

- [x] 2. SourceScanner
  - [x] 2.1 Implementeer `scanSources` in `scripts/brightspacosaurus/src/source-scanner.ts`
    - Scan `6.3.Studentenmateriaal/` recursief voor alle Markdown-bestanden (standaard, overschrijfbaar via `--sources`)
    - Scan `scripts/brightspace/` recursief voor alle QTI-bestanden (standaard, overschrijfbaar via `--quizzes`)
    - Geef gesorteerde bestandslijsten terug als `ScanResult`
    - Weiger paden buiten de repository-root (exitcode 3)
    - _Requirements: 1.1, 3.1, 3.2, 3.4, 6.1_

  - [x] 2.2 Schrijf property-test voor Eigenschap 5: Ongeldige invoerpaden geweigerd
    - Genereer paden buiten de repository-root en niet-bestaande mappen; controleer dat `scanSources` weigert, een fout gooit met het ongeldige pad, en de juiste foutcategorie aangeeft
    - `// Feature: brightspacosaurus, Eigenschap 5: Ongeldige invoerpaden geweigerd`
    - **Valideert: Requirements 1.3, 2.4, 6.1**

  - [x] 2.3 Schrijf property-test voor Eigenschap 4: Uitvoerstructuur weerspiegelt bronstructuur (optioneel)
    - Genereer willekeurige geldige bronmapstructuren; controleer dat de gesorteerde bestandslijsten de mappenstructuur correct weerspiegelen
    - `// Feature: brightspacosaurus, Eigenschap 4: Uitvoerstructuur weerspiegelt bronstructuur`
    - **Valideert: Requirements 3.5**

- [x] 3. MarkdownConverter
  - [x] 3.1 Implementeer `convertMarkdown` in `scripts/brightspacosaurus/src/markdown-converter.ts`
    - Gebruik unified (remark-parse → remark-rehype → rehype-stringify) via Deno JSR
    - Genereer zelfstandig HTML-bestand met `<html lang="nl">` en `<meta charset="utf-8">`
    - Kopieer afbeeldingen met relatieve paden naar `build/brightspace/content/img/` en pas de paden in de HTML aan
    - Sla QTI-gemarkeerde secties over bij de HTML-conversie
    - Spiegel de bronmapstructuur in de uitvoerstructuur onder `build/brightspace/content/`
    - _Requirements: 1.1, 1.2, 1.5, 3.5_

  - [x] 3.2 Schrijf property-test voor Eigenschap 1: HTML-uitvoer voldoet aan structuureisen (optioneel)
    - Genereer willekeurige geldige Markdown-bronbestanden (met en zonder afbeeldingen); controleer dat de HTML-uitvoer `<html lang="nl">` en `<meta charset="utf-8">` bevat en dat alle relatieve afbeeldingspaden zijn aangepast naar `img/`
    - `// Feature: brightspacosaurus, Eigenschap 1: HTML-uitvoer voldoet aan structuureisen`
    - **Valideert: Requirements 1.1, 1.2**

  - [x] 3.3 Schrijf property-test voor Eigenschap 8: QTI-secties uitgesloten van HTML (optioneel)
    - Genereer Markdown-bestanden met willekeurige QTI-gemarkeerde secties; controleer dat de HTML-uitvoer geen inhoud uit die secties bevat
    - `// Feature: brightspacosaurus, Eigenschap 8: QTI-secties uitgesloten van HTML`
    - **Valideert: Requirements 1.5**

- [x] 4. Controlepunt — SourceScanner en MarkdownConverter
  - Voer `deno test` uit; zorg dat alle tests tot nu toe slagen
  - Controleer handmatig dat `prepare` een correcte HTML-uitvoer genereert voor een voorbeeldbestand

- [x] 5. ManifestBuilder
  - [x] 5.1 Implementeer `buildManifest` in `scripts/brightspacosaurus/src/manifest-builder.ts`
    - Genereer een geldig `imsmanifest.xml` op basis van de gescande bestandslijsten
    - Gebruik deterministische volgorde: HTML-bestanden gesorteerd op pad, QTI-bestanden daarna
    - Ken het juiste resourcetype toe: `webcontent` voor HTML, `imsqti_xmlv1p2/imscc_xmlv1p3/assessment` voor QTI
    - _Requirements: 2.1, 2.3_

  - [x] 5.2 Schrijf property-test voor Eigenschap 3: Pakketinhoud correct en compleet
    - Genereer willekeurige geldige bestandslijsten; controleer dat het manifest een resource-entry bevat voor elk Markdown-bestand (type `webcontent`) en elk QTI-bestand (type `imsqti_xmlv1p2/imscc_xmlv1p3/assessment`)
    - `// Feature: brightspacosaurus, Eigenschap 3: Pakketinhoud correct en compleet`
    - **Valideert: Requirements 2.1, 2.3**

- [x] 6. QuizConverter (quiz-Markdown → QTI XML)
  - [x] 6.1 Implementeer `convertQuiz` in `scripts/brightspacosaurus/src/quiz-converter.ts`
    - Parseer quiz-Markdown bestanden (prefix `quiz-`) met het formaat: `## Vraag N`, 4 antwoordopties (A–D), `Correct antwoord: **X**`
    - Genereer QTI 1.2 XML dat importeerbaar is in Brightspace
    - Gebruik de bestaande QTI XML-bestanden in de repo als referentie voor de gewenste output (bijv. `Lesbeschrijvingen/week-2/quiz-2.2-di-brightspace-package/quiz/i-quiz-2-2-di/qti-quiz-2-2-di.xml`)
    - Schrijf uitvoer naar `build/brightspace/quiz/`
    - _Requirements: 2.3_
  - [x] 6.2 Schrijf tests voor QuizConverter
    - Unit-test: converteer een bekend quiz-Markdown bestand en vergelijk de output met de bestaande referentie-QTI XML
    - Property-test: voor alle geldige quiz-Markdown bestanden geldt dat de QTI-output een `<questestinterop>`-element bevat met het juiste aantal items
    - _Requirements: 2.3_

- [x] 7. Packer
  - [x] 7.1 Implementeer `pack` in `scripts/brightspacosaurus/src/packer.ts`
    - Verpak `build/brightspace/` tot een `.imscc`-archief via `jsr:@zip-js/zip-js`
    - Gebruik deterministische bestandsvolgorde (gesorteerd op pad)
    - Sla het archief op als `build/brightspace/cursus.imscc`
    - Verwijder een gedeeltelijk aangemaakt uitvoerbestand bij een archiveringsfout
    - _Requirements: 2.2, 2.4, 2.5, 6.3_

  - [x] 7.2 Schrijf property-test voor Eigenschap 2: Idempotentie van de volledige pipeline (optioneel)
    - Genereer willekeurige geldige bronmappen; voer `prepare` en `pack` twee keer uit op dezelfde invoer en controleer dat de `.imscc`-archieven byte-voor-byte identiek zijn
    - `// Feature: brightspacosaurus, Eigenschap 2: Idempotentie van de volledige pipeline`
    - **Valideert: Requirements 1.4, 2.2**

  - [x] 7.3 Schrijf property-test voor Eigenschap 7: Geen corrupt artefact bij archiveringsfout (optioneel)
    - Simuleer archiveerfouten op willekeurige momenten; controleer dat er geen gedeeltelijk `.imscc`-bestand achterblijft in de uitvoermap
    - `// Feature: brightspacosaurus, Eigenschap 7: Geen corrupt artefact bij archiveringsfout`
    - **Valideert: Requirements 6.3**

- [x] 8. CLI-entry points
  - [x] 8.1 Implementeer `scripts/brightspacosaurus/main.ts` met subcommando's `prepare` en `pack`
    - Parseer CLI-argumenten (`--sources`, `--quizzes`); toon usage en stop met exitcode 1 bij ontbrekende of ongeldige argumenten
    - Roep SourceScanner, MarkdownConverter, ManifestBuilder en Packer aan in de juiste volgorde
    - Schrijf voortgang naar `stdout` en fouten naar `stderr`
    - Gebruik de exitcodetabel: 0 (succes), 1 (gebruik), 2 (bronmap), 3 (bestandssysteem), 4 (archivering)
    - _Requirements: 6.2, 6.4, 6.5_

  - [x] 8.2 Schrijf property-test voor Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode (optioneel)
    - Genereer foutscenario's (ontbrekend argument, ontbrekende bronmap, ontbrekend bestand, archiveringsfout); controleer dat foutmeldingen naar `stderr` gaan, voortgang naar `stdout`, en de exitcode overeenkomt met de foutcategorie
    - `// Feature: brightspacosaurus, Eigenschap 6: Foutuitvoer volgt het juiste kanaal en exitcode`
    - **Valideert: Requirements 6.2, 6.5**

- [x] 9. Controlepunt — volledige pipeline
  - Voer `deno test` uit; zorg dat alle tests slagen
  - Test de volledige flow handmatig: `deno task prepare` gevolgd door `deno task pack`

- [x] 10. Docusaurus-configuratie
  - Maak `docusaurus.config.ts` aan in de repository-root (of pas bestaande configuratie aan)
  - Wijs de `docs`-map naar `6.3.Studentenmateriaal/` zodat de mappenstructuur de navigatieboom weerspiegelt
  - Voeg `build/preview` toe aan `.gitignore`
  - Voeg het npm-script `docs:dev` toe aan `package.json` in de repository-root
  - Controleer dat relatieve afbeeldingslinks correct worden getoond
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [x] 10.1 Documenteer Docusaurus-preview dummy-proof
    - Voeg README toe met doel, vereisten, installatie, startcommando, poort, stopcommando en buildcommando
    - Benoem expliciet dat Node.js met npm nodig is voor de lokale preview
    - Leg uit dat Deno nodig is voor Brightspacosaurus, maar niet voor het starten van Docusaurus
    - _Requirements: 5.7, 5.8_
  - [x] 10.2 Toon niveau-banners op Docusaurus-weekoverzichten
    - Hergebruik de bestaande niveauvisuals uit `scripts/brightspacosaurus/assets/`
    - Kopieer ze naar `scripts/docusaurus/static/img/niveau-banners/`
    - Toon op generated-index weekpagina's automatisch de juiste banner op basis van weeknummer
    - _Requirements: 5.9_

- [x] 11. Quizzosaurus: interactieve quiz-preview in Docusaurus
  - [x] 11.1 Voeg `bartvanderwal/remark-kroki-a11y` toe als tijdelijke Git submodule (`scripts/brightspacosaurus/vendor/remark-kroki-a11y`)
  - [x] 11.2 Kopieer Quiz-component naar `/SoRo/owe-1/scripts/docusaurus/src/components/Quiz/`
  - [x] 11.3 Integreer Quiz-component als MDX-pagina of remark-plugin zodat quiz-Markdown interactief wordt gerenderd
  - [x] 11.4 Voeg Markdown-compositie toe: ondersteuning voor bold, code, en diagrams-as-code (Mermaid/PlantUML) in vraagteksten en antwoordopties
  - [ ] 11.5 Refactor naar eigen npm-module (`quizzosaurus`) op basis van de QuizDown/Quizzosaurus-layering uit de SPEC
  - [ ] 11.6 Definieer het quizzosaurus JSON-tussenformaat (single-choice, multiple-choice, open vragen)
  - [ ] 11.7 Breid de QuizConverter uit met een extra output-pad: quiz-Markdown → quizzosaurus JSON (naast → QTI XML)
  - [ ] 11.8 Verwijder de tijdelijke submodule na extractie van de relevante code
  - _Prototype: https://bartvanderwal.github.io/remark-kroki-a11y/examples/uml-quiz-experimental-syntax_
  - _Component-bron: `scripts/brightspacosaurus/vendor/remark-kroki-a11y/test-docusaurus-site/src/components/Quiz/`_
- [ ] 12. GitLab CI-integratie voor Brightspacosaurus
  - Publiceer `build/brightspace/cursus.imscc` als CI-artefact
  - Gebruik de officiële `denoland/deno`-Docker-image; geen npm-installatiestap
  - Beperk schrijftoegang tot `build/` via `--allow-read=. --allow-write=build/`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 13. Eindcontrole — alle tests slagen
  - Voer `deno test` uit; zorg dat alle tests slagen
  - Vraag de gebruiker of er vragen zijn

- [x] 14. Validatie manifest tegen bestaande Brightspace-exports
  - Vergelijk het gegenereerde `imsmanifest.xml` met de bestaande werkende exports in `scripts/brightspace/week-1/imsmanifest.xml` en `6.1.Docentenhandleiding/meta/brightspace-poc/`
  - Controleer dat de XML-structuur, namespaces en resourcetypes overeenkomen met wat Brightspace accepteert
  - Documenteer afwijkingen en pas de ManifestBuilder aan waar nodig
  - _Afwijkingen gevonden en opgelost:_
    - _Toegevoegd: `xmlns:xsi`, `xsi:schemaLocation`, `xmlns:lomr` (conform referentie)_
    - _Taal aangepast van `nl` naar `nl-NL` (conform referentie)_
  - _Resterende bekende afwijkingen (niet-blokkerend):_
    - *Identifiers zijn langer dan in de referentie (pad-gebaseerd vs. kort); functioneel equivalent*
    - _Antwoorden-docent bestanden worden meegenomen als webcontent; overweeg filtering_

- [ ] 15. Handmatige Brightspace-importvalidatie
  - Genereer een `.imscc`-bestand met `deno task prepare && deno task pack`
  - Importeer het gegenereerde bestand handmatig in een Brightspace-testomgeving
  - Importeer de bestaande referentie-exports (`scripts/brightspace/week-1/` en `6.1.Docentenhandleiding/meta/brightspace-poc/`) handmatig in Brightspace
  - Controleer of deze referentiebestanden zelf correct werken als importbron
  - Vergelijk het gedrag van het gegenereerde pakket met de referentie-exports
  - Controleer dat de inhoud correct wordt weergegeven: HTML-pagina's, quizzen en navigatiestructuur
  - Documenteer welke onderdelen correct importeren, welke niet, en welke pipeline-aanpassingen nodig zijn
  - Overweeg de referentiebestanden te verplaatsen naar een duidelijker benoemde locatie (bijv. `scripts/brightspacosaurus/referentie-exports/`) zodat hun rol als specificatie expliciet is

- [ ] 16. Opruimen verouderde shell-scripts
  - Identificeer shell-scripts in `scripts/` die door Brightspacosaurus worden vervangen (o.a. `scripts/build-week-1-brightspace-imscc.sh`, `scripts/validate-week-1-brightspace-package.sh`)
  - Controleer of er nog verwijzingen naar deze scripts bestaan in `.gitlab-ci.yml` of documentatie
  - Verwijder de verouderde scripts en eventuele verwijzingen
  - Controleer of gegenereerde bestanden die nu in `build/` horen nog naast bronbestanden staan en verwijder die

- [ ] 17. HTML-styling passend bij Brightspace/HAN-huisstijl
  - Bekijk de bestaande referentie-HTML in `scripts/brightspace/week-1/` voor de gewenste styling
  - Voeg een inline `<style>`-blok toe aan de gegenereerde HTML met basisstijling (fonts, spacing, kleuren)
  - Zorg dat code-blokken, tabellen en lijsten er verzorgd uitzien binnen Brightspace
  - Itereer op basis van hoe het er in Brightspace uitziet (dev/prod parity)
  - _Brightspace voegt eigen CSS toe; de inline styles moeten daarmee samenwerken, niet conflicteren_

- [ ] 18. Navigatiestructuur verbeteren (geen dubbele items)
  - Pas het manifest aan zodat elke pagina direct als item verschijnt zonder tussenliggende lege map
  - Onderzoek of Brightspace de `<organization>`-structuur anders interpreteert (geneste items vs. platte lijst)
  - Vergelijk met de referentie-export (`scripts/brightspace/week-1/imsmanifest.xml`) die wél correct navigeert
  - Overweeg per-week groepering in het manifest (item met sub-items per week)

- [ ] 19. Documenteer Brightspace-importbeperkingen en werkwijze
  - Documenteer dat import additief is voor content-modules en quizzen (geen verwijdering), maar dat bestanden (afbeeldingen, PDF's) wél overschreven kunnen worden via de optie "Bestaande bestanden overschrijven" in de importwizard
  - Beschrijf de aanbevolen werkwijze: importeer in een schone cursus of reset eerst
  - Beschrijf de optie "Geselecteerde onderdelen importeren" voor incrementele updates
  - Overweeg per-week pakketten als alternatief voor het volledige cursuspakket
  - Voeg toe aan README (geen ADR; dit is een Brightspace-beperking, geen eigen ontwerpkeuze)

- [ ] 20. Diagrammen (Mermaid/PlantUML) renderen naar SVG
  - Implementeer een rehype- of remark-plugin die fenced code blocks met `mermaid` of `plantuml` omzet naar SVG
  - Gebruik dezelfde renderlogica voor zowel Docusaurus (lokale preview) als Brightspacosaurus (HTML-export)
  - Voorkeur: SVG-output (inline of als bestand); fallback: PNG
  - Overweeg Kroki als rendering-backend (server-side, ondersteunt beide formaten)
  - Integreer in Docusaurus via een remark-plugin (bijv. `remark-kroki` uit de bestaande submodule)
  - Integreer in Brightspacosaurus door dezelfde plugin aan te roepen tijdens de prepare-stap
  - _Dev/prod parity: dezelfde diagrammen moeten er identiek uitzien in Docusaurus en in Brightspace_

- [x] 21. Opruimen afgeleide quiz-bestanden naast bronbestanden
  - De QTI XML-bestanden, Brightspace-packages en zip-bestanden naast de quiz-Markdown bronbestanden (bijv. `quiz-2.2-di-qti.xml`, `quiz-2.2-di-brightspace-package/`, `quiz-2.2-di-brightspace-import.zip`) worden nu gegenereerd door Brightspacosaurus
  - Identificeer alle afgeleide quiz-bestanden in `6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/`
  - Bespreek met collega of je deze veilig kan verwijderen
  - Verwijder na akkoord de afgeleide bestanden; de quiz-Markdown blijft als source of truth
  - _Niet uitvoeren zonder overleg — eerst afstemmen met collega_

- [x] 22. Marp-export voor docentenslides
  - Zet de `slides-les-*.md` uit `6.2.Onderwijsmateriaal-voor-docenten/6.2.4.Instructiemateriaal/` omzet naar Marp-compatible Markdown in `build/marp-slides/`
  - Voeg Marp-frontmatter toe en behoud de bestaande relatieve mappenstructuur
  - Zet `## Slide N - ...` om naar afzonderlijke Marp-slides
  - Zet spreeknotities om naar Marp presenter notes via HTML-comments
  - Documenteer gebruik en latere PPTX-export via Marp CLI
  - _Bronbestanden blijven leidend; Marp-output is afgeleid materiaal in `build/`_

## Notes

- Kiro-specbestanden gebruiken vaste Engelse structuurkoppen (`# Implementation Plan`, `## Overview`, `## Tasks`, `## Notes`), ook wanneer de inhoud Nederlands is. Gebruik geen vertaalde varianten zoals `## Taken` of `## Notities`.
- Taken met `*` zijn optioneel en kunnen worden overgeslagen voor een snellere MVP
- Elke taak verwijst naar specifieke requirements voor traceerbaarheid
- Controlepunten zorgen voor incrementele validatie
- Property-tests valideren universele correctheidseigenschappen uit het ontwerpdocument
- Unit-tests valideren specifieke voorbeelden en randgevallen
