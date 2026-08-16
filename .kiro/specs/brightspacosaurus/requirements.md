# Requirements Document

## Inleiding

Brightspacosaurus is een exportpipeline die Markdown-cursusmateriaal uit de OWE-1-monorepo omzet naar twee distributiepaden:

1. **Brightspace Common Cartridge** (`.imscc`): gegenereerd via GitLab CI, importeerbaar in Brightspace als één pakket voor de hele cursus.
2. **Docusaurus-previewsite** (lokaal, `localhost`): dezelfde Markdown-bronbestanden worden via Docusaurus als statische website getoond als preview.

Het systeem vervangt het handmatige POC-script `build-week-1-brightspace-imscc.sh` door een herhaalbare, configuratieloze CLI-tool (`brightspacosaurus`) en een bijbehorende CI/CD-job.

## Ontwerpprincipes

1. **Convention over Configuration** (CoC): de tool scant automatisch de bekende bronmappen en verwerkt alle Markdown-bestanden en quizzen die daarin worden aangetroffen. Voor de standaardworkflow is geen configuratiebestand nodig.

2. **Single Source of Truth** (SSOT): de Markdown-bronbestanden vormen de enige canonieke bron van cursusinhoud. Alle afgeleide artefacten (zoals HTML, QTI XML en `.imscc`-pakketten) worden deterministisch gegenereerd tijdens de build en niet geversioneerd. Gegenereerde output wordt uitsluitend geplaatst in `build/`, nooit naast de bronbestanden.

   - Eventueel reeds bestaande gegenereerde bestanden die momenteel nog naast hun bronbestanden in de repository staan (zoals handmatig gegenereerde QTI-bestanden), worden tijdelijk behouden als referentievoorbeeld of specificatie van de gewenste uitvoer. Deze worden verwijderd zodra Brightspacosaurus de betreffende artefacten betrouwbaar en reproduceerbaar genereert.

3. **Fast Feedback Loop** (FFL): auteurs moeten wijzigingen in cursusmateriaal snel lokaal kunnen valideren zonder afhankelijk te zijn van Brightspace-imports of CI/CD-runs. Daarom ondersteunt Brightspacosaurus een snelle lokale previewworkflow via Docusaurus, zodat inhoud, structuur, links, quizzen en rendering direct gecontroleerd kunnen worden tijdens ontwikkeling.

4. **Dev/Prod Parity** (DPP): de lokale previewomgeving (Docusaurus) en de productie-export (Brightspace Common Cartridge) moeten inhoudelijk en semantisch zo veel mogelijk overeenkomen. Verschillen tussen beide platformen — zoals de JavaScript-gebaseerde React/MDX-runtime van Docusaurus versus de statische en JavaScript-beperkte omgeving van Brightspace — worden expliciet gemodelleerd in de exportpipeline in plaats van verborgen in handmatige uitzonderingen of platformspecifieke contentvarianten.

   - Functionaliteit die afhankelijk is van client-side JavaScript of React-componenten mag nooit een vereiste zijn voor correcte weergave of begrip van cursusinhoud in Brightspace.
   - De Brightspace-export vormt de leidende compatibiliteitsdoelomgeving; de Docusaurus-preview dient primair als ontwikkel- en validatieomgeving.

## Woordenlijst

- **Brightspacosaurus**: de CLI-tool en pipeline die dit systeem implementeert.
- **Bronbestand**: een Markdown-bestand (`.md`) in de repository dat lesmateriaal bevat.
- **Bronmap**: een bekende map die Brightspacosaurus automatisch scant, standaard `6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/`.
- **Quiz-Markdown**: een Markdown-bestand met het prefix `quiz-` in een `week-x/`-map dat quizvragen bevat en wordt omgezet naar QTI XML.
- **QTI XML**: het tussenformaat voor quizzen dat wordt opgenomen in het IMSCC-pakket. Wordt gegenereerd in `build/brightspace/quiz/`.
- **Common Cartridge**: het IMS Common Cartridge 1.3-formaat voor uitwisseling van leermateriaal.
- **IMSCC-pakket**: een `.imscc`-bestand (zip-archief) dat voldoet aan de Common Cartridge-specificatie.
- **imsmanifest.xml**: het verplichte manifestbestand in een IMSCC-pakket dat de inhoudsstructuur beschrijft.
- **Prepare-stap**: de stap die bronbestanden omzet naar Brightspace-geschikte HTML in `build/brightspace/`.
- **Pack-stap**: de stap die voorbereide bestanden verpakt tot een `.imscc`-archief in `build/brightspace/`.
- **Docusaurus**: een statische sitegenerator (Node.js) die Markdown-bestanden omzet naar een website.
- **CI-job**: een taak in de GitLab CI-pipeline die automatisch wordt uitgevoerd bij een push.
- **Artefact**: een door CI gegenereerd bestand dat beschikbaar wordt gesteld als downloadbaar resultaat.
- **Onderwijsontwikkelaar**: de actor die de tool uitvoert en het resultaat in Brightspace importeert.

