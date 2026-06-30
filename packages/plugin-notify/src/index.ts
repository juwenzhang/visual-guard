import type {HookContext, PluginAPI, VisualGuardPlugin} from '@visual-guard/core';
import {HOOK_NAMES} from '@visual-guard/core';
import type {DiffManifest} from '@visual-guard/shared';
import axios from 'axios';
import {createTransport} from 'nodemailer';

// ======== 类型 ========

interface NotifyOptions {
  /** 企业微信机器人 Webhook URL */
  wecomWebhook?: string;
  /** 飞书机器人 Webhook URL */
  feishuWebhook?: string;
  /** 钉钉机器人 Webhook URL */
  dingtalkWebhook?: string;
  /** 通用 Webhook URL（POST JSON，body 为 {title, content}） */
  webhook?: string;
  /** 邮件配置 */
  email?: {
    host: string;
    port: number;
    user: string;
    pass: string;
    to: string | string[];
  };
  /** 通知标题，支持 {project} {env} {status} 模板变量 */
  title?: string;
  /** 仅在有变化或失败时推送，默认 true */
  onlyOnChange?: boolean;
  /** 详情区最多展示几条 semantic 变化，默认 5 */
  maxChanges?: number;
}

interface WebhookPayload {
  title: string;
  content: string;
  project: string;
  env: string;
  branch: string;
  total: number;
  passed: number;
  changed: number;
  failed: number;
  errored: number;
  reportUrl?: string;
  /** 完整 manifest，给邮箱构建富内容使用 */
  manifest?: DiffManifest;
}

// ======== 工厂函数 ========

export default function createNotifyPlugin(): VisualGuardPlugin {
  let options: NotifyOptions = {};
  let api: PluginAPI;

  return {
    name: 'notify',

    setup(pluginApi: PluginAPI) {
      api = pluginApi;
      const rawOptions = (api.getConfig() as NotifyOptions) ?? {};
      options = resolveEnvValues(rawOptions);

      api.on(HOOK_NAMES.AfterReport, async (ctx: HookContext) => {
        const manifest = ctx.manifest;
        if (!manifest) return;

        // 仅在需要时通知
        if (options.onlyOnChange !== false) {
          const hasIssue =
            manifest.summary.changed > 0 ||
            manifest.summary.failed > 0 ||
            manifest.summary.errored > 0;
          if (!hasIssue) return;
        }

        const title = buildTitle(manifest, options);
        const summary = buildSummary(manifest);
        const details = buildDetails(manifest, options.maxChanges ?? 5);
        const content = `${summary}\n\n${details}`;

        const payload: WebhookPayload = {
          title,
          content,
          project: manifest.run.project,
          env: manifest.run.env,
          branch: manifest.run.branch,
          total: manifest.summary.total,
          passed: manifest.summary.passed,
          changed: manifest.summary.changed,
          failed: manifest.summary.failed,
          errored: manifest.summary.errored,
          reportUrl: ctx.reportFiles?.find((f: string) => f.endsWith('.html')),
          manifest
        };

        await sendNotifications(options, payload);
      });
    }
  };
}

// ======== 消息构建 ========

function buildTitle(manifest: DiffManifest, opts: NotifyOptions): string {
  const template = opts.title ?? 'Visual Guard — {project}/{env}';
  const {summary} = manifest;
  const status =
    summary.errored > 0
      ? '❌ 错误'
      : summary.changed > 0 || summary.failed > 0
        ? '⚠ 有变化'
        : '✅ 通过';

  return template
    .replace('{project}', manifest.run.project)
    .replace('{env}', manifest.run.env)
    .replace('{status}', status);
}

function buildSummary(manifest: DiffManifest): string {
  const s = manifest.summary;
  const parts: string[] = [];
  parts.push(`总场景: ${s.total}`);
  if (s.passed > 0) parts.push(`通过: ${s.passed}`);
  if (s.changed > 0) parts.push(`有变化: ${s.changed}`);
  if (s.failed > 0) parts.push(`失败: ${s.failed}`);
  if (s.errored > 0) parts.push(`错误: ${s.errored}`);
  return parts.join(' | ');
}

