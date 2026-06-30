# @visual-guard/plugin-notify

Post-run notification plugin for Visual Guard. Sends structured diff summaries via webhook or email.

## Supported Channels

| Channel | Config Key | Notes |
|---------|-----------|-------|
| WeCom Bot | `wecomWebhook` | Markdown card format |
| Feishu Bot | `feishuWebhook` | Plain text push |
| DingTalk Bot | `dingtalkWebhook` | Markdown push |
| Email (SMTP) | `email` | HTML email with stats cards, perf tables, layout shifts |
| Generic Webhook | `webhook` | POST JSON payload |

## Usage

```json
{
  "plugins": [
    {
      "name": "notify",
      "options": {
        "wecomWebhook": "env:VG_WECOM_WEBHOOK",
        "onlyOnChange": true,
        "maxChanges": 5
      }
    }
  ]
}
```

### Email example

```json
{
  "plugins": [{
    "name": "notify",
    "options": {
      "email": {
        "host": "smtp.qq.com",
        "port": 465,
        "user": "env:VG_EMAIL_USER",
        "pass": "env:VG_EMAIL_PASS",
        "to": "env:VG_EMAIL_TO"
      }
    }
  }]
}
```

## Environment Variable References

Any config value can use the `env:` prefix to reference environment variables, keeping secrets out of config files:

```json
{ "pass": "env:VG_EMAIL_PASS" }
```

The plugin resolves `env:KEY` → `process.env.KEY` at startup.

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `wecomWebhook` | `string` | — | WeCom bot webhook URL |
| `feishuWebhook` | `string` | — | Feishu bot webhook URL |
| `dingtalkWebhook` | `string` | — | DingTalk bot webhook URL |
| `webhook` | `string` | — | Generic webhook URL |
| `email` | `object` | — | SMTP email config (host, port, user, pass, to) |
| `title` | `string` | `"Visual Guard — {project}/{env}"` | Notification title template |
| `onlyOnChange` | `boolean` | `true` | Skip notification when all scenarios pass |
| `maxChanges` | `number` | `5` | Max semantic changes shown per scenario |

## Hook

Registers on `AfterReport`. Receives the full `DiffManifest` and builds notifications from:
- `manifest.summary` (stats cards)
- `scenario.semantic` (human-readable change descriptions)
- `scenario.diffs.performance` (perf comparison table)
- `scenario.diffs.layout` (top 5 element shifts)
- `scenario.diffs.network` (request changes summary)

## License

[MIT](./LICENSE) © luhanxin
