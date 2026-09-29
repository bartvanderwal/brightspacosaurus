# Lesson 1.4: Core Concepts Flashcards

**Manual test:** verify that each card can be revealed/flipped with the keyboard and mouse, that nested Markdown is rendered in the definition, and that the content remains readable when JavaScript is unavailable.

This section contains the core concepts students should practise. The `term:` line is intentionally short; everything after it is the Markdown definition until the closing `:::`.

::::flashcards

:::flashcard
term: Unit test

A **unit test** checks one small part of a system _in isolation_.
:::

:::flashcard
term: Integration test

An **integration test** checks whether components work together correctly.
:::

:::flashcard
term: End-to-end test

An _end-to-end test_ checks a complete user journey through the system.

:::

:::flashcard
term: Test pyramid

The **test pyramid** combines many unit tests with fewer integration and end-to-end tests.
:::

:::flashcard
term: Regression test

A **regression test** checks that a previously working behaviour still works.
:::

:::flashcard
term: Test double

A **test double** replaces a real dependency during a test, such as a _stub_ or mock.
:::

:::flashcard
term: Arrange, Act, Assert

**Arrange, Act, Assert** means prepare the test, run the behaviour and check the result.
:::

:::flashcard
term: Test strategy

A **test strategy** defines which tests cover which risks.
:::

::::

## Practice checklist

- Reveal every card and check the term and definition.
- Use Tab and Enter or Space; the interaction must not require a mouse.
- Check that **bold**, _italic_, `inline code`, lists and paragraphs render inside definitions.
- Disable JavaScript or open the generated HTML without scripts and confirm the definitions remain available.


This ordinary bullet list becomes a second flashcard set because the demo config
includes `flashcards.sectionHeadings: ["Core concepts"]`. No directives are needed.

## Core concepts

- **request:** a message in which a **client** asks a server for data or an action.
- **response:** a message in which a server returns the result of a request.
- **status code:** an HTTP code indicating the result of a request, such as `200`.
- **payload:** the data sent with a request or response.
- **contract:** the agreed structure and meaning of requests, responses and errors.
- **validation:** checking whether input meets formal rules.
- **business rule:** a domain rule that determines which behaviour or outcome is allowed.
- **system boundary:** a boundary between components or systems across which data and responsibilities pass.

## After the glossary

- Check: this list must remain an ordinary bullet list after the section ends.
