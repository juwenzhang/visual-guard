# 8. 性能增强

项目目录：
  ./packages/plugin-perf/src/index.ts
  ./packages/core/src/capture.ts

问题描述：
  1. `plugin-perf` 已完成 Core Web Vitals（LCP/FCP/CLS/TTFB）采集，但设计文档 P1/P2 的性能能力大量缺失
  2. 缺失项：Lighthouse 集成、资源大小统计、Long Tasks 检测、网络/CPU 节流模拟、性能趋势记录、回归告警

解决方案：

  ### 8.1 资源大小统计
  1. 在 `plugin-perf` 中新增 `collectResourceStats(enginePage)`：
     - 通过 `Performance.getEntriesByType('resource')` 采集所有资源加载数据
     - 按类型聚合（JS/CSS/图片/字体/API）
     - 统计总大小、请求数、平均耗时
  2. 新增性能预算：单个资源上限、总包体积上限

  ### 8.2 Long Tasks 检测
  3. 注入 `PerformanceObserver` 监听 `longtask` entry type
  4. 统计 50ms+ / 100ms+ 长任务数量和总时长
  5. 长任务占比超阈值时触发性能告警

  ### 8.3 网络节流模拟
  6. 在 `BrowserConfig` 中新增 `throttle?: ThrottleConfig`：
     ```ts
     throttle?: {
       network?: '3g' | '4g' | 'slow-3g';
       cpu?: number;  // 1-4 倍减速
     };
     ```
  7. Playwright 使用 `browser.newContext()` 配合 CDP Network.emulateNetworkConditions
  8. Puppeteer 使用 CDP 直接控制

  ### 8.4 性能趋势记录
  9. 新增 `src/trend.ts`，将每次运行的性能指标持久化到 `.visual-guard/perf-trend.json`
  10. 趋势数据结构：
      ```ts
      interface PerfTrendRecord {
        runId: string;
        timestamp: string;
        scenario: string;
        metrics: PerformanceMetrics;
      }
      ```
  11. 支持趋势图表渲染（HTML 报告中嵌入折线图）

  ### 8.5 性能回归告警
  12. 对比连续 N 次运行趋势，指标持续退化时触发告警
  13. 回归阈值可配置（LCP 退化 >20% 持续 3 次运行）

  ### 8.6 Lighthouse 集成（P2 远期）
  14. 使用 Lighthouse Node API + CDP port 方式接入
  15. 作为 `plugin-perf` 的可选能力，非默认启
  16. 输出 Lighthouse 报告嵌入 HTML report
