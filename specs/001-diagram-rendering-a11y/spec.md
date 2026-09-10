# Feature Specification: Accessible Diagram Rendering

**Feature Branch**: `bartvanderwal-feature-spec-kit-migration`

**Created**: 2026-09-09

**Status**: Draft

**Input**: Migrated from `.kiro/specs/diagram-rendering-a11y/requirements.md` for bartvanderwal/brightspacosaurus#14.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Render diagrams in course pages (Priority: P1)

As a course developer, I want PlantUML and Mermaid blocks rendered during the course build so students see diagrams rather than source code in Brightspace.

**Why this priority**: Rendering is the core user value and is required before accessibility or preview parity can be delivered.

**Independent Test**: Build one lesson containing one PlantUML block and one Mermaid block and verify both appear as visible diagrams while an unrelated code block remains unchanged.

**Acceptance Scenarios**:

1. **Given** a lesson with a valid PlantUML block, **When** the course is prepared, **Then** the generated topic contains a visible rendered diagram.
2. **Given** a lesson with a valid Mermaid block, **When** the course is prepared, **Then** the generated topic contains a visible rendered diagram.
3. **Given** a fenced block with an unsupported language, **When** the course is prepared, **Then** that block remains an ordinary code block.
4. **Given** identical source and configuration, **When** the lesson is built twice, **Then** the generated HTML is byte-identical.

---

### User Story 2 - Understand every diagram as a screen reader user (Priority: P1)

As a student using a screen reader, I want every diagram to have an accessible name, a textual description, and its source available through controls I can actually operate, so I can understand it in Brightspace.

**Why this priority**: A visible diagram that excludes screen-reader users does not meet the feature's accessibility goal. Brightspace runs course content in a restricted iframe with no custom client-side JavaScript, so any interactive control the student relies on (expanding a description, revealing source) must work natively, without relying on scripting we do not control.

**Independent Test**: Inspect a generated topic with JavaScript disabled and verify that the diagram is announced as an image, its name and description are connected correctly, and source and description disclosures remain operable.

**Acceptance Scenarios**:

1. **Given** a rendered diagram with a generated description, **When** a screen reader encounters it, **Then** it has a non-empty accessible name and the description is programmatically associated with it.
2. **Given** Brightspace's restricted environment where no custom JavaScript runs, **When** a student opens the source or description disclosure, **Then** the native control reveals the complete content without needing any script to work.
3. **Given** `remark-kroki-a11y` cannot generate a natural-language description for a diagram, **When** the lesson is built, **Then** the diagram still has a name and source disclosure and the course developer receives a warning.

---

### User Story 3 - Control rendering and recover from failures (Priority: P2)

As a course developer, I want to choose the diagram service and output mode and receive actionable failures so local, CI, and self-hosted builds behave predictably.

**Why this priority**: Reliable configuration and error handling are necessary for production use but follow the core render-and-accessibility slice.

**Independent Test**: Build fixtures against a configured endpoint in both strict and fallback modes and verify endpoint selection, output selection, error classification, and fallback behavior.

**Acceptance Scenarios**:

1. **Given** no diagram settings, **When** configuration is resolved, **Then** documented defaults are used.
2. **Given** a valid custom endpoint and output mode, **When** diagrams are rendered, **Then** those values are used for every diagram.
3. **Given** an unreachable endpoint or invalid diagram and strict mode, **When** the lesson is built, **Then** the build fails with the source file, diagram location or title, category, and reason.
4. **Given** the same failure in fallback mode, **When** the lesson is built, **Then** a warning is emitted, the original code block is retained, and the build continues.

---

### User Story 4 - Preview the same accessible content (Priority: P2)

As a course developer, I want the Docusaurus preview and Brightspace output to contain the same diagram, source, and description so the preview accurately represents the delivered course.

**Why this priority**: Preview parity reduces authoring surprises after the production path is functional.

**Independent Test**: Process the same fixture through both outputs and compare the diagram content, original source, and natural-language description while allowing the presentation controls to differ.

**Acceptance Scenarios**:

1. **Given** the same diagram source, **When** it is shown in preview and built for Brightspace, **Then** both contain equivalent diagram, source, and description content.
2. **Given** preview tabs and Brightspace native disclosures, **When** Brightspace runs no custom JavaScript, **Then** all underlying accessible content remains available.

---

### User Story 5 - Reuse diagram validation (Priority: P3)

As a BSO maintainer, I want diagram validation separated from rendering so a future lint command can report the same authoring problems without duplicating logic.

**Why this priority**: This protects maintainability and future work but is not required for the first student-facing increment.

**Independent Test**: Run validation without contacting a rendering service and verify it reports invalid metadata, source references, empty diagrams, and unsupported options with source locations.

**Acceptance Scenarios**:

1. **Given** invalid diagram metadata, **When** static validation runs, **Then** it returns a typed, actionable issue without rendering.
2. **Given** valid supported metadata, **When** static validation runs, **Then** it returns no parameter issue.

### Edge Cases

