import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import fc from "fast-check";
import { join } from "@std/path";
import { resolveConfig } from "../src/config-loader.ts";
import { writeTeacherDashboard } from "../src/teacher-dashboard.ts";
import {
  type CacheConfig,
  type CacheData,
  dashboardState as cache,
} from "./helpers/dashboard-state.ts";

const now = Date.parse("2026-10-12T12:00:00Z");
const hour = 60 * 60 * 1000;
const config: CacheConfig = {
  gitlabUrl: "https://gitlab.example.org",
  groupPath: "course",
  repos: [{ prefix: "old" }, { prefix: "current" }],
  weeks: [
    { title: "Old", startsOn: "2026-10-01", repos: ["old"] },
    { title: "Current", startsOn: "2026-10-12", repos: ["current"] },
  ],
};

Deno.test("dashboard export includes state and cache logic referenced by its page", async () => {
  await Deno.mkdir("build", { recursive: true });
  const dir = await Deno.makeTempDir({
    dir: "build",
    prefix: "dashboard-cache-export-",
  });
  try {
    const resolved = resolveConfig(
      {
        courseName: "Cache test",
        version: "1.0.0",
        sourcesDir: "lessons",
        teacherDashboard: {
          groupPath: "course",
          subgroups: ["A"],
          repos: [{ prefix: "one", label: "One" }],
        },
      },
      {},
      Deno.cwd(),
    );
    await writeTeacherDashboard(dir, resolved.teacherDashboard!);
    const html = await Deno.readTextFile(join(dir, "voortgangsverkenner.html"));
    assertStringIncludes(html, '<script src="state.js"></script>');
    assertStringIncludes(
      await Deno.readTextFile(join(dir, "state.js")),
      "bso-dashboard-cache-v1:",
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

function storage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    clear: () => map.clear(),
  };
}

function data(age = 0): CacheData {
  const fetchedAt = new Date(now - age).toISOString();
  return {
    fetchedAt,
    students: {
      alice: {
        studentId: "alice",
        fetchedAt,
        repos: config.repos.map(({ prefix }) => ({
          prefix,
          fetchedAt,
          workItems: [],
        })),
      },
    },
  };
}

Deno.test("dashboard cache restores data, separates courses/classes/configurations, never stores tokens", () => {
  const store = storage();
  const value = { ...data(), token: "secret-token" };
  cache.writeCache(store, config, { A: value }, now);
  assertEquals(cache.readCache(store, config, ["A"], now), { A: data() });
  assertEquals(cache.readCache(store, config, ["B"], now), {});
  assertEquals(
    cache.readCache(store, { ...config, groupPath: "other" }, ["A"], now),
    {},
  );
  assertEquals(
    cache.readCache(
      store,
      { ...config, gitlabUrl: "https://other.org" },
      ["A"],
      now,
    ),
    {},
  );
  assertEquals(
    cache.readCache(store, { ...config, repos: [{ prefix: "different" }] }, [
      "A",
    ], now),
    {},
  );
  assertEquals(store.getItem(store.key(0)!)!.includes("secret-token"), false);
});

Deno.test("dashboard cache respects exact five-minute and 24-hour freshness boundaries", () => {
  assertEquals(cache.staleRepoPrefixes(config, data(5 * 60_000 - 1), now), []);
  assertEquals(cache.staleRepoPrefixes(config, data(5 * 60_000), now), [
    "current",
  ]);
  assertEquals(cache.staleRepoPrefixes(config, data(24 * hour), now), [
    "old",
    "current",
  ]);
  assertEquals(cache.staleRepoPrefixes(config, undefined, now), [
    "old",
    "current",
  ]);
  const failed = data();
  failed.students.alice.repos[0].error = "403";
  assertEquals(cache.staleRepoPrefixes(config, failed, now), ["old"]);
  assertEquals(
    cache.staleRepoPrefixes({ ...config, weeks: [] }, data(5 * 60_000), now),
    ["old", "current"],
  );
});

Deno.test("dashboard cache uses the same local calendar-day boundary as week focus", () => {
  const reference = new Date(2026, 9, 12, 0, 1).getTime();
  const cached = data();
  const fetchedAt = new Date(reference - 6 * 60_000).toISOString();
  cached.fetchedAt = fetchedAt;
  for (const repo of cached.students.alice.repos) repo.fetchedAt = fetchedAt;
  assertEquals(cache.staleRepoPrefixes(config, cached, reference), ["current"]);
});

Deno.test("dashboard cache removes seven-day entries, preserves newer repo timestamps and unrelated storage", () => {
  const store = storage();
  store.setItem("unrelated", "keep");
  const mixed = data(7 * 24 * hour);
  mixed.students.alice.repos[1].fetchedAt = new Date(now - hour).toISOString();
  cache.writeCache(store, config, { A: mixed, B: data(7 * 24 * hour) }, now);
  const restored = cache.readCache(store, config, ["A", "B"], now);
  assertEquals(restored.A.students.alice.repos.map((repo) => repo.prefix), [
    "current",
  ]);
  assertEquals(restored.B, undefined);
  cache.clearCache(store);
  assertEquals(store.length, 1);
  assertEquals(store.getItem("unrelated"), "keep");
});

Deno.test("dashboard cache reports corruption and storage failures explicitly", () => {
  const store = storage();
  const key = cache.cacheKey(config, "A");
  store.setItem(key, "{broken");
  assertThrows(
    () => cache.readCache(store, config, ["A"], now),
    Error,
    "verwijderd",
  );
  assertEquals(store.getItem(key), null);
  store.setItem(key, JSON.stringify({ version: 2, data: data() }));
  assertThrows(() => cache.pruneCache(store, now), Error, "cacheversie");
  store.setItem(key, JSON.stringify({ version: 1, data: data() }));
  store.setItem = () => {
    throw new Error("Quota exceeded");
  };
  assertThrows(
    () => cache.writeCache(store, config, { A: data() }, now),
    Error,
    "Quota exceeded",
  );
  assertStringIncludes(store.getItem(key)!, "alice");
});

Deno.test("property: dashboard cache round-trips valid data deterministically", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 7 * 24 * hour - 1 }), (age) => {
      const store = storage();
      const value = data(age);
      cache.writeCache(store, config, { A: value }, now);
      const serialized = store.getItem(cache.cacheKey(config, "A"));
      cache.writeCache(store, config, { A: value }, now);
      assertEquals(store.getItem(cache.cacheKey(config, "A")), serialized);
      assertEquals(cache.readCache(store, config, ["A"], now).A, value);
    }),
    { numRuns: 100 },
  );
});
