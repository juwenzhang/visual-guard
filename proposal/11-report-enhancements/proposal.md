# 11. 报告增强

项目目录：
  ./packages/reporters/src/html.ts
  ./packages/core/src/capture.ts
  ./packages/core/src/diff.ts

问题描述：

  ### 11.0 HTML 报告当前缺失的关键信息（P0）
  1. **无 diff overlay/热力图** — Blink Comparator 只能交替看基线/当前截图，没有生成红色标注差异区域的合成图。视觉回归工具的最基础能力缺失
  2. **网络变化详情未渲染** — core 层 `diffNetwork()` 已实现（新增/删除请求、耗时变化），但 HTML reporter 的 `_buildScenarioCard()` 只调用了 pixel/dom/layout/perf 四个 section，`network diff` 结果完全丢弃
  3. **控制台错误未展示** — capture 阶段采集了 `consoleMessages`，但 `_buildScenarioCard()` 未渲染，看不到 JS 运行时错误
  4. **视口信息缺失** — 场景卡片只显示名称 + URL，看不出当前是 desktop(1280x800) 还是 mobile(390x844) 视口
  5. **错误详情不展示** — `scenarioResult.errors`（RuntimeError 数组）完全没渲染，失败/错误场景用户看不到原因
  6. **性能指标缺少对比基准** — 当前只显示退化/改进的指标名和当前值，没有 baseline 值、变化百分比、阈值
  7. **commit/分支对比信息** — `manifest.run.commit` 字段有值但报告未展示
  8. **diff regions 无截图标注** — pixel diff 的 `regions` 坐标只列了文本 `(x, y) W×H Δ%`，没有在截图上画红框标注

  ### 11.1 其他远期增强（P1/P2）
  9. 无障碍树采集与对比（类型已定义，未实现）
  10. 截图 base64 可选输出（JSON reporter embedScreenshots）
  11. PDF 导出
  12. 资源瀑布图
  13. 性能仪表盘增强（Core Web Vitals 仪表盘 + 退化标记 + 趋势图）
  14. Lighthouse 报告嵌入
  15. 截图拖拽放大与像素级对比

解决方案：

  ### P0：补齐 HTML 报告关键缺失

  1. **diff overlay 图片生成** — 在 `_buildPixelSection()` 中增加 diff overlay 列：
     - 使用 pixelmatch 生成 diff PNG（core 层 `diffPixel()` 已产出 diff buffer）
     - 在 Blink Comparator 旁边增加第三列「差异热力图」
     - 红色标注差异像素区域

  2. **网络变化 section** — 新增 `_buildNetworkSection(diffs.network)`：
     - 新增/删除的请求 URL + 状态码
     - 耗时变化 >20% 的请求（旧耗时 vs 新耗时）
     - 体积变化 >1KB 的资源

  3. **控制台错误 section** — 新增 `_buildConsoleSection(scenarioResult.errors)`：
     - 显示 JS 运行时错误（message + source location）
     - 显示 console.error 调用

  4. **视口信息** — 在场景卡片 header 中显示 viewport 名称和尺寸：
     - 从 `manifest.scenarios[].id` 解析（格式如 `home@desktop`）或从 artifacts 元信息中读取
     - 显示为标签：`1280×800 desktop`

  5. **错误详情展示** — 对 status 为 `failed`/`errored` 的场景，展示 `errors` 数组：
     - 错误类型、消息、堆栈（折叠展示）

  6. **性能指标对比详情** — 增强 `_buildPerfSection()`：
     - 显示 baseline 值 → 当前值 → 变化百分比
     - 退化用红色 ↑、改进用绿色 ↓
     - 超出预算阈值时标注 ⚠️

  7. **commit 信息** — 在 header meta 区域展示 commit hash（如有）

  8. **diff regions 截图标注** — 在 Blink Comparator 截图上叠加半透明红框：
     - 根据 `pixel.diffRegions` 坐标用 CSS `position: absolute` 画框

  ### P1/P2：远期增强

  9. 无障碍树采集 — `captureScene()` 中通过 CDP `Accessibility.getFullAXTree` 采集
  10. PDF 导出 — 基于 Playwright `page.pdf()` 渲染 HTML 报告
  11. 资源瀑布图 — 基于 ResourceTiming 数据 + Canvas 渲染
  12. 性能仪表盘 — Core Web Vitals 环形图 + 退化红黄绿标记
  13. Lighthouse 嵌入 — iframe 嵌入 Lighthouse 报告 HTML
  14. 截图放大预览 — 拖拽缩放 + 像素级对比
