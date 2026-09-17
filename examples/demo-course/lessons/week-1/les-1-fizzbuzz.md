# Lesson 1: FizzBuzz

{@include: [Learning goals](../../partials/lesdoelen-week-1.md)}

FizzBuzz is a classic beginner exercise. For each number from 1 to n:

- print `Fizz` if it is divisible by 3
- print `Buzz` if it is divisible by 5
- print `FizzBuzz` if it is divisible by both
- otherwise print the number itself

## Implementation (Java)

```java
public class FizzBuzz {
    public String convert(int n) {
        if (n % 15 == 0) return "FizzBuzz";
        if (n % 3 == 0) return "Fizz";
        if (n % 5 == 0) return "Buzz";
        return String.valueOf(n);
    }
}
```

## Unit test (JUnit)

```java
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class FizzBuzzTest {
    private final FizzBuzz fizzBuzz = new FizzBuzz();

    @Test
    void divisibleByThreeGivesFizz() {
        assertEquals("Fizz", fizzBuzz.convert(9));
    }

    @Test
    void divisibleByFiveGivesBuzz() {
        assertEquals("Buzz", fizzBuzz.convert(10));
    }

    @Test
    void divisibleByFifteenGivesFizzBuzz() {
        assertEquals("FizzBuzz", fizzBuzz.convert(15));
    }

    @Test
    void otherNumbersReturnThemselves() {
        assertEquals("8", fizzBuzz.convert(8));
    }
}
```

## Class diagram

The example is a single class with one method:

```plantuml
@startuml
class FizzBuzz {
  +convert(n: int): String
}
@enduml
```
