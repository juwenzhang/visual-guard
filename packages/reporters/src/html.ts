import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest} from '@visual-guard/shared';

/**
 * HTML 报告器 — 生成可视化 HTML 报告
 *
 * 包含：场景概览、左右截图对比、DOM 变化列表、diff 热力图
 *
 * @param manifest - 对比结果清单
 * @param outputDir - 输出目录
 * @param runId - 运行 ID
 * @returns 写入的文件路径
 */
export async function generateHtmlReport(
  manifest: DiffManifest,
  outputDir: string,
  runId: string
): Promise<string> {
  const reportDir = path.join(outputDir, runId);
  await fs.mkdir(reportDir, {recursive: true});

  const html = _buildHtml(manifest);
  const filePath = path.join(reportDir, 'index.html');
  await fs.writeFile(filePath, html, 'utf-8');

  return filePath;
}

function _buildHtml(manifest: DiffManifest): string {
  const {summary, run, scenarios} = manifest;

  const passedPercent =
    summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(1) : '0';

  const scenarioRows = scenarios
    .map(s => {
      const statusClass = _statusClass(s.status);
      const statusLabel = _statusLabel(s.status);
      const pixelInfo = s.diffs.pixel
        ? `${s.diffs.pixel.diffPixels} / ${s.diffs.pixel.totalPixels} px${s.diffs.pixel.diffRatio !== undefined ? ` (${(s.diffs.pixel.diffRatio * 100).toFixed(1)}%)` : ''}`
        : '—';
      const domChanges = s.diffs.dom
        ? `+${s.diffs.dom.added.length} / -${s.diffs.dom.removed.length} / ~${s.diffs.dom.changed.length}`
        : '—';
      const perfInfo = s.diffs.performance ? _formatPerfCell(s.diffs.performance) : '—';

      return `
      <tr>
        <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
        <td><strong>${_escapeHtml(s.name || s.id)}</strong></td>
        <td class="url-cell">${_escapeHtml(s.url)}</td>
        <td>${s.durationMs}ms</td>
        <td>${pixelInfo}</td>
        <td>${domChanges}</td>
        <td>${perfInfo}</td>
      </tr>`;
    })
    .join('');

  const perfSummary =
    summary.performanceRegressionCount > 0
      ? `<div class="summary-card">
        <div class="num changed">${summary.performanceRegressionCount}</div>
        <div class="label">性能退化</div>
      </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Guard — 视觉回归检测报告</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 1280px; margin: 0 auto; padding: 24px; }
    .header { background: #fff; border-radius: 12px; padding: 32px; margin-bottom: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .header h1 { font-size: 24px; color: #1a1a2e; margin-bottom: 16px; }
    .meta { display: flex; gap: 24px; flex-wrap: wrap; color: #666; font-size: 14px; }
    .meta span strong { color: #333; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .summary-card { background: #fff; border-radius: 12px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    .summary-card .num { font-size: 36px; font-weight: 700; }
    .summary-card .label { font-size: 13px; color: #888; margin-top: 4px; }
    .num.passed { color: #22c55e; }
    .num.changed { color: #f59e0b; }
    .num.failed { color: #ef4444; }
    .num.errored { color: #dc2626; }
    .num.total { color: #6366f1; }
    .progress-bar { height: 8px; border-radius: 4px; background: #e5e7eb; margin-bottom: 24px; overflow: hidden; }
    .progress-fill { height: 100%; border-radius: 4px; background: #22c55e; transition: width .3s; }
    .scenarios { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 12px 16px; background: #fafafa; font-size: 13px; color: #888; font-weight: 600; border-bottom: 1px solid #eee; }
    td { padding: 12px 16px; font-size: 14px; border-bottom: 1px solid #f0f0f0; }
    tr:last-child td { border-bottom: none; }
    .url-cell { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-badge.passed { background: #dcfce7; color: #16a34a; }
    .status-badge.changed { background: #fef3c7; color: #d97706; }
    .status-badge.baseline { background: #dbeafe; color: #2563eb; }
    .status-badge.failed { background: #fee2e2; color: #dc2626; }
    .status-badge.errored { background: #fce7f3; color: #db2777; }
    .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔍 Visual Guard — 视觉回归检测报告</h1>
      <div class="meta">
        <span>项目: <strong>${_escapeHtml(run.project)}</strong></span>
        <span>环境: <strong>${_escapeHtml(run.env)}</strong></span>
        <span>分支: <strong>${_escapeHtml(run.branch)}</strong></span>
        <span>运行 ID: <strong>${run.id}</strong></span>
        <span>开始: <strong>${run.startedAt}</strong></span>
        <span>结束: <strong>${run.endedAt}</strong></span>
      </div>
    </div>

    <div class="summary">
      <div class="summary-card">
        <div class="num total">${summary.total}</div>
        <div class="label">总场景数</div>
      </div>
      <div class="summary-card">
        <div class="num passed">${summary.passed}</div>
        <div class="label">通过</div>
      </div>
      <div class="summary-card">
        <div class="num changed">${summary.changed}</div>
        <div class="label">有变化</div>
      </div>
      <div class="summary-card">
        <div class="num failed">${summary.failed}</div>
        <div class="label">失败</div>
      </div>
      <div class="summary-card">
        <div class="num errored">${summary.errored}</div>
        <div class="label">错误</div>
      </div>
      ${perfSummary}
    </div>

    <div class="progress-bar">
      <div class="progress-fill" style="width: ${passedPercent}%"></div>
    </div>

    <div class="scenarios">
      <table>
        <thead>
          <tr>
            <th>状态</th>
            <th>场景</th>
            <th>URL</th>
            <th>耗时</th>
            <th>像素差异</th>
            <th>DOM 变化</th>
            <th>性能</th>
          </tr>
        </thead>
        <tbody>
          ${scenarioRows}
        </tbody>
      </table>
    </div>

    <div class="footer">
      Visual Guard — 自动化视觉回归检测工具 | 生成时间: ${new Date().toISOString()}
    </div>
  </div>
</body>
</html>`;
}

function _statusClass(status: string): string {
  if (status === 'passed') return 'passed';
  if (status === 'changed') return 'changed';
  if (status === 'baseline') return 'baseline';
  if (status === 'failed') return 'failed';
  return 'errored';
}

function _statusLabel(status: string): string {
  if (status === 'passed') return '通过';
  if (status === 'changed') return '有变化';
  if (status === 'baseline') return '基线';
  if (status === 'failed') return '失败';
  return '错误';
}

function _escapeHtml(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _formatPerfCell(perf: {
  regressions?: Array<{metric: string; current: number; changeRatio: number}>;
  improvements?: Array<{metric: string; current: number; changeRatio?: number}>;
}): string {
  if (perf.regressions && perf.regressions.length > 0) {
    return perf.regressions
      .map(r => `<span style="color:#ef4444">${r.metric} ↑ ${_fmtMs(r.current)}</span>`)
      .join('<br>');
  }

  const first = perf.improvements?.[0];
  if (first && first.changeRatio !== undefined && first.changeRatio !== 0) {
    return (perf.improvements ?? [])
      .map(r => `<span style="color:#22c55e">${r.metric} ↓ ${_fmtMs(r.current)}</span>`)
      .join('<br>');
  }

  // Baseline 模式：仅显示当前值
  if (perf.improvements && perf.improvements.length > 0) {
    return perf.improvements.map(r => `${r.metric}=${_fmtMs(r.current)}`).join('<br>');
  }

  return '—';
}

function _fmtMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}