function buildDetails(manifest: DiffManifest, maxChanges: number): string {
  const lines: string[] = [];

  for (const scenario of manifest.scenarios) {
    const sem = scenario.semantic;
    if (!sem || sem.changes.length === 0) continue;

    const vp = scenario.id.includes('@')
      ? ` ${scenario.id.slice(scenario.id.lastIndexOf('@'))}`
      : '';
    lines.push(`▶ ${scenario.name}${vp} — ${sem.totalChanges} 处变化`);

    for (const c of sem.changes.slice(0, maxChanges)) {
      const icon =
        c.severity === 'critical'
          ? '🔴'
          : c.severity === 'high'
            ? '🟠'
            : c.severity === 'medium'
              ? '🟡'
              : '🔵';
      lines.push(`  ${icon} [${c.type}] ${c.description}`);
    }

    const remaining = sem.totalChanges - maxChanges;
    if (remaining > 0) lines.push(`  ... 还有 ${remaining} 处变化`);
  }

  return lines.join('\n') || '无具体变化信息';
}

// ======== 环境变量解析 ========

/** 递归解析 "env:KEY" 为 process.env.KEY，避免敏感信息写入配置文件 */
function resolveEnvValues<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') {
    if (obj.startsWith('env:')) {
      return (process.env[obj.slice(4)] ?? obj) as unknown as T;
    }
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(resolveEnvValues) as unknown as T;
  }
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      result[key] = resolveEnvValues((obj as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return obj;
}

// ======== 发送通道 ========

async function sendNotifications(config: NotifyOptions, payload: WebhookPayload): Promise<void> {
  const tasks: Promise<void>[] = [];

  if (config.wecomWebhook) {
    tasks.push(sendWecom(config.wecomWebhook, payload));
  }
  if (config.feishuWebhook) {
    tasks.push(sendFeishu(config.feishuWebhook, payload));
  }
  if (config.dingtalkWebhook) {
    tasks.push(sendDingtalk(config.dingtalkWebhook, payload));
  }
  if (config.webhook) {
    tasks.push(sendGenericWebhook(config.webhook, payload));
  }
  if (config.email) {
    tasks.push(sendEmail(config.email, payload));
  }

  if (tasks.length === 0) return;

  try {
    await Promise.allSettled(tasks);
  } catch {
    // 静默处理——通知失败不影响主流程
  }
}

// ======== 企业微信 ========

function sendWecom(webhook: string, payload: WebhookPayload): Promise<void> {
  const {title, content, project, env, branch, total, passed, changed, failed, errored, reportUrl} =
    payload;

  const markdown = [
    `# ${title}`,
    `> 项目: **${project}** | 环境: **${env}** | 分支: **${branch}**`,
    '',
    `总场景: <font color="info">${total}</font>`,
    `通过: <font color="comment">${passed}</font>`,
    `有变化: <font color="warning">${changed}</font>`,
    `失败: <font color="warning">${failed}</font>`,
    `错误: <font color="warning">${errored}</font>`,
    '',
    content.replace(/\n/g, '\n'),
    '',
    reportUrl ? `[📊 查看报告](${reportUrl})` : ''
  ].join('\n');

  return axios.post(webhook, {msgtype: 'markdown', markdown: {content: markdown}}).then(() => {});
}

// ======== 飞书 ========

function sendFeishu(webhook: string, payload: WebhookPayload): Promise<void> {
  const {title, content, project, env, branch, total, passed, changed, failed, errored, reportUrl} =
    payload;

  const text = [
    `${title}`,
    `项目: ${project} | 环境: ${env} | 分支: ${branch}`,
    `总:${total} 通过:${passed} 变化:${changed} 失败:${failed} 错误:${errored}`,
    '',
    content,
    '',
    reportUrl ? `报告: ${reportUrl}` : ''
  ].join('\n');

  return axios.post(webhook, {msg_type: 'text', content: {text}}).then(() => {});
}

// ======== 钉钉 ========

function sendDingtalk(webhook: string, payload: WebhookPayload): Promise<void> {
  const {title, content} = payload;

  return axios
    .post(webhook, {
      msgtype: 'markdown',
      markdown: {title, text: `# ${title}\n\n${content}`}
    })
    .then(() => {});
}

// ======== 通用 Webhook ========

function sendGenericWebhook(webhook: string, payload: WebhookPayload): Promise<void> {
  return axios.post(webhook, payload).then(() => {});
}

// ======== 邮件 ========

function sendEmail(
  cfg: NonNullable<NotifyOptions['email']>,
  payload: WebhookPayload
): Promise<void> {
  const {
    title,
    project,
    env,
    branch,
    total,
    passed,
    changed,
    failed,
    errored,
    reportUrl,
    manifest
  } = payload;
  const now = new Date().toLocaleString('zh-CN', {timeZone: 'Asia/Shanghai'});
  const hasIssue = changed > 0 || failed > 0 || errored > 0;

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6f8;padding:24px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;box-shadow:0 2px 16px rgba(0,0,0,.06);overflow:hidden;">

  <!-- Header -->
  <tr><td style="padding:28px 32px 20px;border-bottom:1px solid #eef0f3;">
    <div style="font-size:20px;font-weight:700;color:#1f2937;">🔍 Visual Guard — ${_escHtml(project)}</div>
    <div style="margin-top:10px;font-size:13px;color:#9ca3af;line-height:1.8;">
      环境: <b style="color:#4b5563">${_escHtml(env)}</b> &nbsp;|&nbsp;
      分支: <b style="color:#4b5563">${_escHtml(branch)}</b> &nbsp;|&nbsp;
      时间: ${now}
    </div>
  </td></tr>

  <!-- Status Banner -->
  <tr><td style="padding:20px 32px;background:${hasIssue ? '#fffbeb' : '#f0fdf4'};text-align:center;">
    <div style="font-size:16px;font-weight:700;color:${hasIssue ? '#d97706' : '#16a34a'};">
      ${hasIssue ? '⚠ 检测到视觉差异' : '✅ 所有场景通过'}
    </div>
    <div style="font-size:12px;color:#6b7280;margin-top:4px;">${_escHtml(title)}</div>
  </td></tr>

  <!-- Stats Cards -->
  <tr><td style="padding:20px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${_emailStatCard('总场景', String(total), '#6366f1')}
        ${_emailStatCard('通过', String(passed), '#22c55e')}
        ${_emailStatCard('变化', String(changed), '#f59e0b')}
        ${_emailStatCard('失败', String(failed), '#ef4444')}
        ${_emailStatCard('错误', String(errored), '#dc2626')}
      </tr>
    </table>
  </td></tr>

  <!-- Per-Scenario Details -->
  ${manifest ? _buildPerScenarioSections(manifest) : ''}

  <!-- AI Suggestions Placeholder -->
  <tr><td style="padding:0 32px 20px;">
    <div style="background:#f0f4ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px 18px;">
      <div style="font-size:13px;font-weight:600;color:#4338ca;margin-bottom:6px;">💡 AI 修改建议</div>
      <div style="font-size:12px;color:#6b7280;line-height:1.6;">
        启用 <code style="background:#e0e7ff;padding:1px 5px;border-radius:3px;">@visual-guard/plugin-ai</code> 插件后，将自动分析差异原因并生成针对性修复建议。
      </div>
    </div>
  </td></tr>

  <!-- Footer -->
  ${
    reportUrl
      ? `
  <tr><td style="padding:16px 32px;border-top:1px solid #eef0f3;text-align:center;">
    <a href="${_escHtml(reportUrl)}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:10px 28px;border-radius:8px;font-size:14px;font-weight:600;">📊 查看完整报告</a>
  </td></tr>`
      : ''
  }
  <tr><td style="padding:16px 32px;text-align:center;font-size:11px;color:#9ca3af;">
    Visual Guard — 自动化视觉回归检测
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;

  const text = [
    `Visual Guard — ${project}/${env}`,
    `分支: ${branch} | 时间: ${now}`,
    '',
    `总:${total}  通过:${passed}  变化:${changed}  失败:${failed}  错误:${errored}`,
    payload.content,
    reportUrl ? `\n完整报告: ${reportUrl}` : ''
  ].join('\n');

  const transporter = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: {user: cfg.user, pass: cfg.pass}
  });

  return transporter
    .sendMail({
      from: cfg.user,
      to: Array.isArray(cfg.to) ? cfg.to.join(', ') : cfg.to,
      subject: `[Visual Guard] ${title}`,
      text,
      html
    })
    .then(() => {});
}

