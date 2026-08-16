# ADR 011 — Rijke inhoud in quizvragen: HTML in QTI mattext

## Status

Geaccepteerd

## Context

Brightspacosaurus genereert QTI 1.2 XML voor import in Brightspace. Quizvragen en antwoordopties bevatten in de bronbestanden (quiz-Markdown) regelmatig rijke inhoud: inline code (backtick-notatie), vetnaam, cursief, en verwijzingen naar technische termen die in monospace weergegeven horen te worden.

Voorbeelden uit de bestaande quizbestanden in `6.3.Studentenmateriaal/`:

- `` `pom.xml` ``, `` `@Autowired` ``, `` `mvn compile` `` (week 2, Maven-quiz)
- `` `querySelector(...)` ``, `` `querySelectorAll(...)` `` (week 5, DOM-quiz)
- `` `findBy...` ``, `` `waitFor(...)` ``, `` `apiClient` `` (week 6, React-testquiz)
- `` `MSW` ``, `` `Y-statement` `` (week 6, teststrategie-quiz)

Geen van de huidige quizbestanden bevat fenced code blocks (meerdere regels code) of afbeeldingen. Inline code is echter al aanwezig in vrijwel alle quizreeksen vanaf week 2.

De bestaande handmatig gegenereerde QTI XML (bijv. `quiz-2.2-di-qti.xml`) gebruikt `texttype="text/html"` in `mattext`-elementen, maar converteert de Markdown-bronnen naar platte tekst — backticks worden gestript zonder HTML-equivalent. Dit betekent dat technische termen als `` `@Autowired` `` in Brightspace als gewone tekst verschijnen, zonder monospace-opmaak.

### Wat Brightspace accepteert in QTI mattext

Het QTI 1.2-formaat ondersteunt `texttype="text/html"` in `<mattext>`-elementen. Brightspace rendert de HTML-inhoud van deze velden. Dit is bevestigd door de bestaande referentie-exports: alle vraag- en antwoordteksten zijn al als HTML-escaped HTML opgeslagen.

Ondersteunde HTML-elementen in Brightspace QTI-inhoud:

| Element | Gebruik | Status |
|---|---|---|
| `<strong>` | Vetgedrukt | Ondersteund |
| `<em>` | Cursief | Ondersteund |
| `<code>` | Inline code (monospace) | Ondersteund |
| `<pre><code>` | Codeblok (meerdere regels) | Ondersteund |
| `<img src="...">` | Afbeelding (pad relatief aan QTI-bestand) | Ondersteund, afbeelding moet in IMSCC-pakket zitten |
| Inline SVG | Vectordiagram | Waarschijnlijk gestript door Brightspace HTML-sanitizer; niet aanbevolen |

Voor diagrammen (Mermaid, PlantUML) is de aanbevolen aanpak: pre-renderen naar PNG of SVG-bestand, bundelen in het IMSCC-pakket, en refereren via `<img src="...">`.

### Criteria

- Inline code in quizvragen moet als monospace worden weergegeven in Brightspace
- De unified-pipeline (remark → rehype) kan Markdown in vraag- en antwoordteksten omzetten naar HTML
- QTI `mattext` met `texttype="text/html"` ondersteunt HTML-inhoud in Brightspace
- Toekomstige quizvragen kunnen codeblokken of diagrammen bevatten

## Beslissing

Brightspacosaurus converteert de tekst van quizvragen en antwoordopties via de unified-pipeline (remark → rehype → rehype-stringify) naar HTML voordat deze als HTML-escaped inhoud in `<mattext texttype="text/html">` wordt geplaatst.

Dit betekent:

- Inline code (`` `code` ``) → `<code>code</code>` → correct weergegeven als monospace in Brightspace
- Vetgedrukt (`**tekst**`) → `<strong>tekst</strong>`
- Cursief (`*tekst*`) → `<em>tekst</em>`
- Fenced code blocks (` ```java ... ``` `) → `<pre><code class="language-java">...</code></pre>`
- Afbeeldingen (`![alt](pad.png)`) → `<img src="pad.png" alt="alt">` + afbeelding bundelen in IMSCC

De HTML-inhoud wordt HTML-escaped opgeslagen in het XML-attribuut, conform de bestaande referentie-exports.

### Huidige situatie vs. gewenste situatie

De bestaande handmatig gegenereerde QTI-bestanden converteren Markdown naar platte tekst. Brightspacosaurus verbetert dit door de unified-pipeline te gebruiken voor vraag- en antwoordteksten, zodat technische termen correct als monospace worden weergegeven.

### Beperkingen

- Inline SVG wordt waarschijnlijk gestript door Brightspace. Diagrammen moeten als PNG/SVG-bestand worden gebundeld en via `<img>` worden gerefereerd.
- Brightspace's HTML-sanitizer kan sommige HTML-elementen of attributen verwijderen. Bij twijfel: testen in een Brightspace-testomgeving (zie taak 13 in het implementatieplan).
- Syntaxiskleuring van codeblokken (via CSS-klassen) werkt alleen als Brightspace de bijbehorende CSS laadt. Brightspace laadt geen externe stylesheets uit het IMSCC-pakket voor QTI-inhoud. Codeblokken zijn leesbaar maar zonder kleuring.

## Gevolgen

Positief:

- Technische termen in quizvragen worden correct als monospace weergegeven.
- De unified-pipeline wordt consistent gebruikt voor zowel lesinhoud als quizinhoud.
- Toekomstige uitbreidingen (codeblokken, diagrammen) zijn mogelijk zonder architectuurwijziging.

Negatief:

- De QuizConverter moet de unified-pipeline aanroepen voor vraag- en antwoordteksten, niet alleen voor de structuur.
- Syntaxiskleuring van codeblokken is niet beschikbaar in Brightspace QTI-inhoud.

## Bronnen

- IMS Global. (z.d.). *IMS Question & Test Interoperability Specification, Version 1.2*. Geraadpleegd op 10 mei 2026, van https://www.imsglobal.org/question/qtiv1p2/qtiASI.html
  - Definieert het `<mattext>`-element met het `texttype`-attribuut. De specificatie beschrijft `texttype="text/html"` als geldige waarde, waarmee HTML-inhoud in vraag- en antwoordteksten is toegestaan.
- D2L. (z.d.). *Import a course package*. Geraadpleegd op 10 mei 2026, van https://documentation.brightspace.com/EN/le/course_administration/instructor/import_course_package.htm
  - Beschrijft het importproces voor Common Cartridge-pakketten in Brightspace, inclusief QTI-assessments. De bestaande referentie-exports in deze repository (bijv. `quiz-2.2-di-qti.xml`) zijn eerder succesvol geïmporteerd en bevestigen dat `texttype="text/html"` in de praktijk wordt ondersteund.
