# Visual Guard 趋势数据提取 & 指标定义

> 状态：方案探讨 | 日期：2026-06-30 | 依赖：[04-ai-agent-design](./04-ai-agent-design.md)

## 一、问题背景

单次 baseline 对比只能回答「变了吗」，无法回答「趋势是恶化还是改善」。需要从历史运行数据中提取趋势指标，构建 Dashboard 展示页面质量的变化走向。

## 二、数据源

每轮运行产出的 `manifest.json` 包含完整 diff 数据，但体积过大（含 base64 截图，2~5MB/次）。因此从 manifest 中提取关键数字指标，存入轻量的 `summary.json`（~3KB/次），趋势面板直接扫描历史 summary 文件。

## 三、趋势指标定义

### 3.1 性能趋势 (`perf`)

来源：`scenario.diffs.performance`

| 指标 | 类型 | 计算方式 | 趋势判断 |
|------|------|---------|---------|
| `lcp` | `number` | 所有场景 LCP `current` 值取平均（ms） | ↑ 恶化 / ↓ 改善 |
| `fcp` | `number` | 同上 | ↑ 恶化 / ↓ 改善 |
| `cls` | `number` | 同上 | ↑ 恶化 / ↓ 改善 |
| `ttfb` | `number` | 同上 | ↑ 恶化 / ↓ 改善 |
| `dcl` | `number` | 同上 | ↑ 恶化 / ↓ 改善 |
| `load` | `number` | 同上 | ↑ 恶化 / ↓ 改善 |
| `regressionCount` | `number` | `regressions.length` 累加 | ↑ 恶化 |
| `improvementCount` | `number` | `improvements.length` 累加 | ↑ 改善 |
| `budgetExceeded` | `number` | 含 `budgetExceeded` 的指标数 | >0 需关注 |
| `worstRatio` | `number` | `max(regressions[].changeRatio)` | 越大越严重 |

### 3.2 视觉趋势 (`pixel`)

来源：`scenario.diffs.pixel`

| 指标 | 类型 | 计算方式 | 趋势判断 |
|------|------|---------|---------|
| `avgDiffRatio` | `number` | 所有场景 `diffRatio` 取平均 | ↑ 恶化 |
| `maxDiffRatio` | `number` | 所有场景 `diffRatio` 取最大值 | ↑ 恶化 |
| `scenesWithDiff` | `number` | `diffRatio > 0` 的场景数 | ↑ 扩散 |
| `totalRegions` | `number` | 所有场景 `regions?.length` 累加 | ↑ 扩散 |

### 3.3 DOM 趋势 (`dom`)

来源：`scenario.diffs.dom`

| 指标 | 类型 | 计算方式 |
|------|------|---------|
| `totalAdded` | `number` | 所有场景 `added.length` 累加 |
| `totalRemoved` | `number` | 所有场景 `removed.length` 累加 |
| `totalChanged` | `number` | 所有场景 `changed.length` 累加 |
| `totalNodes` | `number` | `unchanged + added + removed + changed` |
| `avgChangeRatio` | `number` | 所有场景 `changeRatio` 取平均 |

### 3.4 布局趋势 (`layout`)

来源：`scenario.diffs.layout`

| 指标 | 类型 | 计算方式 |
|------|------|---------|
| `totalMoved` | `number` | 所有场景 `moved.length` 累加 |
| `totalResized` | `number` | 所有场景 `resized.length` 累加 |
| `maxMovePx` | `number` | 所有 `moved[].distance` 取最大值 |
| `avgMovePx` | `number` | 所有 `moved[].distance` 取平均 |
| `scenesWithShift` | `number` | `changeCount > 0` 的场景数 |

### 3.5 网络趋势 (`network`)

来源：`scenario.diffs.network`

| 指标 | 类型 | 计算方式 |
|------|------|---------|
| `addedRequests` | `number` | 所有场景 `added.length` 累加 |
| `removedRequests` | `number` | 所有场景 `removed.length` 累加 |
| `timingRegressions` | `number` | 所有场景 `timingChanges.length` 累加 |
| `totalSizeDelta` | `string` | 所有 `sizeChanges[].changeBytes` 求和 → 格式化 |
| `biggestSizeChange` | `string` | `max(abs(changeBytes))` → 格式化 |

### 3.6 资源分类趋势 (`resources`)

来源：`scenario.diffs.network.added/removed[].url` 按扩展名分类

