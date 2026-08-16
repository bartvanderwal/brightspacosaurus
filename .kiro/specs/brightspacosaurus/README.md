# Brightspacosaurus — Spec

Deze map bevat de feature-spec voor Brightspacosaurus, uitgewerkt via spec-driven development in Kiro. De spec doorloopt drie stappen: requirements → design → tasks. Elke stap is reviewbaar voordat de volgende begint.

De implementatie staat in [`scripts/brightspacosaurus/`](../../../scripts/brightspacosaurus/) met een eigen README voor installatie en gebruik.

## Spec-bestanden

Deze feature is uitgewerkt via spec-driven development in Kiro. Dat betekent dat de implementatie vooraf is doorlopen in drie stappen: eerst de functionele eisen vastleggen, dan het ontwerp uitwerken, en tot slot de implementatietaken definiëren. De eisen zijn geformuleerd in EARS-notatie (Mavin, z.d.).

- [requirements.md](requirements.md) — functionele én niet-functionele eisen met acceptatiecriteria in EARS-notatie
- [design.md](design.md) — architectuur, componenten, correctheidseigenschappen en teststrategie
- [tasks.md](tasks.md) — implementatietaken met property-based tests per correctheidseis

## Gerelateerde ADR's

- [ADR 008](../../../adr/adr008-runtime-deno-vs-nodejs.md) — keuze voor Deno boven Node.js
- [ADR 009](../../../adr/adr009-docusaurus-voor-lokale-studentensite.md) — Docusaurus voor lokale studentensite
- [ADR 010](../../../adr/adr010-unified-pipeline-voor-markdown-conversie.md) — unified (remark/rehype) voor Markdown→HTML
- [ADR 011](../../../adr/adr011-rijke-inhoud-in-quizvragen.md) — rijke inhoud in QTI quizvragen

## Bronnen

- Mavin, A. (z.d.). *Adopting the EARS notation to improve requirements engineering*. In Jama Software, *Requirements Management Guide*. Geraadpleegd op 10 mei 2026, van https://www.jamasoftware.com/requirements-management-guide/writing-requirements/adopting-the-ears-notation-to-improve-requirements-engineering
  - Geciteerd bij de keuze voor EARS-notatie (Mavin, z.d.): "EARS is a lightweight approach that is easy to learn, provides a quick return on investment, and is popular with users because it is intuitive and mirrors normal use of English."
