# Lesson 1.2: Test Pyramid and Test Strategy

## 1. Learning goals

{@include: [Learning goals](../../partials/learning-goals.md)}

A test strategy chooses appropriate tests for different levels of a system.

## 2. Test pyramid

In theory, a test pyramid suggests a mix of three kinds of tests (Chaves, 2025):

- A broad base of unit tests.
- A smaller layer of integration tests.
- A thin layer of end-to-end (E2E) tests.

![A pyramid with a broad base of unit tests, a smaller layer of integration tests and a thin top of end-to-end tests](images/test-pyramid.svg)

_Figure 1_: The test pyramid, redrawn for this course after Chaves (2025).

Figure 1 shows the shape: the higher a layer, the fewer tests it holds. The reason is cost and speed.

## 3. Why the shape?

- **Unit tests** run in milliseconds and point at one class, so you can afford many.
- **Integration tests** check that components work together, and need more set-up.
- **E2E tests** drive the whole system, run slowly and break easily, so you keep them few.

## 4. Test strategy

- Write most tests at the lowest level that can show the behaviour.
- Add an integration test where two components meet.
- Add an E2E test for a few key user journeys.

## 5. Reader

Read the [Testing Basics reader](../../readers/reader-testing-basics.md).

## Sources

Chaves, C. (2025, January 6). _The test pyramid: Insights from 15 years of experience_. Medium. https://medium.com/@kchaves001/the-test-pyramid-insights-from-15-years-of-experience-4adbdaf300f5
