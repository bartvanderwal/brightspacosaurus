# Ontwerpdocument: APA Citation Checker MCP

## Overzicht

`apa-citation-checker` is een Python-tool die Markdown-documenten controleert op naleving van de APA-citeerregels zoals vastgelegd in `AGENTS.md`. De tool is beschikbaar als:

1. **MCP-server**: aanroepbaar vanuit Kiro, VS Code met GitHub Copilot, of andere MCP-compatibele clients via `uvx apa-citation-checker`.
2. **Standalone CLI**: aanroepbaar vanuit de terminal of een CI/CD-pipeline via `python -m apa_citation_checker`.

De kernfunctionaliteit: voor elk document met een `## Bronnen`-sectie controleert de tool of elke bron ook als inline verwijzing `(Auteur, jaar)` voorkomt in de tekst buiten die sectie, én of elke inline verwijzing een overeenkomende bron heeft in de Bronsectie. Optioneel controleert de tool ook de bereikbaarheid van URL's (req. 7), signaleert ongefundeerde beweringen (req. 8), en detecteert losse URL's in de tekst (req. 10).

### Gebruikerslaag en architectuurprincipe

De directe gebruiker van de ACC-MCP is een **LLM** (Kiro, GitHub Copilot), niet de docent. De docent geeft de LLM een opdracht ("check dit bestand op APA"), de LLM ontdekt via MCP-discoverability dat er een geschikte tool beschikbaar is, roept die aan, en rapporteert het resultaat terug aan de docent.

```
Docent
  │  "check adr/adr013.md op APA-citeerregels"
  ▼
LLM (Kiro / GitHub Copilot)
  │  ontdekt via MCP: tool apa_check_citations beschikbaar
  ▼
ACC-MCP server (FastMCP, Python) ← dit is de ACC
  │  apa_check_citations(file_path="adr/adr013.md")
  ▼
Klassieke Python code (parser.py, checker.py)
  │  deterministische regex + string matching, geen AI
  ▼
CheckResult (JSON) → LLM interpreteert → rapportage aan docent
```

De ACC zelf bevat **geen AI** — het is deterministische code. FastMCP is de adapter die die code bereikbaar maakt voor LLM's via het MCP-protocol (JSON-RPC 2.0 over stdio of SSE). Dit is het kernprincipe van MCP: klassieke tools achter een gestandaardiseerde interface voor AI-agents (Schmid, 2025).

## Architectuur

```
scripts/apa-citation-checker/
├── pyproject.toml              # afhankelijkheden en entry points
├── apa_citation_checker/
│   ├── __init__.py
│   ├── __main__.py             # CLI entry point
│   ├── server.py               # FastMCP MCP-server
│   ├── models.py               # Dataclasses: Source, InlineRef, CheckResult, …
│   ├── checker.py              # Kernlogica: parsen + matchen + rapporteren
│   ├── parser.py               # Markdown-parsing: bronnen en inline verwijzingen
│   ├── link_checker.py         # Optionele HTTP-linkcontrole (async, req. 7)
│   ├── bare_url_checker.py     # Losse URL-detectie (req. 10)
│   └── claim_checker.py        # Ongefundeerde beweringen (req. 8)
└── tests/
    ├── test_parser.py
    ├── test_checker.py
    └── test_server.py
```

De kernlogica in `checker.py` is volledig onafhankelijk van zowel de MCP-interface als de CLI — dit maakt testen eenvoudig en zorgt dat beide interfaces dezelfde logica gebruiken (req. 9.3.1).

```
Markdown-tekst
     │
     ▼
  parser.py
  ├── parse_sources()          → Source[]
  └── parse_inline_refs()      → InlineRef[]
     │
     ▼
  checker.py
  └── check_citations()        → CheckResult
     │
     ├── link_checker.py       (optioneel, --check-links)
     ├── bare_url_checker.py   (altijd actief)
     ├── claim_checker.py      (optioneel, --check-claims)
     │
     ├──▶ server.py            (MCP-tool: apa_check_citations)
     └──▶ __main__.py          (CLI: stdout + exitcode)
```

## Data Models

De dataclasses zijn gedefinieerd in `models.py` en worden geïmporteerd door alle andere modules.

