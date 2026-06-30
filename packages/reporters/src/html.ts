import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest, ScenarioResult} from '@visual-guard/shared';

interface SceneImagePaths {
  baseline?: string;
  current?: string;
  diff?: string;
}

export async function generateHtmlReport(
  manifest: DiffManifest,
  outputDir: string,
  runId: string
): Promise<string> {
  const reportDir = path.join(outputDir, runId);
  await fs.mkdir(reportDir, {recursive: true});

  const imagePaths = await _extractImages(manifest, reportDir);
  const html = _buildHtml(manifest, imagePaths);
  const filePath = path.join(reportDir, 'report.html');
  await fs.writeFile(filePath, html, 'utf-8');
  return filePath;
}

async function _extractImages(
  manifest: DiffManifest,
  reportDir: string
): Promise<Map<string, SceneImagePaths>> {
  const map = new Map<string, SceneImagePaths>();
  const imgRoot = path.join(reportDir, 'images');
  await fs.mkdir(imgRoot, {recursive: true});

  for (const s of manifest.scenarios) {
    const paths: SceneImagePaths = {};
    const safeId = _safeId(s.id);
    const sceneDir = path.join(imgRoot, safeId);
    await fs.mkdir(sceneDir, {recursive: true});

    if (s.artifacts?.baselineScreenshot) {
      const file = path.join(sceneDir, 'baseline.png');
      await fs.writeFile(file, Buffer.from(s.artifacts.baselineScreenshot, 'base64'));
      paths.baseline = `images/${safeId}/baseline.png`;
    }
    if (s.artifacts?.currentScreenshot) {
      const file = path.join(sceneDir, 'current.png');
      await fs.writeFile(file, Buffer.from(s.artifacts.currentScreenshot, 'base64'));
      paths.current = `images/${safeId}/current.png`;
    }
    if (s.artifacts?.diffScreenshot) {
      const file = path.join(sceneDir, 'diff.png');
      await fs.writeFile(file, Buffer.from(s.artifacts.diffScreenshot, 'base64'));
      paths.diff = `images/${safeId}/diff.png`;
    }
    map.set(s.id, paths);
  }
  return map;
}

function _safeId(sceneId: string): string {
  return sceneId.replace(/[^a-zA-Z0-9_\-@.]/g, '_');
}

function _viewportFromId(sceneId: string): string {
  const idx = sceneId.lastIndexOf('@');
  return idx >= 0 ? sceneId.slice(idx + 1) : '';
}

// ========== HTML 构建 ==========

