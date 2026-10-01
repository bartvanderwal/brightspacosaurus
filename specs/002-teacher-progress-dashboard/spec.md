# Feature Specification: Teacher Progress Dashboard (Voortgangsverkenner)

**Feature Branch**: `copilot/docent-dashboard-gitlab-work-items`

**Created**: 2026-10-01

**Status**: Ready for Planning

**Input**: User description: "Docent-dashboard: voortgang GitLab-work items per student in Brightspace conform prototype met privacy first, configureerbare drempelwaarden, studentidentificatie via repopostfix en deadline-ondersteuning"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View student work item progress at a glance (Priority: P1)

As a course instructor, I want to open a dedicated teacher page in Brightspace that displays each student and their course repositories with aggregated progress indicators, so I can see at a glance who is on schedule and who needs assistance.

**Why this priority**: Immediate visual insight into student progress across all course repositories is the core value proposition for instructors during lab sessions.

**Independent Test**: Load the progress view with sample course data and verify that students are listed in alphabetical order with their associated repositories and calculated color-coded progress status.

**Acceptance Scenarios**:

1. **Given** a configured course with student repositories and work items, **When** an instructor views the dashboard, **Then** students are displayed alphabetically with their repositories in configured order.
2. **Given** a student repository with work items, **When** the instructor views the repository summary, **Then** an aggregated indicator displays the overall progress color without requiring manual expansion.
3. **Given** an instructor expands a repository, **When** inspecting individual work items, **Then** each work item displays its title, direct link, individual progress indicator, and explicit explanatory reason.
4. **Given** a repository with no active work items, **When** the instructor inspects the repository, **Then** it is visually distinguished as inactive or neutral and excluded from negative progress penalties.

---

### User Story 2 - Privacy-first secure access without data leakage (Priority: P1)

As an instructor and institution, I want authentication and student progress queries to execute strictly client-side from the browser directly to the institution's repository host, so student identities, source code, and access tokens are never transmitted to unauthorized external systems, build artifacts, or artificial intelligence services.

**Why this priority**: Compliance with educational privacy regulations (GDPR/AVG) and zero data leakage to external models are strict institutional prerequisites.

**Independent Test**: Verify that the generated course package and configuration contain no access tokens, that access credentials reside only in transient memory during an active session, and that all data retrieval occurs directly between the browser and the repository host.

**Acceptance Scenarios**:

1. **Given** a generated course cartridge or build output, **When** inspecting files, **Then** no personal access tokens, student usernames, or repository secrets are present.
2. **Given** an instructor enters an access token on the dashboard, **When** checking persistent browser storage (`localStorage`, `sessionStorage`, cookies), **Then** the token is not stored in any persistent storage.
3. **Given** an instructor navigates away or closes the browser tab, **When** the page is reloaded, **Then** the transient in-memory token is cleared.
4. **Given** a student accesses the course material, **When** the dashboard page is encountered without an instructor token, **Then** no student progress data is revealed.

---

### User Story 3 - Cached offline-friendly review and selective refresh (Priority: P2)

As an instructor, I want fetched student progress data cached locally in my browser with visible timestamps and options to refresh individually, so that reviewing progress is instant and does not overwhelm repository rate limits during class.

**Why this priority**: Repeated full refreshes across dozens of students and repositories consume high network traffic and time; instructors need instant cached access and selective refresh when a student pushes new work during a lab.

**Independent Test**: Fetch data once, refresh the browser page, and verify that progress loads immediately from cache without external requests; then trigger a single-student refresh and verify that only that student's repositories are updated.

**Acceptance Scenarios**:

1. **Given** previously retrieved student progress data, **When** the instructor opens or refreshes the page, **Then** the data is displayed immediately from cache alongside an explicit timestamp indicating when it was fetched.
2. **Given** cached data and a student who just submitted work, **When** the instructor triggers "Refresh this student", **Then** only that specific student's repositories and work items are re-queried and updated in the cache.
3. **Given** an instructor wanting a complete update, **When** triggering full refresh, **Then** all student repositories are updated with progress feedback and non-blocking failure isolation per repository.
4. **Given** an instructor using a shared workstation, **When** triggering "Clear cache", **Then** all locally stored student progress data is purged.

---

### User Story 4 - Adjustable status thresholds for differentiated cohort review (Priority: P3)

As an instructor, I want to adjust progress indicator thresholds dynamically using visual controls and course configuration, so that visual indicators reflect cohort expectations rather than showing an undifferentiated sea of a single color.

**Why this priority**: Cohorts vary in pace across course weeks; instructors need flexibility to recalibrate what percentage of incomplete work warrants caution or alarm.

**Independent Test**: Adjust the progress threshold controls and verify that the cohort and student summary indicators immediately re-evaluate and re-color without page reload or re-fetching.

**Acceptance Scenarios**:

1. **Given** course configuration with custom threshold percentages, **When** the dashboard loads, **Then** initial indicator calculations honor the configured threshold values.
2. **Given** the dashboard view, **When** the instructor adjusts a threshold control, **Then** all student and repository progress indicators recalculate immediately based on the new boundaries.
3. **Given** threshold adjustments, **When** resetting to defaults, **Then** indicators restore their standard configuration boundaries.

---

### User Story 5 - Configurable completion criteria including comments and deadlines (Priority: P3)

As an instructor, I want work item completion evaluation to enforce linked student commits and optionally require explanatory comments, while treating future deadlines neutrally, so that assessment is accurate and fair.

**Why this priority**: Tasks require actual implementation commits rather than superficial status changes, and future tasks should not artificially mark students as behind.

