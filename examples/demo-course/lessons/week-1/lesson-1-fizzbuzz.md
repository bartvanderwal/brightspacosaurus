# Lesson 1.1: FizzBuzz

## 1. Learning objectives

{@include: [Learning objectives](../../partials/learning-objectives.md)}

## 2. Introduction

FizzBuzz is a classic beginner exercise. For each number from 1 to n:

- print `Fizz` if it is divisible by 3
- print `Buzz` if it is divisible by 5
- print `FizzBuzz` if it is divisible by both
- otherwise print the number itself

## 3. Implementation (Java)

```java
public class FizzBuzzer {
    public String fizzBuzz(int n) {
        if (n % 15 == 0) return "FizzBuzz";
        if (n % 3 == 0) return "Fizz";
        if (n % 5 == 0) return "Buzz";
        return String.valueOf(n);
    }
}
```

[Extra slides: FizzBuzz, step by step](../../slides/slides-fizzbuzz.md)

## 4. Command-line application

```java
public class Main {
    public static void main(String[] args) {
        int limit = args.length == 0 ? 100 : Integer.parseInt(args[0]);
        FizzBuzzer fizzBuzzer = new FizzBuzzer();

        for (int number = 1; number <= limit; number++) {
            System.out.println(fizzBuzzer.fizzBuzz(number));
        }
    }
}
```

## 5. Unit test (JUnit)

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class FizzBuzzerTest {
    private final FizzBuzzer fizzBuzzer = new FizzBuzzer();

    @Test
    void divisibleByThreeGivesFizz() {
        assertEquals("Fizz", fizzBuzzer.fizzBuzz(9));
    }

    @Test
    void divisibleByFiveGivesBuzz() {
        assertEquals("Buzz", fizzBuzzer.fizzBuzz(10));
    }

    @Test
    void divisibleByFifteenGivesFizzBuzz() {
        assertEquals("FizzBuzz", fizzBuzzer.fizzBuzz(15));
    }

    @Test
    void otherNumbersReturnThemselves() {
        assertEquals("8", fizzBuzzer.fizzBuzz(8));
    }
}
```

## 6. Class diagram

The example has a `Main` entry point that loops from 1 to a configurable limit and delegates each value to `FizzBuzzer.fizzBuzz`. The default limit is 100.

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
