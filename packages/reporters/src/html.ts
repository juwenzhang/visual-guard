import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest, PerformanceDiffResult} from '@visual-guard/shared';

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

  const scenarioCards = scenarios.map(s => _buildScenarioCard(s)).join('');

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
    .num.passed { color: #22c55e; } .num.changed { color: #f59e0b; } .num.failed { color: #ef4444; }
    .num.errored { color: #dc2626; } .num.total { color: #6366f1; }

    /* 场景详情卡 */
    .scenario-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,.1); margin-bottom: 20px; overflow: hidden; }
    .scenario-header { display: flex; align-items: center; gap: 16px; padding: 20px 24px; cursor: pointer; border-bottom: 1px solid #f0f0f0; }
    .scenario-header:hover { background: #fafafa; }
    .scenario-title { flex: 1; }
    .scenario-title h3 { font-size: 16px; margin-bottom: 4px; }
    .scenario-title .url { font-size: 13px; color: #888; }
    .scenario-meta { text-align: right; font-size: 13px; color: #888; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-badge.passed { background: #dcfce7; color: #16a34a; }
    .status-badge.changed { background: #fef3c7; color: #d97706; }
    .status-badge.baseline { background: #dbeafe; color: #2563eb; }
    .status-badge.failed { background: #fee2e2; color: #dc2626; }
    .status-badge.errored { background: #fce7f3; color: #db2777; }

    /* 详情区 */
    .scenario-detail { padding: 24px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    @media (max-width: 768px) { .scenario-detail { grid-template-columns: 1fr; } }
    .detail-section { border: 1px solid #eee; border-radius: 8px; padding: 16px; }
    .detail-section h4 { font-size: 14px; color: #666; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .5px; }
    .detail-section img { max-width: 100%; border: 1px solid #eee; border-radius: 4px; }
    .diff-region { display: inline-block; background: rgba(239,68,68,.1); border: 1px solid #ef4444; border-radius: 3px; padding: 2px 6px; margin: 2px; font-size: 12px; font-family: monospace; }
    .diff-item { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f5f5f5; }
    .diff-item:last-child { border-bottom: none; }
    .diff-path { font-family: monospace; color: #6366f1; word-break: break-all; }
    .diff-old { color: #ef4444; text-decoration: line-through; margin-right: 8px; }
    .diff-new { color: #22c55e; font-weight: 500; }
    .perf-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .perf-label { color: #888; }
    .perf-value { font-weight: 500; font-family: monospace; }
    .perf-over { color: #ef4444; }
    .empty-hint { color: #ccc; font-size: 13px; font-style: italic; }
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
      <div class="summary-card"><div class="num total">${summary.total}</div><div class="label">总场景数</div></div>
      <div class="summary-card"><div class="num passed">${summary.passed}</div><div class="label">通过</div></div>
      <div class="summary-card"><div class="num changed">${summary.changed}</div><div class="label">有变化</div></div>
      <div class="summary-card"><div class="num failed">${summary.failed}</div><div class="label">失败</div></div>
      <div class="summary-card"><div class="num errored">${summary.errored}</div><div class="label">错误</div></div>
      ${perfSummary}
    </div>

    ${scenarioCards}

    <div class="footer">Visual Guard — 自动化视觉回归检测工具 | 生成时间: ${new Date().toISOString()}</div>
  </div>
</body>
</html>`;
}

function _buildScenarioCard(s: {
  id: string;
  name: string;
  url: string;
  status: string;
  durationMs: number;
  diffs: {
    pixel?: {
      diffImage?: string;
      diffPixels: number;
      totalPixels: number;
      diffRatio?: number;
      regions?: Array<{x: number; y: number; width: number; height: number; diffRatio: number}>;
    };
    dom?: {
      changed: Array<{path: string; oldValue: unknown; newValue: unknown}>;
      added: Array<Record<string, unknown>>;
      removed: Array<Record<string, unknown>>;
    };
    layout?: {
      moved: Array<{
        selector: string;
        distance: number;
        oldBounds: {x: number; y: number; width: number; height: number};
        newBounds: {x: number; y: number; width: number; height: number};
      }>;
      resized: Array<{selector: string}>;
    };
    performance?: PerformanceDiffResult;
  };
}): string {
  const statusClass = _statusClass(s.status);
  const statusLabel = _statusLabel(s.status);
  const sceneId = `scene-${s.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return `
  <div class="scenario-card">
    <div class="scenario-header" onclick="document.getElementById('${sceneId}').classList.toggle('hidden')">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="scenario-title">
        <h3>${_escapeHtml(s.name || s.id)}</h3>
        <div class="url">${_escapeHtml(s.url)}</div>
      </div>
      <div class="scenario-meta">${s.durationMs}ms</div>
    </div>
    <div class="scenario-detail" id="${sceneId}">
      ${_buildPixelSection(s.diffs.pixel)}
      ${_buildDomSection(s.diffs.dom)}
      ${_buildLayoutSection(s.diffs.layout)}
      ${_buildPerfSection(s.diffs.performance)}
    </div>
  </div>`;
}

function _buildPixelSection(pixel?: {
  diffImage?: string;
  diffPixels: number;
  totalPixels: number;
  diffRatio?: number;
  regions?: Array<{x: number; y: number; width: number; height: number; diffRatio: number}>;
}): string {
  if (!pixel) {
    return '<div class="detail-section"><h4>📸 像素对比</h4><div class="empty-hint">无对比数据（基线模式）</div></div>';
  }

  const ratio = pixel.diffRatio !== undefined ? (pixel.diffRatio * 100).toFixed(2) : '—';
  const imageHtml = pixel.diffImage
    ? `<img src="data:image/png;base64,${pixel.diffImage}" alt="像素差异热力图" />`
    : '';

  const regionHtml =
    pixel.regions && pixel.regions.length > 0
      ? pixel.regions
          .slice(0, 5)
          .map(
            r =>
              `<span class="diff-region">(${r.x}, ${r.y}) ${r.width}×${r.height} Δ${(r.diffRatio * 100).toFixed(1)}%</span>`
          )
          .join(' ')
      : '';

  return `
  <div class="detail-section">
    <h4>📸 像素对比</h4>
    <div style="margin-bottom:8px"><strong>差异比例:</strong> ${ratio}% (${pixel.diffPixels} / ${pixel.totalPixels} px)</div>
    ${imageHtml}
    ${regionHtml ? `<div style="margin-top:8px"><strong>差异热区 (Top 5):</strong><br>${regionHtml}</div>` : ''}
  </div>`;
}

function _buildDomSection(dom?: {
  changed: Array<{path: string; oldValue: unknown; newValue: unknown}>;
  added: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
}): string {
  if (!dom) {
    return '<div class="detail-section"><h4>🌳 DOM 变化</h4><div class="empty-hint">无对比数据</div></div>';
  }

  const changedRows = dom.changed
    .slice(0, 15)
    .map(
      c => `
    <div class="diff-item">
      <div class="diff-path">${_escapeHtml(c.path)}</div>
      <span class="diff-old">${_escapeHtml(_truncateValue(c.oldValue))}</span>
      <span class="diff-new">→ ${_escapeHtml(_truncateValue(c.newValue))}</span>
    </div>
  `
    )
    .join('');

  return `
  <div class="detail-section">
    <h4>🌳 DOM 变化</h4>
    <div style="margin-bottom:8px;font-size:13px;color:#888">
      +${dom.added.length} 新增 &nbsp; -${dom.removed.length} 删除 &nbsp; ~${dom.changed.length} 修改
    </div>
    ${changedRows || '<div class="empty-hint">修改项为空</div>'}
    ${dom.changed.length > 15 ? `<div style="color:#888;font-size:12px;margin-top:4px">... 还有 ${dom.changed.length - 15} 项修改未展示</div>` : ''}
  </div>`;
}

function _buildLayoutSection(layout?: {
  moved: Array<{selector: string; distance: number}>;
  resized: Array<{selector: string}>;
}): string {
  if (!layout || (layout.moved.length === 0 && layout.resized.length === 0)) {
    return '';
  }

  const movedRows = layout.moved
    .slice(0, 10)
    .map(
      m =>
        `<div class="diff-item"><span class="diff-path">${_escapeHtml(m.selector)}</span> — 偏移 ${Math.round(m.distance)}px</div>`
    )
    .join('');

  const resizedRows = layout.resized
    .slice(0, 5)
    .map(
      r =>
        `<div class="diff-item"><span class="diff-path">${_escapeHtml(r.selector)}</span> — 尺寸变化</div>`
    )
    .join('');

  return `
  <div class="detail-section">
    <h4>↕ 布局变化</h4>
    ${movedRows ? `<div style="margin-bottom:8px"><strong>位移元素:</strong></div>${movedRows}` : ''}
    ${resizedRows ? `<div style="margin-top:8px"><strong>尺寸变化:</strong></div>${resizedRows}` : ''}
  </div>`;
}

function _buildPerfSection(perf?: PerformanceDiffResult): string {
  if (!perf) return '';

  const regressions = perf.regressions;
  const improvements = perf.improvements;

  if (!regressions && !improvements) return '';

  const rows: string[] = [];

  if (regressions) {
    for (const r of regressions) {
      rows.push(
        `<div class="perf-row"><span class="perf-label">${r.metric}</span><span class="perf-value perf-over">${_fmtMs(r.current)} ↑</span></div>`
      );
    }
  }
  if (improvements) {
    for (const r of improvements) {
      rows.push(
        `<div class="perf-row"><span class="perf-label">${r.metric}</span><span class="perf-value">${_fmtMs(r.current)}</span></div>`
      );
    }
  }

  return `
  <div class="detail-section">
    <h4>⚡ 性能</h4>
    ${rows.join('')}
  </div>`;
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

function _truncateValue(value: unknown): string {
  if (value === undefined || value === null) return '(空)';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > 60 ? `${str.slice(0, 57)}...` : str;
}