**Independent Test**: Verify that work items without linked commits are marked incomplete, work items with future deadlines are marked neutral/not yet due, and enabling the comment requirement alters completion scoring appropriately.

**Acceptance Scenarios**:

1. **Given** a work item marked done in the repository system, **When** it has at least one linked commit authored by the student, **Then** it qualifies as complete (Green).
2. **Given** a work item marked done, **When** it has no linked student commits, **Then** it receives an in-progress indicator (Orange) with the reason "Status done without linked commits".
3. **Given** the "require comments" option is active and a work item is marked done with commits, **When** no comments exist on the work item, **Then** it receives an in-progress indicator (Orange) with the reason "No comment/details provided in work item".
4. **Given** a work item not yet started with a due date in the future, **When** evaluated, **Then** it receives a neutral "Not yet due" status and is excluded from the total incomplete percentage denominator.

---

### Edge Cases

- **Missing or empty student repository**: Displayed as neutral/gray; excluded from the denominator so students are not penalized for repositories not yet initialized.
- **Instructor commits only**: Commits authored by recognized course instructors or coordinators do not count toward student completion criteria.
- **Repository request error (404/403/rate limit)**: Isolated to the affected repository with an actionable warning; other repositories continue to load successfully.
- **Expired or revoked access token**: Clear error message explaining that the token was rejected, prompting entry of an active group token.
- **All work items in future**: If all active items for a repository are "Not yet due", the overall repository status displays neutral/gray.
- **No dashboard configured**: If the course configuration omits the dashboard block, no dashboard page or related assets are generated into the course package.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support defining teacher dashboard configuration in the course build configuration, specifying the repository host URL, group path, subgroups, repository prefixes with labels, and instructor usernames.
- **FR-002**: System MUST default the repository host URL to the standard platform host when not explicitly configured.
- **FR-003**: System MUST omit generating teacher dashboard content and assets entirely when the dashboard section is absent from the configuration.
- **FR-004**: System MUST validate configured threshold percentages such that both values are between 0 and 100 inclusive, with the cautionary threshold strictly less than the critical threshold.
- **FR-005**: System MUST extract student identities deterministically from repository names using the postfix following the configured repository prefix.
- **FR-006**: System MUST aggregate and group all identified repositories under each student and display students in alphabetical order.
- **FR-007**: System MUST evaluate work item completion status using linked commit verification, excluding commits authored by configured instructor usernames.
- **FR-008**: System MUST classify work items with status `todo` and a future deadline as neutral ("Not yet due") and exclude them from the progress calculation denominator.
- **FR-009**: System MUST classify work items according to the defined stoplight rules: Green (complete with student commits and comments if required), Orange (in progress, done without student commits, or done without comments when required), Red (not started and overdue/no deadline), and Gray (not yet due).
- **FR-010**: System MUST support a configurable setting and dynamic user control to require explanatory comments on work items for 100% completion credit.
- **FR-011**: System MUST compute overall repository and student progress status using the configured or user-adjusted percentage thresholds for incomplete items.
- **FR-012**: System MUST render all retrieved user data, issue titles, and comments safely as plain text to prevent cross-site scripting.
- **FR-013**: System MUST provide accessible visual indicators using distinct colors, text labels, and semantic ARIA attributes.
- **FR-014**: System MUST keep access tokens strictly in volatile browser memory and never persist them to disk, cookies, web storage, or network logs.
- **FR-015**: System MUST cache retrieved student progress data in local browser storage partitioned by host, group, and subgroup, with recorded fetch timestamps.
- **FR-016**: System MUST provide controls to refresh all student data, refresh a single student's data, and clear the local cache.

### Key Entities

- **TeacherDashboardConfig**: Configuration defining repository platform location, group/subgroup paths, expected repository prefixes, instructor usernames, threshold percentages, and comment requirement settings.
- **Student**: Identified course participant extracted from repository naming postfixes, containing an identifier, display label, and collection of course repositories.
- **StudentRepository**: A specific course repository assigned to a student matching a configured prefix, containing work items, overall progress status, and fetch timestamp.
- **WorkItem**: A tracked assignment or task containing an identifier, title, remote URL, current lifecycle state, due date, linked commits, comment count, assigned indicator status, and explanatory reason.
- **ProgressStatus**: The classified evaluation result (Green, Orange, Red, Gray) with human-readable rationale and accessibility labels.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Instructors can review the progress status of a cohort of 35 students across 6 repositories in under 5 seconds from cached local storage upon opening the dashboard.
- **SC-002**: Opening or refreshing the dashboard page with existing cached data initiates 0 external network requests until a refresh action is triggered.
- **SC-003**: Refreshing a single student triggers queries exclusively for that student's repositories without re-fetching other cohort data.
- **SC-004**: 100% of generated course build output files and persistent browser storage entries are verifiably free of access tokens.
- **SC-005**: All student and repository progress indicators immediately re-render in under 100 milliseconds upon user adjustment of threshold sliders.
- **SC-006**: 100% of progress indicators convey status through both color and text/screen-reader labels to ensure full accessibility.

## Assumptions

- Instructors possess or are provided a read-only group access token with `read_api` permission for the relevant course group.
- Student repositories follow the naming convention of `[prefix]-[studentIdentifier]` within the course subgroup.
- The remote repository platform allows direct cross-origin API requests (`OPTIONS` and `GET`) from the browser environment when presenting the access token header.
- Instructors access the dashboard using modern evergreen browsers with local storage and JavaScript enabled.
- Student work items link commits via standard commit message references (such as `#12` or `fixes #12`) or linked merge requests.
