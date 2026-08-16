# ADR 008 — Runtime: Deno boven Node.js voor Brightspacosaurus

## Status

Geaccepteerd

## Context

Brightspacosaurus is een CLI-tool geschreven in TypeScript. Bij de keuze van de runtime zijn twee opties overwogen: Node.js (met npm of een alternatieve packagemanager) en Deno. De keuze raakt direct aan supply chain-beveiliging, omdat de tool draait in een CI/CD-omgeving met toegang tot de repository en het buildproces.

In maart en april 2026 publiceerde het NCSC een waarschuwing over meerdere gecompromitteerde npm-packages, waaronder axios en een malafide versie van Trivy. Daarbij werden via postinstall-scripts backdoors geplaatst en authenticatiegegevens geëxfiltreerd. Het NCSC adviseert onder meer:

> "Tref maatregelen om dit soort incidenten in de toekomst te voorkomen:
> - Gebruik versiepinning wanneer jouw software externe libraries gebruikt. Pin hashes van externe libraries in plaats van versienummers, indien mogelijk. Hiermee verklein je de kans dat je een gecompromitteerde versie van de externe library downloadt.
> - Pas een dependency cooldown-periode toe. Voer kritieke beveiligingsupdates snel door, maar wacht enkele dagen met het doorvoeren van reguliere dependency-updates waar mogelijk.
> - Schakel postinstall-scripts uit, bijvoorbeeld door de parameter '--ignore-scripts' van het 'npm ci'-commando te gebruiken.
> - Gebruik scansoftware voor CI/CD-omgevingen om malafide updates en packages te detecteren.
> - Gebruik alleen packages van trusted publishers, en gebruik het 'npm audit'-commando om de authenticiteit van packages te controleren."
> — NCSC, *Ontwikkelaars opgelet: gecompromitteerde npm- en Python-packages*, 2026

Deno biedt een relevant verschil ten opzichte van npm op het punt van postinstall-scripts:

> "Unlike npm, Deno doesn't automatically run postinstall scripts. In npm, these scripts can execute untrusted code from third-party packages—posing significant security risks by allowing arbitrary code to run with full access to your system. Deno's approach avoids this by requiring you to explicitly allow scripts."
> — Deno, *Introducing your new JavaScript package manager: Deno*, z.d.

### Criteria

- Beperken van supply chain-risico's in de CI/CD-omgeving
- Geen automatische uitvoering van postinstall-scripts
- Ingebouwd permissiemodel dat bestandstoegang beperkt tot expliciete paden
- Geen `node_modules`-map en bijbehorende installatiecomplexiteit
- Ingebouwde TypeScript-ondersteuning zonder extra tooling

## Overwogen opties

### Optie A — Node.js met npm (standaard)

**Voordelen:**

- Groot ecosysteem, breed gedocumenteerd.
- Vertrouwd voor de meeste JavaScript/TypeScript-ontwikkelaars.
- npm biedt `--ignore-scripts` en `npm audit` als mitigaties.

**Nadelen:**

- Postinstall-scripts draaien standaard automatisch; `--ignore-scripts` moet expliciet worden ingesteld en kan worden vergeten.
- `node_modules` introduceert een grote aanvalsoppervlakte: duizenden transitieve afhankelijkheden.
- npm is vanwege zijn populariteit een aantrekkelijk doelwit voor supply chain-aanvallen; herhaling is niet uit te sluiten.
- Versiepinning op hash-niveau is mogelijk maar niet de standaard werkwijze.

### Optie B — Node.js met npm en hardened configuratie

npm met `--ignore-scripts`, hash-pinning via `package-lock.json`, en `npm audit` in CI.

**Voordelen:**

- Mitigeert de grootste risico's van optie A.
- Blijft binnen het vertrouwde Node.js-ecosysteem.

**Nadelen:**

