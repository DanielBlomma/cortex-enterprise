---
description: "Create or update the governed implementation plan before coding"
---

Create a concrete implementation plan before code changes.

Workflow:

1. Summarize the problem, scope, and expected outcome.
2. Call `workflow.plan` with:
   - `title`
   - `summary`
   - `tasks`
3. Show the resulting workflow state.
4. Do not start implementation until the plan has been reviewed.

Rules:

- Keep the plan specific enough to review.
- Prefer small, ordered tasks.
- If the plan changes materially, update it instead of silently continuing.