## Requirements

### Requirement 1: Markdown naar HTML omzetten (prepare)

**User Story:** Als onderwijsontwikkelaar wil ik dat Brightspacosaurus alle Markdown-bronbestanden in de bekende bronmappen automatisch omzet naar Brightspace-geschikte HTML in `build/`, zodat ik geen handmatige conversie hoef uit te voeren en de Git-repo de source of truth blijft tijdens het geven en doorontwikkelen van onderwijs.

#### 1. Acceptatiecriteria

1.1. WHEN de onderwijsontwikkelaar `brightspacosaurus prepare` uitvoert, SHALL Brightspacosaurus alle Markdown-bestanden in de bronmap recursief scannen en elk omzetten naar een zelfstandig HTML-bestand in `build/brightspace/content/` met correcte UTF-8-codering en een `lang="nl"` attribuut.
1.2. WHEN een Markdown-bronbestand afbeeldingen met relatieve paden bevat, SHALL Brightspacosaurus de afbeeldingen kopiëren naar `build/brightspace/content/img/` en de paden in de HTML aanpassen.
1.3. IF de bronmap niet bestaat of leeg is, THEN SHALL Brightspacosaurus stoppen met een foutmelding die het ontbrekende pad vermeldt en een exitcode ongelijk aan nul teruggeven.
1.4. SHALL Brightspacosaurus de prepare-stap idempotent uitvoeren: herhaalde uitvoering op dezelfde invoer produceert byte-voor-byte identieke uitvoer.
1.5. WHEN een Markdown-bestand een quiz-sectie bevat die als QTI-bron is gemarkeerd, SHALL Brightspacosaurus die sectie overslaan bij de HTML-conversie.
1.6. SHALL Brightspacosaurus quiz-Markdown bestanden (prefix `quiz-`) niet opnemen als webcontent-pagina's in het IMSCC-pakket; deze worden uitsluitend als QTI-assessment opgenomen.
1.7. WHEN een Markdown-bronbestand een fenced code block bevat met taal `mermaid` of `plantuml`, SHALL Brightspacosaurus dat blok omzetten naar een SVG-afbeelding (bij voorkeur inline) in de HTML-uitvoer.
1.8. SHALL Brightspacosaurus de gegenereerde HTML voorzien van basisstijling (inline CSS) die past binnen de Brightspace-weergave, zodat headings, lijsten, tabellen en code-blokken leesbaar zijn zonder aanvullende configuratie in Brightspace.

### Requirement 2: IMSCC-pakket samenstellen (pack)

**User Story:** Als onderwijsontwikkelaar wil ik dat Brightspacosaurus voorbereide HTML-bestanden en quizzen verpakt tot één importeerbaar `.imscc`-bestand voor de hele cursus in `build/`, zodat ik het direct in Brightspace kan importeren.

#### 2. Acceptatiecriteria

2.1. WHEN de onderwijsontwikkelaar `brightspacosaurus pack` uitvoert op een geldige `build/brightspace/`-map, SHALL Brightspacosaurus een `.imscc`-bestand aanmaken dat een geldig `imsmanifest.xml` bevat.
2.2. SHALL Brightspacosaurus bestanden in het archief in deterministische volgorde opnemen, zodat herhaalde uitvoering een byte-voor-byte identiek archief oplevert.
2.3. WHEN de quizmap QTI-bestanden bevat, SHALL Brightspacosaurus die opnemen in het IMSCC-pakket met het juiste resourcetype (`imsqti_xmlv1p2/imscc_xmlv1p3/assessment`).
2.4. IF de `build/brightspace/`-map ontbreekt of leeg is, THEN SHALL Brightspacosaurus stoppen met een foutmelding en een exitcode ongelijk aan nul teruggeven.
2.5. SHALL Brightspacosaurus het gegenereerde `.imscc`-bestand opslaan in `build/brightspace/`.

### Requirement 3: Bronmappen en uitvoerlocaties

**User Story:** Als onderwijsontwikkelaar wil ik dat Brightspacosaurus werkt zonder configuratiebestand door gebruik te maken van vaste conventies voor bronmappen en uitvoerlocaties, zodat ik de tool direct kan gebruiken zonder setup.

#### 3. Acceptatiecriteria

