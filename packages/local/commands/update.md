---
description: "Record workflow progress while implementing or iterating"
---

Record a workflow update whenever implementation changes direction or a review round completes.

Workflow:

1. Summarize the current status in one short paragraph.
2. If the work is moving back into implementation after findings, use phase `implementation`.
3. If the work is in a fix-and-review loop, use phase `iterating`.
4. Call `workflow.update` with:
   - `summary`
   - optional `phase`
5. If the update creates follow-up work, add a `workflow.todo`.
