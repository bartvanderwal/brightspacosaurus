# Requirements Document

## Inleiding

`apa-citation-checker` is een tool die Markdown-documenten controleert op naleving van de APA-citeerregels zoals vastgelegd in `AGENTS.md`. De kernregels:

1. Elke bron in de `## Bronnen`-sectie moet ook als inline verwijzing voorkomen in de tekst (bijv. `(Auteur, jaar)`). Bronnen onderaan zijn niet voldoende zonder inline verwijzingen.
2. Beweringen die uit externe bronnen komen moeten bij voorkeur als letterlijk citaat worden opgenomen (tussen aanhalingstekens), niet als parafrase — slechte/niet passende LLM-parafrases zijn een bekende bron van hallucinatie.
3. URL's in de Bronsectie moeten bereikbaar zijn (geen dode links).

De tool is beschikbaar als:
1. **MCP-server**: aanroepbaar vanuit Kiro, VS Code met GitHub Copilot, of andere MCP-compatibele clients.
2. **Standalone CLI**: aanroepbaar vanuit de terminal of een CI/CD-pipeline.

De eisen in dit document zijn geformuleerd in EARS-notatie (Easy Approach to Requirements Syntax; Mavin, z.d.). EARS gebruikt vaste patronen zoals `WHEN ... SHALL ...`, `IF ... THEN SHALL ...` en `SHALL ...` om ambiguïteit te verminderen. Het document bevat zowel functionele eisen (wat de tool doet) als niet-functionele eisen (kwaliteitsattributen zoals deployability en onderhoudbaarheid) in Requirement 9.

## Woordenlijst

- **APA-Checker**: de tool die dit systeem implementeert (zowel MCP-server als CLI).
- **Bronsectie**: de `## Bronnen`-sectie onderaan een Markdown-document.
- **Bronvermelding**: een regel in de Bronsectie die een externe bron beschrijft in APA-formaat, bijv. `- Auteur. (jaar). *Titel*. URL`.
- **Inline verwijzing**: een verwijzing in de tekst buiten de Bronsectie in de vorm `(Auteur, jaar)` of `(Auteur, z.d.)`.
- **Auteur-jaar-combinatie**: het paar (auteur, jaar) dat een bron uniek identificeert voor citeercontrole, bijv. `(Unified, z.d.)` of `(NCSC, 2026)`.
- **Ontbrekende inline verwijzing**: een bron in de Bronsectie waarvoor geen overeenkomende inline verwijzing in de tekst bestaat.
- **Documenttekst**: de inhoud van het Markdown-document buiten de Bronsectie.
- **MCP-server**: een server die het Model Context Protocol implementeert en tools beschikbaar stelt aan AI-assistenten.
- **CLI**: de opdrachtregelinterface waarmee de APA-Checker direct vanuit de terminal kan worden aangeroepen.
- **Dode link**: een URL in de Bronsectie die niet bereikbaar is (HTTP-statuscode ≥ 400 of verbindingsfout).
- **Ongefundeerde bewering**: een zin in de documenttekst die een feitelijke claim doet zonder overeenkomende inline verwijzing in dezelfde of aangrenzende zin.

## Requirements

### Requirement 1: Bronnen parsen uit de Bronsectie

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker de bronvermeldingen uit de `## Bronnen`-sectie van een Markdown-document parseert, zodat ik weet welke bronnen gecheckt moeten worden op inline verwijzingen.

#### Acceptatiecriteria

