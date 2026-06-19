# @visual-guard/plugin-perf

性能检测插件包（规划中）。

## 目标能力

- Lighthouse 集成
- FCP / LCP / CLS / TTFB 指标采集
- 性能预算检查
- 资源大小统计
- 性能趋势与回归告警

## 设计原则

性能能力不放入 core，避免核心链路过重；通过 `PluginAPI` 在 `afterCapture` / `afterCompare` 阶段接入。

当前包仍为骨架。
