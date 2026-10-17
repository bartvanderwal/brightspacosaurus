---
sidebar_position: 1
---

# Dry run first

Most people start an agentic UI with an approval button. That comes too early. A user who has not yet seen anything useful has no reason to trust the agent, and a bare "Do you approve?" is a question they cannot answer.

Start with a **dry run**: the agent does the work as a draft, shows the result, and changes nothing yet. Only when something concrete is on the table, and the user can see its value, does the user decide.

## The order of trust

1. **Show the plan.** The agent says what it understood and which steps it would take.
2. **Show the result as a draft.** The user sees what would happen, with nothing executed.
3. **Let the user adjust.** Change a step, remove an item, ask for another option.
4. **Ask for the decision.** Now "yes, I want this" means something.

```text
Agent: I found 12 invoices older than two years.
       Dry run: nothing has moved yet. Here is what I would archive.
       [ Show the 12 files ]   [ Remove some ]   [ Archive these ]
```

## Why a dry run builds trust

- The user sees the process, step by step, before anything is at stake.
- A wrong guess costs a glance, not a repair.
- The decision at the end is informed, so approvals are given with care and not by habit.

While the agent then carries out the work, it keeps showing the steps; see [streaming and progress](lesson-3-streaming-and-progress.md).

## Learning goals

After this lesson you can:

1. explain why an approval button at the start is too early;
2. describe the four steps from plan to decision;
3. design a dry run for an action that is hard to undo.
