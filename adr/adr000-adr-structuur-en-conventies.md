# ADR 000 — ADR-structuur en -conventies

## Status

Geaccepteerd

## Context

We gebruiken Architecture Decision Records (ADR's) om ontwerpkeuzes vast te leggen. Het oorspronkelijke ADR-formaat van Nygard (2011) kent vier secties: Context, Decision, Status en Consequences. Wij breiden dit uit met twee secties: Options (overwogen alternatieven) en Bronnen (APA-referenties).

Diverse ADR-templates (waaronder MADR) voegen een aparte H2-sectie "Decision Drivers" toe. Dit leidt tot wildgroei in secties en maakt de structuur minder voorspelbaar. De criteria die een keuze sturen horen bij de probleemschets — dus bij Context.

### Criteria voor deze meta-keuze

- Voorspelbare structuur: elke ADR heeft dezelfde H2-secties
- Traceerbaarheid: criteria zijn vindbaar zonder een aparte sectie
- Compatibiliteit met Nygard's oorspronkelijke formaat
- Ruimte voor APA-bronvermelding (conform AGENTS.md)

## Beslissing

Elke ADR heeft precies zes H2-secties, in deze volgorde:

1. `## Status` — Voorgesteld / Geaccepteerd / Vervangen / Ingetrokken
2. `## Context` — Probleemschets, achtergrond, en criteria (als H3 `### Criteria` of inline)
3. `## Overwogen opties` — Alternatieven met voor- en nadelen
4. `## Beslissing` — De gekozen optie met onderbouwing
5. `## Gevolgen` — Positieve en negatieve consequenties
6. `## Bronnen` — APA-referenties

De sectie "Decision Drivers" bestaat niet als H2. Criteria die de keuze sturen worden opgenomen in Context, eventueel onder een H3 `### Criteria`.

### Naamgeving

- Bestandsnaam: `adrNNN-korte-beschrijving.md` (drie cijfers, kebab-case)
- H1-titel: `# ADR NNN — Korte beschrijving`

## Overwogen opties

### Optie A — MADR-template met Decision Drivers als H2

Het Markdown Any Decision Records-template (Zdun et al.) voegt "Decision Drivers" toe als aparte H2.

**Voordelen:** breed gebruikt in open-source projecten.

**Nadelen:** extra sectie die overlap heeft met Context; minder voorspelbaar wanneer sommige ADR's het wel en andere het niet gebruiken.

### Optie B — Nygard + Options + Bronnen (gekozen)

Nygard's vier secties aangevuld met "Overwogen opties" en "Bronnen". Criteria als onderdeel van Context.

**Voordelen:** compact, voorspelbaar, geen overlap.

**Nadelen:** wijkt af van MADR; bestaande ADR's moeten worden aangepast.

## Gevolgen

Positief:

- Elke ADR heeft een voorspelbare structuur; reviewers weten waar ze wat vinden.
- Geen verwarring over waar criteria thuishoren.

Negatief:

- Bestaande ADR's (001–013) moeten worden aangepast: "Decision Drivers" verplaatsen naar Context als H3.
- De filmfestival-submodule heeft eigen ADR's met dezelfde afwijking; die vallen buiten scope van deze ADR (eigen repo, eigen conventies).

## Bronnen

- Nygard, M. (2011). *Documenting Architecture Decisions*. Geraadpleegd op 20 mei 2026, van https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
