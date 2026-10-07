import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "@std/assert";
import { join } from "@std/path";
import { convertQuiz, generateQtiXml } from "../src/quiz-converter.ts";
import { parseQuizMarkdown, validateQuiz } from "../src/quiz-parser.ts";
import { remarkQuizPreview } from "../src/quiz-preview.ts";
import type { FlashcardNode } from "../src/flashcards.ts";
import { resolveQuizOptions } from "../src/quiz-config.ts";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { runPack, runPrepare } from "../src/main.ts";
import JSZip from "jszip";

const question = (
  answer = "Correct antwoord: A",
  options = "- A. Yes\n- B. No",
) => `# Quiz\n\n## Vraag 1\n\nIs this correct?\n\n${options}\n\n${answer}\n`;

Deno.test("#34 answer formatting, Dutch/English labels and option punctuation preserve the QTI key", () => {
  for (
    const label of [
      "Correct antwoord",
      "Goede antwoord",
      "Goed antwoord",
      "Juiste antwoord",
      "Antwoord",
      "Correct answer",
      "Answer",
      "**Antwoord:**",
    ]
  ) {
    for (const letter of ["a", "A", "**A**", "`a`", "__A__"]) {
      for (
        const options of [
          "- A. Yes\n- B. No",
          "**a)** Yes\n**b)** No",
          "a) Yes\nb) No",
          "- **A.** Yes\n- **B.** No",
        ]
      ) {
        const quiz = parseQuizMarkdown(
          question(
            `${label}${label.includes(":") ? "" : ":"} ${letter}`,
            options,
          ),
        );
        assertEquals(validateQuiz(quiz), []);
        const xml = generateQtiXml(quiz, "quiz-test");
        assertStringIncludes(
          xml,
          '<varequal respident="q1_resp">q1_a</varequal>',
        );
      }
    }
  }
});

Deno.test("#34 rejects missing, duplicate, ambiguous or unreachable answers and invalid options", () => {
  for (
    const markdown of [
      question(""),
      question("Antwoord: Z"),
      question("Antwoord: A or B"),
      question("Antwoord: A\nAntwoord: A"),
      question("Antwoord: A\nAntwoord: B"),
      question("Antwoord: A, A"),
      question("Antwoord: A", ""),
      question("Antwoord: A", "- A. Yes"),
      question("Antwoord: A", "- A. Yes\n- A. No"),
      question("Antwoord: A", "- A. Yes\n- B. No\n- C. "),
      question("Antwoord: A", "- [x] Yes\n- [ ] No"),
      question("", "- [ ] Yes\n- [ ] No"),
      question("", "- [x] Yes\n- B. No"),
      question() + "\n## Vraag 1\nAgain?\n- A. Yes\n- B. No\nAntwoord: A\n",
      question().replace("Is this correct?", ""),
    ]
  ) {
    assertThrows(
      () => generateQtiXml(parseQuizMarkdown(markdown), "invalid"),
      Error,
      "Question 1",
    );
  }
  assertThrows(
    () => generateQtiXml(parseQuizMarkdown("# No questions"), "empty"),
    Error,
    "No questions found",
  );
  const quiz = parseQuizMarkdown(question());
  quiz.questions[0].options[0].text = "";
  assertThrows(
    () => generateQtiXml(quiz, "invalid"),
    Error,
    "text cannot be empty",
  );
  quiz.questions[0].options[0].label = "a";
  assertEquals(
    validateQuiz(quiz).some((issue) => issue.rule === "quiz-option-label"),
    true,
  );
});

