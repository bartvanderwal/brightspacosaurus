/**
 * Unit tests for teacher dashboard configuration validation and resolution.
 *
 * Verifies validation rules, defaults, and boundary conditions for
 * `teacherDashboard` in `brightspacosaurus.config.json`.
 */

import { assertEquals, assertThrows } from "@std/assert";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import type { TeacherDashboardConfig } from "../src/types.ts";

const REPO_ROOT = "/repo";

function baseConfig(teacherDashboard?: unknown): Record<string, unknown> {
  return {
    courseName: "Test Course",
    version: "1.0.0",
    sourcesDir: "src/",
    ...(teacherDashboard !== undefined ? { teacherDashboard } : {}),
  };
}

Deno.test("validateConfig accepts absent teacherDashboard", () => {
  assertEquals(validateConfig(baseConfig()), true);
});

Deno.test("validateConfig accepts valid minimal teacherDashboard", () => {
  const teacherDashboard: TeacherDashboardConfig = {
    groupPath: "course-group",
    subgroups: ["Arnhem"],
    repos: [{ prefix: "pod", label: "POD" }],
  };
  assertEquals(validateConfig(baseConfig(teacherDashboard)), true);
});

Deno.test("validateConfig accepts valid full teacherDashboard", () => {
  const teacherDashboard: TeacherDashboardConfig = {
    gitlabUrl: "https://gitlab.aimsites.nl",
    groupPath: "2026p1-fusten",
    subgroups: ["Arnhem", "Nijmegen"],
    repos: [
      { prefix: "pod", label: "POD" },
      { prefix: "n1-chuck-a-luck", label: "N1 Chuck-a-luck" },
    ],
    teacherUsernames: ["teacher1", "coordinator"],
    orangeThresholdPercent: 15,
    redThresholdPercent: 60,
    requireCommentsForDone: true,
  };
  assertEquals(validateConfig(baseConfig(teacherDashboard)), true);
});

Deno.test("teacherDashboard weeks map repos to ascending, valid course dates", () => {
  const teacherDashboard: TeacherDashboardConfig = {
    groupPath: "course-group",
    subgroups: ["Arnhem"],
    repos: [
      { prefix: "pod", label: "POD" },
      { prefix: "n1", label: "N1" },
    ],
    weeks: [
      { title: "Week 1", startsOn: "2026-09-01", repos: ["pod"] },
      { title: "Week 2", startsOn: "2026-09-08", repos: ["n1"] },
    ],
  };
  assertEquals(validateConfig(baseConfig(teacherDashboard)), true);
  const resolved = resolveConfig(
    baseConfig(teacherDashboard) as unknown as import("../src/types.ts").BsoConfig,
    {},
    REPO_ROOT,
  );
  assertEquals(resolved.teacherDashboard?.weeks, teacherDashboard.weeks);
});

Deno.test("validateConfig rejects malformed, unordered or incomplete teacherDashboard weeks", () => {
  const td = (weeks: unknown) =>
    baseConfig({
      groupPath: "grp",
      subgroups: ["A"],
      repos: [{ prefix: "pod", label: "POD" }, { prefix: "n1", label: "N1" }],
      weeks,
    });
  assertThrows(() => validateConfig(td([])), Error, "teacherDashboard.weeks");
  assertThrows(
    () => validateConfig(td([{ title: "Week 1", startsOn: "2026-02-30", repos: ["pod", "n1"] }])),
    Error,
    "startsOn",
  );
  assertThrows(
    () => validateConfig(td([
      { title: "Week 1", startsOn: "2026-09-08", repos: ["pod"] },
      { title: "Week 2", startsOn: "2026-09-01", repos: ["n1"] },
    ])),
    Error,
    "ascending startsOn",
  );
  assertThrows(
    () => validateConfig(td([
      { title: "Week 1", startsOn: "2026-09-01", repos: ["pod"] },
      { title: "Week 2", startsOn: "2026-09-08", repos: ["pod"] },
    ])),
    Error,
    "only be assigned",
  );
  assertThrows(
    () => validateConfig(td([{ title: "Week 1", startsOn: "2026-09-01", repos: ["pod"] }])),
    Error,
    "must be assigned",
  );
  assertThrows(
    () => validateConfig(td([
      { title: "Week 1", startsOn: "2026-09-01", repos: ["pod", "n1"] },
      { title: "Week 1", startsOn: "2026-09-08", repos: ["n1"] },
    ])),
    Error,
    "title' must be unique",
  );
});

Deno.test("validateConfig rejects non-object teacherDashboard", () => {
  assertThrows(() => validateConfig(baseConfig("not-an-object")));
  assertThrows(() => validateConfig(baseConfig(null)));
  assertThrows(() => validateConfig(baseConfig(123)));
});

