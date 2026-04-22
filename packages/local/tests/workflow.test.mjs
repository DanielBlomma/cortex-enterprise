import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const {
  loadWorkflowState,
  setWorkflowPlan,
  reviewWorkflowPlan,
  startWorkflowImplementation,
  recordWorkflowReview,
  approveWorkflow,
} = await import("../dist/workflow/state.js");

function makeContextDir() {
  const dir = mkdtempSync(join(tmpdir(), "cortex-workflow-"));
  const contextDir = join(dir, ".context");
  mkdirSync(contextDir, { recursive: true });
  return contextDir;
}

test("workflow approval stays blocked until plan and review pass", () => {
  const contextDir = makeContextDir();

  const initial = loadWorkflowState(contextDir);
  assert.equal(initial.approval.status, "blocked");

  const planned = setWorkflowPlan(contextDir, {
    title: "Implement workflow",
    summary: "Create a governed plan-review-approve loop",
    tasks: ["Add workflow state", "Wire review output"],
  });
  assert.equal(planned.phase, "plan_review");
  assert.equal(planned.plan.status, "pending_review");

  const reviewedPlan = reviewWorkflowPlan(contextDir, {
    approved: true,
    notes: "Proceed",
  });
  assert.equal(reviewedPlan.ok, true);
  assert.equal(reviewedPlan.state.plan.status, "approved");

  const started = startWorkflowImplementation(contextDir);
  assert.equal(started.ok, true);
  assert.equal(started.state.phase, "implementation");

  const failedReview = recordWorkflowReview(contextDir, {
    scope: "changed",
    output: {
      summary: { total: 1, passed: 0, failed: 1, warnings: 0 },
      results: [
        {
          policy_id: "require-code-review",
          pass: false,
          severity: "error",
          message: "Code review is required",
        },
      ],
    },
  });

  assert.equal(failedReview.phase, "iterating");
  assert.equal(failedReview.approval.status, "blocked");

  const blockedApproval = approveWorkflow(contextDir);
  assert.equal(blockedApproval.ok, false);

  const passingReview = recordWorkflowReview(contextDir, {
    scope: "changed",
    output: {
      summary: { total: 1, passed: 1, failed: 0, warnings: 0 },
      results: [
        {
          policy_id: "require-code-review",
          pass: true,
          severity: "info",
          message: "Passed",
        },
      ],
    },
  });

  assert.equal(passingReview.phase, "reviewed");
  assert.equal(passingReview.approval.status, "ready");

  const approved = approveWorkflow(contextDir, "Ready to commit");
  assert.equal(approved.ok, true);
  assert.equal(approved.state.phase, "approved");
  assert.equal(approved.state.approval.status, "approved");
});

test("warning-only review does not block approval", () => {
  const contextDir = makeContextDir();

  setWorkflowPlan(contextDir, {
    title: "Warning workflow",
    summary: "Warnings should not block approval",
    tasks: ["Review warning handling"],
  });
  reviewWorkflowPlan(contextDir, { approved: true });
  startWorkflowImplementation(contextDir);

  const warned = recordWorkflowReview(contextDir, {
    scope: "changed",
    output: {
      summary: { total: 1, passed: 0, failed: 0, warnings: 1 },
      results: [
        {
          policy_id: "require-test-coverage",
          pass: false,
          severity: "warning",
          message: "Coverage is lower than target",
        },
      ],
    },
  });

  assert.equal(warned.last_review.status, "passed");
  assert.deepEqual(warned.last_review.failed_policies, []);
  assert.deepEqual(warned.last_review.warning_policies, ["require-test-coverage"]);
  assert.equal(warned.approval.status, "ready");
});
