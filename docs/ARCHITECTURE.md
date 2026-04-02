# Cortex Enterprise — Architecture

## Plugin Model

Enterprise is a drop-in npm package that the public Cortex loads dynamically at startup.

```
Public GitHub                    Private GitHub
┌──────────────────┐            ┌──────────────────────┐
│ cortex (MIT)     │            │ cortex-enterprise     │
│                  │◄───────────│ (proprietary)         │
│ • ingest         │ imports    │                       │
│ • graph          │            │ • src/license/        │
│ • search         │            │ • src/telemetry/      │
│ • embeddings     │            │ • src/policy/         │
│ • mcp-server     │            │ • src/tools/          │
│ • dashboard      │            │                       │
│                  │            │ export function       │
│ try { import     │            │   register(server)    │
│   enterprise }   │            │                       │
└──────────────────┘            └──────────────────────┘
```

**Key principle:** Enterprise imports core, never the other way around. A bugfix in core fixes both editions automatically.

## How it works

In `cortex/mcp/src/server.ts`:

```typescript
import { loadPlugins } from "./plugin.js";

async function main() {
  const server = new McpServer({ name: "cortex-context", version: "0.1.0" });
  registerTools(server);
  await loadPlugins(server);  // ← tries to import enterprise
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

In `cortex/mcp/src/plugin.ts`:

```typescript
try {
  const enterprise = await import("@danielblomma/cortex-enterprise");
  if (typeof enterprise.register === "function") {
    await enterprise.register(server);
  }
} catch {
  // Enterprise not installed — community mode
}
```

## Source structure

```
cortex-enterprise/
├── package.json              # @danielblomma/cortex-enterprise
├── tsconfig.json
├── src/
│   ├── index.ts              # Exports: register(), name, version
│   ├── license/
│   │   └── check.ts          # Offline license validation (.lic files)
│   ├── telemetry/
│   │   └── sync.ts           # Anonymized stats push (connected edition)
│   ├── policy/
│   │   └── push.ts           # Org-wide rules sync
│   └── tools/
│       └── enterprise.ts     # Enterprise-specific MCP tools
├── docs/
│   ├── STRATEGY.md           # Business strategy and roadmap
│   └── ARCHITECTURE.md       # This file
└── dist/                     # Compiled output
```

## Distribution

### Connected customers

```bash
# Customer configures npm auth once
echo "//npm.pkg.github.com/:_authToken=TOKEN" >> ~/.npmrc
npm i -g @danielblomma/cortex-enterprise --registry=https://npm.pkg.github.com
```

### Air-gapped customers

```bash
# We build and ship a .tgz
npm pack
# → danielblomma-cortex-enterprise-0.1.0.tgz
# Delivered via secure channel (USB, internal portal)

# Customer installs offline
npm i -g danielblomma-cortex-enterprise-0.1.0.tgz
```

## Edition detection

The dashboard detects the edition at runtime:

- **Without enterprise package:** Shows `[Community]` in header
- **With enterprise package:** Shows `[Enterprise]` in header

The MCP server logs:
- Community: no enterprise log output
- Enterprise: `[cortex-enterprise] v0.1.0 registered`
