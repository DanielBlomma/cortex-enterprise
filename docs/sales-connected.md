# Cortex Enterprise Connected

## The problem

Your developers use AI coding assistants every day — tools like Claude Code, Copilot, and Cursor. These tools are powerful, but as an organization you have no way to control what they see, measure what they save you, or prove to auditors what they did.

Cortex Enterprise Connected solves this.

---

## What it is

Cortex is a layer that sits between your codebase and the AI coding assistant. It reads and understands your code, then feeds the AI the right context — filtered through your organization's rules.

The Connected edition adds a central cloud dashboard where you manage rules, see usage across all teams, and get a complete audit trail. Your developers don't need to change how they work. Cortex runs quietly in the background.

**Your source code never leaves the developer's machine.**

---

## How it works

Think of it like this:

```
         Your cloud dashboard
         (rules, analytics, audit)
               |          ^
     rules     |          |  usage stats
     flow      |          |  (no code)
     down      v          |
         +-----+----------+-----+
         |     |          |     |
      Dev A  Dev B     Dev C  Dev D
      Each developer runs Cortex locally.
      Code stays on their machine.
      AI assistants get governed context.
```

### The flow

1. **Your admin writes rules** — Plain-English rules like "AI agents must never see deprecated code" or "The authentication module requires architecture review before changes." These are created in the cloud dashboard.

2. **Rules push to every developer automatically** — When a developer starts their workday, Cortex picks up the latest rules from the dashboard. This happens in the background. The developer doesn't need to do anything.

3. **The AI assistant asks Cortex for context** — When a developer uses their AI coding tool, the tool asks Cortex "what do I need to know about this codebase?" Cortex answers based on the code AND the rules. Forbidden areas are filtered out. Important files get priority. Conflicts are flagged instead of guessed at.

4. **Usage data flows back (never code)** — Cortex sends simple numbers to the dashboard: how many times was it used today, how many AI tokens were saved, how fresh is the index. It never sends source code, file contents, or what the developer searched for.

5. **Everything is logged** — Every interaction between the AI and Cortex is recorded: what was asked, what was returned, which rules applied. These logs live on the developer's machine and can optionally be pushed to the dashboard for centralized review.

---

## What does "no code leaves the machine" actually mean?

This is the most important thing to understand:

| What IS sent to the cloud | What is NEVER sent |
|---|---|
| "Cortex was used 47 times today" | Your source code |
| "Estimated 12,000 tokens saved" | File contents |
| "Index is 94% fresh" | What the developer searched for |
| "These 3 rules were applied" | The AI's generated code |

The cloud only sees numbers and rule names. It has no visibility into your code.

---

## What you get as an organization

### Rules that apply everywhere

You write a rule once. It applies to every developer, every repo, every AI tool — automatically. No need to trust that each team configured things correctly. Examples:

- "Deprecated code must be hidden from AI agents"
- "The payments module requires senior review before AI changes"
- "Always prioritize the official architecture documents over old code"

### Usage analytics

A dashboard that answers: Are our developers actually using AI effectively? How many tokens are we saving? Which repos have stale indexes? This is the data you need to justify the investment to leadership.

### Audit trail for compliance

Every AI-assisted action is recorded. When an auditor asks "how do you govern your AI tools?", you have a complete, searchable log. Exportable for SOC2, ISO 27001, and internal compliance reviews.

### Role-based access

- **Admins** manage rules, view all analytics, run compliance reports
- **Developers** use the tools, see their own usage
- **Read-only** viewers see dashboards but can't change anything

### Single sign-on

Developers log in with their existing company credentials. No separate account needed.

---

## What the developer experiences

Almost nothing changes. They install Cortex once (IT can automate this). After that:

- Their AI coding assistant gets better context, automatically
- Organization rules are enforced without the developer needing to think about it
- A small dashboard shows their personal usage stats

No new workflows. No extra steps. It just works in the background.

---

## Who is this for

- **Tech companies** with 50 to 500+ developers using AI coding tools
- **Engineering leaders** who need to prove ROI on AI investments
- **Compliance teams** who need audit trails for AI-assisted development
- **Platform teams** who want consistent rules across all repositories

---

## Pricing

**~$30 per developer per month**

Includes the cloud dashboard, rule management, analytics, audit trail, single sign-on, and priority support.

---

## At a glance

| Question | Answer |
|---|---|
| Does it need internet? | Yes, but only for syncing rules and usage stats. Minimal traffic. |
| Does source code leave the machine? | Never. |
| How do developers log in? | Through your existing identity provider (SSO). |
| How are rules managed? | Centrally, from a web dashboard. |
| Can we see usage across all teams? | Yes, aggregated analytics dashboard. |
| Is there an audit trail? | Yes, every AI interaction is logged. Exportable. |
| How are updates delivered? | Automatically, same as any software package. |
| How long does setup take? | Under an hour for most teams. |