1.1. WHEN de APA-Checker een Markdown-document verwerkt, SHALL de APA-Checker de `## Bronnen`-sectie identificeren als de sectie die begint met de heading `## Bronnen` en doorloopt tot het einde van het document of de volgende heading van gelijk of hoger niveau.
1.2. WHEN de Bronsectie een regel bevat in het formaat `- Auteur. (jaar). ...` of `- Auteur. (z.d.). ...`, SHALL de APA-Checker de auteur-jaar-combinatie extraheren als `(Auteur, jaar)` respectievelijk `(Auteur, z.d.)`.
1.3. WHEN de Bronsectie een regel bevat met een auteur bestaande uit meerdere woorden (bijv. `IMS Global. (z.d.).`), SHALL de APA-Checker de volledige auteursnaam tot aan de punt vóór het jaar extraheren.
1.4. IF het Markdown-document geen `## Bronnen`-sectie bevat, THEN SHALL de APA-Checker een leeg resultaat teruggeven zonder fout.
1.5. IF de Bronsectie leeg is of uitsluitend regels bevat die niet overeenkomen met het APA-bronformaat, THEN SHALL de APA-Checker een leeg resultaat teruggeven zonder fout.
1.6. WHEN de Bronsectie een bron bevat met een sub-bullet (inspringende regel met aanvullende toelichting), SHALL de APA-Checker die sub-bullet niet als aparte bron interpreteren.

### Requirement 2: Inline verwijzingen detecteren in de documenttekst

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker controleert of elke bron ook als inline verwijzing voorkomt in de tekst buiten de Bronsectie, zodat ik weet of het document voldoet aan de citeerregels uit `AGENTS.md`.

#### Acceptatiecriteria

2.1. WHEN de APA-Checker een auteur-jaar-combinatie heeft geëxtraheerd, SHALL de APA-Checker de documenttekst buiten de Bronsectie doorzoeken op een overeenkomende inline verwijzing in het formaat `(Auteur, jaar)` of `(Auteur, z.d.)`.
2.2. WHEN de documenttekst een inline verwijzing bevat die overeenkomt met een bron in de Bronsectie, SHALL de APA-Checker die bron als geciteerd markeren.
2.3. WHEN de documenttekst een inline verwijzing bevat die niet overeenkomt met een bron in de Bronsectie, SHALL de APA-Checker die verwijzing rapporteren als waarschuwing (`orphanedRef`), niet als fout. APA staat toe dat een website in het algemeen wordt vermeld zonder formele bronvermelding (University of Portland Library, z.d.); de auteur beoordeelt zelf of een zwevende verwijzing een omissie is of een bewuste keuze.
2.4. SHALL de APA-Checker de vergelijking van auteursnamen hoofdletterongevoelig uitvoeren.
2.5. WHEN de documenttekst een inline verwijzing bevat met een auteursnaam die een afkorting is van de volledige auteursnaam in de Bronsectie (bijv. `(D2L, z.d.)` voor `D2L. (z.d.).`), SHALL de APA-Checker die als overeenkomst beschouwen.

### Requirement 3: Rapporteren van ontbrekende inline verwijzingen

**User Story:** Als docent of AI-agent wil ik een duidelijk rapport ontvangen van welke bronnen geen inline verwijzing hebben in de tekst, zodat ik gericht de ontbrekende citaten kan toevoegen.

#### Acceptatiecriteria

3.1. WHEN de APA-Checker de controle heeft uitgevoerd, SHALL de APA-Checker een rapport teruggeven met per ontbrekende bron: de volledige bronvermelding zoals die in de Bronsectie staat, en de verwachte inline verwijzing (bijv. `(Auteur, jaar)`).
3.2. WHEN alle bronnen in de Bronsectie een overeenkomende inline verwijzing hebben, SHALL de APA-Checker een rapport teruggeven dat aangeeft dat het document voldoet aan de citeerregels.
3.3. SHALL de APA-Checker het rapport teruggeven als gestructureerde data (lijst van ontbrekende bronnen) zodat zowel de MCP-server als de CLI het kunnen verwerken.
3.4. WHEN de APA-Checker wordt aangeroepen via de CLI, SHALL de APA-Checker het rapport als leesbare tekst naar `stdout` schrijven.
3.5. WHEN de APA-Checker wordt aangeroepen via de CLI en er ontbrekende inline verwijzingen zijn, SHALL de APA-Checker stoppen met exitcode `1`.
3.6. WHEN de APA-Checker wordt aangeroepen via de CLI en alle bronnen geciteerd zijn, SHALL de APA-Checker stoppen met exitcode `0`.

