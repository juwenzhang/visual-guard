# Visual Guard

> 📖 [中文](./README.zh-CN.md)

Automated visual regression and page quality testing tool. Config-driven scenarios → browser capture → baseline read/write → multi-dimensional diff → reports + notifications.

```text
Config-driven scenarios → browser capture → baseline I/O → multi-dimensional diff → DiffManifest → reports + plugins
```

## Status

| Package | Status | Description |
|---------|--------|-------------|
| `@visual-guard/shared` | ✅ | Types, logging, utilities, paths |
| `@visual-guard/config` | ✅ | `visualguard.config.*` auto-discovery + zod validation + env overrides |
| `@visual-guard/core` | ✅ | runner / capture / stabilize / diff / semantic-diff / baseline / branch detection |
| `@visual-guard/engine-playwright` | ✅ | Default stable engine, mainline maintenance |
| `@visual-guard/engine-puppeteer` | ✅ | Fully functional, available as alternative |
| `@visual-guard/cli` | ✅ | `run` / `init` (with notify config) / `baseline list` / `baseline clean` |
| `@visual-guard/reporters` | ✅ | HTML (sidebar + tab panels) / JSON (summary split) / Console |
| `@visual-guard/plugin-notify` | ✅ | WeCom / Feishu / DingTalk Webhooks + QQ Email SMTP + Generic Webhook |
| `@visual-guard/plugin-perf` | ✅ | LCP / FCP / CLS / TTFB collection + budget checks |
| `@visual-guard/plugin-ai` | ⚪ | AI-powered diff explanation (skeleton) |
| `@visual-guard/plugin-archive` | ⚪ | Report archiving (skeleton) |

## Key Features

- **Dynamic content stabilization** — Freezes `Date`, disables CSS animations, freezes `rAF` before screenshots to reduce false positives
- **Semantic diff** — Converts pixelmatch / deep-diff raw output into natural language descriptions consumable by AI
- **5-dimensional comparison** — Pixel / DOM structure / Layout shift / Network requests / Performance metrics
- **Rich HTML reports** — Sidebar navigation + 7 tab panels + diff overlay + blink comparator + performance dashboard + responsive design
- **Multi-channel notifications** — WeCom / Feishu / DingTalk Webhooks + QQ Email + Generic Webhook, with `env:` prefix for secrets
- **Auto branch detection** — Reads current Git branch automatically, no manual config needed

## Engine Strategy

Currently tested on **macOS / Linux** only.

- **Playwright** — Recommended engine, default stable pipeline.
- **Puppeteer** — Fully functional alternative engine, auto-detects system Chrome.

## Quick Start

```bash
pnpm install
pnpm run typecheck
pnpm run build
```

Standalone example:

```bash
cd examples/standalone
pnpm guard:run              # Playwright mainline
pnpm guard:run:puppeteer    # Puppeteer alternative
pnpm guard:baseline         # View baselines
pnpm guard:clean            # Clean basiline preview
```

## Package Structure

```text
packages/
  shared/             # Shared types, utilities, logging, path helpers
  config/             # Config loading, defaults, env overrides, schema validation
  core/               # Scene execution, capture, stabilization, baseline, diff, semantic-diff
  engine-playwright/  # Playwright adapter (mainline)
  engine-puppeteer/   # Puppeteer adapter (experimental)
  cli/                # CLI entry (run / init / baseline)
  reporters/          # HTML / JSON (summary+manifest) / Console reporters
  plugin-notify/      # IM + email notifications
  plugin-perf/        # Web Vitals collection + budget checks
  plugin-ai/          # AI analysis plugin (planned)
  plugin-archive/     # Archive plugin (planned)
```

## Project Memory

Progress tracking in `memory/progress.md`.