```python
from dataclasses import dataclass, field


@dataclass
class Source:
    author: str        # bijv. "Unified" of "IMS Global"
    year: str          # bijv. "z.d.", "2026", "2025"
    full_text: str     # volledige bronregel zoals in het document
    url: str | None = None  # URL indien aanwezig


@dataclass
class InlineRef:
    author: str        # bijv. "Unified"
    year: str          # bijv. "z.d."
    line_number: int   # regelnummer in het document


@dataclass
class MissingCitation:
    source: Source
    expected_ref: str  # bijv. "(Unified, z.d.)"


@dataclass
class OrphanedRef:
    ref: InlineRef
    severity: str = "warning"  # altijd waarschuwing, nooit fout


@dataclass
class DeadLink:
    url: str
    status: str        # HTTP-statuscode of "timeout" of foutmelding


@dataclass
class BareUrl:
    url: str
    line_number: int
    severity: str      # "warning" (URL met pad) of "info" (alleen domein)


@dataclass
class UnfoundedClaim:
    sentence: str      # de zin die als ongefundeerd is gemarkeerd
    line_number: int
    severity: str = "warning"  # altijd waarschuwing, nooit fout


@dataclass
class CheckResult:
    missing_citations: list[MissingCitation] = field(default_factory=list)
    orphaned_refs: list[OrphanedRef] = field(default_factory=list)
    dead_links: list[DeadLink] = field(default_factory=list)
    bare_urls: list[BareUrl] = field(default_factory=list)
    unfounded_claims: list[UnfoundedClaim] = field(default_factory=list)
    has_sources_section: bool = False
    total_sources: int = 0
    cited_sources: int = 0

    @property
    def ok(self) -> bool:
        """True als alle bronnen geciteerd zijn en er geen dode links zijn."""
        return len(self.missing_citations) == 0 and len(self.dead_links) == 0
```

### Toelichting op `orphaned_refs`

Een inline verwijzing zonder overeenkomende bron in de Bronsectie is een **waarschuwing**, geen fout. APA staat toe dat een website in het algemeen wordt vermeld zonder bronvermelding (Scribbr, z.d.): "In de meeste gevallen hoef je geen bronvermelding toe te voegen als je iets bespreekt dat tot algemene kennis behoort." De tool rapporteert zwevende verwijzingen zodat de auteur ze bewust kan beoordelen (req. 2.3).

### Toelichting op `ok`

De `ok`-property op `CheckResult` bepaalt de exitcode van de CLI (0 of 1) en geeft de MCP-client een snelle samenvatting. `unfounded_claims`, `orphaned_refs` en `bare_urls` zijn waarschuwingen en beïnvloeden `ok` niet — alleen `missing_citations` en `dead_links` zijn fouten.

## Componenten

### parser.py

```python
def parse_sources(markdown: str) -> list[Source]:
    """Extraheert bronnen uit de ## Bronnen-sectie."""

def parse_inline_refs(markdown: str, sources_start_line: int) -> list[InlineRef]:
    """Extraheert inline verwijzingen uit de documenttekst BUITEN de Bronsectie."""

def find_sources_section(markdown: str) -> int | None:
    """Geeft het regelnummer van de ## Bronnen-heading terug, of None."""
```

**Parseerpatroon voor bronnen** (regex):

```
^-\s+(?P<author>.+?)\.\s+\((?P<year>[^)]+)\)\.
```

**Parseerpatroon voor inline verwijzingen** (regex):

```
\((?P<author>[^,\n()]+),\s*(?P<year>(?:z\.d\.|n\.d\.|s\.d\.|\d{4}[a-z]?))\)
```

Sub-bullets (inspringende regels) worden overgeslagen bij het parsen van bronnen (req. 1.6). De Bronsectie loopt van de `## Bronnen`-heading tot het einde van het document of de volgende heading van gelijk of hoger niveau (req. 1.1).

**Valideert: Requirements 1.1–1.6**

### checker.py

```python
def check_citations(
    markdown: str,
    check_links: bool = False,
    check_claims: bool = False,
) -> CheckResult:
    """Voert de volledige APA-citeercontrole uit op een Markdown-document."""
```

**Matchinglogica:** een inline verwijzing `(A, jaar)` matcht een bron `(B, jaar)` als `year` exact overeenkomt (hoofdletterongevoelig) én `author` overeenkomt via exacte match, prefix-match, of eerste-woord-match (req. 2.4, 2.5).

De functie delegeert naar `link_checker.py` als `check_links=True`, naar `claim_checker.py` als `check_claims=True`, en naar `bare_url_checker.py` altijd.

**Valideert: Requirements 2.1–2.5, 3.1–3.3**

### link_checker.py

```python
async def check_links(sources: list[Source], timeout: float = 10.0) -> list[DeadLink]:
    """
    Controleert alle URLs in de bronnenlijst parallel via HTTP HEAD-verzoeken.
    Gebruikt httpx voor async HTTP. Geeft DeadLink terug bij status >= 400 of timeout.
    """
```

