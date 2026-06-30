# @visual-guard/plugin-notify

Visual Guard 运行后通知插件，通过 Webhook 或邮件推送结构化的差异摘要。

## 支持渠道

| 渠道 | 配置键 | 说明 |
|------|--------|------|
| 企业微信机器人 | `wecomWebhook` | Markdown 卡片格式 |
| 飞书机器人 | `feishuWebhook` | 文本推送 |
| 钉钉机器人 | `dingtalkWebhook` | Markdown 推送 |
| 邮箱 (SMTP) | `email` | HTML 邮件，含统计卡片、性能对比表格、布局偏移详情 |
| 通用 Webhook | `webhook` | POST JSON 数据 |

## 用法

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

### 邮件示例

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

## 环境变量引用

任意配置值可用 `env:` 前缀引用环境变量，避免敏感信息写入配置文件：

```json
{ "pass": "env:VG_EMAIL_PASS" }
```

插件启动时自动将 `env:KEY` 解析为 `process.env.KEY`。

## 配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `wecomWebhook` | `string` | — | 企业微信机器人 Webhook URL |
| `feishuWebhook` | `string` | — | 飞书机器人 Webhook URL |
| `dingtalkWebhook` | `string` | — | 钉钉机器人 Webhook URL |
| `webhook` | `string` | — | 通用 Webhook URL |
| `email` | `object` | — | SMTP 邮件配置 (host, port, user, pass, to) |
| `title` | `string` | `"Visual Guard — {project}/{env}"` | 通知标题模板 |
| `onlyOnChange` | `boolean` | `true` | 全部通过时跳过通知 |
| `maxChanges` | `number` | `5` | 每场景最多展示几条语义变化 |

## 钩子

注册在 `AfterReport` 钩子上，接收完整 `DiffManifest`，构建通知内容：

- `manifest.summary` — 统计卡片
- `scenario.semantic` — 人类可读的变化描述
- `scenario.diffs.performance` — 性能对比表格
- `scenario.diffs.layout` — 元素偏移 Top 5
- `scenario.diffs.network` — 网络请求变化摘要

## License

[MIT](./LICENSE) © luhanxin
