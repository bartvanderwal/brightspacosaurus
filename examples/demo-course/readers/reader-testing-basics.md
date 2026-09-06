# Reader: Testing Basics

A short reference on the arrange-act-assert pattern for unit tests.

## Arrange-Act-Assert

Most unit tests follow three phases:

1. **Arrange** — set up the object under test and any inputs.
2. **Act** — call the method being tested.
3. **Assert** — verify the result matches expectations.

## Test flow

```mermaid
flowchart TD
    A[Arrange: create FizzBuzz] --> B[Act: call convert]
    B --> C{Assert: result correct?}
    C -->|yes| D[Test passes]
    C -->|no| E[Test fails]
```

Keep tests small and focused: one behaviour per test, with a clear name that describes the expected outcome.
