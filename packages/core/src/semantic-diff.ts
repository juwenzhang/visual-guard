import type {
  DomDiffResult,
  LayoutDiffResult,
  NetworkDiffResult,
  PerformanceDiffResult,
  PixelDiffResult,
  ScenarioResult,
  SemanticChange,
  SemanticDiffReport,
  SemanticSeverity
} from '@visual-guard/shared';

/**
 * 将单场景的 raw diff 结果转化为语义化差异报告
 *
 * 输入：ScenarioResult（含 pixel/dom/layout/network/performance 五种 raw diff）
 * 输出：SemanticDiffReport（自然语言描述 + 结构化关键信息）
 */
export function generateSemanticReport(result: ScenarioResult): SemanticDiffReport {
  const changes: SemanticChange[] = [];

  if (result.diffs.pixel) {
    changes.push(..._semanticPixel(result.diffs.pixel));
  }
  if (result.diffs.dom) {
    changes.push(..._semanticDom(result.diffs.dom));
  }
  if (result.diffs.layout) {
    changes.push(..._semanticLayout(result.diffs.layout));
  }
  if (result.diffs.network) {
    changes.push(..._semanticNetwork(result.diffs.network));
  }
  if (result.diffs.performance) {
    changes.push(..._semanticPerformance(result.diffs.performance));
  }

  return {
    scenarioId: result.id,
    scenarioName: result.name,
    url: result.url,
    viewport: _extractViewport(result.id),
    totalChanges: changes.length,
    changes
  };
}

/** 从 scenario id（如 "home@desktop"）提取视口名 */
function _extractViewport(id: string): string {
  const idx = id.lastIndexOf('@');
  return idx >= 0 ? id.slice(idx + 1) : 'unknown';
}

// ======== Pixel Diff → 语义化 ========

function _semanticPixel(pixel: PixelDiffResult): SemanticChange[] {
  const ratio = pixel.diffRatio;
  if (ratio <= 0) return [];

  const pct = (ratio * 100).toFixed(2);
  const severity = _pixelSeverity(ratio);

  const change: SemanticChange = {
    type: 'visual',
    severity,
    description: `页面像素差异比例为 ${pct}%（${pixel.diffPixels} / ${pixel.totalPixels} 像素），${_pixelDescribe(ratio)}`,
    detail: {
      diffPixels: pixel.diffPixels,
      totalPixels: pixel.totalPixels,
      diffRatio: ratio,
      hasDiffImage: !!pixel.diffImage,
      topRegions: (pixel.regions ?? []).slice(0, 5).map(r => ({
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        ratio: Number((r.diffRatio * 100).toFixed(1))
      }))
    }
  };

  return [change];
}

function _pixelSeverity(ratio: number): SemanticSeverity {
  if (ratio > 0.05) return 'critical';
  if (ratio > 0.01) return 'high';
  if (ratio > 0.001) return 'medium';
  return 'low';
}

function _pixelDescribe(ratio: number): string {
  if (ratio > 0.1) return '大面积视觉变化，建议人工确认';
  if (ratio > 0.01) return '存在明显视觉差异';
  if (ratio > 0.001) return '存在小幅视觉差异';
  return '差异极小，可能为抗锯齿或字体渲染差异';
}

// ======== DOM Diff → 语义化 ========

