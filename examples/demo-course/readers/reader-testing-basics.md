# Reader: Testing Basics

{@include: [Learning goals](../partials/learning-goals.md)}

A short reference on the arrange-act-assert pattern for unit tests.

## Arrange-Act-Assert

Most unit tests follow three phases:

1. **Arrange** — set up the object under test and any inputs.
2. **Act** — call the method being tested.
3. **Assert** — verify the result matches expectations.

## Test flow

```mermaid
flowchart TD
    A[Arrange: create FizzBuzzer] --> B[Act: call fizzBuzz]
    B --> C{Assert: result correct?}
    C -->|yes| D[Test passes]
    C -->|no| E[Test fails]
```

## Class diagram

```plantuml
@startuml
class FizzBuzzer {
    +fizzBuzz(n: int): String
}

class Main {
    +main(args: String[]): void
}

Main ..> FizzBuzzer : uses
@enduml
```

Keep tests small and focused: one behaviour per test, with a clear name that describes the expected outcome.
