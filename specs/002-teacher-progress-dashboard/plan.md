# Implementation Plan: Teacher Progress Dashboard (Voortgangsverkenner)

**Branch**: `copilot/docent-dashboard-gitlab-work-items` | **Date**: 2026-10-01 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/002-teacher-progress-dashboard/spec.md`

## Summary

Add an instructor progress dashboard (*Voortgangsverkenner*) to Brightspacosaurus that allows teachers to view student GitLab work item progress directly within Brightspace. The feature consists of:
1. Configuration extensions in `brightspacosaurus.config.json` for repository endpoints, cohort groups, prefixes, teacher exclusions, and configurable threshold boundaries.
2. Robust configuration validation in `src/config-loader.ts` and type definitions in `src/types.ts`.
3. Pure stoplight classification and aggregation logic with property-based unit tests.
4. Deterministic postfix extraction for student grouping and repo matching.
5. A privacy-first, client-side SPA bundled in `assets/teacher-dashboard/` that communicates directly with GitLab REST API without backend proxies, keeps tokens strictly in browser memory, and caches student work item statuses locally with dynamic threshold slider overrides.
6. Build and packaging integration in `src/main.ts` and `src/manifest-builder.ts` that includes the dashboard page and assets when configured.

## Technical Context

**Language/Version**: TypeScript on Deno >= 2.0 (CLI & core logic), Vanilla ES/React for static frontend bundle

**Primary Dependencies**: `fast-check`, native browser `fetch` (CORS-enabled direct GitLab REST API calls)

**Storage**: Local browser storage (`localStorage`) for student progress caching; strictly NO token persistence (transient in-memory only)

**Testing**: Deno test runner, property-based tests via fast-check (at least 100 runs per property) for stoplight boundaries and postfix extraction

**Target Platform**: Deno CLI on macOS/Linux/CI; generated static HTML/JS/CSS executing inside Brightspace topic iframe and local Docusaurus preview

**Project Type**: Single-project CLI tool with static bundled frontend assets

**Performance Goals**: Instant (< 100ms) re-coloring upon threshold slider adjustment; < 5s cached load time for cohort of 35 students across 6 repos; 0 network calls when cached until explicit refresh

**Constraints**:
- Strict Privacy by Design: zero student data or credentials leaked to external servers or AI services.
- Token never persisted to disk, cookies, web storage, or git.
- Generic configuration-driven: no course-specific paths or assumptions in source code.
- JSR compatibility: bundled assets loaded via `src/assets.ts` and declared in `deno.json`.
- Fail fast with actionable error messages upon invalid configuration.

**Scale/Scope**: Cohorts of 30–50 students, 6–10 repos per student, 10–20 work items per repo.

## Constitution Check

*GATE: Passed before research and re-checked after design.*

| Principle | Result | Evidence |
|---|---|---|
| Generic, configuration-driven | PASS | All platform hosts, groups, repos, prefixes, and thresholds configured via `brightspacosaurus.config.json` |
| Deterministic, isolated output | PASS | Dashboard files written exclusively to `build/brightspace/content/docenten/`; stable student sorting; 0 changes if section unconfigured |
| Fail fast and explain remedy | PASS | Strict schema and threshold validation in `config-loader.ts` with actionable error messages |
| Test at the right boundary | PASS | Pure calculation and postfix extraction functions isolated with fast-check property tests |
| Deno and JSR compatibility | PASS | Static assets loaded via `src/assets.ts`, registered in `publish.include` in `deno.json` |

Post-design check: PASS. No constitutional exceptions or unjustified complexity.

## Project Structure

### Documentation (this feature)

```text
specs/002-teacher-progress-dashboard/
├── checklists/
│   └── requirements.md
├── contracts/
│   └── dashboard-config.md
├── data-model.md
├── plan.md
├── quickstart.md
├── research.md
├── spec.md
└── tasks.md
```

### Source Code Layout

```text
src/
├── types.ts                    # Extended BsoConfig with TeacherDashboardConfig
├── config-loader.ts            # Schema validation for teacherDashboard
├── teacher-dashboard-calc.ts   # Pure functions for stoplights, deadlines, thresholds, postfixes
├── manifest-builder.ts         # Registers teacher dashboard resource in imsmanifest.xml
└── main.ts                     # Integrates dashboard asset copying into `bso prepare`

assets/
└── teacher-dashboard/          # Pre-bundled client-side SPA (index.html, app.js, style.css)

tests/
├── teacher-dashboard-config.test.ts # Configuration validation tests
└── teacher-dashboard-calc.test.ts   # Pure calculation & property-based tests
```

**Structure Decision**: Retains the established single-project structure under `src/`, with frontend assets stored in `assets/teacher-dashboard/` for distribution via JSR.

## Complexity Tracking

No constitutional violations or unjustified complexity.
