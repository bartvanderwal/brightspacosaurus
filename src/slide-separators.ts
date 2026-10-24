/**
 * Finds `---` slide separators that make Marp show an empty slide: one that
 * ends the body, starts it, follows another `---`, or sits directly before a
 * heading that `headingDivider` already turns into a new slide.
 * A `---` with content between it and the next heading stays valid: it splits
 * one section over two slides.
 *
 * Deliberately free of imports, so every module that needs it can load it.
 * @module
 */

/** The heading levels a slide deck's `headingDivider` front matter splits on. */
export function headingDividerLevels(header: string): number[] {
  const value = header.match(/^headingDivider[ \t]*:[ \t]*(.+?)[ \t]*$/m)?.[1];
  if (!value) return [];
  const numbers = (value.match(/\d+/g) ?? []).map(Number).filter((level) =>
    level >= 1 && level <= 6
  );
  // A single number N means levels 1..N; a list names the levels itself.
  if (value.trim().startsWith("[")) return numbers;
  return numbers.length
    ? Array.from({ length: numbers[0] }, (_, i) => i + 1)
    : [];
}

/** Zero-based line numbers of the `---` separators in `body` that give an empty slide. */
export function findEmptySlideSeparators(
  body: string,
  dividerLevels: number[] = [],
): number[] {
  const lines = body.split("\n");
  const separators: number[] = [];
  let fence: string | undefined;
  let inComment = false;
  const meaningful: {
    index: number;
    kind: "sep" | "heading" | "content";
    level?: number;
  }[] = [];
  lines.forEach((line, index) => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1];
    if (fence) {
      if (marker && marker[0] === fence[0] && marker.length >= fence.length) {
        fence = undefined;
      }
      return;
    }
    if (marker) {
      fence = marker;
      meaningful.push({ index, kind: "content" });
      return;
    }
    if (inComment) {
      if (line.includes("-->")) inComment = false;
      return;
    }
    const trimmed = line.trim();
    if (!trimmed) return;
    if (trimmed.startsWith("<!--")) {
      if (!trimmed.includes("-->")) inComment = true;
      return;
    }
    if (/^ {0,3}---+[ \t]*$/.test(line)) {
      meaningful.push({ index, kind: "sep" });
      return;
    }
    const heading = line.match(/^ {0,3}(#{1,6})\s/);
    meaningful.push(
      heading
        ? { index, kind: "heading", level: heading[1].length }
        : { index, kind: "content" },
    );
  });
  meaningful.forEach((item, position) => {
    if (item.kind !== "sep") return;
    const previous = meaningful[position - 1];
    const next = meaningful[position + 1];
    if (
      !previous || !next || next.kind === "sep" ||
      (next.kind === "heading" && dividerLevels.includes(next.level!))
    ) separators.push(item.index);
  });
  return separators;
}

/** `body` without the separators that {@link findEmptySlideSeparators} reports. */
export function dropEmptySlideSeparators(
  body: string,
  dividerLevels: number[],
): string {
  const drop = new Set(findEmptySlideSeparators(body, dividerLevels));
  if (!drop.size) return body;
  return body.split("\n").filter((_, index) => !drop.has(index)).join("\n");
}
