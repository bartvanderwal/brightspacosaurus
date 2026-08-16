/**
 * Tests voor QuizConverter.
 *
 * Feature: brightspacosaurus
 * - Unit-test: converteer een bekend quiz-Markdown bestand en vergelijk structureel met referentie-QTI XML
 * - Property-test: voor alle geldige quiz-Markdown bestanden geldt dat de QTI-output
 *   een <questestinterop>-element bevat met het juiste aantal items
 * Valideert: Requirements 2.3
 */

import { assertEquals } from "@std/assert";
import fc from "fast-check";
import {
  parseQuizMarkdown,
  generateQtiXml,
  deriveQuizIdent,
  convertQuiz,
} from "../src/quiz-converter.ts";
import { join, resolve } from "@std/path";

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------

async function makeTempDir(): Promise<string> {
  return await Deno.makeTempDir({ prefix: "brightspacosaurus_quiz_test_" });
}

async function removeDir(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch {
    // Negeer fouten bij opruimen
  }
}

// ---------------------------------------------------------------------------
// Unit-test: vergelijk output met referentie-QTI XML
// ---------------------------------------------------------------------------

Deno.test("QuizConverter: quiz-2.2-di produceert structureel correcte QTI XML", async () => {
  const quizMarkdown = await Deno.readTextFile(
    "../../6.3.Studentenmateriaal/6.3.1.Studentenhandleiding/Lesbeschrijvingen/week-2/quiz-2.2-di-vragen-en-antwoorden.md"
  );

  const parsed = parseQuizMarkdown(quizMarkdown);
  const ident = deriveQuizIdent("quiz-2.2-di-vragen-en-antwoorden.md");
  const xml = generateQtiXml(parsed, ident);

  // Structurele controles
  assertEquals(parsed.questions.length, 5, "Quiz moet 5 vragen bevatten");
  assertEquals(ident, "quiz-les-2-2-di", "Ident moet correct afgeleid zijn");

  // XML bevat de verwachte structuurelementen
  assertEquals(xml.includes('<?xml version="1.0" encoding="utf-8"?>'), true);
  assertEquals(xml.includes("<questestinterop"), true);
  assertEquals(xml.includes('ident="quiz-les-2-2-di"'), true);
  assertEquals(xml.includes('ident="sectie-les-2-2-di"'), true);

  // Alle 5 vragen als items
  for (let i = 1; i <= 5; i++) {
    assertEquals(xml.includes(`ident="q${i}"`), true, `Item q${i} moet aanwezig zijn`);
  }

  // Correcte antwoorden
  assertEquals(xml.includes("<varequal respident=\"q1_resp\">q1_b</varequal>"), true);
  assertEquals(xml.includes("<varequal respident=\"q2_resp\">q2_a</varequal>"), true);
  assertEquals(xml.includes("<varequal respident=\"q3_resp\">q3_c</varequal>"), true);
  assertEquals(xml.includes("<varequal respident=\"q4_resp\">q4_b</varequal>"), true);
  assertEquals(xml.includes("<varequal respident=\"q5_resp\">q5_b</varequal>"), true);

  // Elke vraag heeft 4 antwoordopties
  const responseLabelCount = (xml.match(/<response_label /g) || []).length;
  assertEquals(responseLabelCount, 20, "5 vragen × 4 opties = 20 response_labels");
});

Deno.test("QuizConverter: convertQuiz schrijft QTI XML naar de juiste uitvoermap", async () => {
  const tempRoot = await makeTempDir();
  try {
    const sourcesDir = join(tempRoot, "sources");
    const quizDir = join(sourcesDir, "week-2");
    const outputDir = join(tempRoot, "build", "quiz");
    await Deno.mkdir(quizDir, { recursive: true });

    const quizContent = `# Quiz Test
## Vraag 1
Wat is 1+1?
- A. 1
- B. 2
- C. 3
- D. 4
Correct antwoord: **B**
`;
    const sourcePath = join(quizDir, "quiz-1.1-test-vragen-en-antwoorden.md");
    await Deno.writeTextFile(sourcePath, quizContent);

    const result = await convertQuiz({
      sourcePath,
      outputDir,
      repoRoot: tempRoot,
      sourcesDir,
    });

    // Bestand moet bestaan
    const stat = await Deno.stat(result.outputPath);
    assertEquals(stat.isFile, true);

    // Uitvoerpad moet de bronmapstructuur weerspiegelen
    assertEquals(result.outputPath.includes("week-2"), true);
  } finally {
    await removeDir(tempRoot);
  }
});


// ---------------------------------------------------------------------------
// Property-test: voor alle geldige quiz-Markdown bestanden geldt dat de
// QTI-output een <questestinterop>-element bevat met het juiste aantal items
// Valideert: Requirements 2.3
// ---------------------------------------------------------------------------

/** Genereer een geldig quiz-Markdown bestand met N vragen. */
const quizMarkdownArb = fc
  .record({
    title: fc.stringMatching(/^[A-Za-z0-9 .-]{3,30}$/),
    questions: fc.array(
      fc.record({
        text: fc.stringMatching(/^[A-Za-z0-9 ,.?!]{5,60}$/),
        options: fc.tuple(
          fc.stringMatching(/^[A-Za-z0-9 ,.]{3,40}$/),
          fc.stringMatching(/^[A-Za-z0-9 ,.]{3,40}$/),
          fc.stringMatching(/^[A-Za-z0-9 ,.]{3,40}$/),
          fc.stringMatching(/^[A-Za-z0-9 ,.]{3,40}$/)
        ),
        correct: fc.constantFrom("A", "B", "C", "D"),
      }),
      { minLength: 1, maxLength: 10 }
    ),
  })
  .map(({ title, questions }) => {
    let md = `# ${title}\n\n`;
    questions.forEach((q, i) => {
      md += `## Vraag ${i + 1}\n\n`;
      md += `${q.text}\n\n`;
      md += `- A. ${q.options[0]}\n`;
      md += `- B. ${q.options[1]}\n`;
      md += `- C. ${q.options[2]}\n`;
      md += `- D. ${q.options[3]}\n\n`;
      md += `Correct antwoord: **${q.correct}**\n\n`;
    });
    return { md, expectedCount: questions.length };
  });

Deno.test("Property: QTI-output bevat <questestinterop> met het juiste aantal items", () => {
  fc.assert(
    fc.property(quizMarkdownArb, ({ md, expectedCount }) => {
      const parsed = parseQuizMarkdown(md);
      const ident = "quiz-les-test";
      const xml = generateQtiXml(parsed, ident);

      // Moet <questestinterop> bevatten
      assertEquals(xml.includes("<questestinterop"), true, "XML moet <questestinterop> bevatten");
      assertEquals(xml.includes("</questestinterop>"), true, "XML moet </questestinterop> bevatten");

      // Aantal items moet overeenkomen met het aantal vragen
      const itemCount = (xml.match(/<item ident="/g) || []).length;
      assertEquals(itemCount, expectedCount, `Verwacht ${expectedCount} items, gevonden ${itemCount}`);

      // Elke vraag moet 4 response_labels hebben
      const responseLabelCount = (xml.match(/<response_label /g) || []).length;
      assertEquals(responseLabelCount, expectedCount * 4, `Verwacht ${expectedCount * 4} response_labels`);
    }),
    { numRuns: 100 }
  );
});
