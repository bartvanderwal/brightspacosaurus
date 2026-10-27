---
slides: true
pptx: false
title: Where does this test belong?
paginate: true
---

# Where does this test belong?

Practise the test strategy of the lesson on three cases.

![bg right:42%](images/student-teacher.jpg)

<!-- Teacher notes stay out of the student-facing slide. -->

---

# Case 1: FizzBuzz

`fizzBuzz(15)` must return `"FizzBuzz"`.

- One class, no database, no network.
- Which level? A **unit test**.

![bg right:42%](images/test-pyramid-platforms.jpg)

---

# Case 2: a service and a repository

A service asks a repository for a film, and the repository reads from a database.

- Two components meet, and a real query is involved.
- Which level? An **integration test**.

---

# Case 3: a student takes a quiz

A student opens a quiz in the browser, answers and sees a score.

- The whole system works together, through the user interface.
- Which level? An **E2E test**, and only for a key journey.

---

# Sources

- Chaves, C. (2025, January 6). *The test pyramid: Insights from 15 years of experience*. Medium. https://medium.com/@kchaves001/the-test-pyramid-insights-from-15-years-of-experience-4adbdaf300f5
- Illustrations generated with DALL-E; see `images/README.md` in the demo course sources.
