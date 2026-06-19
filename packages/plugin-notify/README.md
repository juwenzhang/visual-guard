# @visual-guard/plugin-notify

通知插件包（规划中）。

## 目标能力

- 企业微信机器人
- 飞书机器人
- 钉钉机器人
- 邮件通知

## 设计原则

插件只消费 `DiffManifest` 和 `PluginAPI`，不直接访问 core 内部状态。

## 计划

```ts
import { createNotifyPlugin } from '@visual-guard/plugin-notify';

plugins: [
  createNotifyPlugin({
    channels: ['wecom'],
    webhook: process.env.VG_NOTIFY_WEBHOOK,
  }),
]
```

当前包仍为骨架，后续在插件系统落地后实现。
