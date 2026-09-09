# Quickstart: Validate Accessible Diagram Rendering

## Prerequisites

- Deno 2 or newer
- Network access to `https://kroki.io`, or a local Kroki service
- The Mermaid companion service when using local Kroki for Mermaid

## Validate configuration

Add the optional object documented in
[contracts/diagram-config.md](contracts/diagram-config.md) to a test course
configuration. Omit each property once to confirm its default, then set a custom
endpoint and output mode to confirm explicit values win.

## Build representative lessons

```bash
deno task prepare
```

Use one lesson containing a PlantUML fence, one containing a Mermaid fence, and
one containing a non-diagram fence. Confirm:

- supported blocks become visible diagrams;
- the non-diagram block remains code;
- source and description disclosures work with JavaScript disabled;
- the diagram has a non-empty accessible name;
- a generated description is programmatically associated with the image.

## Verify failure policy

Run once with an unreachable endpoint and `failOnError: true`; the command must
fail with source and diagram context. Repeat with `failOnError: false`; the
command must warn, keep the original code block, and complete.

Repeat both modes with invalid diagram source and invalid fence metadata to
confirm author errors remain distinct from endpoint failures.

## Verify determinism

Build identical input twice into clean output directories and compare the topic
HTML byte-for-byte. Accessibility IDs and markup must match.

## Run automated coverage

```bash
deno task test
```

The suite covers configuration, pure adaptation and validation properties,
fixture integration, error policy, preview parity, and representative real/local
rendering. Manual screen-reader testing is still required before claiming WCAG
conformance.