Parallel uitvoeren via `asyncio.gather` voor alle URLs tegelijk (req. 7.6). Timeout per verzoek is 10 seconden (req. 7.5). Standaard uitgeschakeld; alleen actief bij `--check-links` of `check_links=True` (req. 7.4).

**Valideert: Requirements 7.1–7.6**

### bare_url_checker.py

```python
def find_bare_urls(markdown: str, sources_start_line: int) -> list[BareUrl]:
    """
    Vindt losse URLs in de documenttekst buiten de Bronsectie.
    Losse URL = niet in [tekst](url), niet tussen haakjes, niet in Bronsectie.
    Domein-only URLs krijgen severity 'info'; URLs met pad krijgen 'warning'.
    URLs die al in de Bronsectie staan worden overgeslagen.
    """
```

Detectielogica: een URL is "los" als hij niet voorkomt als `[tekst](url)`, niet tussen haakjes staat, en niet in de Bronsectie staat (req. 10.4). Een URL zonder pad (bijv. `https://example.com`) krijgt severity `"info"` (req. 10.2); een URL met pad krijgt `"warning"` (req. 10.3).

**Valideert: Requirements 10.1–10.5**

### claim_checker.py

```python
def find_unfounded_claims(markdown: str, sources_start_line: int) -> list[UnfoundedClaim]:
    """
    Signaleert zinnen in de documenttekst die een feitelijke bewering bevatten
    zonder overeenkomende inline verwijzing in dezelfde of aangrenzende zin.
    Geeft waarschuwingen terug, geen fouten.
    """
```

Detectiepatronen: werkwoorden en uitdrukkingen als "blijkt", "toont aan", "is bewezen", "onderzoek wijst uit", "studies tonen" (req. 8.2). Een zin wordt alleen als ongefundeerd gemarkeerd als er geen inline verwijzing `(Auteur, jaar)` in dezelfde of de direct aangrenzende zin staat. Standaard uitgeschakeld; alleen actief bij `--check-claims` of `check_claims=True` (req. 8.4).

**Valideert: Requirements 8.1–8.5**

### server.py (FastMCP)

```python
from fastmcp import FastMCP

mcp = FastMCP("apa-citation-checker")

@mcp.tool()
def apa_check_citations(
    content: str | None = None,
    file_path: str | None = None,
    check_links: bool = False,
    check_claims: bool = False,
) -> dict:
    """
    Controleert een Markdown-document op APA-citeerregels.
    Geef 'content' mee als Markdown-tekst, of 'file_path' als pad naar een bestand.
    Als beide worden meegegeven, wordt 'content' gebruikt (req. 4.4).
    check_links: controleer ook of URLs bereikbaar zijn (req. 7).
    check_claims: signaleer zinnen met feitsclaims zonder inline verwijzing (req. 8).
    """
```

Bij ontbrekende `content` én `file_path` geeft de tool een foutmelding terug (req. 4.5). De server is opstartbaar via `uvx apa-citation-checker` zonder handmatige installatie (req. 4.6, 9.2.1).

**Valideert: Requirements 4.1–4.6**

### __main__.py (CLI)

```
Gebruik: python -m apa_citation_checker [opties] [bestand]

Opties:
  --stdin         Lees Markdown van stdin
  --check-links   Controleer bereikbaarheid van URLs (req. 7)
  --check-claims  Signaleer ongefundeerde beweringen (req. 8)
  --json          Geef uitvoer als JSON

Exitcodes:
  0  Alle bronnen geciteerd, geen dode links
  1  Ontbrekende inline verwijzingen of dode links gevonden
  2  Bestand niet gevonden of niet leesbaar
  3  Ongeldige argumenten (geen bestand en geen --stdin)
```

Rapport naar `stdout`, foutmeldingen naar `stderr` (req. 6.5). De `--json`-vlag geeft het volledige `CheckResult` als JSON-object, bruikbaar voor scripting en CI-integratie.

**Valideert: Requirements 3.4–3.6, 5.1–5.5, 6.3, 6.5**

## Configuratie en installatie

### Lokale ontwikkelomgeving

```bash
# Eenmalig: virtual environment aanmaken en afhankelijkheden installeren
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# Tests draaien
pytest
```

De `.venv/`-map staat in `.gitignore` en wordt niet gecommit (req. 9.2.3).

```toml
[project]
name = "apa-citation-checker"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "fastmcp>=2.0",
    "httpx>=0.27",
]

[project.optional-dependencies]
dev = ["pytest", "hypothesis"]

[project.scripts]
apa-citation-checker = "apa_citation_checker.server:main"
```

### Kiro-configuratie (~/.kiro/settings/mcp.json)

