---
name: bso-assignment-issues
description: "Assess whether a course's lesson assignments can become issues.csv, first verifying the real CSV schema, import target and workflow. Gebruik dit voor opdrachten omzetten naar issues.csv, GitLab-issues of CSV-import."
---

# Prepare assignment issues safely

Use this when an instructor asks to turn lesson assignments into an issue CSV. Respond in the user's language.

## Requirements

- Minimum verified BSO version: **0.29.0** for course context; BSO does not provide an established issues.csv export.
- Read access to approved course Markdown. Do not request GitLab credentials or student information.
- An instructor must identify and approve the real import target, its current CSV schema, required fields, encoding, quoting rules and import workflow before generating an importable CSV.

## Workflow

1. Inventory candidate assignments and cite their source file/heading. Distinguish explicitly authored requirements from suggestions; do not infer due dates, points, student assignments or statuses.
2. Ask the instructor to provide authoritative schema documentation or a known-good, synthetic example and name the target system/workflow. Do not fabricate column names or infer a schema from another tool.
3. Until schema and target are verified, produce only a reviewable Markdown/table draft; label it **not importable**. There is no supported BSO `issues.csv` generator or import command.
4. Once the instructor approves the schema and draft, generate the CSV from course text only. Use stable identifiers derived from a stable course/lesson/assignment reference; detect collisions against existing records or an instructor-provided export before proposing new rows.
5. Show the full proposed records for instructor review. Do not upload, create issues, assign work or import anything without explicit confirmation.

## Privacy, validation and failure

- Never send student data, grades, submissions, names, private repositories or tokens to an LLM automatically. Do not include them in fixtures, prompts, CSV drafts or shared logs.
- Use synthetic examples when testing CSV quoting/encoding. Validate header, field count per row, escaping, newline behavior and uniqueness against the approved schema.
- If the target/schema cannot be verified, stop at the non-importable draft. If identifiers collide or fields are missing, ask the instructor; do not silently invent replacements.
- Report that CSV validation does not verify the target system's import behavior. Test only in an authorized sandbox.
