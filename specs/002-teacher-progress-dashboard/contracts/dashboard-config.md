# Contract: Teacher Dashboard Configuration

**Feature**: Teacher Progress Dashboard (Voortgangsverkenner)
**Date**: 2026-10-01
**Status**: Stable

## Configuration Contract (`brightspacosaurus.config.json`)

The `teacherDashboard` property is optional at the top level of `brightspacosaurus.config.json`. When present, it must conform to the following JSON schema contract:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "TeacherDashboardConfig",
  "type": "object",
  "required": ["groupPath", "subgroups", "repos"],
  "properties": {
    "gitlabUrl": {
      "type": "string",
      "format": "uri",
      "default": "https://gitlab.com"
    },
    "groupPath": {
      "type": "string",
      "minLength": 1
    },
    "subgroups": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "minItems": 1
    },
    "repos": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["prefix", "label"],
        "properties": {
          "prefix": { "type": "string", "minLength": 1 },
          "label": { "type": "string", "minLength": 1 }
        }
      }
    },
    "teacherUsernames": {
      "type": "array",
      "items": { "type": "string" },
      "default": []
    },
    "requireCommentsForDone": {
      "type": "boolean",
      "default": false
    },
    "orangeThresholdPercent": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "default": 10
    },
    "redThresholdPercent": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "default": 50
    },
    "weeks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "object",
        "required": ["title", "startsOn", "repos"],
        "properties": {
          "title": { "type": "string", "minLength": 1 },
          "startsOn": { "type": "string", "format": "date" },
          "repos": {
            "type": "array",
            "minItems": 1,
            "items": { "type": "string", "minLength": 1 }
          }
        }
      }
    }
  }
}
```

## Validation Rules

1. `groupPath`: Must not be empty and must not contain leading/trailing slashes.
2. `subgroups`: Must contain at least one non-empty string.
3. `repos`: Must contain at least one object with non-empty `prefix` and `label`.
4. `orangeThresholdPercent` & `redThresholdPercent`:
   - Both must be numbers between 0 and 100.
   - `orangeThresholdPercent` must be strictly less than `redThresholdPercent`:
     $0 \le \text{orangeThresholdPercent} < \text{redThresholdPercent} \le 100$.
5. If validation fails, `bso prepare` fails immediately with an actionable error message on `stderr`.
6. Optional `weeks` must be ordered by unique ascending `startsOn` dates. Every configured repository prefix must occur in exactly one week.
