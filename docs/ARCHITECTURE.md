# Cortex Enterprise — Architecture

## How the pieces fit together

Cortex has two parts: a free, open-source core and a paid enterprise add-on.

The **core** (free, open-source) does the heavy lifting: it reads your code, builds an index, runs searches, and talks to AI coding assistants. Every developer gets this for free.

The **enterprise add-on** (paid, private) layers on top. It adds licensing, rules enforcement, usage tracking, audit logging, and role-based access. It plugs into the core automatically — if it's installed, the extra features just appear. If it's not installed, the core works exactly the same as before.

```
Free core (public)              Enterprise add-on (paid)
+------------------------+      +---------------------------+
|                        |      |                           |
|  Reads your code       |      |  License validation       |
|  Builds the index      |<-----+  Organization rules       |
|  Runs searches         |      |  Usage tracking           |
|  Talks to AI tools     |      |  Audit logging            |
|  Shows the dashboard   |      |  Access control (roles)   |
|                        |      |                           |
+------------------------+      +---------------------------+

The add-on plugs into        The add-on depends on the
the core. The core never     core, never the other way
knows or cares if the        around. A fix to the core
add-on is there.             fixes both editions.
```

**Why this matters:** If we fix a bug or improve search in the free core, every enterprise customer gets that improvement automatically. The enterprise layer never changes how the core works — it only adds capabilities on top.

---

## What happens when Cortex starts

1. The core starts up and does everything it normally does — indexing, search, connecting to AI tools.

2. It then checks: "Is the enterprise add-on installed?"
   - **If yes:** The add-on activates. It checks the license, loads organization rules, starts the audit log, and adds enterprise tools. The dashboard shows **[Enterprise]**.
   - **If no:** Nothing happens. The core runs in community mode. The dashboard shows **[Community]**.

This is seamless. The developer doesn't need to configure anything differently. Enterprise features just appear when the add-on is installed.

---

## What the enterprise add-on contains

| Part | What it does |
|---|---|
| **License validation** | Checks that the organization has a valid license. Uses a signed license file that works offline — no license server needed. |
| **Usage tracking** | Counts how often Cortex is used and estimates token savings. Connected edition sends these numbers (never code) to the cloud dashboard. Air-gapped edition keeps them local. |
| **Organization rules** | Loads rules that control what AI assistants can see. Connected edition pulls rules from the cloud. Air-gapped edition reads them from local files. |
| **Audit logging** | Records every interaction: what the AI asked, what it received, which rules applied. Stored as daily log files. |
| **Access control** | Defines who can do what: admins manage rules, developers use the tools, read-only users view dashboards. |
| **Enterprise tools** | Adds management commands: check license status, sync rules, query audit logs, view system health. |

---

## How it's delivered

### Connected customers (internet available)

The enterprise add-on is installed as a standard software package from a private registry. Your IT team sets this up once, and updates flow automatically — just like any other software dependency.

### Air-gapped customers (no internet)

We build a complete, self-contained package file that includes everything: the core, the enterprise add-on, the built-in AI model, and all dependencies. This is delivered through your secure channel (USB, internal portal, approved file transfer). The developer installs from this local file. No internet needed at any point.

---

## How edition detection works

The dashboard automatically shows which edition is running:

- **Without the enterprise add-on:** The dashboard header shows **[Community]**
- **With the enterprise add-on:** The dashboard header shows **[Enterprise]**

No configuration needed. It's detected automatically at startup.

---

## The key design principle

The enterprise add-on depends on the core. The core never depends on the add-on.

This means:
- The core can be developed and released independently
- A bug fix in the core benefits both free and enterprise users
- If the enterprise add-on fails for any reason, the core keeps working
- Removing the enterprise add-on doesn't break anything — Cortex just goes back to community mode
