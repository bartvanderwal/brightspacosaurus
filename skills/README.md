# BSO authoring skills

This repository includes ten small, on-demand [Agent Skills](https://agentskills.io/specification) for authors of Brightspacosaurus client courses. They guide course workflows; they are not instructions for developing BSO. Skills are independent: install only the workflows your project needs.

## Available skills

| Skill | Use it for |
| --- | --- |
| [`bso-course-setup`](bso-course-setup/SKILL.md) | Inventory, configure, build and pack an existing course |
| [`bso-docusaurus-preview`](bso-docusaurus-preview/SKILL.md) | Docusaurus preview, BSO integrations and shared CSS |
| [`bso-readers`](bso-readers/SKILL.md) | Reader Markdown and PDF prerequisites/troubleshooting |
| [`bso-course-lint`](bso-course-lint/SKILL.md) | `bso lint` diagnostics and editor workflow |
| [`bso-quizdown`](bso-quizdown/SKILL.md) | QuizDown authoring, preview and QTI validation |
| [`bso-assignment-issues`](bso-assignment-issues/SKILL.md) | Safely assess assignment-to-CSV workflows; no assumed schema |
| [`bso-progress-dashboard`](bso-progress-dashboard/SKILL.md) | GitLab dashboard mapping, token permissions and privacy |
| [`bso-brightspace-export`](bso-brightspace-export/SKILL.md) | Cartridge build and safe Brightspace import |
| [`bso-content-authoring`](bso-content-authoring/SKILL.md) | Lessons, includes, accessibility, flashcards and optional slides |
| [`bso-upgrade-troubleshooting`](bso-upgrade-troubleshooting/SKILL.md) | CLI/runtime/source/npm versions and permissions |

## Install selected skills in a client project

The source collection lives in `skills/`, the conventional source directory for the Skills CLI. From the **root of the client course project**, run the CLI and select one or more skills:

```sh
npx skills add bartvanderwal/brightspacosaurus --skill bso-course-setup bso-quizdown --agent github-copilot
```

For Claude Code, use `--agent claude-code`; omit `--agent` to use the CLI's interactive agent selection. To pin to a reviewed tag, branch or full commit SHA, use the GitHub tree URL form supported by the CLI:

```sh
npx skills add https://github.com/bartvanderwal/brightspacosaurus/tree/<tag-or-commit>/skills --skill bso-course-setup --agent github-copilot
```

Use a ref that exists and includes the `skills/` directory. Do not assume a BSO runtime version or npm package version is also a skill collection version.

This repository also contains BSO development skills under `.github/skills/`. A whole-repository discovery can list those alongside the authoring collection; use `--skill bso-...` to install only the client workflow(s) you selected.

The Skills CLI is a separate npm-based installer; the BSO course tool itself still requires Deno. Use the documented `npx skills` route. Deno can run many npm packages, but using Deno as a substitute launcher for this installer has not been tested or established as supported.

## Discovery, updates and removal

Agent Skills defines the `SKILL.md` format, not a universal discovery path or installer. Current locations depend on the agent. VS Code supports project skills in `.github/skills/`, `.claude/skills/` and `.agents/skills/`. The Skills CLI currently lists GitHub Copilot (`github-copilot`), Claude Code (`claude-code`), Codex, Cursor, OpenCode and many other targets; the CLI's table is the source of truth for target names and directories. The example above explicitly selects GitHub Copilot. These are integrations that recognize Agent Skills, not a guarantee that every agent discovers every location or activates a skill for every prompt. Check the current documentation for the agent and CLI version in use.

Skills are on-demand instructions: the English `name` and `description` help an agent choose a workflow. The skill body tells the agent to respond in the user's language; no separate translated duplicate is installed.

For a safe update, commit or back up the client project first, inspect local edits to installed skills, then run:

```sh
npx skills list
npx skills update
npx skills remove --skill bso-course-setup --agent github-copilot
```

Review the resulting diff and restore or reconcile local changes before accepting it. For a pinned installation, update by installing the new reviewed Git ref rather than assuming `skills update` changes the pin. Keep project-specific customizations in a separate, clearly named local skill instead of editing the upstream copy. Inspect the diff after removal; if the CLI is unavailable, remove only that skill's directory. Version control/backup is the recovery path for locally edited copies. Never delete an entire skills folder or unrelated local skills.

The CLI has anonymous telemetry. Disable it for a command by setting `DISABLE_TELEMETRY=1` in that command's environment (PowerShell: `$env:DISABLE_TELEMETRY="1"` before running it). Review the current CLI privacy notice before installation.

## Privacy and feature boundaries

- Skills contain workflow instructions only; fixtures and prompts must not contain student data, tokens, credentials or real class records.
- BSO's GitLab dashboard can show student progress and has local browser caching; follow the privacy and token guidance in `bso-progress-dashboard`.
- There is no established `issues.csv` schema/import workflow or BSO CSV command. The relevant skill explicitly stops rather than inventing one.
- Do not assume installing an npm package makes an editor discover skills. Install to a directory the selected agent actually discovers.

## Sources

- Agent Skills. (n.d.). *Specification*. https://agentskills.io/specification
- Microsoft. (n.d.). *Use Agent Skills in VS Code*. https://code.visualstudio.com/docs/agent-customization/agent-skills
- Skills. (n.d.). *CLI reference*. https://skills.sh/docs/cli
- Vercel Labs. (n.d.). *Skills CLI README*. GitHub. https://github.com/vercel-labs/skills#readme

The official Agent Skills specification, VS Code documentation and CLI reference are linked above. The web fetcher could not retrieve those three pages in this environment; their discovery/format details were cross-checked against indexed search results and the Skills CLI repository README/source. Verify commands against the current CLI before use because it is independently versioned.
