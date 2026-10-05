# apa-citation-checker

Controleert Markdown-documenten op naleving van de APA-citeerregels uit `AGENTS.md`:

- Elke bron in `## Bronnen` moet ook als inline verwijzing `(Auteur, jaar)` in de tekst staan.
- Optioneel: controleer of URL's in de Bronsectie bereikbaar zijn (`--check-links`).
- Optioneel: signaleer zinnen met feitsclaims zonder inline verwijzing (`--check-claims`).

Beschikbaar als **MCP-server** (voor Kiro en VS Code met GitHub Copilot) en als **standalone CLI**.

---

## Lokale setup

```bash
# Eenmalig: virtual environment aanmaken en afhankelijkheden installeren
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

Tests draaien:

```bash
pytest
```

---

## CLI-gebruik

```bash
# Controleer een bestand
python -m apa_citation_checker pad/naar/bestand.md

# Lees van stdin
cat bestand.md | python -m apa_citation_checker --stdin

# Controleer ook of URL's bereikbaar zijn
python -m apa_citation_checker --check-links bestand.md

# Signaleer zinnen met feitsclaims zonder verwijzing
python -m apa_citation_checker --check-claims bestand.md

# Geef uitvoer als JSON (handig voor scripting)
python -m apa_citation_checker --json bestand.md
```

### Exitcodes

| Code | Betekenis                                              |
|------|--------------------------------------------------------|
| `0`  | Alle bronnen geciteerd, geen dode links                |
| `1`  | Ontbrekende inline verwijzingen of dode links gevonden |
| `2`  | Bestand niet gevonden of niet leesbaar                 |
| `3`  | Geen bestand opgegeven en geen `--stdin`               |

Rapport gaat naar `stdout`, foutmeldingen naar `stderr`.

---

## MCP-configuratie

De tool is aanroepbaar via `uvx` zonder handmatige installatie.

### Kiro (`~/.kiro/settings/mcp.json`)

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

### VS Code (`.vscode/mcp.json`)

Dit bestand staat al in de repository en is direct bruikbaar:

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

Na het toevoegen van de configuratie is de tool `apa_check_citations` beschikbaar in Kiro of VS Code met GitHub Copilot. Vraag de assistent bijvoorbeeld: *"Check adr/adr013.md op APA-citeerregels."*
