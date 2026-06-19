import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest, PerformanceDiffResult, ScenarioResult} from '@visual-guard/shared';

/** 图片路径映射：sceneId → 外部化图片的相对路径 */
interface SceneImagePaths {
  baseline?: string;
  current?: string;
}

/**
 * HTML 报告器 — 生成可视化 HTML 报告
 *
 * 包含：场景概览、Blink Comparator 动画、DOM 变化列表、diff 热力图。
 * 截图图片外部化为独立 PNG 文件，HTML 仅引用相对路径，大幅减小 HTML 体积。
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

  // 外部化图片：base64 → 独立 PNG 文件
  const imagePaths = await _extractImages(manifest, reportDir);

  const html = _buildHtml(manifest, imagePaths);
  const filePath = path.join(reportDir, 'index.html');
  await fs.writeFile(filePath, html, 'utf-8');

  return filePath;
}

/**
 * 将 manifest 中所有场景的截图 base64 提取为独立 PNG 文件
 *
 * @returns sceneId → 相对路径映射
 */
async function _extractImages(
  manifest: DiffManifest,
  reportDir: string
): Promise<Map<string, SceneImagePaths>> {
  const map = new Map<string, SceneImagePaths>();
  const imgRoot = path.join(reportDir, 'images');
  await fs.mkdir(imgRoot, {recursive: true});

  for (const s of manifest.scenarios) {
    const paths: SceneImagePaths = {};
    const safeId = _safeSceneId(s.id);
    const sceneDir = path.join(imgRoot, safeId);

    if (s.artifacts?.baselineScreenshot) {
      await fs.mkdir(sceneDir, {recursive: true});
      const file = path.join(sceneDir, 'baseline.png');
      await fs.writeFile(file, Buffer.from(s.artifacts.baselineScreenshot, 'base64'));
      paths.baseline = `images/${safeId}/baseline.png`;
    }

    if (s.artifacts?.currentScreenshot) {
      await fs.mkdir(sceneDir, {recursive: true});
      const file = path.join(sceneDir, 'current.png');
      await fs.writeFile(file, Buffer.from(s.artifacts.currentScreenshot, 'base64'));
      paths.current = `images/${safeId}/current.png`;
    }

    map.set(s.id, paths);
  }

  return map;
}

/** 场景 ID → 安全文件名（替换特殊字符） */
function _safeSceneId(sceneId: string): string {
  return sceneId.replace(/[^a-zA-Z0-9_\-@.]/g, '_');
}