- The rendering endpoint is unavailable or intermittently returns server errors.
- Diagram source is syntactically invalid even though the endpoint is reachable.
- A block is empty, uses an unknown option, or references a non-local `src`.
- A self-hosted service lacks the Mermaid companion service.
- A description cannot be generated although the image renders successfully.
- Multiple diagrams in one file require unique but deterministic accessibility IDs.
- A lesson mixes supported diagrams with unrelated fenced code blocks.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render valid PlantUML and Mermaid fenced blocks during `prepare` and embed the result in Brightspace HTML.
- **FR-002**: Diagram display and disclosure controls MUST work without client-side JavaScript, because Brightspace runs course content in a restricted iframe where custom scripts do not execute.
- **FR-003**: Unsupported fenced-code languages MUST remain unchanged as code.
- **FR-004**: Identical input and configuration MUST produce byte-identical HTML, including accessibility identifiers.
- **FR-005**: Configuration MUST accept an optional diagram endpoint, output mode, and fail-on-error setting.
- **FR-006**: Missing diagram settings MUST resolve to documented defaults: public endpoint, embedded image output, and fail-on-error enabled.
- **FR-007**: Invalid diagram configuration MUST fail with a clear validation error before rendering.
- **FR-008**: Every rendered diagram MUST have a non-empty accessible name and MUST be exposed as an image to assistive technology.
- **FR-009**: When a natural-language description exists, it MUST be programmatically associated with the diagram.
- **FR-010**: Original diagram source MUST be present in a native, labeled disclosure control.
- **FR-011**: A generated description MUST be present as text in a separate native, labeled disclosure control.
- **FR-012**: When `remark-kroki-a11y` cannot generate a description, rendering MUST continue with the accessible name and source disclosure and MUST emit a warning to the course developer.
- **FR-013**: Rendering, source disclosure, description generation, and label generation MUST reuse the established shared diagram-accessibility provider; BSO MUST NOT duplicate that logic.
- **FR-014**: Brightspace-specific behavior MUST be a thin adaptation of shared provider output and MUST NOT rebuild descriptions or labels.
- **FR-015**: Preview and Brightspace output MUST contain equivalent diagram, source, and description content for identical input.
- **FR-016**: Errors MUST distinguish unreachable-service failures, invalid diagram source, and invalid parameters.
- **FR-017**: In strict mode, any error from FR-016 MUST fail the build with the source file, diagram location or title, and actionable reason.
- **FR-018**: In fallback mode, any error from FR-016 MUST emit a warning, preserve the original code block, and allow the build to continue.
- **FR-019**: Author errors MUST remain classified as author errors regardless of rendering-service reachability.
- **FR-020**: Static diagram validation MUST be independently callable without rendering and return typed issues with source context.
- **FR-021**: Automated coverage MUST include PlantUML and Mermaid fixtures, no-JavaScript output, accessibility relationships, deterministic output, configuration, validation, and strict/fallback error behavior.
- **FR-022**: Documentation MUST cover diagram configuration, self-hosted rendering for CI/offline use, the screen-reader accessibility intent, and the need for manual assistive-technology verification.
- **FR-023**: This feature MUST modify only the HTML/Brightspace route; the PDF/reader route MUST remain unchanged.
- **FR-024**: Implementing `bso lint` is outside scope; only reusable validation needed by a future lint command is included.

### Key Entities

- **Diagram configuration**: Optional author settings for endpoint, output mode, strict/fallback behavior, and resolved locale.
- **Diagram issue**: A statically detectable authoring problem with category, source file, optional position/title, and actionable message.
- **Diagram error**: A rendering failure categorized as service reachability, invalid source, or invalid parameter, with source and diagram context.
- **Accessible diagram output**: The rendered image plus deterministic accessible name, optional description, and source/description disclosures.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of valid PlantUML and Mermaid acceptance fixtures produce a visible diagram in generated Brightspace topics.
- **SC-002**: 100% of generated diagrams in the acceptance suite have a non-empty accessible name and an operable source disclosure that needs no client-side JavaScript.
- **SC-003**: 100% of generated descriptions in the acceptance suite are programmatically associated with their diagrams and available as text.
- **SC-004**: Two consecutive builds of every diagram fixture produce byte-identical HTML.
- **SC-005**: Every tested service, source, and parameter failure reports the source file and actionable reason; no tested failure is silent.
- **SC-006**: Preview and Brightspace checks show equivalent diagram, source, and description content for every shared fixture.
- **SC-007**: The complete automated suite passes, including at least 100 generated cases for each stated universal property.

## Assumptions

- The existing shared diagram-accessibility provider (`remark-kroki-a11y`) remains the single source of truth for rendering, descriptions, disclosures, and labels.
- The public rendering endpoint is the default; projects may provide a self-hosted compatible endpoint.
- Full WCAG conformance cannot be established by automation alone and requires manual verification with assistive technology.
- The existing PDF/reader diagram behavior remains unchanged.
- The future lint command tracked by #11 will consume the reusable validation boundary but is not implemented here.

- The existing PDF/reader diagram behavior remains unchanged.
- The future lint command tracked by #11 will consume the reusable validation
  boundary but is not implemented here.