```json
{
  "mcpServers": {
    "apa-citation-checker": {
      "command": "uvx",
      "args": ["apa-citation-checker"]
    }
  }
}
```

### VS Code-configuratie (.vscode/mcp.json, commitbaar)

```json
{
  "servers": {
    "apa-citation-checker": {
      "type": "stdio",
      "command": "uvx",
      "args": ["apa-citation-checker"]
    }
  }
}
```

De `.vscode/mcp.json` wordt gecommit zodat collega-docenten zonder extra setup gebruik kunnen maken van de tool (req. 9.5.2).

## Correctheidseigenschappen

*Een eigenschap is een kenmerk of gedrag dat voor alle geldige uitvoeringen van een systeem moet gelden — een formele uitspraak over wat het systeem behoort te doen. Eigenschappen vormen de brug tussen leesbare specificaties en machinaal verifieerbare correctheidsgaranties.*

### Eigenschap 1: Elke geldige APA-bronregel levert een Source op

*Voor alle* Markdown-teksten met een `## Bronnen`-sectie geldt: elke regel in die sectie die voldoet aan het patroon `- Auteur. (jaar).` levert precies één `Source`-object op met de juiste `author`- en `year`-waarden.

**Valideert: Requirements 1.1, 1.2, 1.3**

---

### Eigenschap 2: Geciteerde bronnen worden altijd herkend

*Voor alle* documenten waarbij elke bron in de Bronsectie een overeenkomende inline verwijzing heeft in de documenttekst, geldt: `check_citations()` geeft een `CheckResult` terug met een lege `missing_citations`-lijst.

**Valideert: Requirements 2.1, 2.2, 3.2**

---

### Eigenschap 3: Ontbrekende inline verwijzingen worden altijd gerapporteerd

*Voor alle* documenten waarbij één of meer bronnen in de Bronsectie geen overeenkomende inline verwijzing hebben, geldt: `check_citations()` geeft een `CheckResult` terug waarbij `missing_citations` precies die bronnen bevat — niet meer, niet minder.

**Valideert: Requirements 2.1, 3.1, 3.3**

---

### Eigenschap 4: Hoofdletterongevoelige matching

*Voor alle* auteursnamen geldt: een inline verwijzing `(auteur, jaar)` matcht een bron `(Auteur, jaar)` ongeacht het gebruik van hoofd- of kleine letters in de auteursnaam.

**Valideert: Requirement 2.4**

---

### Eigenschap 5: Robuustheid bij ontbrekende of lege Bronsectie

*Voor alle* Markdown-documenten zonder `## Bronnen`-sectie of met een lege Bronsectie geldt: `check_citations()` gooit geen uitzondering en geeft een `CheckResult` terug met `missing_citations = []` en `has_sources_section = False` respectievelijk `total_sources = 0`.

**Valideert: Requirements 1.4, 1.5, 6.1, 6.2**

---

### Eigenschap 6: Sub-bullets tellen niet als bronnen

*Voor alle* Markdown-documenten waarbij de Bronsectie sub-bullets bevat (inspringende regels), geldt: `parse_sources()` telt uitsluitend de top-level bronregels en negeert sub-bullets.

**Valideert: Requirement 1.6**

---

### Eigenschap 7: Losse URL's met pad worden als waarschuwing gerapporteerd

*Voor alle* Markdown-documenten geldt: elke losse URL in de documenttekst buiten de Bronsectie die een pad bevat (bijv. `https://example.com/pagina`) en niet al in de Bronsectie staat, wordt gerapporteerd in `bare_urls` met `severity = "warning"`.

**Valideert: Requirements 10.1, 10.3, 10.4, 10.5**

---

### Eigenschap 8: Losse domeinnamen worden als informatieve melding gerapporteerd

*Voor alle* Markdown-documenten geldt: een losse URL die uitsluitend een domeinnaam is zonder pad (bijv. `https://example.com`) wordt gerapporteerd in `bare_urls` met `severity = "info"`, niet als fout of waarschuwing.

**Valideert: Requirement 10.2**

---

### Eigenschap 9: Ongefundeerde beweringen worden als waarschuwing gerapporteerd

*Voor alle* zinnen in de documenttekst die een van de gedefinieerde feitsclaim-patronen bevatten (bijv. "blijkt", "toont aan", "is bewezen") zonder inline verwijzing in dezelfde of aangrenzende zin, geldt: `find_unfounded_claims()` rapporteert die zin in `unfounded_claims` met `severity = "warning"`.

**Valideert: Requirements 8.1, 8.2, 8.3**

---

### Eigenschap 10: Claimcontrole is standaard uitgeschakeld

