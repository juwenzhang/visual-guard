# 2. 差异语义化输出

项目目录：
  ./packages/core/src/diff.ts
  ./packages/shared/src/types/diff.ts

问题描述：
  1. 当前 diff 层（pixel/DOM/layout/network/performance）产出的全是底层算法原始数据
  2. pixel diff 输出 `diffRatio: 0.034`、DOM diff 输出 deep-diff 的 N/D/E 原语、layout diff 输出原始坐标偏移
  3. 这些 raw 数据无论给 HTML reporter 渲染还是给 plugin-ai 分析，都无法直接理解「到底发生了什么变化」
  4. 后续 plugin-ai 需要语义化差异作为 prompt 输入，当前状态根本无法输入

解决方案：
  1. 在 core/src/ 新增 `src/semantic-diff.ts`，作为 diff 之后、manifest 之前的「语义化层」

  2. 对每种 diff 结果生成人类/AI 可读的描述：

  ### pixel diff 语义化
  3. 根据 `diffImage` 中的差异区域坐标，结合页面元素 `boundingRect` 定位具体元素
  4. 输出：`{ element: ".header", type: "visual-change", severity: "high", ratio: 0.034, description: "顶部导航栏背景色可能从深色变为浅色" }`

  ### DOM diff 语义化
  5. 将 deep-diff 原语（N/D/E）转换为可读描述：
     - N（新增）→ `{ element: "div.product-card", change: "added", description: "新增了商品卡片元素" }`
     - D（删除）→ `{ element: ".old-banner", change: "removed", description: "移除了旧版横幅广告" }`
     - E（修改）→ `{ element: ".price", change: "text-changed", oldValue: "¥99", newValue: "¥129", description: "价格从 ¥99 变更为 ¥129" }`

  ### layout diff 语义化
  6. 将坐标偏移转换为方向+距离描述：
     - `{ element: ".sidebar", change: "moved", direction: "right", distance: 2, unit: "px", description: "侧边栏向右偏移 2px" }`
     - `{ element: ".sidebar", change: "resized", axis: "height", delta: 8, unit: "px", description: "侧边栏高度增加 8px" }`

  ### 性能 diff 语义化
  7. `{ metric: "LCP", change: "degraded", baselineValue: 1200, currentValue: 1800, delta: 600, unit: "ms", severity: "warning", description: "LCP 从 1.2s 退化到 1.8s，增加 50%" }`

  ### 输出结构
  8. 新增类型 `SemanticDiffReport`：
     ```ts
     interface SemanticDiffReport {
       scenarioId: string;
       scenarioName: string;
       url: string;
       viewport: string;
       totalChanges: number;
       changes: SemanticChange[];
     }
     interface SemanticChange {
       type: 'visual' | 'dom' | 'layout' | 'network' | 'performance';
       element?: string;
       severity: 'critical' | 'high' | 'medium' | 'low';
       description: string;
       detail: Record<string, unknown>;
     }
     ```

  9. 在 `runner.ts` 中，diff 完成后调用 `generateSemanticReport(scenarioResult)`，将语义化结果写入 `DiffManifest.scenarios[].semantic` 字段

  10. 后续所有 consumer（reporter / plugin-ai / plugin-notify）优先消费 `semantic` 字段
