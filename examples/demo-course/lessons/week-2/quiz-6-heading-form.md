# Quiz 2.6: Questions with a name

In the heading form a question is a heading that starts with `?`. The heading is the question, so it can say what it asks. A plain heading is a section and not a question.

## ? Which UML diagram belongs to the Decorator pattern?

- (x) a. A wrapper that adds behaviour around a component
- ( ) b. A class that creates objects for a family of products
- ( ) c. A class that has exactly one instance

## Assignment: testing

## @ Testing FizzBuzz

Given this class:

```java
public class FizzBuzz {
    public String fizzbuzzer(int n) {
        return n % 15 == 0 ? "FizzBuzz" : String.valueOf(n);
    }
}
```

### ? Which test is useful? (2 pt)

- (x) A test that asserts `"FizzBuzz"` for input 15
- ( ) A test that only checks that the result is not null

### ? What does `fizzbuzzer(7)` return? (1)

= 7 ~5