3.1. SHALL Brightspacosaurus standaard `6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/` gebruiken als bronmap voor Markdown-bestanden en quiz-Markdown.
3.2. SHALL Brightspacosaurus quiz-Markdown bestanden herkennen aan het bestandsnaamprefix `quiz-` in de `week-x/`-mappen.
3.3. SHALL Brightspacosaurus alle uitvoer plaatsen in `build/brightspace/`, nooit naast de bronbestanden.
3.4. WHEN de onderwijsontwikkelaar een alternatieve bronmap opgeeft via een CLI-vlag, SHALL Brightspacosaurus die map gebruiken in plaats van de standaard.
3.5. SHALL Brightspacosaurus de mappenstructuur van de bronmap weerspiegelen in de uitvoerstructuur onder `build/brightspace/content/`.

### Requirement 4: GitLab CI-integratie

**User Story:** Als onderwijsontwikkelaar wil ik dat de CI-pipeline het IMSCC-pakket automatisch genereert bij elke push naar de repository, zodat er altijd een actueel pakket beschikbaar is zonder handmatige actie.

#### 4. Acceptatiecriteria

4.1. WHEN de onderwijsontwikkelaar naar de hoofdbranch pusht, SHALL de CI-pipeline de brightspacosaurus build-job uitvoeren en het gegenereerde `.imscc`-bestand als CI-artefact beschikbaar stellen.
4.2. SHALL de CI-pipeline de build-job alleen uitvoeren WHEN relevante bronbestanden zijn gewijzigd.
4.3. IF de build-job mislukt, THEN SHALL de CI-pipeline de pipeline als mislukt markeren en geen artefact publiceren.
4.4. SHALL de CI-pipeline Brightspacosaurus uitvoeren vanuit de repository zonder externe registries te vereisen tijdens de CI-run.
4.5. WHILE de CI-job actief is, SHALL de CI-pipeline geen schrijftoegang hebben tot bestanden buiten de `build/`-map.

### Requirement 5: Docusaurus-studentensite (lokaal)

**User Story:** Als student wil ik het lesmateriaal lokaal via een browser kunnen bekijken, zodat ik de inhoud overzichtelijk kan raadplegen zonder Brightspace.

#### 5. Acceptatiecriteria

5.1. WHEN de onderwijsontwikkelaar `npm run docs:dev` uitvoert in de repository-root, SHALL de Docusaurus-site starten op `localhost` en de Markdown-bronbestanden uit `6.3.Studentenmateriaal/` tonen als navigeerbare webpagina's.
5.2. SHALL de Docusaurus-site de bestaande mappenstructuur van het studentenmateriaal weerspiegelen in de navigatieboom.
5.3. WHEN de onderwijsontwikkelaar een Markdown-bestand wijzigt terwijl de ontwikkelserver actief is, SHALL de Docusaurus-site de pagina automatisch herladen.
5.4. IF een Markdown-bestand een relatieve afbeeldingslink bevat, THEN SHALL de Docusaurus-site de afbeelding correct tonen zonder handmatige aanpassing van het pad.
5.5. SHALL de Docusaurus-site geen gegenereerde bestanden committen: de `build/preview/`-map staat in `.gitignore`.
5.6. WHEN een Markdown-bestand een fenced code block bevat met taal `mermaid` of `plantuml`, SHALL de Docusaurus-site dat blok renderen als diagram (SVG), met dezelfde renderlogica als de Brightspace-export (dev/prod parity).
5.7. SHALL de Docusaurus README dummy-proof zijn: doel, vereisten, installatie, startcommando's, poort, stopcommando en buildcommando zijn expliciet beschreven.
5.8. SHALL de Docusaurus README expliciet benoemen dat Node.js met npm nodig is voor de lokale preview.
5.9. SHALL elke week-overzichtspagina automatisch de niveau-banner tonen die hoort bij de weekmap.

### Requirement 6: Validatie en foutafhandeling

**User Story:** Als onderwijsontwikkelaar wil ik dat de tool duidelijke foutmeldingen geeft bij ongeldige invoer of ontbrekende bestanden, zodat ik snel de oorzaak van een fout kan vinden.

#### 6. Acceptatiecriteria

6.1. WHEN de onderwijsontwikkelaar een invoerpad opgeeft dat buiten de repository-root valt, SHALL Brightspacosaurus de bewerking weigeren met een foutmelding die het ongeldige pad vermeldt.
6.2. SHALL Brightspacosaurus alle foutmeldingen naar `stderr` schrijven en alle voortgangsmeldingen naar `stdout`.
6.3. IF een archiveringsstap mislukt, THEN SHALL Brightspacosaurus een gedeeltelijk aangemaakt uitvoerbestand verwijderen zodat er geen corrupt artefact achterblijft.
6.4. WHEN de onderwijsontwikkelaar de tool aanroept zonder verplichte argumenten, SHALL Brightspacosaurus een gebruiksaanwijzing tonen en stoppen met exitcode 1.
6.5. SHALL Brightspacosaurus bij elke fout een exitcode ongelijk aan nul teruggeven die overeenkomt met de foutcategorie.
