# Lesson 1: Diagrams and SVG

**Manual test:** verify PlantUML, Mermaid, SVG assets, alt text, source disclosure and diagram descriptions.

## PlantUML diagram

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

## Mermaid diagram

```mermaid
flowchart LR
  Source[Markdown] --> BSO[BSO prepare]
  BSO --> IMSCC[IMSCC]
  IMSCC --> Brightspace
```

## SVG content

![Test SVG asset](images/test-swatch.svg)

Expected: both diagrams and the SVG image are visible after import; source code and accessibility information remain available.