// ======== 邮件内容构建函数 ========

/** 为每个场景生成：语义摘要 + 性能表格 + 偏移列表 */
function _buildPerScenarioSections(manifest: DiffManifest): string {
  const sections: string[] = [];
  for (const s of manifest.scenarios) {
    const parts: string[] = [];
    const vp = s.id.includes('@') ? ` ${s.id.slice(s.id.lastIndexOf('@'))}` : '';

    // 标题行
    parts.push(`<tr><td style="padding:24px 32px 8px;">
      <div style="font-size:15px;font-weight:700;color:#1f2937;">${_escHtml(s.name)}<span style="font-size:12px;color:#9ca3af;font-weight:400;">${_escHtml(vp)}</span></div>
      <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${_escHtml(s.url)} &nbsp;|&nbsp; ${s.durationMs}ms</div>
    </td></tr>`);

    // AI 摘要卡片
    if (s.semantic && s.semantic.changes.length > 0) {
      const cards = s.semantic.changes
        .map(c => {
          const bg =
            c.severity === 'critical'
              ? '#fef2f2'
              : c.severity === 'high'
                ? '#fffbeb'
                : c.severity === 'medium'
                  ? '#eff6ff'
                  : '#f9fafb';
          const bd =
            c.severity === 'critical'
              ? '#fecaca'
              : c.severity === 'high'
                ? '#fde68a'
                : c.severity === 'medium'
                  ? '#bfdbfe'
                  : '#e5e7eb';
          return `<tr><td style="padding:6px 0;font-size:13px;">
            <span style="display:inline-block;background:${bg};border:1px solid ${bd};border-radius:6px;padding:6px 12px;margin:2px 4px 2px 0;">
              <b>${_severityBadge(c.severity)} [${c.type}]</b> ${_escHtml(c.description)}
            </span>
          </td></tr>`;
        })
        .join('');
      parts.push(`<tr><td style="padding:0 32px 12px;">
        <table width="100%" cellpadding="0" cellspacing="0">${cards}</table>
      </td></tr>`);
    }

    // 性能对比表格
    const perfRows = _buildPerfTable(s);
    if (perfRows) {
      parts.push(`<tr><td style="padding:8px 32px 16px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">⚡ 性能指标</div>
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;font-size:12px;">
          <tr style="background:#f9fafb;">
            <td style="padding:7px 12px;font-weight:600;color:#6b7280;width:30%;">指标</td>
            <td style="padding:7px 12px;font-weight:600;color:#6b7280;width:25%;">当前</td>
            <td style="padding:7px 12px;font-weight:600;color:#6b7280;width:25%;">基线</td>
            <td style="padding:7px 12px;font-weight:600;color:#6b7280;width:20%;text-align:right;">变化</td>
          </tr>
          ${perfRows}
        </table>
      </td></tr>`);
    }

    // 布局偏移 Top 5
    const layoutRows = _buildLayoutRows(s);
    if (layoutRows) {
      parts.push(`<tr><td style="padding:8px 32px 16px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">↕ 元素偏移 Top 5</div>
        ${layoutRows}
      </td></tr>`);
    }

    // 网络变化 Top 3
    const netRows = _buildNetworkRows(s);
    if (netRows) {
      parts.push(`<tr><td style="padding:8px 32px 16px;">
        <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:6px;">🌐 网络变化</div>
        ${netRows}
      </td></tr>`);
    }

    // 分隔线
    if (parts.length > 0) {
      parts.push(
        `<tr><td style="padding:0 32px;"><div style="border-top:1px solid #eef0f3;"></div></td></tr>`
      );
    }

    sections.push(parts.join(''));
  }
  return sections.join('');
}

