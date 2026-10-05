# ADR 013 — MCP-server voor APA-citeercontrole: eigen implementatie boven bestaande Brightspace MCP server

## Status

Geaccepteerd

## Context

De `AGENTS.md` schrijft voor dat elke bewering uit een externe bron een inline APA-verwijzing moet hebben in de tekst. Er is geen geautomatiseerde check die dit verifieert. Een MCP-server zou AI-agents (Kiro, GitHub Copilot) in staat stellen om dit automatisch te controleren tijdens het schrijven of reviewen van documenten. In het kader van 'aanpassen aan AI tijdperk' en 'learning on the job' is er wens naar gebruik en maken van MCP servers voor HAN SoRo docenten zou het nuttig zijn wel een koppeling te gebruiken. Vanwege beperkte tijd moet dit wel een simpele service zijn.

ADR 012 documenteert dat de GitLab MCP server niet beschikbaar is op de HAN ICT-instantie vanwege een admin-beperking. Dit laat zien dat externe MCP servers afhankelijk zijn van factoren buiten onze controle. Voor de APA-citeercontrole is een eigen implementatie overwogen naast hergebruik van een bestaande Brightspace MCP server.

### Bestaande MCP-servers voor citatieverificatie

Er bestaan twee relevante open-source MCP-servers voor citatieverificatie, maar geen van beide dekt onze use case:

De tool **mcp-refchecker** (Bååth, 2026) is een MCP-server die academische citaties verifieert tegen Semantic Scholar, OpenAlex en Crossref. De server beschrijft zichzelf als: "An MCP server that lets Claude verify academic citations in real time against Semantic Scholar, OpenAlex, and Crossref — catching hallucinated or incorrect references before they end up in your work." (Bååth, 2026). De server controleert of een geciteerd paper *bestaat* en of de metadata klopt — niet of elke bron in een bronnenlijst ook een inline verwijzing heeft in de tekst.

De tool **citecheck** (Gebremedhin et al., 2026) is een TypeScript MCP-server voor automatische bibliografische verificatie en reparatie in wetenschappelijke manuscripten. De server werkt met `.bib`-, `.tex`- en `.docx`-bestanden en valideert entries tegen PubMed, Crossref, arXiv en Semantic Scholar. Ook deze server richt zich op existentieverificatie van bronnen, niet op structuurcontrole van inline verwijzingen in Markdown.

Beide tools zijn fundamenteel anders van doel: zij controleren of bronnen *bestaan en correct zijn beschreven*, wij willen controleren of bronnen in een bronnenlijst ook *inline geciteerd zijn in de tekst* en of de APA-opmaak correct is. Er bestaat geen MCP-server die dit doet.

### Bestaande Brightspace MCP server als referentie

Er bestaat een open-source Brightspace MCP server van Rohan Muppa (Purdue University): `brightspace-mcp-server` op GitHub (Muppa, 2026). Deze server is bedoeld voor studenten om via AI-assistenten hun Brightspace-cursussen te raadplegen (cijfers, opdrachten, aankondigingen). De server is beschikbaar via `npx brightspace-mcp-server@latest`.

Deze server is voor ons niet bruikbaar als basis, om drie redenen:

1. **Doelgroep**: de server is ontworpen voor studenten die hun eigen cursusdata raadplegen, niet voor docenten of onderwijsontwikkelaars die documenten controleren op citeerregels.
2. **Beveiligingsrisico**: de server gebruikt `npx brightspace-mcp-server@latest` als installatiemethode. Dit patroon — `@latest` zonder versiepinning — is een bekende bad practice: elke nieuwe versie wordt automatisch uitgevoerd zonder review. ADR 008 documenteert onze eis voor versiepinning als mitigatie van supply chain-risico's.
3. **Architectuur**: de server slaat Brightspace-sessiecredentials lokaal op en hergebruikt die bij elke aanroep. Dit is niet geschikt voor een CI/CD-omgeving of gedeeld gebruik door docenten.

De server is wel waardevol als architectuurvoorbeeld: het laat zien hoe een MCP-server voor onderwijscontext kan worden opgezet met FastMCP-achtige patronen.

### Keuze van implementatietaal en framework

Voor de implementatie zijn twee opties overwogen: Python met FastMCP, en Deno/TypeScript consistent met Brightspacosaurus.

