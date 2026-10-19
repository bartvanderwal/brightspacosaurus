---
name: bso-ans-sync
description: "Check whether BSO supports exporting or synchronizing quizzes with ANS and explain the current boundary. Gebruik dit bij ANS, Ans-sync, quizexport naar ANS of synchronisatie met ANS."
---

# ANS is not a supported BSO export target

Use this when asked to export or synchronize BSO quizzes with ANS. Answer in the user's language.

## Requirements

- Minimum verified BSO version: **0.29.0**. Check `bso --version` and the current BSO user manual before describing capabilities.
- No ANS account, token or student data is needed to check BSO's supported features.

## Current boundary

BSO generates QTI 1.2 for Brightspace. The shared quiz model is not itself an ANS integration. ANS may accept other QTI versions, but that does not mean BSO can export or synchronize to ANS.

There is **no supported BSO Ans export/synchronization command or workflow** established by this skill. Do not invent a command, claim compatibility, request an ANS token, or upload a quiz on the user's behalf.

## Workflow and validation

1. Check the installed BSO version and the current published user manual for a documented ANS feature.
2. If no documented support exists, explain that the requested integration is future work and offer the existing Brightspace QTI workflow as a separate option.
3. If the user wants ANS support, help them specify a feature request: target ANS import API/format, supported QTI version, authoring subset, authentication model and sandbox validation. Clearly separate requirements from implemented capability.
4. Only report an ANS export as available after a released BSO version documents the command and its end-to-end validation.

Do not tell the user to run a nonexistent ANS-related BSO command.
