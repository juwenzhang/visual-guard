import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest, ScenarioResult} from '@visual-guard/shared';

/**
 * JSON 报告器 — 输出两份文件
 *
 * - `summary.json`：精简摘要，含 semantic + summary + run 元信息 + trends 趋势字段
 * - `manifest.json`：完整 DiffManifest，供 CI 解析
 */
export async function generateJsonReport(
  manifest: DiffManifest,
  outputDir: string,
  runId: string
): Promise<string[]> {
  const reportDir = path.join(outputDir, runId);
  await fs.mkdir(reportDir, {recursive: true});

  // 完整 manifest（CI 消费）
  const manifestPath = path.join(reportDir, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // 精简摘要（含趋势字段）
  const summary: Record<string, unknown> = {
    version: manifest.version,
    run: manifest.run,
    summary: manifest.summary,
    trends: _buildTrends(manifest),
    scenarios: manifest.scenarios.map(s => ({
      id: s.id,
      name: s.name,
      url: s.url,
      status: s.status,
      durationMs: s.durationMs,
      semantic: s.semantic,
      errors: s.errors.length > 0 ? s.errors : undefined
    }))
  };
  const summaryPath = path.join(reportDir, 'summary.json');
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');

  return [manifestPath, summaryPath];
}

// ======== 趋势数据提取 ========

interface Trends {
  perf: Record<string, number>;
  pixel: Record<string, number>;
  dom: Record<string, number>;
  layout: Record<string, number>;
  network: Record<string, number | string>;
  resources: Record<string, number>;
  domPatterns: Record<string, number>;
  quality: Record<string, number>;
}

function _buildTrends(manifest: DiffManifest): Trends {
  // pixel/dom/layout 只在有对比时提取（非 baseline）
  const comparedScenarios = manifest.scenarios.filter(s => s.status !== 'baseline');
  // perf 包含 baseline 场景（首次运行时所有指标作为 baseline 值记录）

  return {
    perf: _buildPerfTrends(manifest.scenarios),
    pixel: _buildPixelTrends(comparedScenarios),
    dom: _buildDomTrends(comparedScenarios),
    layout: _buildLayoutTrends(comparedScenarios),
    network: _buildNetworkTrends(comparedScenarios),
    resources: _buildResourceTrends(comparedScenarios),
    domPatterns: _buildDomPatternTrends(comparedScenarios),
    quality: _buildQualityTrends(manifest)
  };
}

// ---- perf ----

function _buildPerfTrends(scenarios: ScenarioResult[]): Trends['perf'] {
  const metrics = ['lcp', 'fcp', 'cls', 'ttfb', 'dcl', 'load'] as const;
  const aliasMap: Record<string, string> = {
    domcontentloaded: 'dcl',
    largestcontentfulpaint: 'lcp',
    firstcontentfulpaint: 'fcp',
    cumulativelayoutshift: 'cls',
    timetofirstbyte: 'ttfb'
  };
  const values: Record<string, number[]> = {};
  let regCount = 0;
  let impCount = 0;
  let budgetCount = 0;
  const worstRatios: number[] = [];

  for (const s of scenarios) {
    const perf = s.diffs.performance;
    if (!perf) continue;
    regCount += perf.regressions?.length ?? 0;
    impCount += perf.improvements?.length ?? 0;

    for (const r of perf.regressions ?? []) {
      if (r.budgetExceeded) budgetCount++;
      worstRatios.push(r.changeRatio);
      const raw = r.metric.toLowerCase();
      const key = aliasMap[raw] ?? raw;
      if (!values[key]) values[key] = [];
      values[key].push(r.current);
    }
    for (const im of perf.improvements ?? []) {
      const raw = im.metric.toLowerCase();
      const key = aliasMap[raw] ?? raw;
      if (!values[key]) values[key] = [];
      values[key].push(im.current);
    }
  }

  const result: Record<string, number> = {
    regressionCount: regCount,
    improvementCount: impCount,
    budgetExceeded: budgetCount,
    worstRatio: _max(worstRatios) ?? 0
  };

  for (const m of metrics) {
    const vals = values[m];
    result[m] = vals && vals.length > 0 ? _avg(vals) : 0;
  }

  return result;
}

// ---- pixel ----

function _buildPixelTrends(scenarios: ScenarioResult[]): Trends['pixel'] {
  const ratios: number[] = [];
  let regionCount = 0;
  let scenesWithDiff = 0;

  for (const s of scenarios) {
    const p = s.diffs.pixel;
    if (!p) continue;
    ratios.push(p.diffRatio);
    regionCount += p.regions?.length ?? 0;
    if (p.diffRatio > 0) scenesWithDiff++;
  }

  return {
    avgDiffRatio: ratios.length > 0 ? _avg(ratios) : 0,
    maxDiffRatio: _max(ratios) ?? 0,
    scenesWithDiff,
    totalRegions: regionCount
  };
}

// ---- dom ----

function _buildDomTrends(scenarios: ScenarioResult[]): Trends['dom'] {
  let totalAdded = 0;
  let totalRemoved = 0;
  let totalChanged = 0;
  let totalNodes = 0;
  const changeRatios: number[] = [];

  for (const s of scenarios) {
    const d = s.diffs.dom;
    if (!d) continue;
    totalAdded += d.added.length;
    totalRemoved += d.removed.length;
    totalChanged += d.changed.length;
    totalNodes += d.unchanged + d.added.length + d.removed.length + d.changed.length;
    changeRatios.push(d.changeRatio);
  }

  return {
    totalAdded,
    totalRemoved,
    totalChanged,
    totalNodes,
    avgChangeRatio: changeRatios.length > 0 ? _avg(changeRatios) : 0
  };
}

// ---- layout ----

function _buildLayoutTrends(scenarios: ScenarioResult[]): Trends['layout'] {
  let totalMoved = 0;
  let totalResized = 0;
  const distances: number[] = [];
  let scenesWithShift = 0;

  for (const s of scenarios) {
    const l = s.diffs.layout;
    if (!l) continue;
    totalMoved += l.moved.length;
    totalResized += l.resized.length;
    for (const m of l.moved) distances.push(m.distance);
    if (l.changeCount > 0) scenesWithShift++;
  }

  return {
    totalMoved,
    totalResized,
    maxMovePx: _max(distances) ?? 0,
    avgMovePx: distances.length > 0 ? _avg(distances) : 0,
    scenesWithShift
  };
}

// ---- network ----

function _buildNetworkTrends(scenarios: ScenarioResult[]): Trends['network'] {
  let addedCount = 0;
  let removedCount = 0;
  let timingCount = 0;
  let totalSizeDelta = 0;
  const sizeChanges: number[] = [];

  for (const s of scenarios) {
    const n = s.diffs.network;
    if (!n) continue;
    addedCount += n.added.length;
    removedCount += n.removed.length;
    timingCount += n.timingChanges.length;
    for (const sc of n.sizeChanges) {
      totalSizeDelta += sc.changeBytes;
      sizeChanges.push(Math.abs(sc.changeBytes));
    }
  }

  return {
    addedRequests: addedCount,
    removedRequests: removedCount,
    timingRegressions: timingCount,
    totalSizeDelta: _fmtBytesHtml(totalSizeDelta),
    biggestSizeChange: _fmtBytesHtml(_max(sizeChanges) ?? 0)
  };
}

// ---- resources (URL classification) ----

function _buildResourceTrends(scenarios: ScenarioResult[]): Trends['resources'] {
  let svgCount = 0;
  let imageCount = 0;
  let fontCount = 0;
  let videoCount = 0;
  let jsonCount = 0;
  const cdnDomains = new Set<string>();
  const thirdPartyDomains = new Set<string>();

  for (const s of scenarios) {
    const allUrls = [
      ...(s.diffs.network?.added.map(a => a.url) ?? []),
      ...(s.diffs.network?.removed.map(r => r.url) ?? [])
    ];
    for (const rawUrl of allUrls) {
      const base = rawUrl.split('?')[0] ?? '';
      const segments = base.split('.');
      const ext = segments.length > 1 ? segments[segments.length - 1]?.toLowerCase() : undefined;
      if (ext === 'svg') svgCount++;
      else if (ext && /^(png|jpe?g|webp|gif|ico)$/.test(ext)) imageCount++;
      else if (ext && /^(woff2?|ttf|otf)$/.test(ext)) fontCount++;
      else if (ext && /^(mp4|webm)$/.test(ext)) videoCount++;
      else if (ext === 'json') jsonCount++;

      // domain classification
      try {
        const host = new URL(rawUrl).hostname;
        if (/cdn|static|assets/.test(host)) cdnDomains.add(host);
        else thirdPartyDomains.add(host);
      } catch {
        /* invalid URL, skip */
      }
    }
  }

  // 排除自身域名
  for (const s of scenarios) {
    try {
      thirdPartyDomains.delete(new URL(s.url).hostname);
    } catch {}
  }

  return {
    svgCount,
    imageCount,
    fontCount,
    videoCount,
    jsonEndpoints: jsonCount,
    cdnDomains: cdnDomains.size,
    thirdPartyDomains: thirdPartyDomains.size
  };
}

// ---- dom patterns ----

function _buildDomPatternTrends(scenarios: ScenarioResult[]): Trends['domPatterns'] {
  let dataAttr = 0;
  let ariaAttr = 0;
  let svgEl = 0;
  let styleChg = 0;

  for (const s of scenarios) {
    const d = s.diffs.dom;
    if (!d) continue;
    for (const c of d.changed) {
      const path = String(c.path ?? '');
      if (path.includes('data-')) dataAttr++;
      else if (path.includes('aria-')) ariaAttr++;
      else if (
        path.toLowerCase().includes('svg') ||
        path.toLowerCase().includes('viewbox') ||
        path.toLowerCase().includes('fill') ||
        path.toLowerCase().includes('stroke')
      )
        svgEl++;
      else if (path.includes('attributes.style') || path.includes('style')) styleChg++;
    }
  }

  return {
    dataAttrChanges: dataAttr,
    ariaAttrChanges: ariaAttr,
    svgElementChanges: svgEl,
    styleChanges: styleChg
  };
}

// ---- quality ----

function _buildQualityTrends(manifest: DiffManifest): Trends['quality'] {
  let totalErrors = 0;
  let totalWarnings = 0;
  const durations: number[] = [];

  for (const s of manifest.scenarios) {
    totalErrors += s.errors.length;
    totalWarnings += s.warnings?.length ?? 0;
    durations.push(s.durationMs);
  }

  const total = manifest.summary.total;
  return {
    totalErrors,
    totalWarnings,
    avgDurationMs: durations.length > 0 ? Math.round(_avg(durations)) : 0,
    passRate: total > 0 ? manifest.summary.passed / total : 0
  };
}

// ======== 工具函数 ========

function _avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function _max(arr: number[]): number | undefined {
  return arr.length > 0 ? Math.max(...arr) : undefined;
}

function _fmtBytesHtml(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
