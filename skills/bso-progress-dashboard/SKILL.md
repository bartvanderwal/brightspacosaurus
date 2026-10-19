---
name: bso-progress-dashboard
description: "Configure and safely preview the BSO GitLab progress dashboard, including repo/class/week mapping, read-only token permissions, traffic lights and local cache. Gebruik dit voor de Voortgangsverkenner, GitLab-dashboard, wekenmapping, privacy of tokenrechten."
---

# Configure the progress dashboard

Use this when an instructor configures the GitLab-backed BSO progress dashboard. Respond in the user's language.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version`; do not silently upgrade.
- Required: Deno 2.0 or newer, a configured `teacherDashboard`, and access to a GitLab server. `pandoc` is not needed for the dashboard itself.
- If testing with live GitLab data, the instructor must supply the token through the dashboard UI; do not ask them to paste it into chat, a file, config, shell history or repository.

## Workflow

1. Map the actual GitLab group, class/subgroups and repository prefixes to the course's documented layout. Validate every prefix and, if using a calendar, assign each repository to exactly one week with ascending dates.
2. Configure only the needed dashboard fields and the teacher-page directive `{@bso-teacher-dashboard}`. Keep the teacher page and dashboard inside the instructor workflow; check the Brightspace visibility of the containing module/topic rather than assuming "hidden" content is access-controlled.
3. Ask the GitLab administrator for a short-lived, fine-grained, read-only token scoped to the course group. The manual lists `Work Item: Read`, `Label: Read`, `Merge Request: Read`, `Commit: Read` and `Group: Read`; it notes that the exact minimum combination still needs confirmation. Do not request member, write or code-content permissions.
4. Run `bso lint`, then `bso preview` and check the page structure with synthetic or instructor-approved data. Test in the Brightspace sandbox before production.

## Privacy and recovery

- Never write tokens into config, source, environment examples, cache or repository. The dashboard keeps its token in browser memory only.
- The dashboard's local cache contains student identifiers and progress metadata. It is not encrypted or an access-control boundary; use a trusted device/profile and clear it with **Cache wissen** before sharing the browser profile. The cache expires after seven days, but an inactive browser cannot perform cleanup while closed.
- Traffic lights reflect configured work-item/commit/comment rules; explain the course's thresholds and mapping before interpreting a color as student performance.
- If permissions return 403, review the read-only scopes and project scope with the administrator; do not broaden access speculatively.
- If mapping is ambiguous, stop and ask the instructor. Do not expose actual student records in prompts, fixtures, screenshots or logs.

See the [dashboard guide](https://bartvanderwal.github.io/brightspacosaurus/guidebook/user-manual/#48-teacher-progress-dashboard-voortgangsverkenner) for current scope, cache behavior and traffic-light rules.