Deno.test("multiple-response questions accept answer keys and checked options", () => {
  for (
    const [answer, expected] of [
      ["Correct answer: A, C", ["A", "C"]],
      ["Correct answer: A and C", ["A", "C"]],
      ["Correct answer: AC", ["A", "C"]],
    ] as const
  ) {
    const quiz = parseQuizMarkdown(
      question(answer, "- A. Yes\n- B. No\n- C. Maybe"),
    );
    assertEquals(validateQuiz(quiz), []);
    assertEquals(quiz.questions[0].correctAnswers, expected);
    assertStringIncludes(
      generateQtiXml(quiz, "multiple"),
      "<fieldentry>cc.multiple_response.v0p1</fieldentry>",
    );
  }

  const checked = parseQuizMarkdown(
    question("", "- [x] Yes\n- [ ] No\n- [x] Maybe"),
  );
  assertEquals(validateQuiz(checked), []);
  assertEquals(checked.questions[0].correctAnswers, ["A", "C"]);
  assertStringIncludes(
    generateQtiXml(checked, "checkbox"),
    'response_lid ident="q1_resp" rcardinality="Multiple"',
  );
});

Deno.test("multiple-response preview renders checkboxes and all correct answers", () => {
  const tree: FlashcardNode = { type: "root", children: [] };
  remarkQuizPreview()(tree, {
    path: "quiz-multiple.md",
    value: question(
      "Correct answer: A, C",
      "- A. Yes\n- B. No\n- C. Maybe",
    ),
  });

  const section = tree.children?.[0];
  const fieldset = section?.children?.[0];
  assertEquals(fieldset?.data?.hProperties?.["data-response-type"], "multiple");
  assertEquals(
    fieldset?.data?.hProperties?.["data-correct-answers"],
    '["A","C"]',
  );
  const list = fieldset?.children?.[2];
  assertEquals(
    list?.children?.map((item) =>
      item.children?.[0]?.children?.[0]?.data?.hProperties?.type
    ),
    ["checkbox", "checkbox", "checkbox"],
  );
  assertEquals(
    fieldset?.children?.[3]?.children?.[1]?.children?.[0]?.value,
    "Yes, Maybe",
  );
});

Deno.test("QuizDown syntax supports multiple-choice, hints and open answers", () => {
  const markdown = `# UML Quiz

\`\`\`quiz debug=true
? Which statements are correct?
! Think about time-ordered messages.
- [x] They show interactions over time.
- [ ] They replace all class diagrams.
- [x] They can show self-messages.

? Name one participant.
= wolf / little red / grandmother ~20
\`\`\`
`;
  const quiz = parseQuizMarkdown(markdown);
  assertEquals(validateQuiz(quiz), []);
  assertEquals(quiz.title, "UML Quiz");
  assertEquals(quiz.questions[0].responseType, "multiple");
  assertEquals(quiz.questions[0].hint, "Think about time-ordered messages.");
  assertEquals(quiz.questions[1].responseType, "open_short");
  assertEquals(quiz.questions[1].acceptedAnswers, [
    "wolf",
    "little red",
    "grandmother",
  ]);
  assertEquals(quiz.questions[1].maxLength, 20);

  const tree: FlashcardNode = { type: "root", children: [] };
  remarkQuizPreview()(tree, { path: "quiz-uml.md", value: markdown });
  const questions = tree.children?.[0]?.children ?? [];
  assertEquals(
    questions[0].data?.hProperties?.["data-response-type"],
    "multiple",
  );
  assertEquals(
    questions[0].children?.[2]?.children?.[0]?.children?.[0]?.children?.[0]
      ?.data?.hProperties?.type,
    "checkbox",
  );
  assertEquals(
    questions[0].children?.[4]?.children?.[1]?.children?.[0]?.value,
    "Think about time-ordered messages.",
  );
  assertEquals(
    questions[1].data?.hProperties?.["data-response-type"],
    "open_short",
  );
  assertEquals(
    questions[1].children?.[2]?.data?.hProperties?.maxlength,
    "20",
  );
});