**FastMCP** is een zelfstandig Python-framework voor het bouwen van MCP-servers, gemaakt door Prefect. Het is geen add-on op FastAPI — de naam is geïnspireerd op FastAPI's decorator-gebaseerde aanpak, maar de technische basis is anders. FastMCP implementeert het MCP-protocol direct (JSON-RPC 2.0, stdio en SSE transport) zonder REST als tussenlaag. FastMCP 1.0 werd in 2024 opgenomen in de officiële MCP Python SDK; de standalone versie wordt een miljoen keer per dag gedownload en "some version of FastMCP powers 70% of MCP servers across all languages" (FastMCP, z.d.). Het is daarmee de de-facto standaard voor Python MCP-servers.

De keuze voor Python boven Deno/TypeScript is gebaseerd op drie overwegingen:

1. **Volwassenheid van het framework**: FastMCP is aanzienlijk verder dan de Deno MCP SDK — minder boilerplate, betere documentatie, actief onderhouden.
2. **Zero-install deployment via `uvx`**: collega-docenten hoeven niets te installeren; `uvx apa-citation-checker` in hun `mcp.json` is voldoende. Dit patroon is al in gebruik voor andere tools in de CI-pipeline.
3. **Bekendheid bij docenten**: Python is de meestgebruikte programmeertaal (TIOBE, 2026) en breder bekend bij docenten dan Deno/TypeScript.

Het nadeel — een tweede runtime naast Deno — is een esthetisch bezwaar, geen technisch probleem. De APA-checker en Brightspacosaurus delen geen code.

Een veelgemaakte fout bij het bouwen van MCP-servers is het 1:1 omzetten van REST-endpoints naar MCP-tools (Schmid, 2025). REST-principes als composability, discoverability en flexibility zijn ontworpen voor menselijke ontwikkelaars die documentatie eenmalig lezen. Voor AI-agents gelden andere principes: elke tool-beschrijving kost context-ruimte, en complexe argumenten leiden tot hallucinatie.

Schmid (2025) formuleert zes ontwerpprincipes voor MCP-servers:

1. **Outcomes, Not Operations**: ontwerp tools rond wat de agent wil bereiken, niet rond wat de API kan.
2. **Flatten Your Arguments**: gebruik primitieven en enums als argumenten, geen geneste objecten.
3. **Instructions are Context**: docstrings en foutmeldingen zijn onderdeel van de agent-context; schrijf ze als instructies.
4. **Curate Ruthlessly**: minder tools, compactere responses; elke token in de context telt.
5. **Name Tools for Discovery**: gebruik service-geprefixte namen (`{service}_{action}_{resource}`).
6. **Paginate Large Results**: geef metadata mee bij grote resultaten, dump geen ruwe data.

De conclusie van Schmid (2025) vat dit samen: "When building an MCP Server you are not building infrastructure, you are building an interface for AI agents."

## Decision Drivers

- De APA-citeercontrole is specifiek voor onze repository en `AGENTS.md`-regels; geen bestaande tool dekt dit
- De bestaande Brightspace MCP server is niet geschikt vanwege doelgroep, beveiligingsrisico's en architectuur
- MCP-ontwerpprincipes vereisen een outcome-georiënteerde interface, niet een REST-wrapper
- De tool moet ook bruikbaar zijn als standalone CLI (CI/CD-pipeline, terminal)
- Python met FastMCP sluit aan bij de `uvx`-workflow die al in gebruik is voor andere tools

## Overwogen opties

### Optie A — Brightspace MCP server aanpassen (niet gekozen)

De bestaande `brightspace-mcp-server` forken en aanpassen voor APA-citeercontrole.

**Voordelen:**

- Bestaande MCP-infrastructuur hergebruiken.

**Nadelen:**

- De server is fundamenteel anders van doel (cursusdata raadplegen vs. documenten controleren).
- `@latest`-patroon is een beveiligingsrisico dat we niet willen introduceren.
- Node.js/npm-afhankelijkheid, terwijl Python/FastMCP beter past bij onze tooling.
- Forken van een studentenproject introduceert onderhoudslast zonder meerwaarde.

### Optie B — Eigen Python MCP-server met FastMCP (gekozen)

Een nieuwe MCP-server schrijven in Python met FastMCP, aanroepbaar via `uvx`.

**Voordelen:**

- Volledig afgestemd op onze use case en `AGENTS.md`-regels.
- FastMCP is de de-facto standaard voor Python MCP-servers: "some version of FastMCP powers 70% of MCP servers across all languages" (FastMCP, z.d.). FastMCP 1.0 werd in 2024 opgenomen in de officiële MCP Python SDK.
- FastMCP is **geen add-on op FastAPI** — het is een zelfstandig framework dat het MCP-protocol direct implementeert (JSON-RPC 2.0, stdio en SSE transport). De naam is geïnspireerd op FastAPI's decorator-aanpak, maar de technische basis is anders.
- Aanroepbaar via `uvx apa-citation-checker` zonder voorafgaande installatie — collega-docenten hoeven niets te installeren.
- Dezelfde codebase dient als CLI (`python -m apa_citation_checker`) en als MCP-server.
- Versiepinning via `pyproject.toml` conform ADR 008.
- Python is de meestgebruikte programmeertaal (TIOBE, 2026) en breder bekend bij docenten dan Deno/TypeScript.

