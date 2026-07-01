# @visual-guard/cli

Visual Guard command-line interface.

## Install

```bash
pnpm add -D @visual-guard/cli @visual-guard/engine-playwright
```

Engines are optional peer dependencies — install the one you need:

```bash
pnpm add -D @visual-guard/engine-playwright   # recommended
pnpm add -D @visual-guard/engine-puppeteer    # alternative
```

## Commands

```bash
# Interactive config generation
visual-guard init

# Run visual regression tests
visual-guard run
visual-guard run --engine playwright
visual-guard run --write-baseline
visual-guard run --engine puppeteer
visual-guard run --format html,json,console

# Baseline management
visual-guard baseline list
visual-guard baseline clean --dry-run
```

## `init` — Interactive Setup

Walks through interactive prompts to generate `visualguard.config.json`:

1. Project name
2. Base URL
3. Browser engine (playwright / puppeteer)
4. Headless mode
5. Scenarios (name + path, add multiple)
6. Report formats
7. **Notification setup** (optional) — WeCom / Feishu / DingTalk / QQ Email / Generic Webhook

Sensitive values in the config use `env:` prefix references. A `.env.example` file is generated alongside with the actual values for you to set as environment variables.

```json
{
  "plugins": [{
    "name": "notify",
    "options": {
      "email": {
        "user": "env:VG_EMAIL_USER",
        "pass": "env:VG_EMAIL_PASS"
      }
    }
  }]
}
```

## `run` — Execute Tests

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Config file path |
| `--engine <engine>` | Browser engine (playwright / puppeteer) |
| `--scenes <scenes>` | Run specific scenes (comma-separated) |
| `--tags <tags>` | Filter scenes by tags |
| `--env <env>` | Environment name override |
| `--write-baseline` | Update baselines for subsequent comparison |
| `--format <format>` | Report formats (html,json,console) |

Exit codes: `0` = all passed | `1` = diffs detected | `2` = errors

## Engines

- **playwright** — Stable mainline, default engine
- **puppeteer** — Fully functional alternative, auto-detects system Chrome

## License

[MIT](./LICENSE) © luhanxin
