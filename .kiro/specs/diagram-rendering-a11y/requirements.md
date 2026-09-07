# Requirements Document

## Introduction

Deze feature voegt **diagramrendering** en **toegankelijkheid (a11y)** toe aan de HTML/Brightspace-route van Brightspacosaurus (BSO). Zie GitHub-issue [#14](https://github.com/bartvanderwal/brightspacosaurus/issues/14).

Op dit moment worden PlantUML- en Mermaid-codeblokken (` ```plantuml `, ` ```mermaid `) in lespagina's NIET omgezet naar diagrammen in de HTML-output voor Brightspace: ze blijven staan als ruwe codeblokken. Deze feature zorgt dat deze codeblokken tijdens de build (`bso prepare`) worden gerenderd tot een afbeelding (inline SVG of `<img>`) in de HTML, en dat elk gerenderd diagram toegankelijk is voor gebruikers van een schermlezer.

De toegankelijkheidscomplexiteit zit in de pariteit tussen twee omgevingen. In de Docusaurus-preview kan de plugin `remark-kroki-a11y` (door @bartvanderwal) tabs tonen (diagram / broncode / natuurlijketaal-beschrijving) met behulp van React/JavaScript. Brightspace serveert HTML-topics echter in een iframe waarin JavaScript is beperkt. De Brightspace-output moet daarom dezelfde toegankelijke inhoud bieden **zonder client-side JavaScript**, via native HTML `<details>`/`<summary>`-disclosure-widgets en ARIA-attributen. Alle rendering en toegankelijke inhoud wordt tijdens de build gegenereerd.

**Single source of truth:** De plugin `remark-kroki-a11y` is de enige bron voor (a) de diagramrendering, (b) de broncode-disclosure, (c) de natuurlijketaal-beschrijving én (d) de toegankelijke titel-/labelteksten (via de parametriseerbare opties `summaryText` en `a11ySummaryText` met `{type}`/`{title}`-placeholders). BSO **hergebruikt** deze functionaliteit en dupliceert of herimplementeert die logica NIET. Waar Brightspace afwijkt (no-JS), past BSO een dunne adaptatielaag toe op de plugin-output (bijv. de JS-tab-bekabeling weglaten zodat het degradeert naar de native `<details>`), zonder de beschrijvings- of labellogica opnieuw te bouwen.

**Scope-afbakening:** Deze spec betreft uitsluitend de **HTML-output-route** (lespagina-Markdown → HTML voor Brightspace). De **PDF/reader-route** (via pandoc) valt EXPLICIET BUITEN scope voor deze spec; die route heeft al een gedeeltelijke `diagram-filter.lua`.

## Glossary

- **BSO**: Brightspacosaurus — de build-tool die Markdown cursusmateriaal omzet naar een `.imscc`-pakket voor Brightspace
- **Kroki**: Een renderservice (extern via https://kroki.io of zelf-gehost via Docker) die diagram-tekst zoals PlantUML, Mermaid, C4 en GraphViz omzet naar SVG. Rendering vindt server-side / build-time plaats, zonder client-side JavaScript
- **remark-kroki-a11y**: Een npm-plugin (door @bartvanderwal) voor de unified/remark-pipeline die diagrammen via Kroki rendert, een natuurlijketaal-beschrijving genereert, de broncode in een `<details>`-disclosure toont, en de toegankelijke titel-/labelteksten samenstelt via parametriseerbare opties. Gebruikt intern nu `show-docs/remark-kroki` als rendering-backend (ESM-first), in plaats van het gearchiveerde `remark-kroki-plugin`. In Docusaurus wordt dit als tabs (JS) weergegeven; zonder JS degradeert het naar native `<details>`. Deze plugin is binnen deze feature de enige bron (single source of truth) voor rendering, beschrijving en toegankelijke labels; BSO hergebruikt de plugin en dupliceert die logica niet
- **show-docs/remark-kroki**: De actief onderhouden, ESM-first remark-plugin die `remark-kroki-a11y` nu intern als rendering-backend gebruikt. Ondersteunt een `output`-optie (`inline-svg` | `img-base64` | `img-html-base64` | `object-base64`) en opties zoals `server`, `target`, `headers` en `alias`
- **img-html-base64**: De standaard outputmodus van `show-docs/remark-kroki`: een plain `<img>`-element met `alt`, `className`, `data-type` en een base64 data-URL als `src`. Stabiel in Docusaurus (MDX3/rehype-raw) en de standaardkeuze voor BSO; `inline-svg` blijft een configureerbaar alternatief voor wie SVG-interne titel/ARIA wil
- **yuzutech/kroki-mermaid**: Een aanvullende companion-container die vereist is om Mermaid-diagrammen te renderen op een zelf-gehoste (lokale Docker) Kroki-instantie. Met de publieke instantie `https://kroki.io` werkt Mermaid zonder deze companion
- **summaryText / a11ySummaryText**: Parametriseerbare template-opties van `remark-kroki-a11y` (met de placeholders `{type}` en `{title}`) waarmee de toegankelijke summary-/labelteksten worden gegenereerd; BSO gebruikt deze opties als standaardmechanisme voor toegankelijke namen/labels in plaats van eigen labelteksten samen te stellen
- **SVG**: Scalable Vector Graphics — vectorafbeeldingsformaat dat Kroki produceert en dat inline of via `<img>` in HTML kan worden opgenomen
- **ARIA**: Accessible Rich Internet Applications — set HTML-attributen (bijv. `aria-labelledby`, `aria-describedby`, `role`) die schermlezers gebruiken om inhoud toegankelijk te maken
- **a11y**: Afkorting voor "accessibility" (toegankelijkheid) — de mate waarin inhoud bruikbaar is voor mensen met een beperking, in het bijzonder blinde en slechtziende gebruikers via een schermlezer
- **Natuurlijketaal-beschrijving**: Een tekstuele uitleg in gewone taal van wat een diagram voorstelt (bijv. het "voorlezen" van een UML-diagram), gegenereerd door `remark-kroki-a11y`
- **Dev/Prod parity**: Het principe dat de Docusaurus-preview (dev) en de Brightspace-HTML (prod) dezelfde diagramrendering en dezelfde toegankelijke inhoud (broncode + natuurlijketaal-beschrijving) tonen, ook al verschilt de presentatievorm (JS-tabs versus no-JS `<details>`)
- **Disclosure-widget / details-summary**: Een native HTML-inklapbaar element (`<details>` met `<summary>`) dat zonder JavaScript in- en uitklapbaar is; de basis voor de no-JS toegankelijke inhoud in Brightspace
- **Diagram_Renderer**: Het BSO-component dat PlantUML/Mermaid-codeblokken tijdens de build omzet naar SVG en toegankelijke HTML
- **Markdown_Converter**: Het bestaande BSO-component dat les-Markdown omzet naar HTML (unified/remark/rehype)
- **Config_File**: Het configuratiebestand (`brightspacosaurus.config.json`) dat per project instellingen definieert
- **Kroki_Endpoint**: De URL van de Kroki-renderservice (extern of zelf-gehost) die BSO gebruikt om diagrammen te renderen

## Requirements

### Requirement 1: Diagramrendering van PlantUML- en Mermaid-codeblokken

**User Story:** Als cursusontwikkelaar wil ik dat PlantUML- en Mermaid-codeblokken in mijn lespagina's tijdens de build worden gerenderd tot afbeeldingen, zodat studenten in Brightspace de diagrammen zien in plaats van ruwe code.

#### Acceptance Criteria

1. WHEN een lespagina een codeblok bevat met de taalaanduiding `plantuml`, THE Diagram_Renderer SHALL dat codeblok tijdens `bso prepare` omzetten naar een SVG-diagram in de HTML-output
2. WHEN een lespagina een codeblok bevat met de taalaanduiding `mermaid`, THE Diagram_Renderer SHALL dat codeblok tijdens `bso prepare` omzetten naar een SVG-diagram in de HTML-output
3. THE Diagram_Renderer SHALL diagrammen renderen tijdens de build (server-side), zodat de HTML-output geen (runtime) client-side JavaScript nodig heeft om diagrammen te tonen
4. WHEN een codeblok een andere taalaanduiding heeft dan een ondersteund diagramtype, THE Markdown_Converter SHALL dat codeblok ongewijzigd als codeblok in de HTML-output opnemen
5. THE Diagram_Renderer SHALL het gerenderde SVG opnemen in de HTML-output zodanig dat de afbeelding zichtbaar is binnen het JavaScript-beperkte Brightspace-iframe
6. WHEN dezelfde lespagina met dezelfde broninhoud opnieuw wordt verwerkt, THE Diagram_Renderer SHALL identieke HTML-output produceren (idempotente, deterministische rendering)

### Requirement 2: Configureerbaar Kroki-endpoint

**User Story:** Als cursusontwikkelaar wil ik het Kroki-endpoint kunnen configureren, zodat ik kan kiezen tussen de externe publieke Kroki-service en een zelf-gehoste instantie.

#### Acceptance Criteria

1. THE Config_File SHALL een optioneel `diagrams`-object ondersteunen met een `krokiUrl`-veld dat door de Diagram_Renderer wordt gemapt naar de `server`-optie van `show-docs/remark-kroki` waarmee het Kroki_Endpoint wordt ingesteld
2. WHEN het `diagrams.krokiUrl`-veld ontbreekt in het Config_File, THE Diagram_Renderer SHALL een gedocumenteerde standaardwaarde gebruiken (de publieke instantie `https://kroki.io`)
3. WHEN het `diagrams.krokiUrl`-veld een geldige URL bevat, THE Diagram_Renderer SHALL die URL gebruiken als Kroki_Endpoint voor alle diagramrendering
4. THE Config_File SHALL een optioneel `diagrams.output`-veld ondersteunen met een van de waarden `img-html-base64` (standaard), `inline-svg`, `img-base64` of `object-base64`, dat door de Diagram_Renderer wordt gemapt naar de `output`-optie van `show-docs/remark-kroki`
5. WHEN het `diagrams.output`-veld ontbreekt in het Config_File, THE Diagram_Renderer SHALL de outputmodus `img-html-base64` gebruiken (een `<img>` met een base64 data-URL als `src`)
6. IF het Kroki_Endpoint onbereikbaar is tijdens de build, THEN THE Diagram_Renderer SHALL dit als een transiente conditie behandelen en een duidelijke foutmelding naar `stderr` schrijven die het bronbestand en het betreffende diagram vermeldt (te onderscheiden van auteurfouten in de diagrambron of -parameters; zie Requirement 12)
7. WHERE de configuratie `diagrams.failOnError` op `false` staat, THE Diagram_Renderer SHALL bij een onbereikbaar Kroki_Endpoint het oorspronkelijke codeblok als fallback in de HTML behouden en de build voortzetten
8. THE BSO documentatie SHALL beschrijven hoe een zelf-gehoste Kroki-instantie (via Docker) kan worden geconfigureerd en waarom dit CI-vriendelijk is
9. WHERE een zelf-gehoste Kroki-instantie (lokale Docker) wordt gebruikt voor Mermaid-diagrammen, THE BSO documentatie SHALL vermelden dat een aanvullende companion-container `yuzutech/kroki-mermaid` vereist is; met de publieke instantie `https://kroki.io` werkt Mermaid zonder die companion

### Requirement 3: Toegankelijke naam en beschrijving via de omringende HTML-wrapper

**User Story:** Als slechtziende student wil ik dat elk diagram een toegankelijke naam en beschrijving heeft, zodat mijn schermlezer het diagram kan aankondigen en duiden.

#### Acceptance Criteria

1. WHEN een diagram wordt gerenderd in de standaard outputmodus (`img-html-base64`), THE Diagram_Renderer SHALL het diagram opnemen als een base64 `<img>`-element met een niet-lege `alt`-attribuutwaarde als toegankelijke naam, waarbij de alt-/labelTEKST afkomstig is uit de parametriseerbare opties van `remark-kroki-a11y` (`summaryText`/`a11ySummaryText` met `{type}`/`{title}`) en niet door BSO zelf wordt samengesteld
2. WHEN een natuurlijketaal-beschrijving beschikbaar is voor een diagram in de standaard outputmodus, THE Diagram_Renderer SHALL het base64 `<img>`-element voorzien van een `aria-describedby`-verwijzing naar het element dat de beschrijving bevat
3. WHERE de geconfigureerde outputmodus `inline-svg` is, THE Diagram_Renderer SHALL de toegankelijke naam in plaats daarvan binnen het SVG-element plaatsen via een `<title>`-element met een `aria-labelledby`-verwijzing en een `role="img"`, en de beschrijving koppelen via een `aria-describedby`-verwijzing
4. THE Diagram_Renderer SHALL de toegankelijke naam en beschrijving tijdens de build genereren, zonder afhankelijkheid van client-side JavaScript

### Requirement 4: Toegankelijke broncode en beschrijving via no-JS disclosure-widgets

**User Story:** Als student die een schermlezer gebruikt wil ik de broncode en de natuurlijketaal-beschrijving van een diagram kunnen opvragen in Brightspace, zodat ik het diagram begrijp zonder dat er JavaScript nodig is.

#### Acceptance Criteria

1. WHEN een diagram wordt gerenderd voor de Brightspace-HTML, THE Diagram_Renderer SHALL de originele diagram-broncode opnemen in de HTML-output binnen een native `<details>`/`<summary>`-disclosure-widget
2. WHEN een natuurlijketaal-beschrijving beschikbaar is, THE Diagram_Renderer SHALL die beschrijving opnemen in de HTML-output binnen een native `<details>`/`<summary>`-disclosure-widget
3. THE Diagram_Renderer SHALL de disclosure-widgets zodanig genereren dat deze in- en uitklapbaar zijn zonder client-side JavaScript
4. THE Diagram_Renderer SHALL elke `<summary>` voorzien van een beschrijvend label (bijv. "Broncode" en "Beschrijving") zodat de inhoud voor schermlezers herkenbaar is
5. WHEN de Brightspace-HTML-output wordt gegenereerd, THE Diagram_Renderer SHALL rond elk diagram een toegankelijke wrapper plaatsen die het gerenderde diagram (een base64 `<img>` in de standaardmodus, of een inline SVG wanneer `inline-svg` is geconfigureerd), een broncode-`<details>`/`<summary>` en een beschrijving-`<details>`/`<summary>` bevat

### Requirement 5: Natuurlijketaal-beschrijving via remark-kroki-a11y

**User Story:** Als cursusontwikkelaar wil ik dat de natuurlijketaal-beschrijving van een diagram automatisch wordt gegenereerd, zodat ik deze niet handmatig hoef te schrijven.

#### Acceptance Criteria

1. THE Diagram_Renderer SHALL de natuurlijketaal-beschrijving van een diagram tijdens de build verkrijgen via de bestaande logica en output van `remark-kroki-a11y`, zonder die logica in BSO te herimplementeren
2. WHEN een natuurlijketaal-beschrijving is verkregen, THE Diagram_Renderer SHALL die beschrijving in de HTML-output inbedden als tekstuele inhoud (niet als afbeelding)
3. IF voor een diagram geen natuurlijketaal-beschrijving kan worden gegenereerd, THEN THE Diagram_Renderer SHALL het diagram alsnog renderen met minimaal de toegankelijke naam en de broncode-disclosure, en een waarschuwing naar `stderr` schrijven
4. THE Diagram_Renderer SHALL de natuurlijketaal-beschrijving genereren tijdens de build, zonder afhankelijkheid van client-side JavaScript in de Brightspace-output
5. THE Diagram_Renderer SHALL de toegankelijke titel-/labeltekst behorend bij de beschrijving verkrijgen uit de parametriseerbare opties van `remark-kroki-a11y` (`summaryText`/`a11ySummaryText` met de placeholders `{type}` en `{title}`), niet uit door BSO zelf samengestelde labellogica

### Requirement 6: Dev/Prod-pariteit van toegankelijke inhoud

**User Story:** Als cursusontwikkelaar wil ik dat de Docusaurus-preview en de Brightspace-HTML dezelfde diagrammen en dezelfde toegankelijke inhoud tonen, zodat wat ik in de preview zie overeenkomt met wat de student in Brightspace krijgt.

#### Acceptance Criteria

1. THE BSO SHALL in zowel de Docusaurus-preview als de Brightspace-HTML hetzelfde gerenderde diagram tonen voor dezelfde broninhoud
2. THE BSO SHALL in zowel de Docusaurus-preview als de Brightspace-HTML dezelfde diagram-broncode beschikbaar maken
3. THE BSO SHALL in zowel de Docusaurus-preview als de Brightspace-HTML dezelfde natuurlijketaal-beschrijving beschikbaar maken
4. WHERE de presentatievorm verschilt (JavaScript-tabs in Docusaurus versus no-JS `<details>` in Brightspace), THE BSO SHALL de onderliggende toegankelijke inhoud (broncode + natuurlijketaal-beschrijving) identiek houden tussen beide omgevingen

### Requirement 7: remark-kroki-a11y geconfigureerd in de Docusaurus-preview

**User Story:** Als cursusontwikkelaar wil ik dat de Docusaurus-preview de plugin `remark-kroki-a11y` gebruikt en getest is, zodat ik diagrammen met toegankelijke inhoud kan bekijken vóór de Brightspace-export.

#### Acceptance Criteria

1. THE Docusaurus-preview SHALL de plugin `remark-kroki-a11y` geconfigureerd hebben in de remark-pipeline
2. WHEN een lespagina met een PlantUML- of Mermaid-codeblok in de Docusaurus-preview wordt geopend, THE Docusaurus-preview SHALL het gerenderde diagram, de broncode en de natuurlijketaal-beschrijving tonen
3. THE feature SHALL een geautomatiseerde test bevatten die verifieert dat `remark-kroki-a11y` in de Docusaurus-preview de verwachte toegankelijke inhoud produceert voor een testfixture

### Requirement 8: Toegankelijkheidsintentie en verificatie

**User Story:** Als cursusontwikkelaar wil ik weten dat de diagramrendering tot doel heeft schermlezer-toegankelijkheid te bieden, zodat ik realistische verwachtingen heb over de mate van WCAG-conformiteit.

#### Acceptance Criteria

1. THE BSO documentatie SHALL vermelden dat het doel van de a11y-functionaliteit schermlezer-toegankelijkheid is voor blinde en slechtziende gebruikers
2. THE BSO documentatie SHALL vermelden dat volledige WCAG-conformiteit handmatige verificatie met hulptechnologie en toegankelijkheidsexpertise vereist en niet uitsluitend door geautomatiseerde tests wordt gegarandeerd
3. THE Diagram_Renderer SHALL toegankelijke HTML produceren die de ARIA-relaties tussen het diagram, de naam en de beschrijving correct legt (in de standaardmodus: naam via de `alt` van het base64 `<img>` en beschrijving via `aria-describedby`; in de `inline-svg`-modus: naam via `aria-labelledby` naar de SVG-`<title>` en beschrijving via `aria-describedby`)

### Requirement 9: Testfixtures en verificatie van de HTML-output

**User Story:** Als BSO-ontwikkelaar wil ik geautomatiseerde tests met diagram-fixtures, zodat regressies in de diagramrendering en de a11y-wrapper worden opgemerkt.

#### Acceptance Criteria

1. THE feature SHALL een testfixture bevatten met een lespagina die een PlantUML-codeblok bevat
2. THE feature SHALL een testfixture bevatten met een lespagina die een Mermaid-codeblok bevat
3. WHEN een fixture wordt verwerkt, THE test SHALL verifiëren dat de HTML-output een SVG-element (of `<img>`-element) voor het diagram bevat
4. WHEN een fixture wordt verwerkt, THE test SHALL verifiëren dat de HTML-output de a11y-wrapper bevat: een toegankelijke naam (in de standaardmodus de `alt` van het base64 `<img>`, of in de `inline-svg`-modus een SVG-`<title>`), een broncode-disclosure en een natuurlijketaal-beschrijving-disclosure
5. WHEN een fixture wordt verwerkt, THE test SHALL verifiëren dat de Brightspace-HTML-output geen `<script>`-elementen bevat die nodig zijn om het diagram of de disclosure-widgets te laten werken
6. WHEN dezelfde fixture tweemaal wordt verwerkt, THE test SHALL verifiëren dat de HTML-output identiek is (deterministische output)

### Requirement 10: Scope-afbakening tot de HTML/Brightspace-route

**User Story:** Als BSO-ontwikkelaar wil ik een duidelijke scope-afbakening, zodat deze feature gefocust blijft op de HTML/Brightspace-route en de bestaande PDF-route niet raakt.

#### Acceptance Criteria

1. THE feature SHALL de diagramrendering en a11y-functionaliteit uitsluitend toevoegen aan de HTML/Brightspace-route (les-Markdown → HTML)
2. THE feature SHALL de bestaande PDF/reader-route (via pandoc en `diagram-filter.lua`) ongewijzigd laten
3. THE BSO documentatie SHALL vermelden dat de PDF/reader-route buiten de scope van deze feature valt

### Requirement 11: Hergebruik van remark-kroki-a11y zonder duplicatie

**User Story:** Als BSO-ontwikkelaar wil ik dat de diagram- en toegankelijkheidsfunctionaliteit `remark-kroki-a11y` hergebruikt in plaats van dupliceert, zodat er één bron van waarheid is en onderhoud eenvoudig blijft.

#### Acceptance Criteria

1. THE Diagram_Renderer SHALL de diagramrendering, de broncode-disclosure, de natuurlijketaal-beschrijving ÉN de toegankelijke titel-/labeltekst verkrijgen door HERGEBRUIK van de bestaande functionaliteit van `remark-kroki-a11y` (de opties en output daarvan), en NIET door die logica in BSO te herimplementeren of te dupliceren
2. THE Diagram_Renderer SHALL de parametriseerbare label-/titelopties van de plugin (`summaryText` en `a11ySummaryText` met de placeholders `{type}` en `{title}`) gebruiken als standaardmechanisme voor het genereren van de toegankelijke namen/labels, in plaats van dat BSO eigen labelteksten samenstelt
3. WHERE de plugin al de native `<details>`-broncode- en beschrijving-output produceert, THE Diagram_Renderer SHALL die output gebruiken voor de Brightspace-HTML (no-JS) in plaats van een parallelle eigen implementatie te genereren
4. WHERE een BSO-specifieke transformatie nodig is voor Brightspace (bijv. het weglaten of vermijden van de JS-tab-bekabeling zodat het degradeert naar de native `<details>`), THE Diagram_Renderer SHALL die transformatie uitvoeren als een dunne adaptatielaag bovenop de plugin-output, en NIET als herimplementatie van de beschrijvings- of labellogica van de plugin

### Requirement 12: Foutafhandeling en validatie van diagrammen

**User Story:** Als cursusontwikkelaar wil ik een echte, zichtbare foutmelding wanneer een diagram ongeldige bron of een ongeldige parameter bevat, zodat ik de fout kan herstellen in plaats van dat het diagram stilzwijgend wordt overgeslagen.

#### Acceptance Criteria

1. WHEN een diagram-codeblok ongeldige PlantUML/Mermaid-bron bevat die de renderservice (Kroki) afwijst, THE Diagram_Renderer SHALL een duidelijke, actiegerichte fout rapporteren die het bronbestand, het betreffende diagram (bijv. regel/positie of titel) en de onderliggende reden identificeert, en het diagram NIET stilzwijgend overslaan
2. WHEN een diagram-codeblok een niet-ondersteunde of ongeldige parameter/vlag/optie gebruikt (bijv. een onbekende fence-meta-optie, een ongeldige `src=`, of een optie die `remark-kroki-a11y` afwijst), THE Diagram_Renderer SHALL een duidelijke, actiegerichte fout rapporteren die het bronbestand en de betreffende parameter identificeert, consistent met het throw-on-invalid-gedrag van de plugin zelf
3. WHERE `diagrams.failOnError` `true` is (de standaardwaarde), THE Diagram_Renderer SHALL de build laten falen (fail-fast) bij een ongeldige diagrambron of ongeldige parameter, met een beschrijvende foutmelding, consistent met de engineering-conventies van BSO
4. WHERE `diagrams.failOnError` `false` is, THE Diagram_Renderer SHALL bij een ongeldige diagrambron of ongeldige parameter afschalen naar een waarschuwing met fallback (het oorspronkelijke codeblok behouden) en de build voortzetten
5. THE Diagram_Renderer SHALL een ongeldige diagrambron of ongeldige parameter behandelen als een auteurfout die als zodanig wordt gerapporteerd, ongeacht de bereikbaarheid van het Kroki_Endpoint, en die te onderscheiden van de transiente onbereikbaarheidsconditie uit Requirement 2
6. THE Diagram_Renderer SHALL een gerapporteerde fout surfacen als een echte, voor de gebruiker zichtbare fout (bij de standaardinstelling een buildfout met een beschrijvende melding), en niet uitsluitend als een informatieregel naar `stderr` terwijl de build ongewijzigd doorloopt

### Requirement 13: Herbruikbare validatie voor toekomstige `bso lint`

**User Story:** Als BSO-ontwikkelaar wil ik dat de validatielogica voor diagrammen herbruikbaar is, zodat een toekomstige `bso lint`-subcommand dezelfde problemen kan melden zonder de logica te dupliceren.

#### Acceptance Criteria

1. THE Diagram_Renderer SHALL de validatielogica voor diagrammen/parameters (het detecteren van ongeldige PlantUML/Mermaid of niet-ondersteunde diagram-/a11y-parameters) zodanig implementeren dat een toekomstige `bso lint`-subcommand deze KAN HERGEBRUIKEN om dezelfde problemen aan de auteur te melden, ZONDER de logica te dupliceren
2. THE Diagram_Renderer SHALL de validatie-/detectielogica, voor zover haalbaar, zo factoreren dat deze onafhankelijk van de volledige render-stap kan draaien, zodat een toekomstige lint problemen kan signaleren zonder noodzakelijkerwijs te renderen
3. THE feature SHALL vermelden dat het implementeren van `bso lint` zelf BUITEN scope van deze spec valt; deze requirement beperkt uitsluitend het DESIGN zodat hergebruik later mogelijk is (zie de lint-epic issue [#11](https://github.com/bartvanderwal/brightspacosaurus/issues/11))
