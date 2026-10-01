# Quickstart & Validation Guide: Teacher Progress Dashboard

**Feature**: Teacher Progress Dashboard (Voortgangsverkenner)
**Date**: 2026-10-01
**Status**: Complete

## Overview

This guide details runnable verification steps to validate the Teacher Progress Dashboard functionality from configuration to build output, pure calculation logic, and client-side behavior.

---

## 1. Automated Test Suite Verification

Run the targeted test suites covering the configuration validator, calculation logic, and postfix extraction:

```bash
# Run unit and property tests
deno test tests/teacher-dashboard-calc.test.ts
deno test tests/teacher-dashboard-config.test.ts
```

### Expected Outcome:
- All unit tests pass.
- Fast-check property-based tests verify stoplight boundary transitions across 100+ random iterations.

---

## 2. Configuration Validation Check

Verify that invalid threshold values fail fast with actionable messages:

```json
{
  "teacherDashboard": {
    "groupPath": "2026p1-fusten",
    "subgroups": ["Arnhem"],
    "repos": [{ "prefix": "n1", "label": "N1" }],
    "orangeThresholdPercent": 60,
    "redThresholdPercent": 40
  }
}
```

### Expected Outcome:
`bso prepare` fails with:
`Field 'orangeThresholdPercent' must be strictly less than 'redThresholdPercent'.`

---

## 3. Build & Cartridge Packaging Verification

Configure a valid `teacherDashboard` block in `brightspacosaurus.config.json` and build:

```bash
deno task prepare
deno task pack
```

### Verification Checks:
1. `build/brightspace/content/docenten/voortgangsverkenner.html` exists.
2. Injected configuration inside HTML contains public endpoints and prefixes, with zero secrets or access tokens.
3. `build/brightspace/imsmanifest.xml` registers the resource in the cartridge.
4. Without `teacherDashboard` configured, running `bso prepare` generates no dashboard file.

---

## 4. Client-Side Browser Verification (Local Preview)

Launch the preview server:

```bash
deno task preview
```

### Interactive Verification:
1. Navigate to the Teacher Progress Dashboard page.
2. Enter a mock or valid GitLab group access token in the password field. Verify browser password manager prompt.
3. Observe cohort progress rendered with color-coded stoplights per student and repository.
4. Adjust the threshold slider controls on the settings tab; verify that all student indicators update immediately in real time.
5. Check `localStorage` in browser developer tools: verify that token is NOT present in storage, while student progress cache is present with a timestamp.
6. Click "Wis cache" (Clear cache): verify `localStorage` data is purged.
