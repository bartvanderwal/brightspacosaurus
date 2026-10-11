# Quiz 2.5: Assignments with sub-questions

An assignment shares one context between several sub-questions. Each sub-question has its own response type and points.

````quiz
@ Testing FizzBuzz
Given this class:

```java
public class FizzBuzz {
    public String fizzbuzzer(int n) {
        if (n % 15 == 0) return "FizzBuzz";
        if (n % 3 == 0) return "Fizz";
        if (n % 5 == 0) return "Buzz";
        return String.valueOf(n);
    }
}
```

? Which test is useful and working? (2 pt)
- (x) A test that asserts `"Fizz"` for input 9:
  ```java
  @Test
  void nineGivesFizz() {
      assertEquals("Fizz", fizzBuzz.fizzbuzzer(9));
  }
  ```
- ( ) A test that only checks that the result is not null:
  ```java
  @Test
  void givesSomething() {
      assertNotNull(fizzBuzz.fizzbuzzer(1));
  }
  ```

? Which inputs are boundary values for the `% 15` check? (2 pt)
- [x] `15`
- [x] `14`
- [ ] `100`
- [x] `16`

? Which string does `fizzbuzzer(5)` return? (1)
= Buzz ~10
````
