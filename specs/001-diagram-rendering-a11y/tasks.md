# Tasks: Accessible Diagram Rendering

**Input**: Design documents from `/specs/001-diagram-rendering-a11y/`

**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`,
`contracts/diagram-config.md`, `quickstart.md`

**Tests**: Required by FR-021 and the project constitution. Write each test
before its corresponding implementation and confirm it fails for the intended
reason.

**Organization**: Tasks are grouped by user story and use strict Spec Kit IDs.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the dependencies, permissions, and reusable fixtures required
by all stories.

- [ ] T001 Add `remark-kroki-a11y@^0.6.2` and `rehype-raw@^7.0.0` imports plus `prepare` network permission in `deno.json`
- [ ] T002 [P] Add representative PlantUML and Mermaid lesson fixtures in `tests/fixtures/diagram-plantuml.md` and `tests/fixtures/diagram-mermaid.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared configuration and option mapping before rendering
or adaptation.

**CRITICAL**: User-story implementation starts after this phase.

- [ ] T003 [P] Add failing unit and property tests for diagram config validation, defaults, and provider mapping in `tests/diagram-config.test.ts` and `tests/diagram-config.property.test.ts`
- [ ] T004 Add `DiagramConfig`, output-mode, and resolved diagram types in `src/types.ts`
- [ ] T005 Extend validation and default resolution for the `diagrams` object in `src/config-loader.ts`
- [ ] T006 Implement localized provider-option mapping with PlantUML/Mermaid aliases and no-JS mode in `src/diagram-config.ts`
- [ ] T007 Export the public diagram configuration types and mapper from `src/mod.ts`

**Checkpoint**: Valid and partial configuration resolves deterministically;
invalid fields fail before rendering.

---

## Phase 3: User Story 1 - Render diagrams in course pages (Priority: P1) MVP

**Goal**: Render PlantUML and Mermaid during `prepare` while preserving unrelated
code blocks and deterministic output.

**Independent Test**: Process both fixtures and a generated non-diagram block;
verify visible embedded diagrams, exact pass-through, and identical double-run
HTML.

### Tests for User Story 1

- [ ] T008 [P] [US1] Add a failing property test for unsupported-code pass-through and double-run determinism in `tests/diagram-renderer.property.test.ts`
- [ ] T009 [P] [US1] Add failing fixture integration tests with mocked rendering for PlantUML and Mermaid in `tests/diagram-renderer.integration.test.ts`

### Implementation for User Story 1

- [ ] T010 [US1] Implement in-process asynchronous `remark-kroki-a11y` registration and diagram metadata normalization in `src/diagram-renderer.ts`
- [ ] T011 [US1] Enable parsed raw provider HTML and wire diagram rendering before `remark-rehype` in `src/markdown-converter.ts`
- [ ] T012 [US1] Pass source-file context through the converter and ensure unsupported languages remain unchanged in `src/markdown-converter.ts`

**Checkpoint**: PlantUML and Mermaid render during a build; unrelated code and
repeat-build determinism are independently verified.

---

## Phase 4: User Story 2 - Understand diagrams without sight or JavaScript (Priority: P1)

**Goal**: Produce native disclosures and correct deterministic accessibility
relationships without rebuilding provider-generated content.

**Independent Test**: Disable JavaScript and inspect every fixture for a named
image, associated textual description, exact source disclosure, and operable
native controls.

### Tests for User Story 2

- [ ] T013 [P] [US2] Add failing no-script and native-disclosure property tests in `tests/diagram-adapter.property.test.ts`
- [ ] T014 [P] [US2] Add failing accessible-name, description-reference, exact-source, and stable-ID property tests in `tests/diagram-adapter.property.test.ts`
- [ ] T015 [P] [US2] Add a failing missing-description warning test in `tests/diagram-renderer.integration.test.ts`

### Implementation for User Story 2

- [ ] T016 [US2] Implement deterministic ID generation and accessible image/SVG relationships in `src/diagram-adapter.ts`
- [ ] T017 [US2] Reuse provider-native standalone disclosures or minimally convert combined tab panels into native source and description disclosures in `src/diagram-adapter.ts`
- [ ] T018 [US2] Register the awaited Brightspace adaptation after raw HTML parsing in `src/diagram-renderer.ts` and `src/markdown-converter.ts`
- [ ] T019 [US2] Emit a warning while retaining name and source when no description is available in `src/diagram-renderer.ts`

**Checkpoint**: The complete accessible wrapper works without JavaScript and is
stable across repeated builds.

---

## Phase 5: User Story 3 - Control rendering and recover from failures (Priority: P2)

**Goal**: Apply custom rendering settings and distinguish strict failure from
configured warning-plus-fallback behavior.

**Independent Test**: Exercise every error category in strict and fallback modes
and verify diagnostics, exit behavior, and retained source.

### Tests for User Story 3