function _buildHtml(manifest: DiffManifest, imagePaths: Map<string, SceneImagePaths>): string {
  const {summary, run, scenarios} = manifest;

  // 侧边栏
  const sidebarItems = scenarios.map(s => _buildSidebarItem(s)).join('');

  // 主内容区 — 每个场景一个 section
  const sections = scenarios.map(s => _buildScenarioSection(s, imagePaths.get(s.id))).join('');

  const hasDiffs = summary.changed > 0 || summary.failed > 0;

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Guard — ${_esc(run.project)}</title>
  <style>${_css()}</style>
</head>
<body>
<button class="vg-sidebar-toggle" id="vg-sidebar-toggle" onclick="document.getElementById('vg-sidebar').classList.toggle('open');this.textContent=document.getElementById('vg-sidebar').classList.contains('open')?'✕':'☰'">☰</button>
<div class="vg-layout">
  <nav class="vg-sidebar" id="vg-sidebar">
    <div class="vg-sidebar-header">
      <h2>🔍 Visual Guard</h2>
      <div class="vg-sidebar-meta">${_esc(run.project)} / ${_esc(run.env)}</div>
    </div>
    <ul class="vg-nav-list">${sidebarItems}</ul>
  </nav>

  <main class="vg-main">
    <header class="vg-header">
      <h1>视觉回归检测报告</h1>
      <div class="vg-meta">
        <span>项目: <strong>${_esc(run.project)}</strong></span>
        <span>环境: <strong>${_esc(run.env)}</strong></span>
        <span>分支: <strong>${_esc(run.branch)}</strong></span>
        ${run.commit ? `<span>Commit: <strong>${run.commit.slice(0, 7)}</strong></span>` : ''}
        <span>运行: <strong>${run.id.slice(0, 8)}</strong></span>
        <span>时间: <strong>${new Date(run.startedAt).toLocaleString('zh-CN')}</strong></span>
      </div>
    </header>

    <div class="vg-summary">
      <div class="vg-summary-card"><div class="num total">${summary.total}</div><div class="label">总场景</div></div>
      <div class="vg-summary-card"><div class="num passed">${summary.passed}</div><div class="label">通过</div></div>
      <div class="vg-summary-card"><div class="num changed">${summary.changed}</div><div class="label">有变化</div></div>
      <div class="vg-summary-card"><div class="num failed">${summary.failed}</div><div class="label">失败</div></div>
      <div class="vg-summary-card"><div class="num errored">${summary.errored}</div><div class="label">错误</div></div>
    </div>

    ${
      hasDiffs
        ? `<div class="vg-diff-overview">
      <span>像素 ${summary.pixelDiffCount}</span>
      <span>DOM ${summary.domDiffCount}</span>
      <span>布局 ${summary.layoutDiffCount}</span>
      <span>网络 ${summary.networkDiffCount}</span>
      <span>性能 ${summary.performanceRegressionCount}</span>
    </div>`
        : ''
    }

    ${sections}

    <footer class="vg-footer">Visual Guard — 自动化视觉回归检测 | ${new Date().toISOString()}</footer>
  </main>
</div>
<script>${_js()}</script>
</body>
</html>`;
}

// ========== 侧边栏 ==========

function _buildSidebarItem(s: ScenarioResult): string {
  const safeId = _safeId(s.id);
  const statusClass = _statusClass(s.status);
  const statusLabel = _statusLabel(s.status);
  const vp = _viewportFromId(s.id);
  const changeCount = s.semantic?.totalChanges ?? 0;

  return `<li>
    <a href="#${safeId}" class="vg-nav-scene" data-scene="${safeId}">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <span class="vg-nav-name">${_esc(s.name)}</span>
      <span class="vg-nav-vp">${vp}</span>
      ${changeCount > 0 ? `<span class="vg-nav-count">${changeCount}</span>` : ''}
    </a>
    <ul class="vg-nav-tabs" id="nav-tabs-${safeId}">
      <li><a href="#${safeId}-tab-ai">AI 摘要</a></li>
      <li><a href="#${safeId}-tab-visual">视觉</a></li>
      <li><a href="#${safeId}-tab-dom">DOM</a></li>
      <li><a href="#${safeId}-tab-layout">布局</a></li>
      <li><a href="#${safeId}-tab-network">网络</a></li>
      <li><a href="#${safeId}-tab-perf">性能</a></li>
      <li><a href="#${safeId}-tab-errors">错误</a></li>
    </ul>
  </li>`;
}

// ========== 场景 Section ==========

function _buildScenarioSection(s: ScenarioResult, img?: SceneImagePaths): string {
  const safeId = _safeId(s.id);
  const statusClass = _statusClass(s.status);
  const statusLabel = _statusLabel(s.status);
  const vp = _viewportFromId(s.id);

  return `
  <section class="vg-scene" id="${safeId}">
    <div class="vg-scene-header">
      <span class="status-badge ${statusClass}">${statusLabel}</span>
      <div class="vg-scene-title">
        <h3>${_esc(s.name)}</h3>
        <div class="vg-scene-meta">
          <span class="vg-scene-url"><a href="${_esc(s.url)}" target="_blank" rel="noopener">${_esc(s.url)}</a></span>
          <span class="vg-scene-vp">📐 ${vp} 1280×800</span>
          <span class="vg-scene-time">⏱ ${s.durationMs}ms</span>
        </div>
      </div>
    </div>

    <div class="vg-tab-bar">
      <a href="#${safeId}-tab-ai" class="vg-tab active" data-tab="ai">🤖 AI 摘要</a>
      <a href="#${safeId}-tab-visual" class="vg-tab" data-tab="visual">📸 视觉对比</a>
      <a href="#${safeId}-tab-dom" class="vg-tab" data-tab="dom">🌳 DOM 变化</a>
      <a href="#${safeId}-tab-layout" class="vg-tab" data-tab="layout">↕ 布局变化</a>
      <a href="#${safeId}-tab-network" class="vg-tab" data-tab="network">🌐 网络变化</a>
      <a href="#${safeId}-tab-perf" class="vg-tab" data-tab="perf">⚡ 性能</a>
      <a href="#${safeId}-tab-errors" class="vg-tab" data-tab="errors">🐛 错误</a>
    </div>

    <div class="vg-tab-panels">
      <div class="vg-tab-panel active" id="${safeId}-tab-ai">${_buildAiTab(s)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-visual">${_buildVisualTab(s, img)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-dom">${_buildDomTab(s)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-layout">${_buildLayoutTab(s)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-network">${_buildNetworkTab(s)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-perf">${_buildPerfTab(s)}</div>
      <div class="vg-tab-panel" id="${safeId}-tab-errors">${_buildErrorsTab(s)}</div>
    </div>
  </section>`;
}

// ========== TAB: AI 摘要 ==========

function _buildAiTab(s: ScenarioResult): string {
  const sem = s.semantic;
  if (!sem || sem.changes.length === 0) {
    return '<div class="vg-empty">✅ 无检测到的变化，所有维度通过。</div>';
  }
  const cards = sem.changes
    .map(
      c => `
    <div class="vg-ai-card vg-ai-${c.severity}">
      <span class="vg-ai-icon">${_severityIcon(c.severity)}</span>
      <div class="vg-ai-body">
        <span class="vg-ai-type">${c.type}</span>
        <span class="vg-ai-desc">${_esc(c.description)}</span>
        ${c.element ? `<span class="vg-ai-element">${_esc(c.element)}</span>` : ''}
      </div>
    </div>`
    )
    .join('');
  return `<div class="vg-ai-list">${cards}</div>`;
}

function _severityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
      return '🟡';
    default:
      return '🔵';
  }
}

// ========== TAB: 视觉对比 ==========

function _buildVisualTab(s: ScenarioResult, img?: SceneImagePaths): string {
  if (s.status === 'baseline') {
    if (img?.current) {
      return `<div class="vg-visual-row">
        <div class="vg-visual-col"><h4>当前截图</h4><img src="${img.current}" alt="当前截图" class="vg-screenshot"/></div>
      </div>`;
    }
    return '<div class="vg-empty">📌 基线模式，无对比数据</div>';
  }

  const pixel = s.diffs.pixel;
  if (!pixel) return '<div class="vg-empty">无像素对比数据</div>';

  const ratio = pixel.diffRatio !== undefined ? (pixel.diffRatio * 100).toFixed(2) : '—';
  const hasDiff = (pixel.diffRatio ?? 0) > 0;

  return `
  <div class="vg-pixel-summary">
    <span class="${hasDiff ? 'vg-text-warn' : 'vg-text-ok'}">差异比例: ${ratio}% (${pixel.diffPixels} / ${pixel.totalPixels} px)</span>
  </div>
  <div class="vg-visual-row">
    ${img?.baseline ? `<div class="vg-visual-col"><h4>基线</h4><img src="${img.baseline}" alt="基线" class="vg-screenshot"/></div>` : ''}
    ${img?.diff ? `<div class="vg-visual-col"><h4>差异热力图</h4><img src="${img.diff}" alt="差异热力图" class="vg-screenshot vg-diff-img"/></div>` : ''}
    ${img?.current ? `<div class="vg-visual-col"><h4>当前</h4><img src="${img.current}" alt="当前" class="vg-screenshot"/></div>` : ''}
  </div>
  ${img?.baseline && img?.current ? _blinkComparator(img.baseline, img.current) : ''}
  ${_pixelRegions(pixel)}`;
}

function _pixelRegions(pixel: ScenarioResult['diffs']['pixel'] & {}): string {
  if (!pixel?.regions || pixel.regions.length === 0) return '';
  const rows = pixel.regions
    .slice(0, 10)
    .map(
      r =>
        `<tr><td>(${r.x}, ${r.y})</td><td>${r.width}×${r.height}</td><td>${(r.diffRatio * 100).toFixed(1)}%</td></tr>`
    )
    .join('');
  return `<details class="vg-details"><summary>差异热区 (Top ${Math.min(pixel.regions.length, 10)})</summary>
    <div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>位置</th><th>尺寸</th><th>差异比</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}

// ========== TAB: DOM 变化 ==========

function _buildDomTab(s: ScenarioResult): string {
  if (s.status === 'baseline') return '<div class="vg-empty">📌 基线模式，无对比数据</div>';

  const dom = s.diffs.dom;
  if (!dom || (dom.added.length === 0 && dom.removed.length === 0 && dom.changed.length === 0)) {
    return '<div class="vg-empty">✅ DOM 结构无变化</div>';
  }

  const changedRows = dom.changed
    .slice(0, 50)
    .map(
      c => `
    <div class="vg-diff-item">
      <div class="vg-diff-path">${_esc(c.path)}</div>
      <span class="vg-diff-old">${_trunc(String(c.oldValue ?? ''))}</span>
      <span class="vg-diff-arrow">→</span>
      <span class="vg-diff-new">${_trunc(String(c.newValue ?? ''))}</span>
    </div>`
    )
    .join('');

  return `
  <div class="vg-dom-stats">
    <span class="vg-stat-add">+${dom.added.length} 新增</span>
    <span class="vg-stat-rem">-${dom.removed.length} 删除</span>
    <span class="vg-stat-chg">~${dom.changed.length} 修改</span>
    <span class="vg-stat-ratio">变化率 ${(dom.changeRatio * 100).toFixed(1)}%</span>
  </div>
  ${changedRows ? `<div class="vg-diff-list">${changedRows}</div>` : ''}
  ${dom.changed.length > 50 ? `<div class="vg-more-hint">... 还有 ${dom.changed.length - 50} 处修改未展示</div>` : ''}`;
}

// ========== TAB: 布局变化 ==========

function _buildLayoutTab(s: ScenarioResult): string {
  if (s.status === 'baseline') return '<div class="vg-empty">📌 基线模式，无对比数据</div>';

  const layout = s.diffs.layout;
  if (!layout || layout.changeCount === 0) {
    return '<div class="vg-empty">✅ 布局无变化</div>';
  }

  const movedRows = layout.moved
    .slice(0, 20)
    .map(
      m =>
        `<tr><td><code>${_esc(m.selector)}</code></td><td>${Math.round(m.distance)}px</td><td>${_shiftDir(m)}</td></tr>`
    )
    .join('');

  const resizedRows = layout.resized
    .slice(0, 20)
    .map(
      m =>
        `<tr><td><code>${_esc(m.selector)}</code></td><td>${m.oldBounds.width}×${m.oldBounds.height}</td><td>${m.newBounds.width}×${m.newBounds.height}</td></tr>`
    )
    .join('');

  return `
  ${
    layout.moved.length > 0
      ? `<h4>位移元素 (${layout.moved.length})</h4>
    <div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>元素</th><th>偏移</th><th>方向</th></tr></thead><tbody>${movedRows}</tbody></table></div>
    ${layout.moved.length > 20 ? `<div class="vg-more-hint">... 还有 ${layout.moved.length - 20} 处未展示</div>` : ''}`
      : ''
  }
  ${
    layout.resized.length > 0
      ? `<h4>尺寸变化 (${layout.resized.length})</h4>
    <div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>元素</th><th>旧尺寸</th><th>新尺寸</th></tr></thead><tbody>${resizedRows}</tbody></table></div>
    ${layout.resized.length > 20 ? `<div class="vg-more-hint">... 还有 ${layout.resized.length - 20} 处未展示</div>` : ''}`
      : ''
  }`;
}

function _shiftDir(m: {
  oldBounds: {x: number; y: number};
  newBounds: {x: number; y: number};
}): string {
  const dx = m.newBounds.x - m.oldBounds.x;
  const dy = m.newBounds.y - m.oldBounds.y;
  const parts: string[] = [];
  if (Math.abs(dx) > 0.5) parts.push(dx > 0 ? `→ ${Math.round(dx)}px` : `← ${Math.round(-dx)}px`);
  if (Math.abs(dy) > 0.5) parts.push(dy > 0 ? `↓ ${Math.round(dy)}px` : `↑ ${Math.round(-dy)}px`);
  return parts.join(' ') || '—';
}

// ========== TAB: 网络变化 ==========

function _buildNetworkTab(s: ScenarioResult): string {
  if (s.status === 'baseline') return '<div class="vg-empty">📌 基线模式，无对比数据</div>';

  const net = s.diffs.network;
  if (
    !net ||
    (net.added.length === 0 &&
      net.removed.length === 0 &&
      net.timingChanges.length === 0 &&
      net.sizeChanges.length === 0)
  ) {
    return '<div class="vg-empty">✅ 网络请求无变化</div>';
  }

  const addedRows = net.added
    .slice(0, 15)
    .map(
      r =>
        `<tr><td class="vg-net-url" title="${_esc(r.url)}">${_esc(_shortUrl(r.url))}</td><td>${r.status || '—'}</td></tr>`
    )
    .join('');

  const removedRows = net.removed
    .slice(0, 15)
    .map(
      r => `<tr><td class="vg-net-url" title="${_esc(r.url)}">${_esc(_shortUrl(r.url))}</td></tr>`
    )
    .join('');

  const timingRows = net.timingChanges
    .map(
      t =>
        `<tr><td class="vg-net-url" title="${_esc(t.url)}">${_esc(_shortUrl(t.url))}</td><td>${t.oldDuration}ms</td><td>${t.newDuration}ms</td><td class="${t.changeRatio > 0 ? 'vg-text-warn' : 'vg-text-ok'}">${t.changeRatio > 0 ? '+' : ''}${(t.changeRatio * 100).toFixed(0)}%</td></tr>`
    )
    .join('');

  const sizeRows = net.sizeChanges
    .map(
      c =>
        `<tr><td class="vg-net-url" title="${_esc(c.url)}">${_esc(_shortUrl(c.url))}</td><td>${_fmtBytes(c.oldSize)}</td><td>${_fmtBytes(c.newSize)}</td><td class="${c.changeBytes > 0 ? 'vg-text-warn' : 'vg-text-ok'}">${c.changeBytes > 0 ? '+' : ''}${_fmtBytes(c.changeBytes)}</td></tr>`
    )
    .join('');

  return `
  ${net.added.length > 0 ? `<details class="vg-details" open><summary>新增请求 (${net.added.length})</summary><div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>URL</th><th>状态</th></tr></thead><tbody>${addedRows}</tbody></table></div></details>` : ''}
  ${net.removed.length > 0 ? `<details class="vg-details"><summary>移除请求 (${net.removed.length})</summary><div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>URL</th></tr></thead><tbody>${removedRows}</tbody></table></div></details>` : ''}
  ${net.timingChanges.length > 0 ? `<details class="vg-details" open><summary>耗时变化 >20% (${net.timingChanges.length})</summary><div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>URL</th><th>旧耗时</th><th>新耗时</th><th>变化</th></tr></thead><tbody>${timingRows}</tbody></table></div></details>` : ''}
  ${net.sizeChanges.length > 0 ? `<details class="vg-details" open><summary>体积变化 >1KB (${net.sizeChanges.length})</summary><div class="vg-table-wrap"><table class="vg-table"><thead><tr><th>URL</th><th>旧体积</th><th>新体积</th><th>变化</th></tr></thead><tbody>${sizeRows}</tbody></table></div></details>` : ''}`;
}

function _shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.length > 60
      ? `${u.hostname}${u.pathname.slice(0, 57)}...`
      : `${u.hostname}${u.pathname}`;
  } catch {
    return url;
  }
}

// ========== TAB: 性能 ==========

function _buildPerfTab(s: ScenarioResult): string {
  if (s.status === 'baseline') {
    const perf = s.diffs.performance;
    if (!perf?.improvements || perf.improvements.length === 0)
      return '<div class="vg-empty">📌 基线模式</div>';
    return `<div class="vg-perf-grid">
      ${perf.improvements.map(m => `\n      <div class="vg-perf-card"><div class="vg-perf-metric">${m.metric}</div><div class="vg-perf-value">${_fmtMs(m.current)}</div><div class="vg-perf-label">基线值</div></div>`).join('')}
    </div>`;
  }

  const perf = s.diffs.performance;
  if (!perf) return '<div class="vg-empty">无性能数据</div>';

  const cards: string[] = [];
  const allMetrics = [...(perf.regressions ?? []), ...(perf.improvements ?? [])];
  if (allMetrics.length === 0) return '<div class="vg-empty">✅ 性能指标无显著变化</div>';

  for (const m of allMetrics) {
    const isReg = (perf.regressions ?? []).includes(m);
    cards.push(`
      <div class="vg-perf-card ${isReg ? 'vg-perf-degrade' : 'vg-perf-improve'}">
        <div class="vg-perf-metric">${m.metric}</div>
        <div class="vg-perf-value">${_fmtMs(m.current)}</div>
        <div class="vg-perf-delta">${isReg ? '↑' : '↓'} ${Math.abs(m.changeRatio * 100).toFixed(0)}%</div>
        <div class="vg-perf-label">基线: ${_fmtMs(m.baseline)}</div>
        ${(m as {budgetExceeded?: boolean}).budgetExceeded ? '<div class="vg-perf-budget">⚠ 超出预算</div>' : ''}
      </div>`);
  }

  return `<div class="vg-perf-grid">${cards.join('')}</div>`;
}

// ========== TAB: 错误 & 控制台 ==========

function _buildErrorsTab(s: ScenarioResult): string {
  const errors = s.errors ?? [];
  const hasErrors = errors.length > 0;

  if (!hasErrors) return '<div class="vg-empty">✅ 无运行时错误</div>';

  const errRows = errors
    .map(
      e =>
        `<div class="vg-error-item">
      <div class="vg-error-msg">❌ ${_esc(e.message)}</div>
      ${e.stack ? `<pre class="vg-error-stack">${_esc(e.stack)}</pre>` : ''}
    </div>`
    )
    .join('');

  return `<div class="vg-error-list">${errRows}</div>`;
}

// ========== Blink Comparator ==========

function _blinkComparator(baselinePath: string, currentPath: string): string {
  const uid = `blink-${Math.random().toString(36).slice(2, 8)}`;

  return `
  <details class="vg-details"><summary>🔁 动画帧切换（基线 ↔ 当前）</summary>
  <div class="blink-comparator" id="${uid}">
    <img class="frame-a" src="${baselinePath}" alt="基线截图" />
    <img class="frame-b animating" src="${currentPath}" alt="当前截图" />
    <span class="blink-label blink-label-a">基线</span>
    <span class="blink-label blink-label-b">当前</span>
  </div>
  <div class="blink-controls">
    <button class="blink-btn" onclick="(function(c){var b=c.querySelector('.frame-b');b.classList.toggle('animating');c.classList.toggle('paused');this.textContent=b.classList.contains('animating')?'⏸ 暂停':'▶ 播放'})(document.getElementById('${uid}'))">⏸ 暂停</button>
    <div class="blink-speed">
      <label>速度:</label>
      <select onchange="(function(c,s){c.style.setProperty('--blink-dur',s.value+'s')})(document.getElementById('${uid}'),this)">
        <option value="20">0.5×</option>
        <option value="10" selected>1×</option>
        <option value="5">2×</option>
        <option value="2.5">4×</option>
      </select>
    </div>
  </div></details>`;
}

// ========== CSS ==========

function _css(): string {
  return `
:root {
  --sidebar-w: 260px;
  --c-bg: #f8f9fa;
  --c-surface: #fff;
  --c-border: #e5e7eb;
  --c-text: #1f2937;
  --c-muted: #9ca3af;
  --c-accent: #6366f1;
  --c-pass: #22c55e;
  --c-warn: #f59e0b;
  --c-fail: #ef4444;
  --c-err: #dc2626;
  --c-crit: #dc2626;
  --c-high: #f59e0b;
  --c-med: #3b82f6;
  --c-low: #9ca3af;
  --radius: 10px;
}
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:var(--c-bg); color:var(--c-text); line-height:1.5; }

/* Layout */
.vg-layout { display:flex; min-height:100vh; }
.vg-sidebar { width:var(--sidebar-w); background:var(--c-surface); border-right:1px solid var(--c-border); position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:10; padding-bottom:24px; }
.vg-sidebar-header { padding:20px; border-bottom:1px solid var(--c-border); }
.vg-sidebar-header h2 { font-size:16px; color:var(--c-text); }
.vg-sidebar-meta { font-size:12px; color:var(--c-muted); margin-top:4px; }
.vg-main { margin-left:var(--sidebar-w); flex:1; min-width:0; padding:24px 28px; width:calc(100vw - var(--sidebar-w)); transition:margin-left .25s ease, width .25s ease; }

/* Sidebar nav */
.vg-nav-list { list-style:none; padding:8px 0; }
.vg-nav-list li { margin:0; }
.vg-nav-scene { display:flex; align-items:center; gap:8px; padding:8px 20px; text-decoration:none; color:var(--c-text); font-size:13px; transition:background .15s; }
.vg-nav-scene:hover,.vg-nav-scene.active { background:#f3f4f6; }
.vg-nav-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.vg-nav-vp { font-size:11px; color:var(--c-muted); }
.vg-nav-count { font-size:11px; background:var(--c-warn); color:#fff; border-radius:10px; padding:0 6px; min-width:20px; text-align:center; }
.vg-nav-tabs { list-style:none; padding-left:44px; }
.vg-nav-tabs li { margin:1px 0; }
.vg-nav-tabs a { font-size:11px; color:var(--c-muted); text-decoration:none; padding:2px 0; display:block; }
.vg-nav-tabs a:hover,.vg-nav-tabs a.active { color:var(--c-accent); }

/* Header */
.vg-header { background:var(--c-surface); border-radius:var(--radius); padding:24px 32px; margin-bottom:20px; box-shadow:0 1px 2px rgba(0,0,0,.05); }
.vg-header h1 { font-size:22px; margin-bottom:12px; }
.vg-meta { display:flex; gap:20px; flex-wrap:wrap; font-size:13px; color:var(--c-muted); }
.vg-meta strong { color:var(--c-text); }

/* Summary */
.vg-summary { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; margin-bottom:16px; }
.vg-summary-card { background:var(--c-surface); border-radius:var(--radius); padding:18px; text-align:center; box-shadow:0 1px 2px rgba(0,0,0,.05); }
.vg-summary-card .num { font-size:32px; font-weight:700; }
.vg-summary-card .label { font-size:12px; color:var(--c-muted); margin-top:2px; }
.num.passed{color:var(--c-pass)} .num.changed{color:var(--c-warn)} .num.failed{color:var(--c-fail)} .num.errored{color:var(--c-err)} .num.total{color:var(--c-accent)}

.vg-diff-overview { display:flex; gap:16px; margin-bottom:24px; font-size:13px; color:var(--c-muted); }
.vg-diff-overview span { background:var(--c-surface); padding:4px 12px; border-radius:6px; border:1px solid var(--c-border); }

/* Scene */
.vg-scene { background:var(--c-surface); border-radius:var(--radius); margin-bottom:24px; box-shadow:0 1px 2px rgba(0,0,0,.05); overflow:hidden; }
.vg-scene-header { padding:20px 24px; border-bottom:1px solid var(--c-border); display:flex; align-items:center; gap:16px; }
.vg-scene-title h3 { font-size:17px; }
.vg-scene-meta { display:flex; gap:16px; font-size:12px; color:var(--c-muted); margin-top:4px; }
.vg-scene-url a { color:var(--c-accent); text-decoration:none; }
.vg-scene-url a:hover { text-decoration:underline; }

/* Status badge */
.status-badge { display:inline-block; padding:2px 10px; border-radius:12px; font-size:11px; font-weight:600; white-space:nowrap; }
.status-badge.passed { background:#dcfce7; color:#16a34a; }
.status-badge.changed { background:#fef3c7; color:#d97706; }
.status-badge.baseline { background:#dbeafe; color:#2563eb; }
.status-badge.failed { background:#fee2e2; color:#dc2626; }
.status-badge.errored { background:#fce7f3; color:#db2777; }

/* Tab bar */
.vg-tab-bar { display:flex; border-bottom:2px solid var(--c-border); padding:0 24px; background:#fafafa; overflow-x:auto; }
.vg-tab { padding:10px 16px; font-size:13px; text-decoration:none; color:var(--c-muted); border-bottom:2px solid transparent; margin-bottom:-2px; white-space:nowrap; }
.vg-tab:hover { color:var(--c-text); }
.vg-tab.active { color:var(--c-accent); border-bottom-color:var(--c-accent); font-weight:600; }

/* Tab panels */
.vg-tab-panels { padding:24px; }
.vg-tab-panel { display:none; }
.vg-tab-panel.active { display:block; }

/* AI tab */
.vg-ai-list { display:flex; flex-direction:column; gap:8px; }
.vg-ai-card { display:flex; gap:12px; padding:12px 16px; border-radius:8px; border:1px solid var(--c-border); }
.vg-ai-card.vg-ai-critical { border-left:3px solid var(--c-crit); }
.vg-ai-card.vg-ai-high { border-left:3px solid var(--c-high); }
.vg-ai-card.vg-ai-medium { border-left:3px solid var(--c-med); }
.vg-ai-card.vg-ai-low { border-left:3px solid var(--c-low); }
.vg-ai-icon { font-size:18px; flex-shrink:0; }
.vg-ai-body { display:flex; flex-direction:column; gap:2px; }
.vg-ai-type { font-size:11px; color:var(--c-muted); text-transform:uppercase; letter-spacing:.5px; }
.vg-ai-desc { font-size:14px; }
.vg-ai-element { font-size:12px; color:var(--c-muted); font-family:monospace; }

/* Visual tab */
.vg-pixel-summary { margin-bottom:16px; font-size:14px; font-weight:600; }
.vg-text-warn { color:var(--c-warn); }
.vg-text-ok { color:var(--c-pass); }
.vg-visual-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(250px,1fr)); gap:16px; margin-bottom:16px; }
.vg-visual-col h4 { font-size:13px; color:var(--c-muted); margin-bottom:8px; text-transform:uppercase; }
.vg-screenshot { width:100%; border:1px solid var(--c-border); border-radius:6px; }
.vg-diff-img { border-color:var(--c-fail); border-width:2px; }

/* DOM tab */
.vg-dom-stats { display:flex; gap:16px; margin-bottom:16px; font-size:14px; }
.vg-stat-add { color:#22c55e; font-weight:600; }
.vg-stat-rem { color:#ef4444; font-weight:600; }
.vg-stat-chg { color:#f59e0b; font-weight:600; }
.vg-stat-ratio { color:var(--c-muted); }
.vg-diff-list { max-height:400px; overflow-y:auto; border:1px solid var(--c-border); border-radius:8px; padding:8px 16px; }
.vg-diff-item { padding:6px 0; border-bottom:1px solid #f5f5f5; font-size:13px; }
.vg-diff-item:last-child { border-bottom:none; }
.vg-diff-path { font-family:monospace; font-size:11px; color:var(--c-accent); margin-bottom:2px; word-break:break-all; }
.vg-diff-old { color:var(--c-fail); text-decoration:line-through; }
.vg-diff-arrow { color:var(--c-muted); margin:0 4px; }
.vg-diff-new { color:var(--c-pass); }
.vg-more-hint { color:var(--c-muted); font-size:12px; margin-top:8px; }

/* Table — always scrollable with wrapper */
.vg-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; border:1px solid var(--c-border); border-radius:8px; margin-bottom:8px; }
.vg-table-wrap .vg-table { margin-bottom:0; }
.vg-table { width:100%; border-collapse:collapse; font-size:12px; min-width:500px; }
.vg-table th { text-align:left; padding:10px 14px; background:#f9fafb; color:var(--c-muted); font-weight:600; font-size:10px; text-transform:uppercase; letter-spacing:.3px; position:sticky; top:0; }
.vg-table td { padding:9px 14px; border-top:1px solid var(--c-border); vertical-align:top; }
.vg-table tr:hover td { background:#fafbfc; }
.vg-table code { font-size:11px; color:var(--c-accent); word-break:break-all; background:#f3f4f6; padding:1px 4px; border-radius:3px; }

/* Network tab */
.vg-net-url { max-width:400px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; font-family:monospace; }

/* Perf tab */
.vg-perf-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(160px,1fr)); gap:12px; }
.vg-perf-card { background:#f9fafb; border-radius:8px; padding:16px; text-align:center; border:1px solid var(--c-border); }
.vg-perf-card.vg-perf-degrade { border-color:var(--c-warn); background:#fffbeb; }
.vg-perf-card.vg-perf-improve { border-color:var(--c-pass); background:#f0fdf4; }
.vg-perf-metric { font-size:11px; color:var(--c-muted); text-transform:uppercase; }
.vg-perf-value { font-size:24px; font-weight:700; margin:4px 0; }
.vg-perf-delta { font-size:13px; font-weight:600; }
.vg-perf-degrade .vg-perf-delta { color:var(--c-warn); }
.vg-perf-improve .vg-perf-delta { color:var(--c-pass); }
.vg-perf-label { font-size:11px; color:var(--c-muted); }
.vg-perf-budget { font-size:11px; color:var(--c-fail); margin-top:2px; }

/* Error tab */
.vg-error-list { display:flex; flex-direction:column; gap:12px; }
.vg-error-item { background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 16px; }
.vg-error-msg { font-size:14px; font-weight:600; color:var(--c-err); }
.vg-error-stack { font-size:11px; color:var(--c-muted); margin-top:8px; white-space:pre-wrap; word-break:break-all; max-height:200px; overflow-y:auto; }

/* Common */
.vg-empty { color:var(--c-muted); font-size:14px; padding:24px 0; }
.vg-details { margin:12px 0; }
.vg-details summary { cursor:pointer; font-size:14px; font-weight:600; padding:4px 0; }
.vg-details summary:hover { color:var(--c-accent); }
.vg-details[open] > *:not(summary) { animation:slideDown .2s ease; }
@keyframes slideDown { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }

/* Blink Comparator */
.blink-comparator { position:relative; width:100%; overflow:hidden; border:1px solid var(--c-border); border-radius:6px; background:#000; margin-top:8px; }
.blink-comparator img { display:block; width:100%; height:auto; }
.blink-comparator .frame-a { position:relative; z-index:1; }
.blink-comparator .frame-b { position:absolute; top:0; left:0; z-index:2; }
@keyframes blink-swap { 0%,42%{opacity:0} 50%,92%{opacity:1} 100%{opacity:0} }
.blink-comparator .frame-b.animating { animation:blink-swap var(--blink-dur,10s) ease-in-out infinite; }
.blink-comparator.paused .frame-b.animating { animation-play-state:paused; }
.blink-label { position:absolute; top:8px; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:600; color:#fff; background:rgba(0,0,0,.55); z-index:3; }
.blink-label-a { left:8px; } .blink-label-b { right:8px; }
.blink-controls { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:12px; }
.blink-btn { padding:4px 10px; border:1px solid #d0d0d0; border-radius:4px; background:#fff; cursor:pointer; font-size:12px; }
.blink-btn:hover { background:#f5f5f5; }
.blink-speed { display:flex; align-items:center; gap:4px; margin-left:auto; }
.blink-speed select { font-size:12px; padding:2px 4px; border:1px solid #d0d0d0; border-radius:4px; }

/* Footer */
.vg-footer { text-align:center; color:var(--c-muted); font-size:11px; margin-top:32px; padding:20px; border-top:1px solid var(--c-border); }

/* Sidebar toggle button (mobile) */
.vg-sidebar-toggle { display:none; position:fixed; top:12px; left:12px; z-index:20; background:var(--c-surface); border:1px solid var(--c-border); border-radius:8px; padding:8px 12px; cursor:pointer; font-size:18px; box-shadow:0 2px 8px rgba(0,0,0,.1); }

/* ====== 响应式 ====== */

/* 宽屏 >1400: 侧边栏 220px，内容区自适应拉满 */
@media (min-width:1401px) {
  :root { --sidebar-w: 220px; }
}

/* 中等屏幕 (900-1200): 侧边栏更窄 */
@media (max-width:1200px) {
  :root { --sidebar-w: 200px; }
  .vg-main { padding:20px; }
  .vg-visual-row { grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); }
  .vg-perf-grid { grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); }
  .vg-scene-header { flex-wrap:wrap; gap:8px; }
  .vg-net-url { max-width:250px; }
}

/* 平板/小屏 (< 900): 侧边栏 → 可滑出，内容区全宽 */
@media (max-width:900px) {
  .vg-sidebar { transform:translateX(-100%); transition:transform .25s ease; width:260px; box-shadow:4px 0 20px rgba(0,0,0,.15); }
  .vg-sidebar.open { transform:translateX(0); }
  .vg-sidebar-toggle { display:block; }
  .vg-main { margin-left:0; width:100vw; padding:16px; }
  .vg-header { padding:16px 20px; }
  .vg-header h1 { font-size:18px; }
  .vg-meta { gap:12px; font-size:12px; }
  .vg-summary { grid-template-columns:repeat(auto-fit,minmax(80px,1fr)); gap:8px; }
  .vg-summary-card { padding:12px; }
  .vg-summary-card .num { font-size:24px; }
  .vg-diff-overview { flex-wrap:wrap; gap:8px; }
  .vg-tab-bar { padding:0 12px; gap:0; }
  .vg-tab { padding:8px 10px; font-size:11px; }
  .vg-tab-panels { padding:16px; }
  .vg-visual-row { grid-template-columns:1fr; }
  .vg-dom-stats { flex-wrap:wrap; gap:8px; }
  .vg-table { font-size:11px; min-width:400px; }
  .vg-table th,.vg-table td { padding:6px 8px; }
  .vg-net-url { max-width:180px; }
  .vg-scene-header { flex-direction:column; align-items:flex-start; }
  .vg-scene-meta { flex-wrap:wrap; gap:8px; }
  .vg-nav-tabs { padding-left:32px; }
}

/* 手机 (< 540px) */
@media (max-width:540px) {
  .vg-main { padding:10px; }
  .vg-header { padding:12px 14px; }
  .vg-header h1 { font-size:16px; }
  .vg-summary { grid-template-columns:repeat(3,1fr); }
  .vg-summary-card .num { font-size:20px; }
  .vg-summary-card .label { font-size:10px; }
  .vg-tab-bar { flex-wrap:nowrap; overflow-x:auto; -webkit-overflow-scrolling:touch; gap:0; }
  .vg-tab { flex-shrink:0; padding:8px; font-size:11px; }
  .vg-perf-grid { grid-template-columns:repeat(2,1fr); }
  .vg-scene-title h3 { font-size:15px; }
  .vg-ai-desc { font-size:12px; }
  .blink-comparator { max-height:60vh; }
  .vg-table { min-width:300px; font-size:10px; }
}

/* 打印样式 */
@media print {
  .vg-sidebar, .vg-sidebar-toggle, .vg-tab-bar, .vg-nav-tabs { display:none !important; }
  .vg-main { margin-left:0 !important; width:100% !important; padding:0; }
  .vg-tab-panel { display:block !important; page-break-inside:avoid; }
  .vg-scene { break-inside:avoid; box-shadow:none; border:1px solid #ddd; margin-bottom:16px; }
  .vg-screenshot { max-width:100%; page-break-inside:avoid; }
  .vg-footer { display:none; }
  .vg-table-wrap { overflow-x:visible; border:none; }
  .vg-table { min-width:0; }
}`;
}

// ========== JS ==========

function _js(): string {
  return `
(function(){
  // Tab switching
  document.querySelectorAll('.vg-tab').forEach(function(tab){
    tab.addEventListener('click',function(e){
      e.preventDefault();
      var scene = this.closest('.vg-scene');
      // Update tabs
      scene.querySelectorAll('.vg-tab').forEach(function(t){ t.classList.remove('active'); });
      this.classList.add('active');
      // Update panels
      var targetId = this.getAttribute('href').replace('#','');
      scene.querySelectorAll('.vg-tab-panel').forEach(function(p){ p.classList.remove('active'); });
      var target = document.getElementById(targetId);
      if (target) target.classList.add('active');
      // Update sidebar active tab
      document.querySelectorAll('.vg-nav-tabs a').forEach(function(a){ a.classList.remove('active'); });
      var navLinks = document.querySelectorAll('.vg-nav-tabs a[href="#'+targetId+'"]');
      navLinks.forEach(function(a){ a.classList.add('active'); });
    });
  });

  // Sidebar scene click — scroll to scene
  document.querySelectorAll('.vg-nav-scene').forEach(function(link){
    link.addEventListener('click',function(e){
      e.preventDefault();
      var target = document.querySelector(this.getAttribute('href'));
      if (target) target.scrollIntoView({behavior:'smooth',block:'start'});
      // Highlight in sidebar
      document.querySelectorAll('.vg-nav-scene').forEach(function(l){ l.classList.remove('active'); });
      this.classList.add('active');
    });
  });

  // Sidebar tab click — scroll to scene + switch tab
  document.querySelectorAll('.vg-nav-tabs a').forEach(function(link){
    link.addEventListener('click',function(e){
      e.preventDefault();
      var targetId = this.getAttribute('href').replace('#','');
      var panel = document.getElementById(targetId);
      if (!panel) return;
      var scene = panel.closest('.vg-scene');
      scene.scrollIntoView({behavior:'smooth',block:'start'});
      // Activate the corresponding tab
      var tab = scene.querySelector('.vg-tab[href="#'+targetId+'"]');
      if (tab) tab.click();
      // Highlight sidebar parent scene
      document.querySelectorAll('.vg-nav-scene').forEach(function(l){ l.classList.remove('active'); });
      var sceneLink = document.querySelector('.vg-nav-scene[data-scene="'+scene.id+'"]');
      if (sceneLink) sceneLink.classList.add('active');
    });
  });

  // Blink buttons
  document.querySelectorAll('.blink-btn').forEach(function(btn){
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var comp = this.parentElement.previousElementSibling;
      if (!comp || !comp.classList.contains('blink-comparator')) return;
      var frameB = comp.querySelector('.frame-b');
      frameB.classList.toggle('animating');
      comp.classList.toggle('paused');
      this.textContent = frameB.classList.contains('animating') ? '⏸ 暂停' : '▶ 播放';
    });
  });
  document.querySelectorAll('.blink-speed select').forEach(function(sel){
    sel.addEventListener('change',function(){
      var comp = this.parentElement.parentElement.previousElementSibling;
      if (!comp || !comp.classList.contains('blink-comparator')) return;
      comp.style.setProperty('--blink-dur', this.value + 's');
    });
  });

  // Mobile: close sidebar on nav click, update toggle button
  var sidebar = document.getElementById('vg-sidebar');
  var toggle = document.getElementById('vg-sidebar-toggle');
  function closeSidebar() {
    sidebar.classList.remove('open');
    if (toggle) toggle.textContent = '☰';
  }
  sidebar.querySelectorAll('a').forEach(function(link){
    link.addEventListener('click',function(){
      if (window.innerWidth <= 900) {
        setTimeout(closeSidebar, 150);
      }
    });
  });
  // Close sidebar on outside click
  document.addEventListener('click',function(e){
    if (window.innerWidth <= 900 && sidebar.classList.contains('open')) {
      var target = e.target;
      if (!sidebar.contains(target) && target !== toggle) {
        closeSidebar();
      }
    }
  });
})();
`;
}

// ========== 工具函数 ==========

function _esc(str: string): string {
  return str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function _trunc(str: string, max = 80): string {
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

function _fmtMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function _fmtBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
