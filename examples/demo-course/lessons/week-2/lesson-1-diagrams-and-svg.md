# Lesson 2.1: Diagrams and SVG

**Manual test:** verify PlantUML, Mermaid, SVG assets, alt text, source disclosure and diagram descriptions.

## 1. PlantUML diagram

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

## 2. Mermaid diagram

```mermaid
flowchart LR
  Source[Markdown] --> BSO[BSO build]
  BSO --> IMSCC[IMSCC]
  IMSCC --> Brightspace
```

## 3. SVG content

![Test SVG asset](images/test-swatch.svg)

Expected: both diagrams and the SVG image are visible after import; source code and accessibility information remain available.
