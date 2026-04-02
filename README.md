# @danielblomma/cortex-enterprise

Enterprise plugin for [Cortex MCP](https://github.com/DanielBlomma/cortex).

## What this adds

- **License validation** — Offline `.lic` file verification
- **Telemetry sync** — Anonymized stats for connected deployments
- **Policy push** — Org-wide rules enforcement
- **Enterprise MCP tools** — Additional tools for governance and analytics

## Install

```bash
npm i -g @danielblomma/cortex-enterprise --registry=https://npm.pkg.github.com
```

Requires `@danielblomma/cortex-mcp` >= 0.6.0.

## How it works

Cortex automatically detects and loads this package at startup. No configuration needed — install the package and it activates.

## Docs

- [Strategy & Roadmap](docs/STRATEGY.md)
- [Architecture](docs/ARCHITECTURE.md)
