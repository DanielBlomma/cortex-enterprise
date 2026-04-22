---
description: "Add or complete governed workflow TODOs"
---

Use workflow TODOs for concrete follow-up work.

Add a TODO:
- Call `workflow.todo` with `action: "add"`, `title`, and optional `details`

Complete a TODO:
- Call `workflow.todo` with `action: "complete"` and the TODO `id`

Rules:
- Keep TODOs specific and actionable.
- Complete or replace stale TODOs instead of letting them accumulate.
