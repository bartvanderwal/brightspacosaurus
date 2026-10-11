# Quiz 2.4: Question types and code

````quiz
? Which keyword limits a field to its own class?

! Look for the access modifier in `class Account { ... }`.

- ( ) `public`
- (x) `private`
- ( ) `protected`
- ( ) `final`

? Which statements about this Java code are true?

```java
List<String> names = List.of("Ada", "Linus");
names.add("Grace");
```

- [x] `List.of` returns an immutable list
- [x] The `add` call throws an exception
- [ ] The list ends up with three names
- [ ] `List<String>` is not valid Java syntax

? Which method returns the larger of two numbers?

- ( ) This one:
  ```java
  int max(int a, int b) {
      return a < b ? a : b;
  }
  ```
- (x) This one:
  ```java
  int max(int a, int b) {
      return a > b ? a : b;
  }
  ```

? Which React component shows the count after a click?

- ( ) This one:
  ```jsx
  function Counter() {
    const [count, setCount] = useState(0);
    return <button onClick={() => count + 1}>{count.toString()}</button>;
  }
  ```
- (x) This one:
  ```jsx
  function Counter() {
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>{count}</button>;
  }
  ```

? Name the HTTP method that creates a resource in a REST API.

! It is one word in capitals.

= POST / post ~10
````
