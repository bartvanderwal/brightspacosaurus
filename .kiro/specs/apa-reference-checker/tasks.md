# Implementatieplan: APA Citation Checker MCP

## Overzicht

`apa-citation-checker` is een Python MCP-server en CLI-tool die Markdown-documenten controleert op naleving van de APA-citeerregels. De implementatie volgt de architectuur uit het ontwerpdocument: `parser.py` → `checker.py` → `server.py` / `__main__.py`. De code staat in `scripts/apa-reference-checker/`.

## Taken

- [x] 1. Projectstructuur en basisopzet
  - `scripts/apa-reference-checker/` aangemaakt met `pyproject.toml`, `apa_reference_checker/__init__.py`, en modules
  - `fastmcp>=2.0` en `httpx>=0.27` als afhankelijkheden; `hypothesis` en `pytest` als dev-afhankelijkheden
  - `tests/` map aangemaakt met `__init__.py`
  - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 2. Parser
  - [x] 2.1 Implementeer `parse_sources()`, `parse_inline_refs()` en `find_sources_section()` in `parser.py`
    - Regex-patronen uit het ontwerpdocument
    - Sub-bullets worden overgeslagen (inspringende regels)
    - Lege lijst bij ontbrekende of lege Bronsectie
    - URL-extractie uit bronregels
    - _Requirements: 1.1–1.6_

  - [x]* 2.2 Schrijf property-test voor Eigenschap 1: Elke geldige APA-bronregel levert een Source op
    - `# Feature: apa-citation-checker, Eigenschap 1`
    - **Valideert: Requirements 1.1, 1.2, 1.3**

  - [x]* 2.3 Schrijf property-test voor Eigenschap 6: Sub-bullets tellen niet als bronnen
    - `# Feature: apa-citation-checker, Eigenschap 6`
    - **Valideert: Requirement 1.6**

- [x] 3. Checker (kernlogica)
  - [x] 3.1 Implementeer `check_citations()` in `checker.py`
    - Koppelt `parse_sources()` en `parse_inline_refs()`
    - Matchinglogica: exacte match, prefix-match, eerste-woord-match, et al.-match (hoofdletterongevoelig)
    - Rapporteert `missing_citations` en `orphaned_refs`
    - _Requirements: 2.1–2.5, 3.1–3.3_

  - [x]* 3.2 Schrijf property-test voor Eigenschap 2: Geciteerde bronnen worden altijd herkend
    - `# Feature: apa-citation-checker, Eigenschap 2`
    - **Valideert: Requirements 2.1, 2.2, 3.2**

  - [x]* 3.3 Schrijf property-test voor Eigenschap 3: Ontbrekende inline verwijzingen worden altijd gerapporteerd
    - `# Feature: apa-citation-checker, Eigenschap 3`
    - **Valideert: Requirements 2.1, 3.1, 3.3**

  - [x]* 3.4 Schrijf property-test voor Eigenschap 4: Hoofdletterongevoelige matching
    - `# Feature: apa-citation-checker, Eigenschap 4`
    - **Valideert: Requirement 2.4**

  - [x]* 3.5 Schrijf property-test voor Eigenschap 5: Robuustheid bij ontbrekende of lege Bronsectie
    - `# Feature: apa-citation-checker, Eigenschap 5`
    - **Valideert: Requirements 1.4, 1.5, 6.1, 6.2**

- [x] 4. Controlepunt — parser en checker
  - `pytest` uitgevoerd; alle tests slagen
  - Handmatig getest met ADR-bestanden uit de repo

- [x] 5. CLI-interface
  - [x] 5.1 Implementeer `__main__.py` met argumentparsing
    - Bestandspad als argument en `--stdin` ondersteund
    - Usage getoond bij ontbrekende argumenten (exitcode 3)
    - Rapport naar `stdout`, fouten naar `stderr`
    - Exitcodes: 0 (ok), 1 (ontbrekende verwijzingen), 2 (bestand niet gevonden), 3 (ontbrekende argumenten)
    - _Requirements: 5.1–5.5, 3.4–3.6, 6.3, 6.5_

  - [x] 5.2 Voeg `--check-links`- en `--check-claims`-vlaggen toe aan `__main__.py`
    - Geef `check_links=True` respectievelijk `check_claims=True` door aan `check_citations()`
    - _Requirements: 7.1, 8.1_

