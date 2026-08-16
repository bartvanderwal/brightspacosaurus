# ADR 014 — Reader-PDF-conversie via Brightspacosaurus, niet via apart shell-script

## Status

Geaccepteerd (mei 2026)

## Context

Readers (naslagmateriaal zoals de Git-reader, PlantUML-essentials, geheugenmodellen) worden als PDF aangeboden in Brightspace. De conversie van Markdown naar PDF via pandoc/xelatex moet ergens worden aangestuurd.

Er waren twee opties:

1. Een apart shell-script (bv. `scripts/build-reader-pdfs.sh`) dat pandoc aanroept.
2. Integratie in Brightspacosaurus als onderdeel van de bestaande `prepare`-stap.

Het shell-script bestond al als eerste implementatie. Tegelijkertijd is Brightspacosaurus de centrale build-pipeline voor alle afgeleide assets (HTML-lespagina's, QTI-quizzen, `.imscc`-pakket). De reader-PDF's zijn eveneens afgeleide assets die in het Brightspace-pakket terechtkomen. Allerlei logica en fouten rondom in pandoc gebruikte nieuwe namen van flags/opties en het goed HTML encoderen van bron kunnen op beide plekken misgaan, dus dit moet op een plek staan. Wel komen allen de studenten pdf readers in Brightspce en de docenten readers NIET. ook al zouden die evt. op een verborgen pagina gezet kunnen worden, zou dit met enkele verkeerde toggle klik zichtbaar kunnen worden. Dus docenten readers vindt je in versiebeheer, of verspreid je via Teams of e-mail o.i.d.

### Criteria

- Eén build-commando (`npm run build:brightspace`) moet alle afgeleide assets produceren
- Testbaarheid: unit tests voor de conversie-logica (padresolutie, foutafhandeling, bestandsnaamconventie)
- CI-integratie: de GitLab CI-pipeline draait dezelfde stap als lokale ontwikkelaars
- Onderhoudbaarheid: pandoc-opties op één plek beheren, niet in een shell-script én in TypeScript

## Overwogen opties

### Optie A — Apart shell-script (`build-reader-pdfs.sh`)

**Voordelen:**

- Eenvoudig, direct aanroepbaar, geen Deno-kennis nodig.
- Onafhankelijk van de rest van Brightspacosaurus.

**Nadelen:**

- Tweede build-stap die apart moet worden aangeroepen en onderhouden.
- Pandoc-opties (marges, fonts, highlight-style) staan op twee plekken als Brightspacosaurus ook pandoc-gerelateerde logica bevat.
- Geen unit tests: shell-scripts zijn lastig geïsoleerd te testen.
- Foutafhandeling is beperkt (exit codes, geen gestructureerde foutberichten).
- CI-pipeline moet twee aparte stappen configureren.

### Optie B — Integratie in Brightspacosaurus (gekozen)

**Voordelen:**

- Eén `deno run ... prepare`-commando produceert alle afgeleide assets (HTML, QTI, PDF).
- Unit tests voor `convertReaderToPdf` (padresolutie, foutafhandeling, bestandsnaamconventie) draaien in dezelfde test-suite als de rest.
- Pandoc-opties staan op één plek (`reader-pdf-converter.ts` + `reader-header.tex`).
- Gestructureerde foutafhandeling: per reader een duidelijke foutmelding met bestandspad en stderr-output.
- CI-pipeline heeft één stap; lokale en CI-build zijn identiek.
- Graceful degradation: als pandoc niet geïnstalleerd is, toont Brightspacosaurus een waarschuwing en slaat de PDF-stap over — de rest van de build draait door.

**Nadelen:**

- Afhankelijkheid van Deno voor een taak die in principe ook met een shell-script kan.
- Iets meer code dan een 10-regelig shell-script.

## Beslissing

We kiezen voor optie B: reader-PDF-conversie is onderdeel van Brightspacosaurus. Het shell-script `scripts/build-reader-pdfs.sh` wordt niet meer gebruikt en kan worden verwijderd.

De rationale: Brightspacosaurus is de single source of truth voor alle afgeleide assets. Een apart script introduceert een tweede codepath met eigen pandoc-opties, eigen foutafhandeling en eigen CI-configuratie. Dat leidt tot divergentie en dubbel onderhoud.

## Gevolgen

Positief:

- `npm run build:brightspace` (of `deno task prepare`) produceert alles: HTML, QTI, reader-PDF's, `.imscc`.
- Pandoc-opties (marges, engine, highlight-style, LaTeX-header) staan op één plek.
- Unit tests dekken de conversie-logica af.
- CI-pipeline is eenvoudiger (één stap).

Negatief:

- Ontwikkelaars die alleen een reader-PDF willen genereren moeten de hele Brightspacosaurus-prepare draaien (of de functie direct aanroepen via een Deno-script).
- Pandoc blijft een externe afhankelijkheid die lokaal geïnstalleerd moet zijn (of in CI via `apt-get`).

## Verwijzingen

- ADR 008 — Brightspacosaurus runtime: Deno vs. Node.js
- ADR 010 — unified pipeline voor Markdown-conversie
- `scripts/brightspacosaurus/src/reader-pdf-converter.ts` — implementatie
- `scripts/brightspacosaurus/assets/reader-header.tex` — LaTeX-header voor TOC-pagebreak en afbeeldingsschaling
