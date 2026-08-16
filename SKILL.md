# Brightspacosaurus CLI Skill

Use this skill when implementing or changing the `brightspacosaurus` tooling that prepares and packages Brightspace content into a `.imscc` file.

## Scope

This skill is for:

- CLI commands under `scripts/brightspacosaurus/`
- Packaging and validation for Brightspace Common Cartridge output
- File transforms needed before packaging

This skill is not for:

- Generic lesson content edits
- Java/Python assignment implementation
- Non-Brightspace packaging formats

## Runtime And Stack

- Runtime: Deno ≥ 2.0 (see ADR 008)
- Language: TypeScript
- Package registry: JSR + npm via Deno compatibility layer
- No `node_modules`; dependencies cached globally by Deno

## CLI Contract

Implement and maintain these commands (via `deno task`):

1. `prepare`
2. `pack`
3. `test`

### `prepare`

Purpose:

- Scan known source directories (convention over configuration)
- Convert Markdown to standalone HTML for Brightspace import
- Copy images and adjust paths
- Output to `build/brightspace/content/`

### `pack`

Purpose:

- Build a `.imscc` artifact from prepared content in `build/brightspace/`
- Generate `imsmanifest.xml`
- Deterministic file ordering for reproducible archives

### `test`

Purpose:

- Run all unit and property-based tests via `deno test`
- Property tests use fast-check (npm:fast-check via Deno)

## Engineering Rules

- Keep commands idempotent
- Fail fast with actionable error messages to stderr
- Use deterministic file ordering when creating archives
- All output goes to `build/`, never next to source files
- Convention over configuration: no config file needed for the default flow

## Security And Safety

- Validate input paths; reject paths outside repository root
- Use Deno permission flags to restrict file access (`--allow-read=. --allow-write=build/`)
- No postinstall scripts (Deno default)
- Pin dependency versions via deno.lock

## Test Requirements

For CLI changes, include or update tests for:

- Command argument validation
- Deterministic output naming and structure
- Property-based tests for correctness properties (see design.md)
- Error scenarios (missing directories, invalid paths)

## Definition Of Done

A change is done when:

1. `prepare` and/or `pack` behavior is implemented as specified
2. `deno task test` passes locally
3. Package layout checks pass for sample content
4. Command usage is documented in README.md
