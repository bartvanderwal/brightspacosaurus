# ADR 026 — The identity of a learning objective is a code in the text, separate from its criterion

## Status

Proposed (to be accepted by the owner; then immutable)

## Context

Phase 1 of the tickable learning objectives keeps the state of each box in the `localStorage` of the student's browser. The key is the page plus a hash of the text of the objective (rule LG8). That key breaks in three cases the owner wants to allow:

- the author rewords an objective (the hash changes);
- the author reorders the objectives of a lesson (a key built from the position would change);
- the author moves an objective to another lesson (the page changes).

In each case the student would lose the ticks, without a message. The key is also written into the browsers of students and into the files of authors, so it is hard to change later.

The coming traceability and coverage (#65, #66; Software Guidebook, 2.5.2) also need an objective to name the outcome it serves. owe-1 already codes outcomes (LUK) as `FUSTEN 0X` and assessment criteria (AC) as `FUSTEN 0X-0Y`.

### Criteria

- **Stable:** the identity survives rewording, reordering and moving to another lesson.
- **Readable and typable by an author**, and usable as a storage key.
- **Checkable:** a lint rule can find a duplicate or a missing code.
- **One canonical form** (strict, not forgiving); no guessing.
- **No repetition:** the course code is not typed in every objective.

## Considered options

### Option A — A code from the position in the course (`FUSTEN 1.1-A`)

**Cons:** the code contains the lesson number and the order, so moving or reordering changes the identity. Rejected.

### Option B — A random id

**Pros:** stable.

**Cons:** not readable, not typable, not reviewable in a diff. Rejected.

### Option C — A topic slug only (`aaa-pattern`)

**Pros:** stable, readable.

**Cons:** a topic is not unique: one topic has several objectives (explain it, apply it, judge it). It names a core concept more than an objective. Rejected by the owner.

### Option D — A code that contains the criterion (`FUSTEN 01-02/aaa-pattern`)

**Pros:** the hierarchy is visible in the code.

**Cons:** moving an objective to another criterion, or renumbering a criterion, changes the identity. A relation is not an identity. Rejected.

### Option E — Cognitive level and topic, with an optional qualifier (`R-aaa-pattern`), and the criterion as a separate property

**Pros:** stable under rewording, reordering and moving; readable; unique where it must be, because *explain the pattern* and *apply the pattern* are different objectives with different codes; the level is stored once, in the code; the relation can change without changing the identity; a lint rule finds duplicates.

**Cons:** the author must choose a level and a topic name; changing the level makes it another objective, so the ticks start empty (which is the intended meaning: a student who can explain a pattern cannot yet be said to apply it). Two objectives of the same topic and level need a qualifier.

## Decision

**Option E.**

1. **Identity.** An objective has a code `<level>-<topic>` or `<level>-<topic>-<qualifier>`, for example `R-aaa-pattern`: a level letter from the cognitive scale (from reproduction, R, to synthesis, S; the letters between are to be set), then lower-case words with hyphens. It is unique in the course and written in braces at the end of the item, `{#R-aaa-pattern}`; BSO removes the braces from the visible text. It contains no lesson number, no position and no criterion.
2. **Criterion.** An objective belongs to **exactly one** assessment criterion, the main one, in the same braces: `{#R-aaa-pattern ac=FUSTEN-01-02}`. The outcome follows from the criterion, so one reference is enough. An objective that serves two criteria is written as two objectives. Where the course description names only an outcome, the reference may be the outcome; `bso lint` warns when a criterion exists.
3. **Structure.** An outcome has criteria, a criterion has objectives, a lesson has objectives, a quiz question tests one objective: every objective and every question has one parent in each hierarchy. Together they form a directed acyclic graph of two trees that share their leaves, the objectives. Coverage (#65, #66) counts along these edges.
4. **Storage key.** `bso:goals:v2:<course code>:<code of the objective>`. The course code comes from the configuration, so two courses on one origin do not share keys. An objective **without** a code keeps the key of phase 1 (page and hash of the text, `v1`); this is an explicit second form, and `bso lint` can ask for a code once traceability is configured.
5. **Level.** The cognitive level is read from the code, not stored a second time.

## Consequences

- Positive: ticks survive rewording, reordering and moving; the structure is checkable; the code is readable in a diff.
- Positive: the format is decided before any course has a code in it.
- Negative: the author must give each objective a code to benefit from this; objectives without one still break when reworded.
- Negative: raising the level of an objective starts its ticks again. Accepted: it is another objective.
- Negative: two forms of the key exist (with and without code). Rejected alternative: demand a code on every objective now, which would make phase 1 harder to use for courses that only want boxes.
- A change of the key format needs a new version in the key (`v3`) and a note for the students, because their ticks are in their browsers.
- Not decided here: the format of the document that holds the outcomes and criteria (`traceability.oweDocument` in #65), the name of the configuration key for the course code, the letters of the cognitive scale, whether a topic must be the name of a core concept, and whether `learningGoals` is renamed `learningObjectives`.

## Sources

- Poorvu Center for Teaching and Learning. (n.d.). *Writing learning goals, objectives, and outcomes*. Yale University. <https://poorvucenter.yale.edu/teaching/teaching-resource-library/writing-learning-goals-objectives-and-outcomes> (the distinction between goal, objective and outcome).
- Issues #65 and #66 of this repository, for the codes of owe-1 (`FUSTEN 0X`, `FUSTEN 0X-0Y`).
