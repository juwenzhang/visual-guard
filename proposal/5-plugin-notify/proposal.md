# 3. 通知插件实现

项目目录：
  ./packages/plugin-notify/src/index.ts

问题描述：
  1. 当前 `plugin-notify` 仅有 hello-world 骨架代码（15 行），无任何实际功能
  2. 设计文档 §5.6 定义了通知插件的 4 个渠道：企微机器人、飞书机器人、钉钉机器人、邮件通知
  3. 插件系统（PluginAPI + PluginEventBus）已在 core 中完整实现，具备接入条件

解决方案：
  1. 重写 `plugin-notify/src/index.ts`，实现完整通知插件

  2. 导出 `createNotifyPlugin(options: NotifyOptions): VisualGuardPlugin`，在 `afterReport` 钩子触发通知

  3. 企微机器人 (`src/channels/wecom.ts`)：Webhook URL 推送 markdown 格式消息（运行摘要、差异统计、报告链接）

  4. 飞书机器人 (`src/channels/feishu.ts`)：Webhook URL 推送富文本卡片消息（标题、摘要统计、快速操作按钮）

  5. 钉钉机器人 (`src/channels/dingtalk.ts`)：Webhook URL 推送 markdown 格式消息（运行结果、差异详情、报告链接）

  6. 邮件通知 (`src/channels/email.ts`)：基于 nodemailer 的 SMTP 发送，支持 HTML 邮件正文和可选 HTML 报告附件

  7. 新增 `src/template.ts` 通知模板构造器：
     ```ts
     interface NotifyContext {
       manifest: DiffManifest;
       reportUrls?: Record<string, string>;
       title: string;
     }
     function buildSummaryMarkdown(ctx: NotifyContext): string;
     ```

  8. 支持按状态裁剪通知：`notifyOn: 'always' | 'changed' | 'failed'`，支持阈值静默

  9. 扩展 PluginConfig 类型，新增通知配置：
     ```ts
     notify?: {
       enabled: boolean;
       channels: ('wecom' | 'feishu' | 'dingtalk' | 'email')[];
       notifyOn: 'always' | 'changed' | 'failed';
       silenceThreshold?: number;
       wecom?: { webhookUrl: string };
       feishu?: { webhookUrl: string };
       dingtalk?: { webhookUrl: string };
       email?: { host: string; port: number; auth: { user: string; pass: string }; to: string[] };
     };
     ```

  10. 新增依赖：`axios`（HTTP 推送）、`nodemailer`（邮件）
