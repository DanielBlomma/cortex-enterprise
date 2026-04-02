# Cortex Enterprise Air-Gapped

## The problem

Your developers work in a restricted environment — no internet, no cloud services, no data leaving the network. But they still need AI coding assistants to be productive. And you still need governance, audit trails, and compliance proof.

Cortex Enterprise Air-Gapped makes this possible without a single byte leaving the building.

---

## What it is

Cortex is a layer that sits between your codebase and the AI coding assistant. It reads and understands your code, then feeds the AI the right context — filtered through your organization's rules.

The Air-Gapped edition runs entirely on the developer's machine. No cloud. No internet. No phone-home. Not even during installation. Everything is self-contained in one deliverable package.

---

## How it works

Think of it like this:

```
  Developer's machine (no internet)
  +------------------------------------+
  |                                    |
  |  Your code                         |
  |      |                             |
  |      v                             |
  |  Cortex reads and indexes it       |
  |      |                             |
  |      v                             |
  |  Rules filter what the AI can see  |
  |      |                             |
  |      v                             |
  |  AI assistant gets governed        |
  |  context — nothing forbidden,      |
  |  nothing outdated, nothing wrong   |
  |      |                             |
  |  Every interaction is logged       |
  |                                    |
  |  Network: OFF                      |
  +------------------------------------+
```

### The flow

1. **We deliver the software** — You receive a single package file containing everything: Cortex, the enterprise features, and a built-in AI model for understanding code. This is delivered through your approved channel — a USB drive, your internal software portal, or any secure file transfer you already use.

2. **Your IT team installs it** — A standard software install from the local file. No internet connection is needed at any point. No external downloads happen during or after installation.

3. **A license file activates it** — We provide a digitally signed license file containing your organization's name, the expiry date, and which features are enabled. Cortex verifies this signature using a key that's built into the software. No license server. No activation call. It works the same way whether the machine is online or has never seen the internet.

4. **Your security team distributes the rules** — Organization-wide rules are simple text files. Your security or platform team writes them and distributes them through your internal channels — the same way you distribute any configuration today. Examples of rules:
   - "AI agents must never surface deprecated code"
   - "The authentication module is off-limits without architecture approval"
   - "Always prioritize official documentation over legacy code"

5. **Developers use their AI tools normally** — When a developer's AI coding assistant asks Cortex for context about the codebase, Cortex applies the rules automatically. The developer doesn't need to know or think about the rules. They just get better, governed results.

6. **Everything is logged locally** — Every interaction is written to a log file on the machine: what the AI asked for, what it received, which rules were applied. Your compliance team can collect and review these logs through your existing processes.

---

## What gets sent over the network

**Nothing.**

Zero network traffic. The software is designed to work with the network cable unplugged. We verify this by testing with network access completely disabled.

---

## The license

Traditional software licensing requires "phoning home" to a license server. We don't do that.

Instead, you receive a license file — a small text document with a digital signature. Think of it like a notarized letter: anyone can verify it's authentic by checking the signature, but no one needs to call the notary to do so.

The license contains:
- Your organization's name
- The expiry date
- How many projects you can use it with
- Which features are enabled

**Renewal** is simple: we send you a new license file through your secure channel. You replace the old one. No downtime, no reinstall.

If the license expires, Cortex doesn't break — it simply falls back to the free community edition until you renew.

---

## The rules

Rules are plain-text files that your security or platform team writes and distributes. There are two levels:

### Organization-wide rules

Written by your security team. Distributed to all projects through your internal channels (the same way you distribute any policy today). These are the guardrails that apply everywhere.

**Examples:**
- "Passwords and secrets must never appear in AI context"
- "No AI modifications to the payment processing module without approval"
- "Database changes require review from the data team"

### Project-level rules

Written by each project team for their specific needs. These handle local concerns.

**Examples:**
- "Always prioritize the API specification document"
- "Exclude test fixtures from AI context"
- "Flag conflicting documentation instead of guessing"

### When both exist

Organization rules always win. If a project rule conflicts with an organization rule, the organization rule takes priority. This ensures central governance while still allowing teams to manage their own local standards.

---

## The audit trail

Every time an AI assistant interacts with Cortex, it's logged:

- **When** it happened
- **What** the AI asked for
- **What** Cortex returned
- **Which rules** were applied
- **How long** it took

These logs are stored as simple text files on the developer's machine. Your compliance team can collect them through your existing processes — copy them to a shared drive, feed them into your SIEM, or archive them however you normally handle audit data.

Logs are kept for 90 days by default (configurable).

---

## What's in the package

Everything needed to run, with no external dependencies:

| Component | What it does |
|---|---|
| Cortex core | Reads your code, builds an understanding of it, answers AI questions |
| Enterprise features | License validation, rule enforcement, audit logging, access control |
| Built-in AI model | Understands code structure without downloading anything from the internet |
| All dependencies | Fully self-contained — nothing is fetched after install |

---

## Who is this for

- **Banks and financial institutions** — Regulatory requirements prohibit code or data leaving the network
- **Defense and intelligence** — Classified environments with no internet access
- **Government agencies** — Strict data sovereignty and air-gap requirements
- **Healthcare** — Patient data regulations require complete network isolation
- **Any organization** where "no data leaves the building" is not negotiable

---

## Pricing

**Annual site license: $50,000 - $200,000/year** depending on the number of developers and projects.

Includes: the complete software package, license file, built-in AI model, offline documentation, and a dedicated support channel.

---

## At a glance

| Question | Answer |
|---|---|
| Does it need internet? | No. Zero network traffic, ever. |
| Does source code leave the machine? | Never. |
| How is it installed? | From a file delivered through your secure channel. |
| How is it licensed? | A signed license file verified offline. No license server. |
| How are rules managed? | Text files distributed through your internal channels. |
| Is there analytics? | Yes, a local dashboard on each machine. |
| Is there an audit trail? | Yes, log files on each machine. Exportable. |
| How are updates delivered? | New package through your secure channel. |
| What if the license expires? | Falls back to the free edition. Nothing breaks. |
| How long does setup take? | Under 30 minutes per machine. |