- [x] 6. MCP-server
  - [x] 6.1 Implementeer `server.py` met FastMCP
    - Tool `apa_check_citations` met parameters `content`, `file_path`, `check_links`, `check_claims`
    - `content` heeft voorrang boven `file_path`
    - Foutmelding bij ontbrekende `content` én `file_path`
    - _Requirements: 4.1–4.6_

  - [x]* 6.2 Schrijf unit-tests voor `server.py` in `tests/test_server.py`
    - Test: `content` heeft voorrang boven `file_path` (req. 4.4)
    - Test: foutmelding bij ontbrekende `content` én `file_path` (req. 4.5)
    - _Requirements: 4.4, 4.5_

- [x] 7. Controlepunt — CLI en MCP
  - Alle tests in `test_server.py` slagen
  - MCP-server handmatig getest via Kiro

- [x] 8. Losse URL-detectie
  - [x] 8.1 Implementeer `bare_url_checker.py`
    - Detecteer losse URLs buiten Bronsectie (niet in `[tekst](url)`, niet tussen haakjes)
    - Domein-only → severity `"info"`; URL met pad → severity `"warning"`
    - Sla URLs over die al in de Bronsectie staan
    - _Requirements: 10.1–10.5_

  - [x] 8.2 Integreer `bare_url_checker` in `checker.py`
    - Roep `find_bare_urls()` aan vanuit `check_citations()` en vul `CheckResult.bare_urls`
    - _Requirements: 10.1, 10.5_

  - [ ]* 8.3 Schrijf property-test voor Eigenschap 7: Losse URL's met pad worden als waarschuwing gerapporteerd
    - `# Feature: apa-citation-checker, Eigenschap 7`
    - Genereer willekeurige Markdown-documenten met losse URLs die een pad bevatten
    - Verifieer dat elke losse URL met pad in `bare_urls` staat met `severity = "warning"`
    - **Valideert: Requirements 10.1, 10.3, 10.4, 10.5**

  - [ ]* 8.4 Schrijf property-test voor Eigenschap 8: Losse domeinnamen worden als informatieve melding gerapporteerd
    - `# Feature: apa-citation-checker, Eigenschap 8`
    - Genereer willekeurige Markdown-documenten met domein-only URLs (zonder pad)
    - Verifieer dat elke domein-only URL in `bare_urls` staat met `severity = "info"`
    - **Valideert: Requirement 10.2**

- [x] 9. Linkcontrole
  - [x] 9.1 Implementeer `link_checker.py` met async httpx
    - Parallel HEAD-verzoeken voor alle URLs in de Bronsectie via `asyncio.gather`
    - Timeout na 10 seconden; rapporteer als `"timeout"`
    - HTTP-status ≥ 400 of verbindingsfout → `DeadLink`
    - _Requirements: 7.1–7.6_

  - [x] 9.2 Integreer `link_checker` in `checker.py`
    - Roep `check_links()` aan als `check_links=True` en vul `CheckResult.dead_links`
    - _Requirements: 7.1, 7.4_

  - [ ]* 9.3 Schrijf unit-tests voor `link_checker.py`
    - Test: HTTP 404 gerapporteerd als dode link (gemockte httpx-client via `respx` of `pytest-httpx`)
    - Test: timeout na 10 seconden → `DeadLink` met status `"timeout"`
    - Test: HTTP 200 → URL niet in `dead_links`
    - _Requirements: 7.2, 7.5, 7.3_

- [x] 10. Claimcontrole
  - [x] 10.1 Implementeer `claim_checker.py`
    - Detecteer zinnen met patronen als "blijkt", "toont aan", "is bewezen", "onderzoek wijst uit", "studies tonen"
    - Markeer alleen als ongefundeerd als er geen inline verwijzing in dezelfde of aangrenzende zin staat
    - Geef `UnfoundedClaim` terug met `severity = "warning"`
    - _Requirements: 8.1–8.5_

  - [x] 10.2 Integreer `claim_checker` in `checker.py`
    - Roep `find_unfounded_claims()` aan als `check_claims=True` en vul `CheckResult.unfounded_claims`
    - _Requirements: 8.1, 8.4_

  - [ ]* 10.3 Schrijf property-test voor Eigenschap 9: Ongefundeerde beweringen worden als waarschuwing gerapporteerd
    - `# Feature: apa-citation-checker, Eigenschap 9`
    - Genereer willekeurige zinnen met feitsclaim-patronen zonder inline verwijzing in dezelfde/aangrenzende zin
    - Verifieer dat elke zin in `unfounded_claims` staat met `severity = "warning"`
    - **Valideert: Requirements 8.1, 8.2, 8.3**

  - [ ]* 10.4 Schrijf property-test voor Eigenschap 10: Claimcontrole is standaard uitgeschakeld
    - `# Feature: apa-citation-checker, Eigenschap 10`
    - Genereer willekeurige Markdown-documenten met feitsclaims
    - Verifieer dat `check_citations(md, check_claims=False)` altijd `unfounded_claims == []` oplevert
    - **Valideert: Requirement 8.4**

