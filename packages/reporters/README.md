# @visual-guard/reporters

Visual Guard 报告输出包。

## 报告类型

- `generateConsoleReport`：终端摘要，包含基线建立 / 通过 / 差异 / 错误提示
- `generateJsonReport`：输出 `manifest.json`
- `generateHtmlReport`：输出可视化 HTML 报告

## 使用

```ts
import { generateConsoleReport, generateHtmlReport, generateJsonReport } from '@visual-guard/reporters';

const text = generateConsoleReport(manifest, reportFiles);
await generateJsonReport(manifest, '.visual-guard/reports', manifest.run.id);
await generateHtmlReport(manifest, '.visual-guard/reports', manifest.run.id);
```

## 输入协议

所有 reporter 只消费 `DiffManifest`，不依赖 runner 内部实现。