### Requirement 4: MCP-server interface

**User Story:** Als AI-agent (Kiro of GitHub Copilot) wil ik de APA-Checker kunnen aanroepen als MCP-tool, zodat ik automatisch kan controleren of een document voldoet aan de citeerregels zonder de terminal te hoeven gebruiken.

#### Acceptatiecriteria

4.1. SHALL de APA-Checker een MCP-server implementeren die de tool `check_apa_citations` beschikbaar stelt.
4.2. WHEN de MCP-tool `check_apa_citations` wordt aangeroepen met een `content`-parameter (Markdown-tekst als string), SHALL de APA-Checker de controle uitvoeren op die tekst en het resultaat teruggeven als gestructureerde JSON.
4.3. WHEN de MCP-tool `check_apa_citations` wordt aangeroepen met een `file_path`-parameter (pad naar een Markdown-bestand), SHALL de APA-Checker het bestand inlezen en de controle uitvoeren.
4.4. IF zowel `content` als `file_path` worden meegegeven, THEN SHALL de APA-Checker `content` gebruiken en `file_path` negeren.
4.5. IF noch `content` noch `file_path` wordt meegegeven, THEN SHALL de APA-Checker een foutmelding teruggeven die aangeeft dat minimaal één parameter vereist is.
4.6. SHALL de MCP-server opstartbaar zijn via `uvx` zonder voorafgaande installatie, conform het FastMCP-patroon.

### Requirement 5: CLI-interface

**User Story:** Als docent of CI/CD-pipeline wil ik de APA-Checker kunnen aanroepen als standalone CLI-tool, zodat ik Markdown-bestanden kan controleren zonder een MCP-client te hoeven gebruiken.

#### Acceptatiecriteria

5.1. WHEN de CLI wordt aangeroepen met een bestandspad als argument (bijv. `apa-citation-checker pad/naar/bestand.md`), SHALL de APA-Checker het opgegeven bestand inlezen en de controle uitvoeren.
5.2. WHEN de CLI wordt aangeroepen met de vlag `--stdin`, SHALL de APA-Checker de Markdown-tekst van `stdin` inlezen en de controle uitvoeren.
5.3. WHEN de CLI wordt aangeroepen zonder argumenten of vlaggen, SHALL de APA-Checker een gebruiksaanwijzing tonen en stoppen met exitcode `3`.
5.4. IF het opgegeven bestandspad niet bestaat, THEN SHALL de APA-Checker een foutmelding naar `stderr` schrijven en stoppen met exitcode `2`.
5.5. SHALL de CLI-tool aanroepbaar zijn als `python -m apa_citation_checker` of via een geïnstalleerd entry point.

### Requirement 6: Foutafhandeling en robuustheid

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker robuust omgaat met onverwachte invoer, zodat de tool niet crasht bij afwijkende of incomplete documenten.

#### Acceptatiecriteria

6.1. WHEN de APA-Checker een Markdown-document verwerkt dat geen `## Bronnen`-sectie bevat, SHALL de APA-Checker een leeg rapport teruggeven met een melding dat er geen Bronsectie is gevonden.
6.2. WHEN de APA-Checker een leeg document verwerkt, SHALL de APA-Checker een leeg rapport teruggeven zonder fout.
6.3. IF het inlezen van een bestand mislukt door een permissiefout of I/O-fout, THEN SHALL de APA-Checker een beschrijvende foutmelding teruggeven die het bestandspad en de foutsoort vermeldt.
6.4. WHEN de APA-Checker een Markdown-document verwerkt met een `## Bronnen`-sectie die bronnen bevat in een afwijkend formaat (bijv. zonder punt na het jaar), SHALL de APA-Checker die regels overslaan en de overige bronnen wel verwerken.
6.5. SHALL de APA-Checker alle foutmeldingen via de CLI naar `stderr` schrijven en alle rapportage naar `stdout`.

