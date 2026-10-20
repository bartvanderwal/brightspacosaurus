---
name: bso-docusaurus-preview
description: "Add or configure a Docusaurus preview for a BSO course, connect its plugins and shared CSS, and compare preview with export."
---

# Add a Docusaurus preview

Use this for a course project that wants a local site preview of its BSO material. Respond in the user's language; Dutch course content and Dutch prompts are supported.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required: Deno 2.0 or newer and Node.js/npm for the Docusaurus application. Use the project's existing Node and Docusaurus versions where present.
- `pandoc` is not needed for the preview. Build permissions may include read/write and approved diagram-network access.

## Workflow

1. Inspect the course config, source directories and existing Docusaurus app. Do not replace an existing app or package manifest.
2. If no app exists, agree on its location and use the official Docusaurus npm scaffolding flow. Install the BSO npm package only if required by that app; the BSO CLI itself runs on Deno.
3. Set `docusaurusDir` in the course config to the existing app directory. Integrate only the plugin and `clientModules` entries needed for the BSO features actually used, following the current [Docusaurus integration guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/software-guidebook/).
4. Start `bso preview` from the course root. It writes the complete shared stylesheet to `src/generated/brightspacosaurus.css` in the configured Docusaurus app. Import it from the app's `src/css/custom.css` before course overrides, and keep that stylesheet registered in `docusaurus.config.js`. Do not use a path into a neighboring BSO checkout or a hardcoded `node_modules` path.
5. Review representative lessons, links/includes, quizzes, diagrams, tabs, flashcards and any configured teacher page. Compare the same content in a BSO build; investigate differences rather than hiding them with preview-only fixes.

## Validate and recover

- Confirm the Docusaurus dev server starts without unresolved module, plugin or CSS import errors.
- Build/export and compare the rendered features that the course actually uses. Preview success alone does not validate the `.imscc`.
- If the generated stylesheet cannot be resolved, run `bso preview` once before starting Docusaurus and check `docusaurusDir` and the generated import path.
- If BSO features do not appear, verify the configured `docusaurusDir` and the exact integrations for the feature. Do not invent plugin names or claim parity for untested behavior.
- Do not replace or delete app files, update dependencies or commit generated output without the author's approval.

The preview is optional. A course without Docusaurus can still use `bso build` and `bso pack`.
