---
sidebar_position: 5
---

# Learning goals to tick off

Students can tick off the learning goals of a lesson. BSO turns the list under a heading *Learning goals* (or *Leerdoelen*) into a list of square checkboxes. What a student ticks stays in **the browser of that student** (`localStorage`): not on a server and not tied to an account. Someone who opens the page in another browser starts again, and a goal whose text you rewrite starts empty.

## 1. Learning goals

- Explain what a unit test checks and what it does not.
- Write a test with the arrange-act-assert pattern.
- Run the tests and read the result.
- Name a learning goal that you want to check with the teacher.

## 2. How it works

- The goals are an ordinary list in the Markdown source, under a heading that BSO recognises: `Learning goals`, `Leerdoelen`, or the headings you list in `learningGoals.sectionHeadings` in `brightspacosaurus.config.json`.
- Each goal gets a checkbox with its text as the label, so a screen reader and the keyboard work, and a line *3 of 4 checked* above the list.
- Without JavaScript the list is still readable and the boxes still work, they just remember nothing.
- Other lists on the page stay bullet lists.