### Requirement 7: Dode links detecteren

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker de URL's in de Bronsectie controleert op bereikbaarheid, zodat ik dode (e.g. gehallucineerde) links kan opsporen voordat studenten of collega's ze tegenkomen.

#### Acceptatiecriteria

7.1. WHEN de APA-Checker wordt aangeroepen met de vlag `--check-links` (CLI) of de parameter `check_links: true` (MCP), SHALL de APA-Checker elke URL in de Bronsectie opvragen via een HTTP HEAD-verzoek.
7.2. WHEN een URL een HTTP-statuscode ≥ 400 teruggeeft of de verbinding mislukt, SHALL de APA-Checker die URL rapporteren als dode link met de bijbehorende statuscode of foutmelding.
7.3. WHEN een URL een HTTP-statuscode 200–399 teruggeeft, SHALL de APA-Checker die URL als bereikbaar markeren.
7.4. IF de linkcontrole is uitgeschakeld (standaard), THEN SHALL de APA-Checker geen HTTP-verzoeken uitvoeren.
7.5. WHEN de linkcontrole actief is en een verzoek langer duurt dan 10 seconden, SHALL de APA-Checker het verzoek afbreken en de URL rapporteren als niet-bereikbaar met de melding "timeout".
7.6. SHALL de APA-Checker de linkcontrole parallel uitvoeren voor alle URL's in de Bronsectie om de doorlooptijd te beperken.

### Requirement 8: Ongefundeerde beweringen signaleren

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker zinnen in de documenttekst signaleert die een feitelijke bewering doen zonder inline verwijzing, zodat ik kan controleren of alle claims onderbouwd zijn.

#### Acceptatiecriteria

8.1. WHEN de APA-Checker wordt aangeroepen met de vlag `--check-claims` (CLI) of de parameter `check_claims: true` (MCP), SHALL de APA-Checker de documenttekst buiten de Bronsectie analyseren op zinnen die een feitelijke bewering bevatten zonder overeenkomende inline verwijzing in dezelfde of aangrenzende zin.
8.2. SHALL de APA-Checker zinnen als potentieel ongefundeerd markeren wanneer ze een van de volgende patronen bevatten: werkwoorden als "blijkt", "toont aan", "is bewezen", "onderzoek wijst uit", "studies tonen", of vergelijkbare feitsclaims, zonder dat er een inline verwijzing `(Auteur, jaar)` in dezelfde of de direct aangrenzende zin staat.
8.3. WHEN de APA-Checker een potentieel ongefundeerde bewering detecteert, SHALL de APA-Checker de betreffende zin en het regelnummer rapporteren als waarschuwing (geen fout).
8.4. IF de claimcontrole is uitgeschakeld (standaard), THEN SHALL de APA-Checker geen claimanalyse uitvoeren.
8.5. SHALL de APA-Checker de claimcontrole rapporteren als afzonderlijke sectie in het rapport, gescheiden van de ontbrekende inline verwijzingen.

### Requirement 9: Niet-functionele eisen (kwaliteitsattributen)

**User Story:** Als ontwikkelaar of beheerder wil ik dat de APA-Checker voldoet aan technische kwaliteitsattributen voor deployability, onderhoudbaarheid en compatibiliteit, zodat de tool duurzaam inzetbaar is in uiteenlopende omgevingen.

**Context:** Naast de functionele eisen gelden er technische constraints en kwaliteitsattributen die de implementatiekeuzes sturen. Deze zijn hier expliciet vastgelegd zodat ze traceerbaar zijn en niet impliciet in het ontwerp verdwijnen.

#### Acceptatiecriteria

##### 9.1 Invoerformaat

