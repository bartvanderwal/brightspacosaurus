import { assertEquals, assertThrows } from "@std/assert";
import { validateConfig } from "../src/config-loader.ts";
import { resolvePptxSettings } from "../src/pptx/settings.ts";
import fc from "fast-check";

const base = { courseName: "Course", version: "1.0.0", sourcesDir: "lessons" };
const md = (fields: string) => `---\nslides: true\n${fields}\n---\n\n# Title\n`;

// Spec *Rendered PowerPoint export*, rules E1 and E4.
Deno.test("E1: mode resolves deck over course over raster, independently of the export switch", () => {
  assertEquals(resolvePptxSettings(md(""), {}, "deck.md").mode, "raster");
  assertEquals(resolvePptxSettings(md(""), {}, "deck.md").origin, "default");
  for (const course of ["raster", "native"] as const) {
    const config = { pptxMode: course };
    assertEquals(resolvePptxSettings(md(""), config, "deck.md").mode, course);
    assertEquals(
      resolvePptxSettings(md(""), config, "deck.md").origin,
      "course",
    );
    for (const deck of ["raster", "native"] as const) {
      const settings = resolvePptxSettings(
        md(`pptxMode: ${deck}`),
        config,
        "deck.md",
      );
      assertEquals(settings.mode, deck);
      assertEquals(settings.origin, "deck");
    }
  }
  assertEquals(
    resolvePptxSettings(md("pptx: false\npptxMode: native"), {}, "deck.md")
      .mode,
    "native",
  );
});

Deno.test("E1: invalid and duplicate modes fail with the source and key", () => {
  for (const value of ["auto", "true", "42", "null", "[]", '""']) {
    assertThrows(
      () => resolvePptxSettings(md(`pptxMode: ${value}`), {}, "bad.md"),
      Error,
      "bad.md",
    );
    assertThrows(
      () =>
        validateConfig({ ...base, slides: { lessons: {}, pptxMode: value } }),
      Error,
      "slides.pptxMode",
    );
  }
  assertThrows(
    () =>
      resolvePptxSettings(
        md("pptxMode: native\npptxMode: raster"),
        {},
        "duplicate.md",
      ),
    Error,
    "duplicate.md",
  );
});

Deno.test("E4: the source notice defaults on and inherits text or visibility independently", () => {
  const defaultNotice = resolvePptxSettings(md(""), {}, "deck.md").notice;
  assertEquals(defaultNotice.startsWith("Generated from Markdown."), true);
  assertEquals(
    resolvePptxSettings(md(""), { pptxSourceNotice: false }, "deck.md").notice,
    "",
  );
  assertEquals(
    resolvePptxSettings(md("pptxSourceNotice: true"), {
      pptxSourceNotice: false,
    }, "deck.md").notice,
    defaultNotice,
  );
  assertEquals(
    resolvePptxSettings(md("pptxSourceNotice: 'Edit the source: Git'"), {
      pptxSourceNotice: false,
    }, "deck.md").notice,
    "Edit the source: Git",
  );
  assertEquals(
    resolvePptxSettings(md("pptxSourceNotice: false"), {
      pptxSourceNotice: "Source",
    }, "deck.md").notice,
    "",
  );
  for (const value of ["42", "null", "[]", '""']) {
    assertThrows(
      () => resolvePptxSettings(md(`pptxSourceNotice: ${value}`), {}, "bad.md"),
      Error,
      "pptxSourceNotice",
    );
  }
});

Deno.test("E1/E4: both global settings are validated without enabling export", () => {
  for (const pptxMode of ["native", "raster"]) {
    for (const pptxSourceNotice of [true, false, "Edit Markdown"]) {
      assertEquals(
        validateConfig({
          ...base,
          slides: { lessons: {}, pptx: false, pptxMode, pptxSourceNotice },
        }),
        true,
      );
    }
  }
  for (const pptxSourceNotice of [null, 42, [], ""]) {
    assertThrows(
      () =>
        validateConfig({ ...base, slides: { lessons: {}, pptxSourceNotice } }),
      Error,
      "slides.pptxSourceNotice",
    );
  }
});

Deno.test("E1: arbitrary notice text cannot affect mode precedence", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("native" as const, "raster" as const),
      fc.constantFrom("native" as const, "raster" as const),
      fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0),
      (course, local, notice) => {
        const source = md(
          `pptxMode: ${local}\npptxSourceNotice: ${JSON.stringify(notice)}`,
        );
        const resolved = resolvePptxSettings(
          source,
          { pptxMode: course },
          "generated.md",
        );
        assertEquals(resolved.mode, local);
        assertEquals(resolved.notice, notice);
      },
    ),
    { numRuns: 100 },
  );
});
