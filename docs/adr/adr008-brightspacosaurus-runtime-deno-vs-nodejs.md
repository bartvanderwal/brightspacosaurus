# ADR 008 — Runtime: Deno rather than Node.js for Brightspacosaurus

## Status

Accepted

## Context

Brightspacosaurus is a CLI tool written in TypeScript. Two runtimes were considered: Node.js (with npm or an alternative package manager) and Deno. The choice directly affects supply chain security, because the tool runs in a CI/CD environment with access to the repository and the build process.

In March and April 2026 the Dutch National Cyber Security Centre (NCSC) warned about several compromised npm packages, including axios and a malicious version of Trivy. Postinstall scripts were used to install backdoors and exfiltrate credentials. Among other things, the NCSC advises (original in Dutch):

> "Tref maatregelen om dit soort incidenten in de toekomst te voorkomen:
> - Gebruik versiepinning wanneer jouw software externe libraries gebruikt. Pin hashes van externe libraries in plaats van versienummers, indien mogelijk. Hiermee verklein je de kans dat je een gecompromitteerde versie van de externe library downloadt.
> - Pas een dependancy cooldown-periode toe. Voer kritieke beveiligingsupdates snel door, maar wacht enkele dagen met het doorvoeren van reguliere dependency-updates waar mogelijk.
> - Schakel postinstall-scripts uit, bijvoorbeeld door de parameter '--ignore-scripts' van het 'npm ci'-commando te gebruiken.
> - Gebruik scansoftware voor CI/CD-omgevingen om malafide updates en packages te detecteren.
> - Gebruik alleen packages van trusted publishers, en gebruik het 'npm audit'-commando om de authenticiteit van packages te controleren."
> — NCSC (2026)

Our translation: take measures to prevent such incidents in the future: pin versions of external libraries, preferably by hash rather than version number; apply a dependency cooldown period, applying critical security updates quickly but waiting a few days with regular updates; disable postinstall scripts, for example with `npm ci --ignore-scripts`; use scanning software in CI/CD environments to detect malicious updates and packages; only use packages from trusted publishers and use `npm audit` to check their authenticity.

Deno differs from npm on postinstall scripts:

> "Unlike npm, Deno doesn’t automatically run postinstall scripts. In npm, these scripts can execute untrusted code from third-party packages —posing significant security risks by allowing arbitrary code to run with full access to your system. Deno’s approach avoids this by requiring you to explicitly allow scripts."
> — Deno (n.d.)

### Criteria

- Limit supply chain risks in the CI/CD environment
- No automatic execution of postinstall scripts
- Built-in permission model that restricts file access to explicit paths
- No `node_modules` directory and its installation complexity
- Built-in TypeScript support without extra tooling

## Considered options

### Option A — Node.js with npm (default)

**Pros:**

- Large ecosystem, widely documented.
- Familiar to most JavaScript/TypeScript developers.
- npm offers `--ignore-scripts` and `npm audit` as mitigations.

**Cons:**

- Postinstall scripts run automatically by default; `--ignore-scripts` must be set explicitly and can be forgotten.
- `node_modules` introduces a large attack surface: thousands of transitive dependencies.
- Its popularity makes npm an attractive target for supply chain attacks; recurrence cannot be ruled out.
- Hash-level version pinning is possible but not the default way of working.

### Option B — Node.js with npm and a hardened configuration

npm with `--ignore-scripts`, hash pinning via `package-lock.json`, and `npm audit` in CI.

**Pros:**

- Mitigates the biggest risks of option A.
- Stays within the familiar Node.js ecosystem.

**Cons:**

- Requires discipline and explicit configuration; the safe setting is not the default.
- Hash pinning via `package-lock.json` does not protect against a compromised package that is already in the lock file.
- Transitive dependencies remain a risk.

### Option C — Deno (chosen)

**Pros:**

- Postinstall scripts are not run automatically; explicit opt-in via `--allow-scripts` is required.
- Built-in permission model: `--allow-read` and `--allow-write` restrict file access to explicit paths, which enforces Requirement 4.5 at runtime level.
- No `node_modules`; dependencies are cached in a global cache with hash verification.
- Built-in TypeScript support; no separate compilation step.
- JSR as the primary package registry is smaller and less of a target than npm; this reduces the chance of supply chain attacks, although it does not rule them out.

**Cons:**

- Smaller ecosystem than npm; not all npm packages are available via JSR.
- JSR and Deno's npm compatibility layer are not free of supply chain risks; the smaller ecosystem makes attacks less likely but not impossible.
- Less familiar tooling for team members who mainly work with Node.js, although some team members already have Deno experience, which limits the learning curve.
- Deno 2 offers npm compatibility, but that reintroduces npm risks when npm packages are used.

## Decision

We choose Deno (option C). The built-in permission model and the absence of automatic postinstall scripts directly match the NCSC recommendations, without requiring extra configuration or discipline. Here the safe setting is the default.

The choice is not an absolute security guarantee: JSR and Deno's npm compatibility layer are not immune to supply chain attacks. The NCSC recommendations on version pinning, dependency cooldown and scanning software still apply with Deno.

### Deliberately not chosen

- Node.js with the default npm configuration, because of automatic postinstall scripts and the broad attack surface of `node_modules`.
- Node.js with a hardened npm configuration, because the safe setting has to be enforced explicitly there and is not the default.

### Follow-up

- Apply hash-level version pinning to all Deno dependencies in `deno.json`.
- Apply a dependency cooldown period for regular updates.
- When using the npm compatibility layer in Deno: assess whether the associated npm risks are acceptable.

## Consequences

Positive:

- Postinstall scripts of dependencies do not run automatically in CI.
- File access in CI is limited to `build/` and the repository root through Deno's permission model.
- No `node_modules` installation step in the CI pipeline.

Negative:

- Team members without Deno experience have to learn it; some team members already have experience, which makes knowledge sharing within the team easier.
- Not all desired libraries are available via JSR; sometimes the npm compatibility layer is needed, which partly brings back the supply chain risks.

## References

- Deno. (n.d.). *Introducing your new JavaScript package manager: Deno*. Retrieved September 30, 2026, from https://deno.com/blog/your-new-js-package-manager
- NCSC. (2026). *Ontwikkelaars opgelet: gecompromitteerde npm- en Python-packages* [Developers beware: compromised npm and Python packages]. Retrieved September 30, 2026, from https://www.ncsc.nl/alerts/ontwikkelaars-opgelet-gecompromitteerde-npm-en-python-packages