**Nadelen:**

- Tweede runtime (Python) naast de bestaande Deno-tooling — esthetisch bezwaar, geen technisch probleem.
- De APA-checker en Brightspacosaurus delen geen code, dus de inconsistentie heeft geen praktische gevolgen.

### Optie C — Eigen Deno/TypeScript MCP-server

Een MCP-server schrijven in Deno/TypeScript, consistent met Brightspacosaurus. Er bestaat een community-template als startpunt: [deno-mcp-template](https://github.com/phughesmcr/deno-mcp-template) (Hughes, 2026).

**Voordelen:**

- Consistente runtime met Brightspacosaurus.
- Deno's permissiemodel past bij een tool die bestanden leest.

**Nadelen:**

- Deno MCP SDK is minder volwassen dan FastMCP; meer boilerplate nodig.
- Geen `uvx`-equivalent voor Deno — zero-install deployment is niet beschikbaar.
- Studenten in OWE-1 leren JavaScript (in React-context), niet TypeScript — consistentie met Brightspacosaurus is een docenten-argument, geen studentenargument.

## Beslissing

We kiezen voor een eigen Python MCP-server met FastMCP (optie B). De bestaande Brightspace MCP server is niet bruikbaar als basis vanwege doelgroep, beveiligingsrisico's en architectuurverschillen. Python + FastMCP wint op volwassenheid van het framework, zero-install deployment via `uvx`, en bekendheid bij docenten.

### Toepassing van MCP-ontwerpprincipes

De `apa-citation-checker` MCP-server implementeert de principes van Schmid (2025) als volgt:

- **Outcomes, Not Operations**: één tool `apa_check_citations` die het volledige controleresultaat teruggeeft, niet aparte tools voor parsen, matchen en rapporteren.
- **Flatten Your Arguments**: `content: string` en `file_path: string` als primitieven; `check_links: boolean` als optionele vlag.
- **Instructions are Context**: de tool-docstring beschrijft exact wat de agent moet meegeven en wat het resultaat betekent.
- **Curate Ruthlessly**: één tool, compact JSON-resultaat met alleen ontbrekende bronnen, zwevende verwijzingen en eventuele dode links.
- **Name Tools for Discovery**: `apa_check_citations` volgt het `{service}_{action}_{resource}`-patroon.
- **Paginate Large Results**: niet van toepassing bij documenten van normale omvang.

## Gevolgen

Positief:

- AI-agents kunnen automatisch controleren of documenten voldoen aan de citeerregels uit `AGENTS.md`.
- De tool is ook bruikbaar als CLI in CI/CD-pipelines.
- Uitbreidbaar met dead link checking en claimcontrole zonder architectuurwijziging.

Negatief:

- Nieuwe Python-codebase naast de bestaande Deno-tooling.
- Onderhoud van de tool valt bij het docententeam.

## Bronnen

- Schmid, P. (2025). *MCP is Not the Problem, It's your Server: Best Practices for Building MCP Servers*. Geraadpleegd op 10 mei 2026, van https://www.philschmid.de/mcp-best-practices
- Muppa, R. (2026). *brightspace-mcp-server: MCP server for Brightspace (D2L)*. Geraadpleegd op 10 mei 2026, van https://github.com/RohanMuppa/brightspace-mcp-server
- Bååth, J. (2026). *mcp-refchecker: An MCP server that lets Claude verify academic citations in real time against Semantic Scholar, OpenAlex, and Crossref*. Geraadpleegd op 10 mei 2026, van https://github.com/JonasBaath/mcp-refchecker
- Gebremedhin, A., et al. (2026). *citecheck: An MCP Server for Automated Bibliographic Verification and Repair in Scholarly Manuscripts*. arXiv:2603.17339. https://doi.org/10.48550/arXiv.2603.17339
- FastMCP. (z.d.). *FastMCP — The standard framework for building MCP servers*. Geraadpleegd op 10 mei 2026, van https://gofastmcp.com/
- Hughes, P. (2026). *deno-mcp-template: A template for building MCP servers with Deno*. Geraadpleegd op 10 mei 2026, van https://github.com/phughesmcr/deno-mcp-template
- TIOBE. (2026, maart). *TIOBE Index for March 2026*. Geraadpleegd op 10 mei 2026, van https://www.tiobe.com/tiobe-index/
