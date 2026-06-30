# 3. 核心性能采集

项目目录：
  ./packages/core/src/capture.ts
  ./packages/shared/src/types/snapshot.ts

问题描述：
  1. `Snapshot` 类型已定义 `performance: PerformanceMetrics` 字段，但 `captureScene()` 中并未实际采集性能指标填入 Snapshot
  2. 当前 `plugin-perf` 通过 `afterCapture` hook 自行采集 LCP/CLS/NavigationTiming，但这是插件层面的补充
  3. 这意味着如果不启用 plugin-perf，Snapshot 中 performance 字段始终为空，报告中也看不到任何性能数据
  4. 性能数据应该是 core 层的基础采集能力，不应依赖可选插件

解决方案：
  1. 在 `captureScene()` 中新增 `collectPerformanceMetrics(enginePage)` 阶段

  2. 采集内容（通过 `enginePage.evaluate()` 注入）：
     - Navigation Timing API：`performance.timing` → DOMContentLoaded / Load / TTFB / FCP
     - Resource Timing：`performance.getEntriesByType('resource')` → 资源总数、总体积、平均耗时
     - JS Heap Size：`performance.memory?.usedJSHeapSize`
     - DOM 节点数：`document.querySelectorAll('*').length`

  3. 采样时机：页面 goto + waitForSelector 之后、截图之前执行 `evaluate()`

  4. 性能数据填入 `Snapshot.performance`，与截图、DOM 快照一起作为 capture 的标准产物

  5. `collectNavigationTiming()` 实现参考（从 plugin-perf 迁移到 core）：
     ```ts
     const timing = await page.evaluate(() => {
       const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
       const paint = performance.getEntriesByType('paint');
       return {
         domContentLoaded: nav.domContentLoadedEventEnd,
         load: nav.loadEventEnd,
         ttfb: nav.responseStart,
         fcp: paint.find(p => p.name === 'first-contentful-paint')?.startTime,
       };
     });
     ```

  6. LCP/CLS 等需要异步 Observer 的指标暂不在此处采集（留在 plugin-perf），避免阻塞 capture 主流程

  7. `plugin-perf` 由「独立采集」降级为「补充采集 + 预算检查」，去重已有指标

  8. 报告层（HTML reporter）的性能展示改为直接读取 `Snapshot.performance`，不再依赖插件