Deno.test("QuizDown preserves nested fenced question content", () => {
  const quiz = parseQuizMarkdown(`# Quiz

\`\`\`quiz
? What does this code print?
\`\`\`java
System.out.println("Hello");
\`\`\`
- (x) Hello
- ( ) Goodbye
\`\`\`
`);
  assertEquals(validateQuiz(quiz), []);
  assertStringIncludes(
    quiz.questions[0].text,
    '\`\`\`java\nSystem.out.println("Hello");\n\`\`\`',
  );
});

Deno.test("#34 fenced examples cannot inject question headings or correct answer declarations", () => {
  const markdown = question("") +
    "\n```md\n## Question 9\nCorrect answer: A\n```\n";
  const quiz = parseQuizMarkdown(markdown);
  assertEquals(quiz.questions.length, 1);
  assertEquals(quiz.questions[0].correctAnswer, "");
  assertEquals(
    validateQuiz(quiz).some((issue) => issue.rule === "quiz-answer"),
    true,
  );
});

Deno.test("#34 conversion fails with source path and question number before writing a QTI file", async () => {
  const root = await Deno.makeTempDir();
  try {
    const sourcePath = join(root, "quiz-invalid.md");
    await Deno.writeTextFile(sourcePath, question("Correct antwoord: Z"));
    await assertRejects(
      () =>
        convertQuiz({
          sourcePath,
          sourcesDir: root,
          repoRoot: root,
          outputDir: join(root, "out"),
        }),
      Error,
      `${sourcePath}:3: Question 1`,
    );
    await assertRejects(
      () => Deno.stat(join(root, "out")),
      Deno.errors.NotFound,
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("#35 shared config defaults to fixed order and rejects invalid shuffle settings", () => {
  assertEquals(resolveQuizOptions(), { maxAttempts: 0, shuffleAnswers: false });
  for (const shuffleAnswers of [true, false]) {
    const raw = {
      courseName: "Quiz",
      version: "1.0",
      sourcesDir: "lessons",
      quiz: { shuffleAnswers },
    };
    assertEquals(validateConfig(raw), true);
    assertEquals(
      resolveConfig(raw, {}, Deno.cwd()).quiz.shuffleAnswers,
      shuffleAnswers,
    );
  }
  for (const shuffleAnswers of ["true", 1, null, [], {}]) {
    assertThrows(
      () => resolveQuizOptions({ shuffleAnswers }),
      Error,
      "quiz.shuffleAnswers",
    );
  }
});

Deno.test("#35 shuffle settings survive prepare and pack with deterministic answer IDs and scoring", async () => {
  const root = await Deno.makeTempDir();
  try {
    await Deno.mkdir(join(root, "lessons"));
    await Deno.writeTextFile(
      join(root, "lessons", "quiz-example.md"),
      question(),
    );
    for (const shuffleAnswers of [true, false]) {
      const config = resolveConfig(
        {
          courseName: "Quiz",
          version: "1.0",
          sourcesDir: "lessons",
          quiz: { shuffleAnswers },
        },
        {},
        root,
      );
      await runPrepare(config, false, { skipReaders: true });
      await runPack(config);
      const zip = await JSZip.loadAsync(
        await Deno.readFile(join(config.outputDir, "quiz.v1.0.imscc")),
      );
      const qtiFile = Object.keys(zip.files).find((name) =>
        name.endsWith(".xml") && name.includes("qti-")
      )!;
      const xml = await zip.file(qtiFile)!.async("string");
      assertStringIncludes(
        xml,
        `<render_choice shuffle="${shuffleAnswers ? "Yes" : "No"}">`,
      );
      assertStringIncludes(
        xml,
        '<varequal respident="q1_resp">q1_a</varequal>',
      );
      assertStringIncludes(xml, 'response_label ident="q1_a"');
      const parsed = parseQuizMarkdown(question());
      assertEquals(
        generateQtiXml(parsed, "quiz", 0, shuffleAnswers),
        generateQtiXml(parsed, "quiz", 0, shuffleAnswers),
      );
    }
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});
