# Quiz 2.7: Code highlighting

````quiz
? Which keyword declares a constant in this JavaScript, next to the inline `const` and `let`?

```js
// Count the concerts
const total = concerts.length;
let label = `Total: ${total}`;
console.log(label, 42, true);
```

- (x) `const`
- ( ) `total`
- ( ) `console`
- ( ) `42`

? What does this Java method return for `func(2, 5)`?

```java
public static int func(int a, int b) {
    return a > b ? a : b;
}
```

- ( ) `5`
- (x) `2`
- ( ) `true`
- ( ) Nothing, it does not compile

? What would you rename this function to if you named it well/better (more semantically) than `func`?

```java
public static int func(int a, int b) {
    return a > b ? a : b;
}
```

- (x) min
- ( ) max
- ( ) add
- ( ) naming things well is not important

? Which setting does this YAML file turn on?

```yaml
# course settings
quiz:
  locale: en
  shuffleAnswers: true
  maxAttempts: 0
```

- (x) `shuffleAnswers`
- ( ) The locale of the quiz
- ( ) The number of attempts
- ( ) Every setting in the file

? Which element is the parent of `<item>` in this XML?

```xml
<manifest identifier="demo">
  <resources>
    <item id="1" type="quiz">Quiz 2.7</item>
  </resources>
</manifest>
```

- (x) `<resources>`
- ( ) `<manifest root>`
- ( ) `<quiz type>`
- ( ) `<item id>`

? Which option is valid code?

- (x) This one:
  ```js
  const answer = () => "yes";
  ```
- ( ) That one:
  ```java
  int answer = ;
  ```
- ( ) Plain text with `inline code`, not a block
````
