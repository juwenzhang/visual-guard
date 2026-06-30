# @visual-guard/reporters

Visual Guard 报告输出包，从 `DiffManifest` 生成控制台摘要、JSON 和 HTML 可视化报告。

## 报告类型

| 报告器 | 输出 | 说明 |
|--------|------|------|
| `generateConsoleReport` | stdout | 终端彩色摘要，含状态图标、语义摘要和报告文件路径 |
| `generateJsonReport` | `summary.json` + `manifest.json` | 精简摘要（AI 可读）+ 完整数据（CI 解析） |
| `generateHtmlReport` | `report.html` | 富交互 HTML，侧边栏导航 + 每场景 7 个 TAB 面板 |
| `generateReportsIndex` | `index.html` | 运行历史概览页 |

## 用法

```ts
import {
  generateConsoleReport,
  generateHtmlReport,
  generateJsonReport,
  generateReportsIndex
} from '@visual-guard/reporters';

// 终端输出（消费 semantic 语义化数据）
const text = generateConsoleReport(manifest, reportFiles);

// JSON 报告（summary.json + manifest.json）
const files = await generateJsonReport(manifest, '.visual-guard/reports', manifest.run.id);

// HTML 交互报告
await generateHtmlReport(manifest, '.visual-guard/reports', manifest.run.id);

// 运行历史索引
await generateReportsIndex('.visual-guard/reports');
```

## 输出结构

```
.visual-guard/reports/
  index.html              ← 运行历史概览
  {runId}/
    report.html           ← 富交互 HTML 查看器
    summary.json          ← 精简摘要（AI 可消费）
    manifest.json         ← 全量数据（CI 集成）
    images/
      {sceneId}/
        baseline.png
        current.png
        diff.png          ← 差异热力图
```

## HTML 报告功能

- **固定侧边栏** — 场景列表 + 子 TAB 导航，点击跳转 + 高亮
- **每场景 7 个 TAB**：AI 摘要 / 视觉对比 / DOM 变化 / 布局偏移 / 网络变化 / 性能 / 错误
- **差异热力图** — 红色标注的像素差异图，与基线和当前截图并排展示
- **动画帧切换** — 基线 ↔ 当前动画切换，支持速度调节
- **性能仪表盘** — 指标卡片含基线对比和退化高亮
- **响应式适配** — 移动端侧边栏收起为滑入面板，表格自动水平滚动

## 输入协议

所有 reporter 只消费 `DiffManifest`，不依赖 runner 内部实现。

## License

[MIT](./LICENSE) © luhanxin