- [x] 11. Bronsectie-zuiverheidscontrole
  - [x] 11.1 Implementeer `_check_source_section_purity()` in `checker.py`
    - Detecteer sub-bullets (inspringende tekst) → `SourceSectionIssue` met code `ARC-500`
    - Detecteer niet-bronregels → `SourceSectionIssue` met code `ARC-501`
    - Integreer in `check_citations()` en vul `CheckResult.source_section_issues`
    - _Requirements: 11.1–11.3_

  - [ ]* 11.2 Schrijf unit-tests voor bronsectie-zuiverheidscontrole
    - Test: sub-bullet in Bronsectie → waarschuwing met code `ARC-500`
    - Test: losse zin in Bronsectie → waarschuwing met code `ARC-501`
    - Test: schone Bronsectie (alleen bronregels en lege regels) → geen issues
    - _Requirements: 11.1, 11.2, 11.3_

- [x] 12. Documentkwaliteitsscore
  - [x] 12.1 Implementeer score-berekening in `checker.py` of nieuw bestand `grader.py`
    - Letterschaal: A (geen fouten, geen waarschuwingen), B (geen fouten, enkele waarschuwingen), C (1–2 ontbrekende inline verwijzingen), D (3+ ontbrekende of dode links), F (geen Bronsectie terwijl document claims bevat)
    - Voeg `grade`-veld toe aan `CheckResult`
    - Maak drempelwaarden configureerbaar via gewichtsfactoren
    - _Requirements: 12.1, 12.2, 12.4_

  - [x] 12.2 Integreer score in CLI-uitvoer en MCP-respons
    - Toon score prominent bovenaan CLI-tekstrapportage
    - Neem `grade` op in JSON-uitvoer en MCP-resultaat
    - _Requirements: 12.2, 12.3_

  - [ ]* 12.3 Schrijf unit-tests voor score-berekening
    - Test: document zonder fouten/waarschuwingen → grade A
    - Test: document met alleen waarschuwingen (bare_urls, orphaned_refs) → grade B
    - Test: document met 1–2 ontbrekende verwijzingen → grade C
    - Test: document met 3+ ontbrekende verwijzingen of dode links → grade D
    - Test: document zonder Bronsectie met claims → grade F
    - _Requirements: 12.1_

- [-] 13. CLI-rapportage completeren
  - [x] 13.1 Voeg `bare_urls` toe aan CLI-tekstuitvoer
    - Toon losse URLs als aparte sectie in het rapport met severity-indicatie
    - _Requirements: 10.5_

  - [x] 13.2 Voeg `source_section_issues` toe aan CLI-tekstuitvoer
    - Toon bronsectie-issues als aparte sectie met foutcode en regelnummer
    - _Requirements: 11.3_

  - [-] 13.3 Voeg `dead_links` toe aan CLI-tekstuitvoer
    - Toon dode links als aparte sectie wanneer `--check-links` actief is
    - Toon URL, statuscode en foutmelding per dode link
    - _Requirements: 7.2_

- [x] 14. Configuratie en deployment
  - [x] 14.1 Maak `.vscode/mcp.json` aan met uvx-configuratie
    - Commitbaar zodat collega-docenten zonder extra setup de tool kunnen gebruiken
    - _Requirements: 9.5.2_

  - [x] 14.2 Documenteer installatie in `scripts/apa-reference-checker/README.md`
    - Beschrijf lokale setup (venv, pip install -e), CLI-gebruik, en MCP-configuratie
    - _Requirements: 9.2, 9.5_

- [ ] 15. Eindcontrole
  - Voer `pytest` uit; zorg dat alle tests slagen
  - Controleer requirements 1–12 met ADR-bestanden uit de repo
  - Verifieer dat CLI-exitcodes correct zijn (0, 1, 2, 3)
  - Verifieer dat CLI-rapportage alle secties toont (bare_urls, dead_links, source_section_issues, grade)

## Opmerkingen

- De code staat in `scripts/apa-reference-checker/` (package: `apa_reference_checker`)
- Taken gemarkeerd met `*` zijn optioneel en kunnen worden overgeslagen voor een snellere MVP
- Property-tests valideren de correctheidseigenschappen uit het ontwerpdocument
- Requirement 12 (kwaliteitsscore) is een wanthave en kan als laatste worden opgepakt
- Resterende werk: property-tests (8.3, 8.4, 10.3, 10.4), unit-tests (9.3, 11.2), kwaliteitsscore (12), CLI-rapportage (13), eindcontrole (15)