function _semanticDom(dom: DomDiffResult): SemanticChange[] {
  const changes: SemanticChange[] = [];
  const hasChanges = dom.added.length > 0 || dom.removed.length > 0 || dom.changed.length > 0;
  if (!hasChanges) return changes;

  // 聚合：按变更类型生成语义描述
  if (dom.added.length > 0) {
    changes.push({
      type: 'dom',
      element: _plural('节点', dom.added.length),
      severity: dom.added.length > 5 ? 'high' : 'medium',
      description: `新增了 ${dom.added.length} 个 DOM 节点`,
      detail: {addedCount: dom.added.length}
    });
  }

  if (dom.removed.length > 0) {
    changes.push({
      type: 'dom',
      element: _plural('节点', dom.removed.length),
      severity: dom.removed.length > 5 ? 'high' : 'medium',
      description: `移除了 ${dom.removed.length} 个 DOM 节点`,
      detail: {removedCount: dom.removed.length}
    });
  }

  // 文本/属性修改 — 提取前 10 条关键变更
  const textChanges = dom.changed.filter(c => String(c.path).endsWith('.text'));
  const attrChanges = dom.changed.filter(
    c => !String(c.path).endsWith('.text') && !String(c.path).endsWith('.children')
  );

  if (textChanges.length > 0) {
    changes.push({
      type: 'dom',
      severity: textChanges.length > 5 ? 'medium' : 'low',
      description: `${textChanges.length} 处文本内容变更`,
      detail: {
        count: textChanges.length,
        samples: textChanges.slice(0, 5).map(c => ({
          path: c.path,
          oldValue: String(c.oldValue ?? '').slice(0, 100),
          newValue: String(c.newValue ?? '').slice(0, 100)
        }))
      }
    });
  }

  if (attrChanges.length > 0) {
    changes.push({
      type: 'dom',
      severity: attrChanges.length > 10 ? 'medium' : 'low',
      description: `${attrChanges.length} 处属性变更`,
      detail: {
        count: attrChanges.length,
        samples: attrChanges.slice(0, 5).map(c => ({
          path: c.path,
          oldValue: String(c.oldValue ?? ''),
          newValue: String(c.newValue ?? '')
        }))
      }
    });
  }

  // 总变化比例
  changes.push({
    type: 'dom',
    severity: dom.changeRatio > 0.5 ? 'critical' : dom.changeRatio > 0.2 ? 'high' : 'low',
    description: `DOM 结构变化比例 ${(dom.changeRatio * 100).toFixed(1)}%（+${dom.added.length}/-${dom.removed.length}/~${dom.changed.length}）`,
    detail: {
      changeRatio: dom.changeRatio,
      added: dom.added.length,
      removed: dom.removed.length,
      changed: dom.changed.length,
      unchanged: dom.unchanged
    }
  });

  return changes;
}

function _plural(word: string, count: number): string {
  return count === 1 ? word : `${word}s`;
}

// ======== Layout Diff → 语义化 ========

function _semanticLayout(layout: LayoutDiffResult): SemanticChange[] {
  const changes: SemanticChange[] = [];

  if (layout.moved.length > 0) {
    const maxDist = Math.max(...layout.moved.map(m => m.distance));
    const avgDist = layout.moved.reduce((s, m) => s + m.distance, 0) / layout.moved.length;

    changes.push({
      type: 'layout',
      severity: maxDist > 50 ? 'critical' : maxDist > 10 ? 'high' : 'low',
      description: `${layout.moved.length} 个元素位置偏移（最大 ${Math.round(maxDist)}px，平均 ${Math.round(avgDist)}px）`,
      detail: {
        movedCount: layout.moved.length,
        maxDistance: Math.round(maxDist),
        avgDistance: Math.round(avgDist),
        topMoved: layout.moved.slice(0, 10).map(m => ({
          element: m.selector,
          distance: Math.round(m.distance),
          dx: m.newBounds.x - m.oldBounds.x,
          dy: m.newBounds.y - m.oldBounds.y
        }))
      }
    });
  }

  if (layout.resized.length > 0) {
    changes.push({
      type: 'layout',
      severity: layout.resized.length > 10 ? 'high' : 'medium',
      description: `${layout.resized.length} 个元素尺寸变化`,
      detail: {
        resizedCount: layout.resized.length,
        topResized: layout.resized.slice(0, 10).map(m => ({
          element: m.selector,
          oldSize: `${m.oldBounds.width}×${m.oldBounds.height}`,
          newSize: `${m.newBounds.width}×${m.newBounds.height}`
        }))
      }
    });
  }

  return changes;
}

// ======== Network Diff → 语义化 ========