- Vereist discipline en expliciete configuratie; de veilige instelling is niet de standaard.
- Hash-pinning via `package-lock.json` beschermt niet tegen een gecompromitteerd pakket dat al in de lock-file staat.
- Transitieve afhankelijkheden blijven een risico.

### Optie C — Deno (gekozen)

**Voordelen:**

- Postinstall-scripts worden niet automatisch uitgevoerd; expliciete opt-in vereist via `--allow-scripts`.
- Ingebouwd permissiemodel: `--allow-read` en `--allow-write` beperken bestandstoegang tot expliciete paden, wat Requirement 4.5 afdwingt op runtimenoveau.
- Geen `node_modules`; afhankelijkheden worden gecached in een globale cache met hash-verificatie.
- Ingebouwde TypeScript-ondersteuning; geen aparte compilatiestap nodig.
- JSR als primair pakketregister is kleiner en minder een doelwit dan npm; dit verkleint de kans op supply chain-aanvallen, al sluit het ze niet uit.

**Nadelen:**

- Kleiner ecosysteem dan npm; niet alle npm-packages zijn beschikbaar via JSR.
- JSR en Deno's npm-compatibiliteitslaag zijn niet volledig vrij van supply chain-risico's; het kleinere ecosysteem maakt aanvallen minder waarschijnlijk maar niet onmogelijk.
- Minder bekende tooling voor teamleden die primair met Node.js werken — al hebben enkele teamleden al ervaring met Deno, waardoor de leercurve beperkt is.
- Deno 2 biedt npm-compatibiliteit, maar dit introduceert opnieuw npm-risico's als npm-packages worden gebruikt.

## Beslissing

We kiezen voor Deno (optie C). Het ingebouwde permissiemodel en het ontbreken van automatische postinstall-scripts sluiten direct aan op de NCSC-aanbevelingen, zonder dat daarvoor extra configuratie of discipline vereist is. De veilige instelling is hier de standaard.

De keuze is geen absolute veiligheidsgarantie: JSR en Deno's npm-compatibiliteitslaag zijn niet immuun voor supply chain-aanvallen. De NCSC-aanbevelingen voor versiepinning, dependency cooldown en scansoftware blijven van toepassing, ook bij Deno.

### Bewust niet gekozen

- Node.js met standaard npm-configuratie, vanwege automatische postinstall-scripts en de brede aanvalsoppervlakte van `node_modules`.
- Node.js met hardened npm-configuratie, omdat de veilige instelling daar expliciet moet worden afgedwongen en niet de standaard is.

### Follow-up

- Versiepinning op hash-niveau toepassen voor alle Deno-afhankelijkheden in `deno.json`.
- Dependency cooldown-periode hanteren voor reguliere updates.
- Bij gebruik van npm-compatibiliteitslaag in Deno: beoordelen of de bijbehorende npm-risico's acceptabel zijn.

## Gevolgen

Positief:

- Postinstall-scripts van afhankelijkheden draaien niet automatisch in CI.
- Bestandstoegang in CI is beperkt tot `build/` en de repository-root via Deno's permissiemodel.
- Geen `node_modules`-installatiestap nodig in de CI-pipeline.

Negatief:

- Teamleden die nog geen Deno-ervaring hebben moeten het leren kennen; enkele teamleden hebben al ervaring, wat kennisdeling binnen het team vergemakkelijkt.
- Niet alle gewenste libraries zijn beschikbaar via JSR; soms is de npm-compatibiliteitslaag nodig, wat de supply chain-risico's gedeeltelijk terugbrengt.

## Bronnen

- NCSC. (2026). *Ontwikkelaars opgelet: gecompromitteerde npm- en Python-packages*. https://www.ncsc.nl/alerts/ontwikkelaars-opgelet-gecompromitteerde-npm-en-python-packages

- Deno. (z.d.). *Introducing your new JavaScript package manager: Deno*. https://deno.com/blog/your-new-js-package-manager