- [ ] T020 [P] [US3] Add failing property tests for the strict/fallback decision matrix in `tests/diagram-renderer.property.test.ts`
- [ ] T021 [P] [US3] Add failing property tests proving author errors are never reclassified as endpoint failures in `tests/diagram-renderer.property.test.ts`
- [ ] T022 [P] [US3] Add failing integration tests for custom endpoint/output mapping and unreachable-service fallback in `tests/diagram-renderer.integration.test.ts`

### Implementation for User Story 3

- [ ] T023 [US3] Implement typed `DiagramError` categories and actionable diagnostic formatting in `src/diagram-renderer.ts`
- [ ] T024 [US3] Implement strict throw and warning-plus-original-block fallback behavior in `src/diagram-renderer.ts`
- [ ] T025 [US3] Pass resolved endpoint, output, locale, and error policy from `src/config-loader.ts` through `src/markdown-converter.ts`

**Checkpoint**: Configuration is honored and all failure paths are visible,
categorized, and policy-controlled.

---

## Phase 6: User Story 4 - Preview the same accessible content (Priority: P2)

**Goal**: Use shared provider options in preview and production while allowing
tabs in preview and native disclosures in Brightspace.

**Independent Test**: Compare one shared fixture across both routes and verify
equivalent rendered diagram, source, and description content.

### Tests for User Story 4

- [ ] T026 [P] [US4] Add a failing shared-fixture preview-parity test in `tests/diagram-preview-parity.test.ts`

### Implementation for User Story 4

- [ ] T027 [US4] Add a reference Docusaurus remark configuration that imports `buildKrokiA11yOptions` in `tests/fixtures/docusaurus-preview/docusaurus.config.ts`
- [ ] T028 [US4] Normalize preview and Brightspace locale, labels, aliases, endpoint, and output settings through `src/diagram-config.ts`

**Checkpoint**: Preview and Brightspace contain equivalent accessible content.

---

## Phase 7: User Story 5 - Reuse diagram validation (Priority: P3)

**Goal**: Detect authoring issues without rendering so future lint work can
reuse the same typed results.

**Independent Test**: Run the validator offline against generated valid and
invalid blocks and inspect typed issues and source context.

### Tests for User Story 5

- [ ] T029 [P] [US5] Add failing property tests for valid metadata and unknown options, invalid `src`, empty blocks, and unsupported diagram declarations in `tests/diagram-validation.property.test.ts`

### Implementation for User Story 5

- [ ] T030 [US5] Implement pure `detectDiagramIssues(markdown, sourceFile)` and typed issue results in `src/diagram-validation.ts`
- [ ] T031 [US5] Reuse static validation before rendering without adding a `bso lint` command in `src/diagram-renderer.ts`
- [ ] T032 [US5] Export reusable validation types and functions from `src/mod.ts`

**Checkpoint**: Static validation is offline, typed, source-aware, and reusable.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T033 [P] Document `diagrams` settings, defaults, self-hosted Kroki plus Mermaid companion, accessibility intent, WCAG caveat, and HTML-only scope in `docs/user-manual.md`
- [ ] T034 [P] Add one to three opt-in real/local Kroki integration cases in `tests/diagram-renderer.integration.test.ts`
- [ ] T035 [P] Add optional no-JS disclosure styles in `assets/diagram-a11y.css`, load them through `src/assets.ts`, and list the asset in `deno.json` only if fixture review shows styling is needed
- [ ] T036 Bump the minor package version for the feature in `deno.json`
- [ ] T037 Run the quickstart scenarios from `specs/001-diagram-rendering-a11y/quickstart.md` and the full `deno task test` suite

---

## Dependencies & Execution Order

### Phase Dependencies

- Setup has no dependencies.
- Foundational depends on Setup and blocks all user stories.
- US1 depends on Foundational.
- US2 depends on US1 provider output.
- US3 depends on Foundational and integrates with US1; its tests can begin in
  parallel with US2.
- US4 depends on the shared mapper and the US1/US2 output contract.
- US5 depends only on Foundational and can run in parallel with US1-US4.
- Polish follows the stories selected for delivery.

### Parallel Opportunities

- T002 can run alongside T001.
- T003 can be written while T004-T007 are being prepared, but implementation
  follows the failing tests.
- Within each story, tasks marked `[P]` touch independent test or documentation
  surfaces.
- US5 can be implemented in parallel with rendering after Foundational.
- T033-T035 can run in parallel once their corresponding behavior stabilizes.

## Implementation Strategy

### MVP First

1. Complete Setup and Foundational.
2. Complete US1 and US2 together as the minimum accessible student-facing slice.
3. Validate both fixtures with JavaScript disabled and compare two builds.

### Incremental Delivery

1. Add strict/configurable failure handling in US3.
2. Add preview parity in US4.
3. Add reusable offline validation in US5.
4. Complete documentation, optional styles, real-service checks, and versioning.

## Notes

- The historical Deno compatibility spike is captured in `research.md`; it is
  not repeated as an implementation task.
- `[P]` means different files or no dependency on incomplete implementation.
- Every task includes an exact path and every story task maps to `[US1]`-`[US5]`.
- Publishing to JSR or npm is intentionally outside this task list.
