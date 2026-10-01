---
description: "Task list for Teacher Progress Dashboard implementation"
---

# Tasks: Teacher Progress Dashboard (Voortgangsverkenner)

**Input**: Design documents from `/specs/002-teacher-progress-dashboard/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Exact file paths included in all descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Type definitions and package configuration

- [x] T001 Define `TeacherDashboardConfig` and `ResolvedTeacherDashboardConfig` types in `src/types.ts`
- [x] T002 Register `assets/teacher-dashboard/` in `publish.include` in `deno.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core configuration validation and pure calculation functions required by all user stories

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 [P] Implement `resolveTeacherDashboardConfig()` validation in `src/config-loader.ts` ensuring $0 \le \text{orange} < \text{red} \le 100$
- [x] T004 [P] Implement pure stoplight calculation, threshold evaluation, and repository postfix extraction functions in `src/teacher-dashboard-calc.ts`
- [x] T005 [P] Implement unit and property-based tests for `src/teacher-dashboard-calc.ts` in `tests/teacher-dashboard-calc.test.ts`
- [x] T006 [P] Implement configuration validation tests for `teacherDashboard` in `tests/teacher-dashboard-config.test.ts`

**Checkpoint**: Foundation ready - pure calculation logic and configuration validation tested.

---

## Phase 3: User Story 1 - View student work item progress at a glance (Priority: P1) 🎯 MVP

**Goal**: Instructors can view student repositories and calculated progress indicators in an organized hierarchical view.

**Independent Test**: Load the dashboard with sample data and verify that students are listed in alphabetical order with their associated repositories and calculated color-coded progress status.

### Implementation for User Story 1

- [x] T007 [P] [US1] Create accessible dashboard SPA shell in `assets/teacher-dashboard/index.html` with plain-text rendering containers
- [x] T008 [P] [US1] Create responsive and accessible styling in `assets/teacher-dashboard/style.css` with semantic color indicators and ARIA support
- [x] T009 [US1] Implement student repository aggregation and collapsible view hierarchy in `assets/teacher-dashboard/app.js`
- [x] T010 [US1] Implement dashboard asset emission in `src/main.ts` and manifest registration in `src/manifest-builder.ts`

**Checkpoint**: User Story 1 MVP fully functional and testable independently.

---

## Phase 4: User Story 2 - Privacy-first secure access without data leakage (Priority: P1)

**Goal**: Authentication tokens remain transient in browser memory, and all API queries execute directly client-to-GitLab without proxy servers or AI data leakage.

**Independent Test**: Enter a token, verify that password manager prompts work, verify direct REST API v4 calls with `PRIVATE-TOKEN` header, and confirm 0 tokens in web storage or build files.

### Implementation for User Story 2

- [x] T011 [US2] Implement ephemeral password manager form with hidden dummy username and in-memory token state in `assets/teacher-dashboard/app.js`
- [x] T012 [US2] Implement direct browser GitLab REST API v4 client (`GET /groups/:id/projects`, `/projects/:id/issues`, `/projects/:id/repository/commits`) in `assets/teacher-dashboard/app.js`

**Checkpoint**: User Stories 1 AND 2 work together securely with direct API interaction.

---

## Phase 5: User Story 3 - Cached offline-friendly review and selective refresh (Priority: P2)

**Goal**: Retrieved student progress data is cached in `localStorage` with fetch timestamps, and instructors can refresh all or single students.

**Independent Test**: Fetch data, refresh page to verify 0 API calls and visible timestamp; trigger "Ververs deze student" to verify selective single-student re-fetch.

### Implementation for User Story 3

- [x] T013 [US3] Implement `localStorage` cache read/write with schema version and timestamp formatting in `assets/teacher-dashboard/app.js`
- [x] T014 [US3] Implement full refresh, single-student refresh ("Ververs deze student"), error isolation per repo, and "Wis cache" actions in `assets/teacher-dashboard/app.js`

**Checkpoint**: User Stories 1, 2, and 3 provide an offline-capable, cached experience with selective refresh.

---

## Phase 6: User Story 4 - Adjustable status thresholds for differentiated cohort review (Priority: P3)

**Goal**: Instructors can adjust the orange and red percentage thresholds using sliders on a settings tab with instant live re-coloring.

**Independent Test**: Adjust the slider controls and observe that all cohort and student indicators immediately re-evaluate without network calls.

### Implementation for User Story 4

- [x] T015 [US4] Implement dynamic threshold slider inputs on settings tab with instant live re-coloring in `assets/teacher-dashboard/app.js`
- [x] T016 [US4] Implement reset-to-defaults action restoring configured `orangeThresholdPercent` and `redThresholdPercent` in `assets/teacher-dashboard/app.js`

**Checkpoint**: User Story 4 allows dynamic recalibration of stoplight sensitivity.

---

## Phase 7: User Story 5 - Configurable completion criteria including comments and deadlines (Priority: P3)

**Goal**: Work item completion requires student commits, supports future deadline neutrality (*Nog niet*), and optional comment enforcement.

**Independent Test**: Verify that work items without linked commits are marked incomplete, work items with future deadlines are marked neutral/not yet due, and toggling comment requirement alters completion scoring appropriately.

### Implementation for User Story 5

- [x] T017 [US5] Implement work item commit linking check (`#iid`) and teacher username exclusion filter in `assets/teacher-dashboard/app.js`
- [x] T018 [US5] Implement future deadline detection (`due_date` / `milestone.due_date`) for neutral "Not yet due" status in `assets/teacher-dashboard/app.js`
- [x] T019 [US5] Implement dynamic checkbox and config option for "Require comment(s) in work item for 100%" with orange fallback in `assets/teacher-dashboard/app.js`

**Checkpoint**: All user stories functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, examples, and full test suite verification

- [x] T020 [P] Document `teacherDashboard` configuration, security model, and Brightspace visibility in `docs/user-manual.md` and `docs/software-guidebook.md`
- [x] T021 [P] Add example `teacherDashboard` block in `examples/owe-1.config.json`
- [x] T022 Execute test suites and verify Definition of Done
