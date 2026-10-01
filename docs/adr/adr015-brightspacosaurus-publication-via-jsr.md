# ADR 015 — Publication of Brightspacosaurus through JSR

## Status

Accepted

## Context

Brightspacosaurus is a CLI tool and library written in TypeScript, running on Deno (see ADR 008). To make the tool reusable, both as an executable script and as an importable module, a distribution strategy must be chosen.

The choice of package registry affects discoverability, versioning, type information, and consistency with the runtime and toolchain already chosen.

JSR describes itself as follows: "The JavaScript Registry (JSR) is a modern package registry for JavaScript and TypeScript. JSR works with many runtimes (Node.js, Deno, Bun, browsers, and more) and is backwards compatible with npm." (JSR, n.d.).

### Criteria

- Native support for Deno without a separate build or transpilation step
- Automatically indexed TypeScript types (no `@types` packages needed)
- Versioning with changelog support
- Minimal impedance mismatch with the existing Deno toolchain
- No unnecessary coupling to an external platform or vendor

## Considered options

### Option A — npm registry (npmjs.com)

Publish to the standard npm registry, reachable via `npm:brightspacosaurus` in Deno.

**Pros:**

- Large reach; used by the broad JavaScript/TypeScript ecosystem.
- Familiar to most developers.

**Cons:**

- Requires a build step: TypeScript must be transpiled to CommonJS and/or ESM, including `package.json` and declaration files.
- No native Deno support; imports work through the `npm:` specifier, but the tooling goes against the grain of Deno.
- Larger attack surface (see ADR 008): npm is a primary target for supply chain attacks.
- Conversely, Deno-specific features (permission model, top-level await without a wrapper) are not expressed well in an npm package.

### Option B — GitHub Packages (npm-compatible)

Publish to GitHub's npm-compatible package registry.

**Pros:**

- Integrated with the GitHub repository; releases and packages are linked.
- Supports npm-compatible installation.

**Cons:**

- Same build step required as option A.
- Authentication is required for installation, even for public packages, which makes use by third parties harder.
- No native Deno support.
- Couples the tool strongly to the GitHub platform.

### Option C — URL distribution through a git tag

Deno supports imports over HTTPS, so modules can be distributed directly through a raw URL or a git tag, without a registry.

**Pros:**

- No external registry needed.
- Works natively in Deno.
- No extra configuration or account required.

**Cons:**

- No central version index; users must know the exact URL or tag.
- No indexed type information; auto-complete and type checking work less well.
- No dependency graph visualization or dependency analysis.
- deno.land/x (the earlier Deno registry based on this model) is officially deprecated in favor of JSR.

### Option D — JSR (jsr.io) (chosen)

Publish to the JavaScript Registry (JSR), developed and maintained by the Deno team but designed as a runtime-agnostic registry for modern JavaScript and TypeScript.

**Pros:**

- Native Deno support: `deno publish` publishes directly from the existing `deno.json`, without a build step or extra configuration. The command is documented as "Publish the current working directory's package or workspace" (Deno, n.d.).
- TypeScript source is published directly: "Modules are published to JSR as TypeScript source code. API documentation generation, type declarations for Node-like environments, and transpilation are all handled by JSR." (Deno, 2024).
- Versioning with semver, yanking of broken versions, and a public version index.
- The package can also be used from Node.js, Bun and browsers through JSR's npm compatibility layer, so there is no lock-in.
- Smaller attack surface than npm (see ADR 008): fewer packages, fewer transitive dependencies.
- No postinstall scripts (Deno does not run them); this also applies to packages installed through JSR.

**Cons:**

- JSR is younger than npm and has a smaller user base.
- Discoverability and awareness are lower than npm for developers outside the Deno ecosystem.
- Requires a JSR account and setting up a scope (`@scope/brightspacosaurus`).

## Decision

We choose publication through JSR (option D). JSR is the logical continuation of ADR 008: the same arguments that put Deno above Node.js (no postinstall scripts, no `node_modules`, native TypeScript) also put JSR above npm. The tool is published as `@soro/brightspacosaurus` on jsr.io. (Correction: it was eventually published as `@bartvanderwal/brightspacosaurus`.)

Publication runs through `deno publish` in the CI/CD pipeline, based on the existing `deno.json`. No separate build step is needed.

### Deliberately not chosen

- npm registry: requires a build step and introduces npm risks that ADR 008 aims to avoid.
- GitHub Packages: mandatory authentication for public packages makes use by third parties harder.
- URL distribution: no registry benefits (type index, versioning, discoverability); deno.land/x is also deprecated.

## Consequences

Positive:

- Publication is fully automated through `deno publish` without a transpilation step.
- Users get automatically generated API documentation and type information on jsr.io.
- The package can be used from Deno, Node.js and Bun without changes.

Negative:

- A JSR scope (`@soro`) must be created and managed.
- Developers who only know npm have to get used to the JSR workflow.
- JSR's smaller user base means community support is more limited than for npm.

## References

- Deno. (n.d.). *deno publish*. Deno Docs. Retrieved September 30, 2026, from https://docs.deno.com/runtime/reference/cli/publish/
- Deno. (2024). *Introducing JSR - the JavaScript Registry*. Retrieved September 30, 2026, from https://deno.com/blog/jsr_open_beta
- JSR. (n.d.). *Introduction to JSR*. Retrieved September 30, 2026, from https://jsr.io/docs
