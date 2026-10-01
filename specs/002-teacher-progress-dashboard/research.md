# Research & Technical Decisions: Teacher Progress Dashboard

**Feature**: Teacher Progress Dashboard (Voortgangsverkenner)
**Date**: 2026-10-01
**Status**: Complete

## Decision 1: Client-Side Direct GitLab REST API vs Backend Proxy

### Decision
The Teacher Progress Dashboard is implemented as a 100% client-side Single Page Application (SPA) communicating directly with the configured GitLab instance (`gitlab.aimsites.nl` or `gitlab.com`) using the GitLab REST API v4. No intermediate backend proxy or server-side component is used.

### Rationale
- CORS preflight and actual GET requests to both `https://gitlab.com` and `https://gitlab.aimsites.nl` return `Access-Control-Allow-Origin: *` and expose pagination headers (`Link`, `X-Total`, `X-Next-Page`).
- Eliminates hosting costs, deployment overhead, and maintenance of a custom proxy server.
- **Privacy by Design**: Student identities, repositories, commits, and work item descriptions flow strictly between the teacher's browser and the institution's GitLab instance. Zero student data is exposed to external servers or third-party AI systems.

### Alternatives Considered
- *Backend Proxy (e.g. Node/Deno server)*: Rejected because CORS is already supported by GitLab; a proxy introduces infrastructure complexity, server maintenance, and a potential security bottleneck where tokens could be intercepted or logged.
- *GraphQL-only client*: GitLab GraphQL supports rich queries but requires different permission levels and schema variations across GitLab CE/EE versions. REST API v4 is universal across all versions and supports group access tokens seamlessly.

---

## Decision 2: Credential Handling and Password Manager Integration

### Decision
Group access tokens (role `Reporter`, scope `read_api`) are kept **exclusively in volatile browser memory** for the duration of the page session. Tokens are never written to `localStorage`, `sessionStorage`, cookies, URL query parameters, or build artifacts.

### Rationale
Brightspace hosts course HTML within its own domain context. Storing tokens in web storage (`localStorage` / `sessionStorage`) would expose credentials to any other course script or widget executing on the same origin.
To provide a smooth user experience without violating this principle, the token input is embedded in a `<form>`:
```html
<form autocomplete="on">
  <input type="text" name="username" value="gitlab-token" autocomplete="username" style="display:none" />
  <input type="password" name="password" autocomplete="current-password" placeholder="Paste GitLab group token..." />
</form>
```
This enables native browser password managers (Chrome, Edge, Firefox, Safari, 1Password, Bitwarden) to securely store and autofill the token upon subsequent visits. A "Forget token" action purges the in-memory variable and displays guidance for clearing the entry from the browser's credential store.

### Alternatives Considered
- *Encrypting token in localStorage with master password*: Adds key management complexity and can still be accessed by any script running on the same origin.
- *Embedding token in BSO build configuration*: Strictly prohibited because course cartridges and HTML topics are distributed to students; students could inspect the source code and extract the token.

---

## Decision 3: Student and Repository Identification via Postfix Matching

### Decision
Student identity is extracted deterministically from project names returned by `GET /api/v4/groups/:id/projects` using postfix matching against configured repository prefixes:
Given configured prefix `n2-ticketfaster-api`, a repository named `n2-ticketfaster-api-J-deBruin7` is parsed into:
- Matching prefix: `n2-ticketfaster-api`
- Student identifier: `J-deBruin7`

Projects sharing the same student identifier are aggregated into a single `Student` record, sorted alphabetically by student identifier.

### Rationale
- Standardized educational naming convention across course cohorts.
- Requires only a single paginated API call to list all subgroup repositories.
- Resilient against varying group member configurations and permissions.

### Alternatives Considered
- *Querying group/project members API*: Requires additional API queries per repository, which significantly increases network latency and risks hitting API rate limits.
- *Separate subgroup per student*: Some courses use flat subgroups with repositories rather than student-level subgroups. Postfix matching supports both flat structures and simplifies scanning.

---

## Decision 4: Stoplight Status and Dynamic Threshold Evaluation

### Decision
Stoplight color calculation is divided into two distinct levels:
1. **Per Work Item**:
   - `Green`: Status `done` + linked student commit(s) + comments present (if required).
   - `Orange`: Status `doing`, OR `done` without student commits, OR `done` with commits but missing required comments.
   - `Red`: Status `todo` with overdue or missing deadline.
   - `Gray` (Not yet due): Status `todo` with deadline in the future.
2. **Aggregated (Per Repository and Per Student)**:
   - Percentage of active (non-gray) items that are not green:
     - `< orangeThresholdPercent` (default 10%) $\to$ `Green`
     - $\ge orangeThresholdPercent$ and $\le redThresholdPercent$ (default 10%–50%) $\to$ `Orange`
     - $> redThresholdPercent$ (default 50%) $\to$ `Red`
     - 0 active items $\to$ `Gray`

Dynamic slider controls in the dashboard allow instructors to live-adjust thresholds with instant UI recalculation.

### Rationale
- Guarantees fairness: future tasks do not artificially penalize students as "behind".
- Prevents cohort-wide uniform color displays: instructors can calibrate thresholds to match current course progression.

---

## Decision 5: Distribution and Packaging in Brightspacosaurus

### Decision
The dashboard is bundled as a static distribution asset (`assets/teacher-dashboard/`) within Brightspacosaurus. When `teacherDashboard` is configured in `brightspacosaurus.config.json`:
1. `bso prepare` copies the dashboard HTML/JS/CSS to `build/brightspace/content/docenten/` and injects the resolved public configuration (without secrets).
2. `bso pack` includes the dashboard HTML resource in `imsmanifest.xml` under an instructor-visible section.
3. If `teacherDashboard` is omitted, no dashboard files or manifest entries are created.

### Rationale
- Completely zero overhead for courses that do not use GitLab work items.
- Works offline in local preview (`bso preview`) and online in Brightspace.
