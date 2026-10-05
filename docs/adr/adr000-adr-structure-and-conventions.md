# ADR 000 — ADR structure and conventions

## Status

Accepted

## Context

We use Architecture Decision Records (ADRs) to record design decisions. Nygard's original ADR format has four main sections besides the title: Context, Decision, Status and Consequences (Nygard, 2011). We extend it with two sections: Considered options (alternatives that were weighed) and References (APA references).

Nygard describes the purpose of the consequences section as follows: "This section describes the resulting context, after applying the decision. All consequences should be listed here, not just the "positive" ones." (Nygard, 2011).

Several ADR templates (including MADR) add a separate H2 section "Decision Drivers". This leads to a proliferation of sections and makes the structure less predictable. The criteria that drive a decision belong to the problem statement, and therefore to Context.

### Criteria for this meta-decision

- Predictable structure: every ADR has the same H2 sections
- Traceability: criteria can be found without a separate section
- Compatibility with Nygard's original format
- Room for APA references (per AGENTS.md)

## Considered options

### Option A — MADR template with Decision Drivers as H2

The Markdown Architectural Decision Records (MADR) template (Kopp et al., 2018) lists "Decision Drivers" as a separate H2 element, marked optional in the template.

**Pros:** widely used in open-source projects.

**Cons:** an extra section that overlaps with Context; less predictable when some ADRs use it and others do not.

### Option B — Nygard + Considered options + References (chosen)

Nygard's four sections supplemented with "Considered options" and "References". Criteria are part of Context.

**Pros:** compact, predictable, no overlap.

**Cons:** differs from MADR; existing ADRs have to be adjusted.

## Decision

Every ADR has exactly six H2 sections, in this order:

1. `## Status` — Proposed / Accepted / Superseded / Withdrawn
2. `## Context` — Problem statement, background and criteria (as H3 `### Criteria` or inline)
3. `## Considered options` — Alternatives with pros and cons
4. `## Decision` — The chosen option with its rationale
5. `## Consequences` — Positive and negative consequences
6. `## References` — APA references

The "Decision Drivers" section does not exist as an H2. Criteria that drive the decision are included in Context, optionally under an H3 `### Criteria`.

Claims in an ADR are supported by sources that were actually read. Each reference is cited in the text, preferably with a literal quote rather than a paraphrase, so that a reader can check the claim against the source.

### Naming

- File name: `adrNNN-short-description.md` (three digits, kebab-case)
- H1 title: `# ADR NNN — Short description`
- ADRs are written in English.

## Consequences

Positive:

- Every ADR has a predictable structure; reviewers know where to find what.
- No confusion about where criteria belong.

Negative:

- Existing ADRs (001–013) had to be adjusted: "Decision Drivers" moved to Context as an H3.
- The film festival submodule has its own ADRs, which also keep decision drivers in Context instead of a separate "Decision Drivers" H2. Those ADRs are outside the scope of this ADR (separate repository, separate conventions).

## References

- Kopp, O., Armbruster, A., & Zimmermann, O. (2018). Markdown architectural decision records: Format and tool support. In N. Herzberg, C. Hochreiner, O. Kopp, & J. Lenhard (Eds.), *10th ZEUS Workshop, ZEUS 2018, Dresden, Germany, 8–9 February 2018* (CEUR Workshop Proceedings, Vol. 2072). CEUR-WS.org. https://ceur-ws.org/Vol-2072/paper9.pdf
- Nygard, M. (2011, November 15). *Documenting architecture decisions*. Cognitect. Retrieved September 30, 2026, from https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions
