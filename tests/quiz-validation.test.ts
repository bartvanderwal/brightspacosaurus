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
import { quizTextNodes } from "../src/quiz-markdown.ts";
import type { FlashcardNode } from "../src/flashcards.ts";
import { resolveQuizOptions } from "../src/quiz-config.ts";
import { resolveConfig, validateConfig } from "../src/config-loader.ts";
import { runBuild, runPack } from "../src/main.ts";
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
    assertEquals(quiz.questions[0].correctAnswers, [...expected]);
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
    fieldset?.children?.[3]?.children?.[1]?.children?.map((answer) =>
      answer.children?.[0]?.value
    ),
    ["Yes", "Maybe"],
  );
});

Deno.test("quiz preview and QTI export render prompt, option and hint Markdown from the same tree (parity)", () => {
  const markdown = `# Code quiz

\`\`\`\`quiz
? Use \`private\` here:

\`\`\`java
class A {
    private int x;
}
\`\`\`

! The \`private\` keyword.

- (x) \`List<String>\`
- ( ) This one:
  \`\`\`jsx
  const el = <Button title="A & B" />;
  \`\`\`
\`\`\`\`
`;
  const quiz = parseQuizMarkdown(markdown);
  const [question] = quiz.questions;
  const tree: FlashcardNode = { type: "root", children: [] };
  remarkQuizPreview()(tree, { path: "quiz-code.md", value: markdown });
  const fieldset = tree.children?.[0]?.children?.[0];

  // Prompt with a code block: a div holding exactly the shared mdast nodes.
  const prompt = fieldset?.children?.[1];
  assertEquals(prompt?.data?.hName, "div");
  assertEquals(prompt?.children, quizTextNodes(question.text).nodes);
  const code = prompt?.children?.find((node) => node.type === "code") as
    | { lang?: string; value?: string }
    | undefined;
  assertEquals(code?.lang, "java");
  assertEquals(code?.value, "class A {\n    private int x;\n}");

  // Options: inline code stays inline, a code block becomes a block.
  const optionText = (index: number) =>
    fieldset?.children?.[2]?.children?.[index]?.children?.[0]?.children?.[2];
  assertEquals(optionText(0)?.data?.hName, "span");
  assertEquals(optionText(0)?.children, quizTextNodes("`List<String>`").nodes);
  assertEquals(optionText(1)?.data?.hName, "div");
  assertEquals(
    optionText(1)?.children,
    quizTextNodes(question.options[1].text).nodes,
  );

  // Hint: inline code, not literal backticks.
  const hint = fieldset?.children?.find((node) =>
    node.data?.hProperties?.className === "bso-quiz-hint"
  );
  assertEquals(hint?.children?.[1]?.children?.[1]?.type, "inlineCode");

  // The QTI export renders the same nodes: code elements, no backticks.
  const xml = generateQtiXml(quiz, "quiz-code");
  assertStringIncludes(xml, "&gt;private&lt;/code&gt;");
  assertStringIncludes(
    xml,
    "&lt;code class=&quot;language-java code-highlight&quot;&gt;",
  );
  assertStringIncludes(
    xml,
    "&lt;code class=&quot;language-jsx code-highlight&quot;&gt;",
  );
  assertEquals(xml.includes("`"), false);
});

Deno.test("legacy assignments share context across typed, scored subquestions", () => {
  const markdown = `# FizzBuzz

## Opdracht 27

De gedeelde context.

\`\`\`java
class FizzBuzz {}
\`\`\`

### Deelvraag 27a (2 pt)

Welke klasse wordt gedeeld?

- A. FizzBuzz
- B. BuzzFizz

Correct antwoord: A

### Deelvraag 27b (3 pt)

Wat is de naam van de klasse?

Correct antwoord: Paris / New York
`;
  const quiz = parseQuizMarkdown(markdown);
  assertEquals(validateQuiz(quiz), []);
  assertEquals(quiz.questions.length, 2);
  assertEquals(quiz.questions[0].label, "27a");
  assertEquals(quiz.questions[0].points, 2);
  assertEquals(quiz.questions[1].label, "27b");
  assertEquals(quiz.questions[1].points, 3);
  assertEquals(quiz.questions[1].responseType, "open_short");
  assertEquals(quiz.questions[1].acceptedAnswers, ["Paris", "New York"]);

  const block = quiz.blocks?.[0];
  assertEquals(block?.type, "assignment");
  if (block?.type !== "assignment") {
    throw new Error("Expected assignment block");
  }
  assertStringIncludes(block.assignment.text, "De gedeelde context.");
  assertStringIncludes(block.assignment.text, "class FizzBuzz {}");
  assertEquals(block.assignment.questions, quiz.questions);

  const xml = generateQtiXml(quiz, "quiz-fizzbuzz");
  assertEquals((xml.match(/<section\b/g) ?? []).length, 1);
  assertStringIncludes(
    xml,
    '<section ident="sectie-fizzbuzz_opdracht_27_1" title="Opdracht 27">',
  );
  assertStringIncludes(xml, '<rubric view="All">');
  assertStringIncludes(xml, "De gedeelde context.");
  assertEquals((xml.match(/De gedeelde context/g) ?? []).length, 1);
  assertStringIncludes(xml, "<fieldentry>cc.multiple_choice.v0p1</fieldentry>");
  assertStringIncludes(xml, "<fieldentry>cc.fib.v0p1</fieldentry>");
  assertStringIncludes(xml, "<fieldentry>2</fieldentry>");
  assertStringIncludes(xml, "<fieldentry>3</fieldentry>");

  const tree: FlashcardNode = { type: "root", children: [] };
  remarkQuizPreview()(tree, { path: "quiz-fizzbuzz.md", value: markdown });
  const assignment = tree.children?.[0]?.children?.[0];
  assertEquals(assignment?.data?.hProperties?.className, "bso-quiz-assignment");
  assertEquals(assignment?.data?.hProperties?.["data-points"], "5");
  assertEquals(assignment?.children?.[0]?.children?.[0]?.value, "Opdracht 27");
  const context = assignment?.children?.[1];
  assertEquals(
    context?.data?.hProperties?.className,
    "bso-quiz-assignment-context",
  );
  assertEquals(context?.children?.some((node) => node.type === "code"), true);
  assertEquals(
    assignment?.children?.[2]?.children?.[0]?.children?.[0]?.value,
    "Subquestion 27a (2 points)",
  );
  assertEquals(
    assignment?.children?.[3]?.children?.[0]?.children?.[0]?.value,
    "Subquestion 27b (3 points)",
  );
});

Deno.test("quiz heading prefixes default to English and follow locale or explicit overrides", () => {
  assertEquals(resolveQuizOptions(), {
    maxAttempts: 0,
    shuffleAnswers: false,
    locale: "en",
    assignmentPrefix: "Assignment",
    questionPrefix: "Question",
    subquestionPrefix: "Subquestion",
  });
  assertEquals(
    resolveQuizOptions({ locale: "nl" }).assignmentPrefix,
    "Opdracht",
  );
  assertEquals(
    resolveQuizOptions({ locale: "nl" }).questionPrefix,
    "Vraag",
  );
  assertEquals(
    resolveQuizOptions({ locale: "nl" }).subquestionPrefix,
    "Deelvraag",
  );
  assertEquals(
    resolveQuizOptions({
      locale: "nl",
      assignmentPrefix: "Opgave",
      questionPrefix: "Vraag",
    }).assignmentPrefix,
    "Opgave",
  );
  assertThrows(
    () => resolveQuizOptions({ locale: "fr" }),
    Error,
    "quiz.locale",
  );
  assertThrows(
    () => resolveQuizOptions({ questionPrefix: " " }),
    Error,
    "quiz.questionPrefix",
  );

  const english = parseQuizMarkdown(`# Quiz

## Assignment 7
Shared context.

### Question 7a (2 pt)
Part prompt.
- A. Yes
- B. No
Correct answer: A
`);
  assertEquals(english.blocks?.[0]?.type, "assignment");
  assertEquals(english.questions[0].label, "7a");
  assertEquals(validateQuiz(english), []);

  const dutch = parseQuizMarkdown(
    `# Quiz

## Opdracht 7
Gedeelde context.

### Deelvraag 7a (2 pt)
Deelvraag.
- A. Ja
- B. Nee
Correct antwoord: A
`,
    resolveQuizOptions({ locale: "nl" }),
  );
  assertEquals(dutch.blocks?.[0]?.type, "assignment");
  assertEquals(validateQuiz(dutch), []);
  const custom = parseQuizMarkdown(
    "# Quiz\n\n## Opgave 7\nContext.\n\n### Vraag 7a\nPrompt.\n- A. Ja\n- B. Nee\nCorrect antwoord: A",
    resolveQuizOptions({
      locale: "nl",
      assignmentPrefix: "Opgave",
      questionPrefix: "Vraag",
    }),
  );
  assertEquals(custom.blocks?.[0]?.type, "assignment");
  assertEquals(validateQuiz(custom), []);
  const standalone = parseQuizMarkdown(
    "# Quiz\n\n## Question 1\nPrompt.\n- A. Yes\n- B. No\nCorrect answer: A",
  );
  assertEquals(standalone.issues, []);
  assertEquals(standalone.blocks?.[0]?.type, "question");

  const mixed = parseQuizMarkdown(`# Quiz

## Question 2
Standalone.
- A. Yes
- B. No
Correct answer: A

## Assignment 3
Shared context.

### Question 3a
Part.
- A. Yes
- B. No
Correct answer: A
`);
  assertEquals(mixed.questions.map((item) => item.number), [2, 3]);
  assertEquals(validateQuiz(mixed), []);
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

Deno.test("QuizDown forced positions are preserved in deterministic option order", () => {
  const quiz = parseQuizMarkdown(`# Quiz

\`\`\`quiz
? Put the final answer last.
- ( ) First
- 3. (x) Last
- ( ) Second
\`\`\`
`);
  assertEquals(validateQuiz(quiz), []);
  assertEquals(
    quiz.questions[0].options.map((option) => option.text),
    ["First", "Second", "Last"],
  );
  assertEquals(quiz.questions[0].correctAnswer, "B");
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
  assertEquals(resolveQuizOptions(), {
    maxAttempts: 0,
    shuffleAnswers: false,
    locale: "en",
    assignmentPrefix: "Assignment",
    questionPrefix: "Question",
    subquestionPrefix: "Subquestion",
  });
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
  for (const quiz of [{ locale: "fr" }, { assignmentPrefix: "" }]) {
    assertThrows(
      () =>
        validateConfig({
          courseName: "Quiz",
          version: "1.0",
          sourcesDir: "lessons",
          quiz,
        }),
      Error,
      "quiz.",
    );
  }
});

Deno.test("#35 shuffle settings survive build and pack with deterministic answer IDs and scoring", async () => {
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
      await runBuild(config, false, { skipReaders: true });
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

Deno.test("assignment context images are included as quiz cartridge dependencies", async () => {
  const root = await Deno.makeTempDir();
  try {
    const sources = join(root, "lessons");
    await Deno.mkdir(join(sources, "images"), { recursive: true });
    await Deno.writeFile(
      join(sources, "images", "context.png"),
      new Uint8Array([137, 80, 78, 71]),
    );
    await Deno.writeTextFile(
      join(sources, "quiz-assignment.md"),
      `# Assignment quiz

## Opdracht 1
![A shared diagram](images/context.png)

### Deelvraag 1a (2 pt)
What is shown?
- A. A diagram
- B. A table
Correct antwoord: A
`,
    );
    const config = resolveConfig(
      { courseName: "Quiz", version: "1.0", sourcesDir: "lessons" },
      {},
      root,
    );
    await runBuild(config, false, { skipReaders: true });
    await runPack(config);

    const packageFile = join(
      config.outputDir,
      `${config.name}.v${config.version}.imscc`,
    );
    const zip = await JSZip.loadAsync(await Deno.readFile(packageFile));
    const qtiName = Object.keys(zip.files).find((name) =>
      name.startsWith("quiz/") && name.endsWith(".xml")
    )!;
    const qti = await zip.file(qtiName)!.async("string");
    const imageRef = qti.match(/src=&quot;(quiz\/assets\/[^&"]+)&quot;/)?.[1];
    assertEquals(Boolean(imageRef), true);
    assertEquals(Boolean(zip.file(imageRef!)), true);
    const manifest = await zip.file("imsmanifest.xml")!.async("string");
    assertStringIncludes(manifest, `href="${imageRef}"`);
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("quiz images cannot escape sources through symlinks", async () => {
  const root = await Deno.makeTempDir();
  try {
    const sources = join(root, "lessons");
    await Deno.mkdir(sources);
    const outsideImage = join(root, "outside.png");
    await Deno.writeFile(outsideImage, new Uint8Array([137, 80, 78, 71]));
    await Deno.symlink(outsideImage, join(sources, "context.png"));
    const sourcePath = join(sources, "quiz-assignment.md");
    await Deno.writeTextFile(
      sourcePath,
      `# Assignment quiz

## Opdracht 1
![A shared diagram](context.png)

### Deelvraag 1a (2 pt)
What is shown?
- A. A diagram
- B. A table
Correct antwoord: A
`,
    );
    await assertRejects(
      () =>
        convertQuiz({
          sourcePath,
          sourcesDir: sources,
          repoRoot: root,
          outputDir: join(root, "out"),
        }),
      Error,
      "quiz images must be inside the configured source directory",
    );
  } finally {
    await Deno.remove(root, { recursive: true });
  }
});

Deno.test("assignment points accept only '(2 pt)' and '(2)'; other spellings are errors", () => {
  const source = (points: string) =>
    `# Quiz

## Opdracht 1

Shared context.

### Deelvraag 1a ${points}

Which?
- A. First
- B. Second
Correct antwoord: A
`;
  assertEquals(parseQuizMarkdown(source("(2 pt)")).questions[0].points, 2);
  assertEquals(parseQuizMarkdown(source("(2)")).questions[0].points, 2);
  for (const bad of ["(2 punten)", "(2 points)", "(2,5 pt)"]) {
    const issues = parseQuizMarkdown(source(bad)).issues ?? [];
    assertEquals(
      issues.some((issue) =>
        issue.rule === "quiz-heading-syntax" && issue.message.includes("2 pt")
      ),
      true,
      bad,
    );
  }
});

Deno.test("QuizDown keeps an indented fenced block after a blank line in the option (#84)", () => {
  const source = (gap: string) =>
    `\`\`\`\`quiz
? Which tests?
- [x] Test A:${gap}
  \`\`\`java
  @Test

  void a() {}
  \`\`\`
- [ ] Test B:
  \`\`\`java
  void b() {}
  \`\`\`
\`\`\`\`
`;
  for (const gap of ["", "\n"]) {
    const quiz = parseQuizMarkdown(source(gap));
    assertEquals(quiz.issues, []);
    assertEquals(quiz.questions[0].options.length, 2);
    assertEquals(
      quiz.questions[0].options[0].text.includes("void a() {}"),
      true,
      `blank line gap: ${JSON.stringify(gap)}`,
    );
    assertEquals(
      quiz.questions[0].options[0].text.includes("@Test\n\nvoid a() {}"),
      true,
    );
    assertEquals(
      quiz.questions[0].options[1].text.includes("void b() {}"),
      true,
    );
  }
});

Deno.test("QuizDown ends an option at an unindented line after a blank line", () => {
  const quiz = parseQuizMarkdown(`\`\`\`quiz
? Which?
- ( ) A

  indented belongs to A
- (x) B
\`\`\`
`);
  assertEquals(quiz.questions[0].options[0].text, "A\n\nindented belongs to A");
  assertEquals(quiz.questions[0].options[1].text, "B");
});

Deno.test("legacy question headings accept free text after the number as a title", () => {
  const quiz = parseQuizMarkdown(`# Quiz

## Vraag 12 (optioneel)

Which?
- A. First
- B. Second
Correct antwoord: A

## Vraag 13 Bella de koe

Which again?
- A. First
- B. Second
Correct antwoord: B
`);
  assertEquals(quiz.issues, []);
  assertEquals(quiz.questions.map((q) => q.number), [12, 13]);
  assertEquals(quiz.questions.map((q) => q.title), [
    "(optioneel)",
    "Bella de koe",
  ]);
  assertEquals(quiz.questions[0].text, "Which?");
});

Deno.test("quiz preview tells the client script the quiz language, so its own texts follow quiz.locale", () => {
  const locales = (options?: { locale?: "nl" | "en" }) => {
    const tree: FlashcardNode = { type: "root", children: [] };
    remarkQuizPreview(options)(tree, { path: "quiz-a.md", value: question() });
    return tree.children?.[0]?.data?.hProperties?.["data-locale"];
  };
  assertEquals(locales(), "en");
  assertEquals(locales({ locale: "en" }), "en");
  assertEquals(locales({ locale: "nl" }), "nl");
});
