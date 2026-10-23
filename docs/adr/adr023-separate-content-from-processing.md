# ADR 023 — Separate content from processing

## Status

Proposed

## Context

BSO exists to keep two things apart: the **content** of a course (Markdown, images, quizzes, readers, slides) and the **processing** that turns it into a Brightspace package, a preview, PDFs and slides. A course repository holds content and a small `brightspacosaurus.config.json`; the software, converters, filters and scripts live in BSO.

That separation is easy to lose. A course team that needs something BSO does not do yet writes its own code in the course repository: for example scripts that copy part of the teacher folder into the student folder, or that strip teacher-only sections before a build. Each such script is one more thing to maintain per course, it hides the real structure of the material inside code, and it cannot be linted, tested or reused by other courses. The question "which parts of the material are for students?" (#127) is a good example: it is content knowledge, but the answer ends up as logic in a script.

This ADR follows ADR 021 (convention over configuration and good defaults), ADR 020 (strict, one canonical form), the "No magic" principle in Software Guidebook section 5.1, and issue #127; no external sources were consulted.

ADR 021 sets the other half: BSO offers conventions and good defaults so that a course needs little configuration. This ADR states the boundary that makes that possible.

### Criteria

- A course repository can be understood by reading its content and its configuration alone.
- The processing is written, tested and fixed once, in BSO, for every course.
- Authors get help from BSO (lint, Skills, defaults) to put content in the right place.
- A course that needs something unusual still has a way forward.
- No magic: BSO says what it does (ADR 021, Software Guidebook 5.1).

## Considered options

### Option A — Courses bring their own processing

Each course writes the scripts it needs around BSO (copy, filter, rename, post-process).

**Pros:** nothing waits for BSO; maximum freedom.

**Cons:** the logic is duplicated and drifts per course; it is invisible to `bso lint`; it breaks when BSO changes; behaviour that should be the same across courses (what students may see) is decided by whoever wrote the script.

### Option B — BSO does the processing; the course arranges its content (chosen)

BSO gets the capability (for example selecting student-facing parts of mixed material), driven by conventions in the content (a folder, a front matter marker, a section heading), with a default that works without configuration and a setting only for what BSO cannot know. `bso lint` checks that the content follows the convention and says how to fix it; the BSO Skills teach agents and authors the same convention.

**Pros:** one implementation, tested once; the course repository stays plain content; lint and Skills can guide authors; behaviour is the same across courses.

**Cons:** BSO has to grow the feature before a course can use it; a convention that proves wrong is a behaviour change for every course (ADR 021, "Consequences").

### Option C — Hooks for custom pre- and post-processing, as an escape hatch

BSO runs a configured script before or after a step (before scanning, after the build output is written).

**Pros:** covers needs that no convention fits; keeps an unusual course unblocked.

**Cons:** a hook is code in the course again, so every cost of option A returns, but with BSO's authority behind it; hooks run arbitrary commands, which is a security and "no magic" concern (ADR 021); hooks invite a course to stay on a script instead of asking for a BSO feature.

## Decision

Not decided yet; the recommendation below is for discussion.

**Recommendation: Option B as the rule, with option C later and only as a narrow, visible escape hatch.**

1. **Content in the course, processing in BSO.** When a course needs logic to prepare its content for students, that is a request for a BSO feature (an issue), not a script in the course repository.
2. **Convention first.** The feature is driven by where and how the content is written, with defaults (ADR 021). Configuration only where BSO cannot know the answer.
3. **Lint and Skills do the guiding.** `bso lint` reports content that does not follow the convention and names the fix; the Skills describe the convention for authors and agents.
4. **Existing scripts stay allowed.** BSO does not forbid a course from running its own scripts around BSO. It does not support them either, and it does not read their results as part of its contract.
5. **Hooks later, if at all.** If hooks are added, they run only commands the course lists in its configuration, announce each hook when it runs (no magic), and write only to the build directory. The decision to add them gets its own ADR.

## Consequences

**Positive**

- Course repositories stay readable and uniform; a new teacher can find the structure in the content.
- Behaviour that matters for students is decided in one place and tested once.
- Features such as the student version of mixed material (#127) are built in BSO, with a convention, a lint rule and documentation.

**Negative**

- Some needs wait until BSO supports them; the course owner has to file the request and may keep a script in the meantime.
- BSO has to decide conventions on behalf of all courses, and a wrong one costs a version bump and a changelog entry.
- The boundary needs guarding: a convenient script in a course will keep appearing, and each one is a signal that a BSO feature is missing.