9.1.1. SHALL de APA-Checker uitsluitend Markdown-bestanden (`.md`) als invoer accepteren. De tool is niet bedoeld voor andere documentformaten (Word, PDF, LaTeX).
9.1.2. SHALL de APA-Checker de `## Bronnen`-sectie herkennen als Nederlandse sectienaam. Engelstalige varianten (`## References`, `## Sources`) worden niet automatisch herkend tenzij expliciet geconfigureerd.

##### 9.2 Deployability

9.2.1. SHALL de MCP-server aanroepbaar zijn zonder handmatige installatiestappen op de machine van de gebruiker — het exacte mechanisme (bijv. `uvx`, `pip install`, of lokaal draaien) wordt uitgewerkt in het ontwerpdocument.
9.2.2. SHALL de tool versiepinning ondersteunen conform de supply chain-aanbevelingen in ADR 008.
9.2.3. SHALL de lokale ontwikkelomgeving gebruik maken van een Python virtual environment (`.venv/`) conform standaard Python-praktijk, zodat afhankelijkheden geïsoleerd zijn van de systeeminstallatie.

##### 9.3 Onderhoudbaarheid

9.3.1. SHALL de kernlogica (parsen, matchen, rapporteren) volledig onafhankelijk zijn van de MCP-interface en de CLI, zodat beide interfaces dezelfde logica gebruiken en afzonderlijk testbaar zijn.
9.3.2. SHALL de tool een testruimte hebben met property-based tests (hypothesis) en unit-tests (pytest) die de correctheidseigenschappen uit het ontwerpdocument valideren.

##### 9.4 Taal en runtime

9.4.1. SHALL de tool geïmplementeerd zijn in Python 3.11 of hoger, met FastMCP als MCP-framework. De keuze voor Python boven Deno/TypeScript is gedocumenteerd in ADR 013 en geldt als technische constraint voor deze implementatie.

##### 9.5 Compatibiliteit

9.5.1. SHALL de MCP-server compatibel zijn met Kiro IDE, VS Code met GitHub Copilot, en andere MCP-clients die het stdio-transport ondersteunen.
9.5.2. SHALL de `.vscode/mcp.json`-configuratie commitbaar zijn in de repository zodat collega-docenten zonder extra setup gebruik kunnen maken van de tool.

### Requirement 10: Losse URL's signaleren

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker losse URL's in de documenttekst signaleert die niet als APA-bronvermelding zijn opgenomen, zodat ik weet waar ik een formele bronvermelding moet toevoegen of de URL correct moet opmaken.

De APA-checker is hiermee een aanvulling op Markdown-linters zoals markdownlint (regel `no-bare-urls`) en quickmark: waar die linters de syntaxregel handhaven, controleert de APA-checker de semantische regel — heeft de URL een bijbehorende bronvermelding?

#### Acceptatiecriteria

10.1. WHEN de APA-Checker een losse URL tegenkomt in de documenttekst buiten de Bronsectie (een URL die niet is opgenomen in een Markdown-link `[tekst](url)` en niet tussen haakjes staat), SHALL de APA-Checker die URL rapporteren als waarschuwing met de suggestie om een APA-bronvermelding toe te voegen of de URL tussen haakjes te plaatsen.
10.2. WHEN de APA-Checker een URL tegenkomt die uitsluitend een domeinnaam is zonder pad (bijv. `https://example.com`), SHALL de APA-Checker die URL rapporteren als informatieve melding — geen fout, want APA staat toe dat een website in het algemeen wordt vermeld zonder formele bronvermelding (University of Portland Library, z.d.).
10.3. WHEN de APA-Checker een URL tegenkomt die een pad bevat (bijv. `https://example.com/pagina/artikel`), SHALL de APA-Checker die URL rapporteren als waarschuwing met de suggestie om een deeplink-bronvermelding toe te voegen.
10.4. IF de URL al voorkomt in de Bronsectie als onderdeel van een bronvermelding, THEN SHALL de APA-Checker die URL niet rapporteren als losse URL.
10.5. SHALL de APA-Checker losse URL's rapporteren als afzonderlijke sectie in het rapport, gescheiden van ontbrekende inline verwijzingen.