Deno.test("validateConfig rejects missing or non-string groupPath", () => {
  assertThrows(() => validateConfig(baseConfig({})));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: 123 })));
});

Deno.test("validateConfig rejects invalid gitlabUrl", () => {
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", gitlabUrl: "" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", gitlabUrl: "not-a-url" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", gitlabUrl: "ftp://gitlab.com" })));
});

Deno.test("validateConfig rejects invalid subgroups", () => {
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", subgroups: "not-an-array" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", subgroups: [123] })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", subgroups: [""] })));
});

Deno.test("validateConfig rejects invalid repos", () => {
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", repos: "not-an-array" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", repos: [{ prefix: "pod" }] })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", repos: [{ label: "POD" }] })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", repos: [{ prefix: "", label: "POD" }] })));
});

Deno.test("validateConfig rejects invalid teacherUsernames", () => {
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", teacherUsernames: "not-an-array" })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", teacherUsernames: [123] })));
});

Deno.test("validateConfig rejects invalid thresholds and invariant violations", () => {
  // Out of 0..100 bounds
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", orangeThresholdPercent: -5 })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", orangeThresholdPercent: 105 })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", redThresholdPercent: 105 })));
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", redThresholdPercent: -1 })));

  // Invariant: orangeThresholdPercent must be strictly less than redThresholdPercent
  assertThrows(() =>
    validateConfig(baseConfig({
      groupPath: "grp",
      orangeThresholdPercent: 50,
      redThresholdPercent: 50,
    }))
  );
  assertThrows(() =>
    validateConfig(baseConfig({
      groupPath: "grp",
      orangeThresholdPercent: 60,
      redThresholdPercent: 40,
    }))
  );
});

Deno.test("validateConfig rejects non-boolean requireCommentsForDone", () => {
  assertThrows(() => validateConfig(baseConfig({ groupPath: "grp", requireCommentsForDone: "true" })));
});

Deno.test("resolveConfig applies correct default values for teacherDashboard", () => {
  const resolved = resolveConfig(
    baseConfig({
      groupPath: "test-cohort",
      subgroups: ["Arnhem"],
      repos: [{ prefix: "pod", label: "POD" }],
    }) as unknown as import("../src/types.ts").BsoConfig,
    {},
    REPO_ROOT,
  );

  assertEquals(resolved.teacherDashboard?.groupPath, "test-cohort");
  assertEquals(resolved.teacherDashboard?.gitlabUrl, "https://gitlab.com");
  assertEquals(resolved.teacherDashboard?.subgroups, ["Arnhem"]);
  assertEquals(resolved.teacherDashboard?.repos, [{ prefix: "pod", label: "POD" }]);
  assertEquals(resolved.teacherDashboard?.teacherUsernames, []);
  assertEquals(resolved.teacherDashboard?.orangeThresholdPercent, 10);
  assertEquals(resolved.teacherDashboard?.redThresholdPercent, 50);
  assertEquals(resolved.teacherDashboard?.requireCommentsForDone, false);
  assertEquals(resolved.teacherDashboard?.weeks, []);
});

Deno.test("teacherDashboard.module is validated like readersModule, with a required slug", () => {
  const td = (module: unknown) => baseConfig({ groupPath: "g", subgroups: ["A"], repos: [{ prefix: "p", label: "P" }], module });
  assertEquals(validateConfig(td({ slug: "algemeen" })), true);
  assertEquals(validateConfig(td({ slug: "algemeen", title: "Algemeen" })), true);
  assertThrows(() => validateConfig(td({ title: "Algemeen" })), Error, "teacherDashboard.module.slug");
  assertThrows(() => validateConfig(td({ slug: "../x" })), Error, "teacherDashboard.module.slug");
  assertThrows(() => validateConfig(td({ slug: "a", titel: "x" })), Error, "teacherDashboard.module.titel");
  assertThrows(() => validateConfig(td("algemeen")), Error, "teacherDashboard.module");
});

Deno.test("resolveConfig: teacherDashboard.module defaults to null and resolves slug and title", () => {
  const resolve = (module?: { slug: string; title?: string }) =>
    resolveConfig({
      courseName: "C",
      version: "1",
      sourcesDir: "s",
      teacherDashboard: { groupPath: "g", ...(module ? { module } : {}) },
    }, {}, REPO_ROOT).teacherDashboard?.module;
  assertEquals(resolve(), null);
  assertEquals(resolve({ slug: "algemeen", title: " Algemeen " }), { slug: "algemeen", title: "Algemeen" });
});
