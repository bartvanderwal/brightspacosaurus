# ADR 016 — Diagramrendering via remark-kroki-a11y

## Status

Geaccepteerd

## Context

Brightspacosaurus moet PlantUML- en Mermaid-diagrammen in lespagina's renderen naar Brightspace HTML. Brightspace draait geïmporteerde topic-content in een beperkte iframe-omgeving waar custom JavaScript niet betrouwbaar is als interactiemechanisme. Tegelijk moet de diagramlogica niet opnieuw in BSO worden gebouwd: rendering, broncode-disclosure, natuurlijke-taalbeschrijving en labels bestaan al in `remark-kroki-a11y`.

De feature-specs staan in `.kiro/specs/diagram-rendering-a11y/` en `specs/001-diagram-rendering-a11y/`.

## Beslissing

BSO registreert `remark-kroki-a11y` in-process in de bestaande unified pipeline. De gedeelde configuratie wordt opgebouwd in `src/diagram-config.ts`, zodat BSO en de Docusaurus-preview dezelfde provideropties kunnen gebruiken.

Voor Brightspace past BSO de provideroutput dun aan in `src/diagram-adapter.ts`: tabpanelen worden omgezet naar native `<details>/<summary>` disclosures, en diagrammen krijgen deterministische ARIA-relaties. BSO herbouwt geen diagramdescriptions of labels.

Statische diagramvalidatie staat apart in `src/diagram-validation.ts`, zodat een toekomstige lint-route dezelfde authoring checks kan hergebruiken zonder Kroki aan te roepen.

Renderfouten worden gemodelleerd als `DiagramError` met categorie:

- `kroki-unreachable`
- `invalid-source`
- `invalid-parameter`

`diagrams.failOnError` bepaalt of BSO faalt of waarschuwt en het originele fenced code block behoudt.

## Gevolgen

Positief:

- Een bron van waarheid voor rendering en accessibility-inhoud blijft `remark-kroki-a11y`.
- Brightspace-output werkt zonder client-side JavaScript.
- Configuratie, preview en productie delen dezelfde option mapper.
- Auteurfouten kunnen voor netwerk-rendering worden gemeld.

Negatief:

- `prepare` heeft netwerktoegang nodig naar Kroki, tenzij fallback of een lokale service wordt gebruikt.
- Mermaid op lokale Kroki vereist een companion-container.
- De HTML-output is afhankelijk van de publieke contracten van `remark-kroki-a11y`; BSO moet bij upstream HTML-wijzigingen de adaptertests blijven draaien.

## Niet Gekozen

- Diagramrendering opnieuw implementeren in BSO: afgewezen omdat dit de accessibility- en beschrijvingslogica dupliceert.
- Een Node-subproces voor rendering: afgewezen omdat de Deno npm-compat route werkt.
- JavaScript-tabcontrols in Brightspace-output: afgewezen omdat Brightspace custom scripts beperkt.
