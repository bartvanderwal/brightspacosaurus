---
sidebar_position: 5
---

# Learning objectives to tick off

Students can tick off the learning objectives of a lesson. BSO turns the list under a heading *Learning objectives* (or *Leerdoelen*) into a list of square checkboxes. What a student ticks stays in **the browser of that student** (`localStorage`): not on a server and not tied to an account. Someone who opens the page in another browser starts again, and a objective whose text you rewrite starts empty.

## 1. Learning objectives

- Explain what a unit test checks and what it does not.
- Write a test with the arrange-act-assert pattern.
- Run the tests and read the result.
- Name a learning objective that you want to check with the teacher.

## 2. How it works

- The objectives are an ordinary list in the Markdown source, under a heading that BSO recognises: `Learning objectives`, `Leerdoelen`, or the headings you list in `learningObjectives.sectionHeadings` in `brightspacosaurus.config.json`.
- Each objective gets a checkbox with its text as the label, so a screen reader and the keyboard work, and a line *3 of 4 checked* above the list.
- Without JavaScript the list is still readable and the boxes still work, they just remember nothing.
- Other lists on the page stay bullet lists.
