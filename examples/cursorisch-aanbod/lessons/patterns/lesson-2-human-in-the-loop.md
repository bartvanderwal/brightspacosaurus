---
sidebar_position: 2
---

# Human in the loop

The user approves an action before the agent performs it. Use this pattern when an action is hard to undo or affects other people, and only after a [dry run](lesson-1-dry-run-first.md) has shown something concrete to approve.

## When to ask for approval

- The action sends data outside the system (an email, a payment).
- The action deletes or overwrites something.
- The agent is unsure which of several options the user wants.

## What an approval step shows

1. **What** the agent wants to do, in plain words.
2. **Why**, in one sentence.
3. **A preview** of the result, when possible.
4. **Approve, change or cancel**, with the safe choice as the default.

The preview in step 3 is the result of the dry run. Without it the user is asked to approve something they have not seen.

```text
Agent: I will move 12 old invoices to the archive folder.
       [ Show the 12 files ]   [ Approve ]   [ Change ]   [ Cancel ]
```

Asking too often makes users click "Approve" without reading. Ask only for actions that matter.