### Requirement 11: Bronsectie bevat uitsluitend bronvermeldingen

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker signaleert wanneer de Bronsectie andere inhoud bevat dan bronvermeldingen (zoals toelichtende sub-bullets, losse zinnen of uitleg), zodat de bronnenlijst conform APA uitsluitend een lijst van bronnen is zonder aanvullende tekst.

**Rationale:** Een APA-bronnenlijst is geen hoofdstuk en bevat geen uitleggende tekst. De lezer wordt geacht de APA-standaard te kennen. Toelichtende sub-bullets onder bronnen (bijv. "Geciteerd bij..." of "Gebruikt als...") zijn niet conform APA en vervuilen de bronnenlijst. Dit is een veelgemaakte fout bij LLM-gegenereerde teksten die "behulpzaam" willen zijn door context toe te voegen waar die niet hoort.

#### Acceptatiecriteria

11.1. WHEN de APA-Checker de Bronsectie verwerkt en een regel tegenkomt die begint met witruimte (sub-bullet of inspringende tekst), SHALL de APA-Checker die regel rapporteren als waarschuwing met de melding dat de Bronsectie uitsluitend bronvermeldingen mag bevatten.
11.2. WHEN de APA-Checker de Bronsectie verwerkt en een regel tegenkomt die geen bronvermelding is en geen lege regel, SHALL de APA-Checker die regel rapporteren als waarschuwing.
11.3. SHALL de APA-Checker deze waarschuwingen rapporteren als afzonderlijke sectie in het rapport, gescheiden van ontbrekende inline verwijzingen.

### Requirement 12: Documentkwaliteitsscore (wanthave)

**User Story:** Als docent of AI-agent wil ik dat de APA-Checker een samenvattende kwaliteitsscore toekent aan een gecontroleerd document, zodat ik in één oogopslag kan zien hoe goed het document voldoet aan de APA-citeerregels.

**Rationale:** Een letterschaal geeft snel inzicht in de algehele kwaliteit zonder dat je elk individueel probleem hoeft te lezen. Dit is vooral nuttig bij het scannen van meerdere documenten in een repository of CI/CD-pipeline.

#### Acceptatiecriteria

12.1. WHEN de APA-Checker de controle heeft uitgevoerd, SHALL de APA-Checker een letterschaal-score toekennen op basis van de gevonden fouten en waarschuwingen: A (geen fouten, geen waarschuwingen), B (geen fouten, enkele waarschuwingen), C (1–2 ontbrekende inline verwijzingen), D (3+ ontbrekende inline verwijzingen of dode links), F (geen Bronsectie terwijl het document wel externe claims bevat).
12.2. SHALL de APA-Checker de score opnemen in het gestructureerde rapport als veld `grade`.
12.3. WHEN de APA-Checker wordt aangeroepen via de CLI, SHALL de APA-Checker de score prominent tonen bovenaan de rapportage-uitvoer.
12.4. SHALL de score-berekening configureerbaar zijn via gewichtsfactoren, zodat teams de drempelwaarden per letter kunnen aanpassen aan hun eigen kwaliteitsnormen.

## Bronnen

- Mavin, A. (z.d.). *Adopting the EARS notation to improve requirements engineering*. In Jama Software, *Requirements Management Guide*. Geraadpleegd op 10 mei 2026, van https://www.jamasoftware.com/requirements-management-guide/writing-requirements/adopting-the-ears-notation-to-improve-requirements-engineering
- University of Portland Library. (z.d.). *APA: Websites*. Geraadpleegd op 10 mei 2026, van https://libguides.up.edu/apa/websites