| 指标 | 计算方式 |
|------|---------|
| `svgCount` | URL 匹配 `*.svg` |
| `imageCount` | URL 匹配 `*.png|*.jpg|*.jpeg|*.webp|*.gif` |
| `fontCount` | URL 匹配 `*.woff|*.woff2|*.ttf|*.otf` |
| `videoCount` | URL 匹配 `*.mp4|*.webm` |
| `jsonEndpoints` | URL 匹配 `*.json` |
| `cdnDomains` | hostname 匹配 `cdn|static|assets` |
| `thirdPartyDomains` | hostname 排除 `baseUrl` 自身域名 |

### 3.7 DOM 变更特征 (`domPatterns`)

来源：`scenario.diffs.dom.changed[].path`

| 指标 | 计算方式 |
|------|---------|
| `dataAttrChanges` | path 含 `data-` 前缀 |
| `ariaAttrChanges` | path 含 `aria-` 前缀 |
| `svgElementChanges` | path 含 `svg` 关键字 |
| `styleChanges` | path 含 `attributes.style` |

### 3.8 质量趋势 (`quality`)

来源：`scenario` 自身字段 + `summary`

| 指标 | 计算方式 |
|------|---------|
| `totalErrors` | `errors.length` 累加 |
| `totalWarnings` | `warnings?.length` 累加 |
| `avgDurationMs` | 所有场景 `durationMs` 取平均 |
| `passRate` | `passed / total` |

## 四、summary.json 新增结构

```json
{
  "run": { "id": "...", "startedAt": "...", "endedAt": "..." },
  "summary": { /* 现有字段不变 */ },
  "trends": {
    "perf": { "lcp": 1240, "fcp": 710, "cls": 0.02, "ttfb": 210, "dcl": 620, "load": 2350, "regressionCount": 2, "improvementCount": 1, "budgetExceeded": 0, "worstRatio": 0.19 },
    "pixel": { "avgDiffRatio": 0.081, "maxDiffRatio": 0.0998, "scenesWithDiff": 1, "totalRegions": 5 },
    "dom": { "totalAdded": 87, "totalRemoved": 88, "totalChanged": 922, "totalNodes": 3330, "avgChangeRatio": 0.329 },
    "layout": { "totalMoved": 252, "totalResized": 212, "maxMovePx": 2193, "avgMovePx": 53, "scenesWithShift": 1 },
    "network": { "addedRequests": 1, "removedRequests": 0, "timingRegressions": 0, "totalSizeDelta": "+15.3KB", "biggestSizeChange": "15.3KB" },
    "resources": { "svgCount": 5, "imageCount": 15, "fontCount": 3, "videoCount": 0, "jsonEndpoints": 8, "cdnDomains": 2, "thirdPartyDomains": 5 },
    "domPatterns": { "dataAttrChanges": 12, "ariaAttrChanges": 3, "svgElementChanges": 1, "styleChanges": 7 },
    "quality": { "totalErrors": 0, "totalWarnings": 0, "avgDurationMs": 2637, "passRate": 0.0 }
  }
}
```

## 五、Dashboard 布局

趋势面板替换现有 `reports/index.html`（当前仅列出历史 run），展示最近 20 次运行的指标趋势：

```text
═══════════════════════════════════════════════
📊 趋势概览 — 最近 20 次运行
═══════════════════════════════════════════════

行 1: ⚡ 性能趋势
  [LCP] [FCP] [CLS] [TTFB] [dcl] [load]

行 2: 📸 视觉 & 结构
  [Avg DiffRatio] [Max DiffRatio] [DOM TotalAdded] [DOM ChangeRatio]

行 3: ↕ 布局
  [TotalMoved] [MaxMovePx] [TotalResized] [ScenesWithShift]

行 4: 🌐 网络
  [Added Requests] [Timing Regressions] [Total Size Delta] [3rd Party Domains]

行 5: 🐛 质量
  [Pass Rate] [Total Errors] [Avg Duration] [Perf Regressions]
═══════════════════════════════════════════════
```

每个指标用一个 **inline SVG sparkline** 展示趋势折线图，标注当前值 + min/max/avg + 趋势箭头 ↗/↘/→。

## 六、实施计划

| 阶段 | 内容 | 依赖 |
|------|------|------|
| 1 | `reporters/src/json.ts` 新增 `_buildTrends()` 从 manifest 提取趋势数据 | — |
| 2 | `reporters/src/trends.ts` 读取历史 summary.json 聚合趋势 | 阶段 1 |
| 3 | `reporters/src/index.ts` 更新 `generateReportsIndex()` → 趋势 Dashboard | 阶段 2 |
| 4 | 趋势面板 UI (inline SVG sparkline + 卡片布局) | 阶段 3 |