*Voor alle* documenten geldt: als `check_claims=False` (standaard), bevat `CheckResult.unfounded_claims` altijd een lege lijst, ongeacht de inhoud van het document.

**Valideert: Requirement 8.4**

---

## Teststrategie

### Testframework

- **Testrunner**: `pytest`
- **Property-based testing**: `hypothesis`
- Minimaal **50 iteraties** per property-test (geconfigureerd via `@settings(max_examples=50)`)

### Property-tests (hypothesis)

| Eigenschap | Beschrijving | Requirements |
|---|---|---|
| 1 | Elke geldige APA-bronregel levert een Source op | 1.1, 1.2, 1.3 |
| 2 | Geciteerde bronnen worden altijd herkend | 2.1, 2.2, 3.2 |
| 3 | Ontbrekende inline verwijzingen worden altijd gerapporteerd | 2.1, 3.1, 3.3 |
| 4 | Hoofdletterongevoelige matching | 2.4 |
| 5 | Robuustheid bij ontbrekende of lege Bronsectie | 1.4, 1.5, 6.1, 6.2 |
| 6 | Sub-bullets tellen niet als bronnen | 1.6 |
| 7 | Losse URL's met pad worden als waarschuwing gerapporteerd | 10.1, 10.3, 10.4, 10.5 |
| 8 | Losse domeinnamen worden als informatieve melding gerapporteerd | 10.2 |
| 9 | Ongefundeerde beweringen worden als waarschuwing gerapporteerd | 8.1, 8.2, 8.3 |
| 10 | Claimcontrole is standaard uitgeschakeld | 8.4 |

### Unit-tests

- Specifieke APA-bronregels: enkelvoudige auteur, meerdere woorden, organisatie als auteur
- `z.d.` vs. `2026` vs. `2025` als jaar
- Zwevende inline verwijzing → gerapporteerd als `orphaned_refs` (waarschuwing, geen fout)
- Inline verwijzing in een codeblok (mag niet matchen)
- CLI: exitcode 0 bij volledig geciteerd document
- CLI: exitcode 1 bij ontbrekende verwijzingen
- CLI: exitcode 2 bij niet-bestaand bestand
- CLI: exitcode 3 bij ontbrekende argumenten
- MCP: `content`-parameter heeft voorrang boven `file_path` (req. 4.4)
- MCP: foutmelding bij ontbrekende `content` én `file_path` (req. 4.5)
- Linkcontrole: timeout na 10 seconden (gemockte server via `httpx`)
- Linkcontrole: HTTP 404 gerapporteerd als dode link
- Losse URL's: URL met pad → `severity = "warning"`; domein-only → `severity = "info"`
- Losse URL's: URL die al in Bronsectie staat wordt niet gerapporteerd (req. 10.4)
- Claimcontrole: zin met "blijkt" zonder verwijzing → gerapporteerd als waarschuwing
- Claimcontrole: zin met "blijkt" mét verwijzing in aangrenzende zin → niet gerapporteerd

### CI-integratie

De tool is aanroepbaar als `python -m apa_citation_checker adr/*.md` in de GitLab CI-pipeline. Exitcode 1 blokkeert de pipeline bij ontbrekende inline verwijzingen.

## Bronnen

- Schmid, P. (2025). *MCP is Not the Problem, It's your Server: Best Practices for Building MCP Servers*. Geraadpleegd op 10 mei 2026, van https://www.philschmid.de/mcp-best-practices
  - Geciteerd bij het architectuurprincipe in het overzicht: "When building an MCP Server you are not building infrastructure, you are building an interface for AI agents." — bevestigt dat de ACC klassieke code is achter een MCP-adapter, niet zelf een AI.
- Scribbr. (z.d.). *Moet je een bronvermelding toevoegen voor algemene kennis?*. Geraadpleegd op 10 mei 2026, van https://www.scribbr.nl/veel-gestelde-vragen/moet-je-een-bronvermelding-toevoegen-voor-algemene-kennis/
  - Geciteerd bij de toelichting op `orphanedRefs`: "In de meeste gevallen hoef je geen bronvermelding toe te voegen als je iets bespreekt dat tot algemene kennis behoort." — onderbouwt waarom zwevende inline verwijzingen een waarschuwing zijn, geen fout.
- University of Portland Library. (z.d.). *APA: Websites*. Geraadpleegd op 10 mei 2026, van https://libguides.up.edu/apa/websites
  - Geciteerd bij de toelichting op `orphanedRefs`: "If you mention a website in general, do not create a reference list entry or an in-text citation." — bevestigt dat niet elke URL een formele bronvermelding vereist.
