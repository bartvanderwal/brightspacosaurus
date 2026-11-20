/** Fixed manifest: 30 slides, 100 bullets, 10 content illustrations, no repeated logos. */
export function benchmarkDeck(): string {
  const pictures = [
    "slides/images/dino-whiteboard.jpg",
    "slides/images/red-green-refactor.jpg",
    "slides/images/student-teacher.jpg",
    "slides/images/test-pyramid-platforms.jpg",
    "lessons/images/course-overview-markdown-to-package.jpg",
    "lessons/images/for-teachers-inspect-package.jpg",
    "lessons/images/course-overview-team-at-screen.jpg",
    "lessons/features/images/bso-features-pictogram-board.jpg",
    "lessons/week-1/images/week-1-authoring-code-links-flashcards.jpg",
    "lessons/week-2/images/week-2-package-conveyor-pdf-diagram-version.jpg",
  ];
  const slides = [
    "# Rendered export benchmark\n\nThirty slides from one Markdown source.\n\n<!-- Title note. -->",
  ];
  for (let n = 1; n < 30; n++) {
    let body = `# Section ${n}\n\n`;
    if (n <= 20) {
      body += Array.from(
        { length: 5 },
        (_, i) =>
          `- Point ${
            (n - 1) * 5 + i + 1
          }: verify the observable result before changing the implementation.`,
      ).join("\n");
    } else {
      body += "```typescript\n" + [
        "interface Item { id: number; label: string; }",
        "function labels(items: Item[]): string[] {",
        "  return items",
        "    .filter((item) => item.id > 0)",
        "    .map((item) => item.label);",
        "}",
        `const section = ${n};`,
      ].join("\n") + "\n```\n\n[Reference](https://example.org/reference)";
    }
    if (n <= 10) {
      body +=
        `\n\n![bg right:35% Content illustration ${n}](../../examples/demo-course/${
          pictures[n - 1]
        })`;
    }
    body += `\n\n<!-- Teacher note for section ${n}. -->`;
    slides.push(body);
  }
  return "---\nslides: true\ntitle: Rendered export benchmark\npaginate: true\nstyle: |\n  section { font-family: Arial, sans-serif; }\n  code, pre { font-family: 'Courier New', monospace; }\n---\n\n" +
    slides.join("\n\n---\n\n") + "\n";
}
