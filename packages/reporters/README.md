# @visual-guard/reporters

Visual Guard report output package. Generates console, JSON, and HTML reports from `DiffManifest`.

## Report Types

| Reporter | Output | Description |
|----------|--------|-------------|
| `generateConsoleReport` | stdout | Terminal summary with status icons, semantic summaries, and report file paths |
| `generateJsonReport` | `summary.json` + `manifest.json` | Lightweight summary (AI-readable) + full manifest (CI parsing) |
| `generateHtmlReport` | `report.html` | Rich HTML with sidebar nav, 7 tab panels per scenario (AI summary / Visual / DOM / Layout / Network / Performance / Errors) |
| `generateReportsIndex` | `index.html` | Run history overview page |

## Usage

```ts
import {
  generateConsoleReport,
  generateHtmlReport,
  generateJsonReport,
  generateReportsIndex
} from '@visual-guard/reporters';

// Human-readable console output (consumes semantic data)
const text = generateConsoleReport(manifest, reportFiles);

// JSON reports (summary.json + manifest.json)
const files = await generateJsonReport(manifest, '.visual-guard/reports', manifest.run.id);

// HTML report with interactive viewer
await generateHtmlReport(manifest, '.visual-guard/reports', manifest.run.id);

// Run history index
await generateReportsIndex('.visual-guard/reports');
```

## Output Structure

```
.visual-guard/reports/
  index.html              ← Run history overview
  {runId}/
    report.html           ← Rich HTML viewer
    summary.json          ← Lightweight AI-readable summary
    manifest.json         ← Full data (CI integration)
    images/
      {sceneId}/
        baseline.png
        current.png
        diff.png          ← Pixel diff heatmap
```

## HTML Report Features

- **Fixed sidebar** — scene list with sub-tabs, click to scroll + highlight
- **7 Tab panels** per scene: AI Summary / Visual Comparison / DOM Changes / Layout Shifts / Network Changes / Performance / Errors
- **Diff overlay** — red-highlighted pixel diff image side-by-side with baseline and current
- **Blink Comparator** — animated baseline ↔ current toggle with speed control
- **Performance dashboard** — metric cards with baseline comparison and regression highlighting
- **Responsive design** — collapses sidebar on mobile, tables gain horizontal scroll

## Input Protocol

All reporters consume only `DiffManifest` — no dependency on runner internals.

## License

[MIT](./LICENSE) © luhanxin