/** 构建性能对比表格行 */
function _buildPerfTable(s: DiffManifest['scenarios'][number]): string {
  const perf = s.diffs.performance;
  if (!perf) return '';

  const allMetrics = [...(perf.regressions ?? []), ...(perf.improvements ?? [])];
  if (allMetrics.length === 0) return '';

  return allMetrics
    .map(m => {
      const isReg = (perf.regressions ?? []).some(r => r.metric === m.metric);
      const color = isReg ? '#d97706' : '#16a34a';
      const arrow = isReg ? '↑' : '↓';
      const delta = Math.abs(m.changeRatio * 100).toFixed(0);
      return `<tr>
        <td style="padding:6px 12px;border-top:1px solid #f3f4f6;font-weight:500;">${m.metric}</td>
        <td style="padding:6px 12px;border-top:1px solid #f3f4f6;">${_fmtMsHtml(m.current)}</td>
        <td style="padding:6px 12px;border-top:1px solid #f3f4f6;color:#9ca3af;">${_fmtMsHtml(m.baseline)}</td>
        <td style="padding:6px 12px;border-top:1px solid #f3f4f6;text-align:right;font-weight:600;color:${color};">${arrow} ${delta}%</td>
      </tr>`;
    })
    .join('');
}

/** 构建布局偏移行 */
function _buildLayoutRows(s: DiffManifest['scenarios'][number]): string {
  const layout = s.diffs.layout;
  if (!layout || layout.moved.length === 0) return '';

  const rows = layout.moved
    .slice(0, 5)
    .map(m => {
      const dx = m.newBounds.x - m.oldBounds.x;
      const dy = m.newBounds.y - m.oldBounds.y;
      const dirs: string[] = [];
      if (Math.abs(dx) > 0.5) dirs.push(dx > 0 ? `→${Math.round(dx)}px` : `←${Math.round(-dx)}px`);
      if (Math.abs(dy) > 0.5) dirs.push(dy > 0 ? `↓${Math.round(dy)}px` : `↑${Math.round(-dy)}px`);
      return `<tr>
        <td style="padding:4px 0;font-family:monospace;font-size:11px;color:#6366f1;">${_escHtml(m.selector)}</td>
        <td style="padding:4px 8px;font-size:12px;color:#6b7280;">${dirs.join(' ')}</td>
      </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

/** 构建网络变化行 */
function _buildNetworkRows(s: DiffManifest['scenarios'][number]): string {
  const net = s.diffs.network;
  if (!net) return '';

  const items: string[] = [];
  if (net.added.length > 0) {
    items.push(`<span style="color:#22c55e;">+${net.added.length}</span> 新增请求`);
  }
  if (net.removed.length > 0) {
    items.push(`<span style="color:#ef4444;">-${net.removed.length}</span> 移除请求`);
  }
  if (net.timingChanges.length > 0) {
    items.push(`<span style="color:#f59e0b;">${net.timingChanges.length}</span> 耗时变化`);
  }
  if (net.sizeChanges.length > 0) {
    const totalBytes = net.sizeChanges.reduce((sum, c) => sum + c.changeBytes, 0);
    items.push(
      `体积 <span style="color:${totalBytes > 0 ? '#f59e0b' : '#22c55e'};">${totalBytes > 0 ? '+' : ''}${_fmtBytesHtml(Math.abs(totalBytes))}</span>`
    );
  }
  if (items.length === 0) return '';
  return `<span style="font-size:13px;color:#4b5563;">${items.join(' &nbsp;|&nbsp; ')}</span>`;
}

// ======== HTML 工具函数 ========

/** 邮件统计卡片 */
function _emailStatCard(label: string, value: string, color: string): string {
  return `<td style="width:20%;padding:4px;text-align:center;vertical-align:top;">
    <div style="background:#f9fafb;border-radius:8px;padding:10px 6px;">
      <div style="font-size:22px;font-weight:700;color:${color};line-height:1.2;">${value}</div>
      <div style="font-size:10px;color:#9ca3af;margin-top:2px;">${label}</div>
    </div>
  </td>`;
}

function _escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _severityBadge(severity: string): string {
  return severity === 'critical'
    ? '🔴'
    : severity === 'high'
      ? '🟠'
      : severity === 'medium'
        ? '🟡'
        : '🔵';
}

function _fmtMsHtml(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function _fmtBytesHtml(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