function _buildHtml(manifest: DiffManifest, imagePaths: Map<string, SceneImagePaths>): string {
  const {summary, run, scenarios} = manifest;

  const scenarioCards = scenarios.map(s => _buildScenarioCard(s, imagePaths.get(s.id))).join('');

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
    .scenario-title .url a { color: #6366f1; text-decoration: none; }
    .scenario-title .url a:hover { text-decoration: underline; }
    .scenario-meta { text-align: right; font-size: 13px; color: #888; }
    .status-badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; }
    .status-badge.passed { background: #dcfce7; color: #16a34a; }
    .status-badge.changed { background: #fef3c7; color: #d97706; }
    .status-badge.baseline { background: #dbeafe; color: #2563eb; }
    .status-badge.failed { background: #fee2e2; color: #dc2626; }
    .status-badge.errored { background: #fce7f3; color: #db2777; }

    /* 详情区 — 严格 1:1 等宽 */
    .scenario-detail { padding: 24px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; }
    @media (max-width: 768px) { .scenario-detail { grid-template-columns: minmax(0, 1fr); } }
    .detail-section { min-width: 0; }
    .detail-section { border: 1px solid #eee; border-radius: 8px; padding: 16px; }
    .detail-section h4 { font-size: 14px; color: #666; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .5px; }
    .detail-section img { max-width: 100%; border: 1px solid #eee; border-radius: 4px; }
    .diff-region { display: inline-block; background: rgba(239,68,68,.1); border: 1px solid #ef4444; border-radius: 3px; padding: 2px 6px; margin: 2px; font-size: 12px; font-family: monospace; }
    .diff-item { font-size: 13px; padding: 6px 0; border-bottom: 1px solid #f5f5f5; }
    .diff-item:last-child { border-bottom: none; }
    .diff-scroll-list { max-height: 320px; overflow-y: auto; border: 1px solid #f0f0f0; border-radius: 4px; padding: 4px 12px; }
    .diff-value a { color: #6366f1; word-break: break-all; }
    .diff-path { font-family: monospace; color: #6366f1; word-break: break-all; }
    .diff-old { color: #ef4444; text-decoration: line-through; margin-right: 8px; }
    .diff-new { color: #22c55e; font-weight: 500; }
    .perf-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
    .perf-label { color: #888; }
    .perf-value { font-weight: 500; font-family: monospace; }
    .perf-over { color: #ef4444; }
    .empty-hint { color: #ccc; font-size: 13px; font-style: italic; }
    .footer { text-align: center; color: #aaa; font-size: 12px; margin-top: 24px; }

    /* Blink Comparator 动画帧切换 */
    .blink-comparator { position: relative; width: 100%; overflow: hidden; border: 1px solid #eee; border-radius: 4px; background: #000; cursor: zoom-in; }
    .blink-comparator img { display: block; width: 100%; height: auto; }

    /* Lightbox 全屏放大 */
    .lightbox-overlay { display: none; position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,.85); backdrop-filter: blur(4px); }
    .lightbox-overlay.active { display: flex; align-items: center; justify-content: center; }
    .lightbox-close { position: absolute; top: 16px; right: 24px; z-index: 5; background: none; border: none; color: #fff; font-size: 32px; cursor: pointer; opacity: .7; transition: opacity .2s; }
    .lightbox-close:hover { opacity: 1; }
    .lightbox-content { position: relative; max-width: 95vw; max-height: 95vh; width: auto; }
    .lightbox-content .blink-comparator { cursor: default; }
    .lightbox-content .blink-comparator img { max-height: 92vh; width: auto; max-width: 95vw; }
    .lightbox-content .blink-controls { justify-content: center; }
    .blink-comparator .frame-a { position: relative; z-index: 1; }
    .blink-comparator .frame-b { position: absolute; top: 0; left: 0; z-index: 2; }
    @keyframes blink-swap {
      0%, 42%   { opacity: 0; }
      50%, 92%  { opacity: 1; }
      100%      { opacity: 0; }
    }
    .blink-comparator .frame-b.animating { animation: blink-swap var(--blink-dur, 10s) ease-in-out infinite; }
    .blink-comparator.paused .frame-b.animating { animation-play-state: paused; }
    .blink-label { position: absolute; top: 8px; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #fff; background: rgba(0,0,0,.55); z-index: 3; pointer-events: none; }
    .blink-label-a { left: 8px; }
    .blink-label-b { right: 8px; }

    /* Blink 控制栏 */
    .blink-controls { display: flex; align-items: center; gap: 8px; margin-top: 8px; font-size: 13px; }
    .blink-btn { padding: 4px 10px; border: 1px solid #d0d0d0; border-radius: 4px; background: #fff; cursor: pointer; font-size: 12px; }
    .blink-btn:hover { background: #f5f5f5; }
    .blink-speed { display: flex; align-items: center; gap: 4px; margin-left: auto; }
    .blink-speed select { font-size: 12px; padding: 2px 4px; border: 1px solid #d0d0d0; border-radius: 4px; }
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

  <div class="lightbox-overlay" id="vg-lightbox" onclick="(function(){var lb=document.getElementById('vg-lightbox');lb.classList.remove('active');lb.querySelector('.lightbox-content').innerHTML=''})()">
    <button class="lightbox-close" onclick="(function(){var lb=document.getElementById('vg-lightbox');lb.classList.remove('active');lb.querySelector('.lightbox-content').innerHTML=''})()">×</button>
    <div class="lightbox-content"></div>
  </div>

  <script>
    (function(){
      var lb = document.getElementById('vg-lightbox');
      var lbContent = lb.querySelector('.lightbox-content');

      window.openLightbox = function(comparatorId) {
        var src = document.getElementById(comparatorId);
        if (!src) return;
        var clone = src.cloneNode(true);
        // 先暂停动画，克隆后再恢复
        var wasPaused = src.classList.contains('paused');
        clone.classList.remove('paused');
        clone.querySelector('.frame-b').classList.add('animating');
        // 同步速度
        var dur = src.style.getPropertyValue('--blink-dur') || '';
        if (dur) clone.style.setProperty('--blink-dur', dur);
        // 重新绑定控制按钮
        var btn = clone.querySelector('.blink-btn');
        if (btn) {
          btn.onclick = function() {
            var b = clone.querySelector('.frame-b');
            b.classList.toggle('animating');
            clone.classList.toggle('paused');
            this.textContent = b.classList.contains('animating') ? '⏸ 暂停' : '▶ 播放';
          };
        }
        var sel = clone.querySelector('.blink-speed select');
        if (sel) {
          sel.onchange = function() {
            clone.style.setProperty('--blink-dur', this.value + 's');
          };
        }
        lbContent.innerHTML = '';
        lbContent.appendChild(clone);
        lb.classList.add('active');
        // 保持原比较器状态
        if (wasPaused) {
          src.querySelector('.frame-b').classList.remove('animating');
          src.classList.add('paused');
        }
      };

      // ESC 关闭
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && lb.classList.contains('active')) {
          lb.classList.remove('active');
          lbContent.innerHTML = '';
        }
      });
    })();
  </script>
</body>
</html>`;
}

function _buildScenarioCard(s: ScenarioResult, imagePaths?: SceneImagePaths): string {
  const statusClass = _statusClass(s.status);
  const statusLabel = _statusLabel(s.status);
  const sceneId = `scene-${s.id.replace(/[^a-zA-Z0-9]/g, '-')}`;

  return `
  <div class="scenario-card">
    <div class="scenario-header" onclick="document.getElementById('${sceneId}').classList.toggle('hidden')">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="scenario-title">
        <h3>${_escapeHtml(s.name || s.id)}</h3>
        <div class="url"><a href="${_escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${_escapeHtml(s.url)}</a></div>
      </div>
      <div class="scenario-meta">${s.durationMs}ms</div>
    </div>
    <div class="scenario-detail" id="${sceneId}">
      ${_buildPixelSection(s.diffs.pixel, imagePaths)}
      ${_buildDomSection(s.diffs.dom)}
      ${_buildLayoutSection(s.diffs.layout)}
      ${_buildPerfSection(s.diffs.performance)}
    </div>
  </div>`;
}

function _buildPixelSection(
  pixel?: ScenarioResult['diffs']['pixel'],
  imagePaths?: SceneImagePaths
): string {
  if (!pixel) {
    return '<div class="detail-section"><h4>📸 像素对比</h4><div class="empty-hint">无对比数据（基线模式）</div></div>';
  }

  const ratio = pixel.diffRatio !== undefined ? (pixel.diffRatio * 100).toFixed(2) : '—';

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

  const blinkHtml = _buildBlinkAnimation(imagePaths);

  return `
  <div class="detail-section">
    <h4>📸 像素对比</h4>
    <div style="margin-bottom:8px"><strong>差异比例:</strong> ${ratio}% (${pixel.diffPixels} / ${pixel.totalPixels} px)</div>
    ${blinkHtml}
    ${regionHtml ? `<div style="margin-top:8px"><strong>差异热区 (Top 5):</strong><br>${regionHtml}</div>` : ''}
  </div>`;
}

/**
 * 构建 Blink Comparator 动画帧切换组件
 *
 * 双帧交替切换（基线 ↔ 当前），图片为外部 PNG 文件（非 base64 内联）。
 * CSS 动画控制 opacity 交替，支持播放/暂停和速度调节。
 */
function _buildBlinkAnimation(imagePaths?: SceneImagePaths): string {
  if (!imagePaths?.baseline || !imagePaths?.current) {
    return '';
  }

  const uid = `blink-${Math.random().toString(36).slice(2, 8)}`;

  return `
  <div class="blink-comparator" id="${uid}" onclick="openLightbox('${uid}')">
    <img class="frame-a" src="${imagePaths.baseline}" alt="基线截图" />
    <img class="frame-b animating" src="${imagePaths.current}" alt="当前截图" />
    <span class="blink-label blink-label-a">基线</span>
    <span class="blink-label blink-label-b">当前</span>
  </div>
  <div class="blink-controls" onclick="event.stopPropagation()">
    <button class="blink-btn" onclick="(function(c){var b=c.querySelector('.frame-b');b.classList.toggle('animating');c.classList.toggle('paused');this.textContent=b.classList.contains('animating')?'⏸ 暂停':'▶ 播放'})(document.getElementById('${uid}'))">⏸ 暂停</button>
    <span style="font-size:11px;color:#888">点击图片放大查看</span>
    <div class="blink-speed">
      <label>速度:</label>
      <select onchange="(function(c,s){c.style.setProperty('--blink-dur',s.value+'s')})(document.getElementById('${uid}'),this)">
        <option value="20">0.5×</option>
        <option value="10" selected>1×</option>
        <option value="5">2×</option>
        <option value="2.5">4×</option>
      </select>
    </div>
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
    .map(
      c => `
    <div class="diff-item">
      <div class="diff-path">${_escapeHtml(c.path)}</div>
      <span class="diff-old">${_linkifyValue(c.oldValue)}</span>
      <span class="diff-new">→ ${_linkifyValue(c.newValue)}</span>
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
    <div class="diff-scroll-list">
      ${changedRows || '<div class="empty-hint">修改项为空</div>'}
    </div>
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

/** 将值转为 HTML 安全字符串，其中的 URL 自动转为可点击的 <a> 链接 */
function _linkifyValue(value: unknown): string {
  if (value === undefined || value === null) return '(空)';
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  const escaped = _escapeHtml(raw);
  // 匹配 http/https URL，转为可点击链接
  return escaped.replace(
    /(https?:\/\/[^\s<>"'{}|\\^`[\]]+)/gi,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );
}