function _semanticNetwork(network: NetworkDiffResult): SemanticChange[] {
  const changes: SemanticChange[] = [];

  if (network.added.length > 0) {
    changes.push({
      type: 'network',
      severity: network.added.length > 5 ? 'high' : 'medium',
      description: `新增了 ${network.added.length} 个网络请求`,
      detail: {
        addedUrls: network.added.slice(0, 10).map(r => ({
          url: _shortUrl(r.url),
          status: r.status
        }))
      }
    });
  }

  if (network.removed.length > 0) {
    changes.push({
      type: 'network',
      severity: network.removed.length > 3 ? 'medium' : 'low',
      description: `移除了 ${network.removed.length} 个网络请求`,
      detail: {
        removedUrls: network.removed.slice(0, 10).map(r => ({
          url: _shortUrl(r.url)
        }))
      }
    });
  }

  if (network.timingChanges.length > 0) {
    const maxDelta = Math.max(...network.timingChanges.map(t => t.changeRatio));
    changes.push({
      type: 'network',
      severity: maxDelta > 1 ? 'critical' : maxDelta > 0.5 ? 'high' : 'medium',
      description: `${network.timingChanges.length} 个请求耗时变化 >20%`,
      detail: {
        topSlowdowns: network.timingChanges
          .sort((a, b) => b.changeRatio - a.changeRatio)
          .slice(0, 10)
          .map(t => ({
            url: _shortUrl(t.url),
            oldDuration: `${t.oldDuration}ms`,
            newDuration: `${t.newDuration}ms`,
            changeRatio: Number((t.changeRatio * 100).toFixed(0))
          }))
      }
    });
  }

  if (network.sizeChanges.length > 0) {
    const totalBytes = network.sizeChanges.reduce((s, c) => s + c.changeBytes, 0);
    changes.push({
      type: 'network',
      severity: Math.abs(totalBytes) > 100 * 1024 ? 'high' : 'low',
      description: `${network.sizeChanges.length} 个资源体积变化（总计 ${_fmtBytes(totalBytes)}）`,
      detail: {
        totalBytes,
        topChanges: network.sizeChanges
          .sort((a, b) => Math.abs(b.changeBytes) - Math.abs(a.changeBytes))
          .slice(0, 10)
          .map(c => ({
            url: _shortUrl(c.url),
            oldSize: _fmtBytes(c.oldSize),
            newSize: _fmtBytes(c.newSize),
            changeBytes: c.changeBytes
          }))
      }
    });
  }

  return changes;
}

function _shortUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function _fmtBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024) return `${bytes}B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// ======== Performance Diff → 语义化 ========

function _semanticPerformance(perf: PerformanceDiffResult): SemanticChange[] {
  const changes: SemanticChange[] = [];

  if (perf.regressions.length > 0) {
    const worst = perf.regressions.reduce((a, b) => (a.changeRatio > b.changeRatio ? a : b));
    changes.push({
      type: 'performance',
      severity: worst.changeRatio > 0.5 ? 'critical' : 'high',
      description: `${perf.regressions.length} 项性能指标退化：${perf.regressions.map(r => `${r.metric} ${_fmtMs(r.baseline)}→${_fmtMs(r.current)}（+${(r.changeRatio * 100).toFixed(0)}%）`).join('，')}`,
      detail: {
        regressedCount: perf.regressions.length,
        worstMetric: worst.metric,
        worstChange: Number((worst.changeRatio * 100).toFixed(0)),
        metrics: perf.regressions.map(r => ({
          metric: r.metric,
          baseline: r.baseline,
          current: r.current,
          changeRatio: Number((r.changeRatio * 100).toFixed(0))
        }))
      }
    });
  }

  if (perf.improvements.length > 0) {
    changes.push({
      type: 'performance',
      severity: 'low',
      description: `${perf.improvements.length} 项性能指标改善：${perf.improvements.map(r => `${r.metric} ${_fmtMs(r.baseline)}→${_fmtMs(r.current)}（${(r.changeRatio * 100).toFixed(0)}%）`).join('，')}`,
      detail: {
        improvedCount: perf.improvements.length,
        metrics: perf.improvements.map(r => ({
          metric: r.metric,
          baseline: r.baseline,
          current: r.current,
          changeRatio: Number((r.changeRatio * 100).toFixed(0))
        }))
      }
    });
  }

  return changes;
}

function _fmtMs(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}
