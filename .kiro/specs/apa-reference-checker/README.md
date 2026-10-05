# APA Citation Checker MCP

Een Python MCP-server en CLI-tool die Markdown-documenten controleert op naleving van de APA-citeerregels uit `AGENTS.md`.

## Wat doet het?

- Controleert of elke bron in de `## Bronnen`-sectie ook als inline verwijzing `(Auteur, jaar)` voorkomt in de tekst
- Signaleert zwevende inline verwijzingen zonder overeenkomende bron (waarschuwing)
- Optioneel: controleert of URL's in de Bronsectie bereikbaar zijn (`--check-links`)

## Implementatie: Python + FastMCP

De tool is gebouwd met [FastMCP](https://gofastmcp.com/) — het standaard framework voor Python MCP-servers. FastMCP implementeert het MCP-protocol direct (JSON-RPC 2.0, stdio en SSE transport) en is aanroepbaar via `uvx` zonder voorafgaande installatie.

<video src="assets/f-watercolor-waves-4-animated.mp4" width="600" autoplay loop muted></video>

*FastMCP — animatie van de officiële FastMCP-site ([gofastmcp.com](https://gofastmcp.com/))*

## Alternatief overwogen: Deno MCP

Voor Deno bestaat ook een MCP-template: [deno-mcp-template](https://github.com/phughesmcr/deno-mcp-template). Dit is overwogen als optie C in ADR 013, maar niet gekozen vanwege de minder volwassen Deno MCP SDK en het ontbreken van een `uvx`-equivalent voor zero-install deployment.

![Deno MCP template](assets/deno-mcp.png)

*Deno MCP template — [github.com/phughesmcr/deno-mcp-template](https://github.com/phughesmcr/deno-mcp-template)*

## Spec-bestanden

Deze feature is uitgewerkt via spec-driven development in Kiro. Dat betekent dat de implementatie vooraf is doorlopen in drie stappen: eerst de functionele eisen vastleggen, dan het ontwerp uitwerken, en tot slot de implementatietaken definiëren. Elke stap bouwt voort op de vorige en is reviewbaar voordat de volgende begint.

De eisen zijn geformuleerd in EARS-notatie (Easy Approach to Requirements Syntax; Mavin, z.d.) — een gestructureerde schrijfwijze voor natuurlijke taal die ambiguïteit vermindert via vaste patronen zoals `WHEN ... SHALL ...` en `IF ... THEN SHALL ...`. EARS onderscheidt functionele eisen (wat het systeem doet) en niet-functionele eisen (kwaliteitsattributen zoals deployability, robuustheid en onderhoudbaarheid). Beide typen staan in `requirements.md`.

De drie spec-bestanden voor deze feature:

- [requirements.md](requirements.md) — functionele én niet-functionele eisen met acceptatiecriteria in EARS-notatie
- [design.md](design.md) — de architectuur, data models, componenten en formele correctheidseigenschappen die de implementatie moet voldoen
- [tasks.md](tasks.md) — de concrete implementatietaken, inclusief property-based tests per correctheidseis *(nog aan te maken)*

## Gerelateerde ADR's

- [ADR 013](../../../adr/adr013-mcp-server-ontwerp-apa-citation-checker.md) — keuze voor Python + FastMCP boven Deno/TypeScript, met vergelijking van bestaande MCP-servers

## Bronnen

- Mavin, A. (z.d.). *Adopting the EARS notation to improve requirements engineering*. In Jama Software, *Requirements Management Guide*. Geraadpleegd op 10 mei 2026, van https://www.jamasoftware.com/requirements-management-guide/writing-requirements/adopting-the-ears-notation-to-improve-requirements-engineering
  - Geciteerd bij de keuze voor EARS-notatie (Mavin, z.d.): "EARS is a lightweight approach that is easy to learn, provides a quick return on investment, and is popular with users because it is intuitive and mirrors normal use of English."
