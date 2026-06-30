# @visual-guard/core

> Visual Guard core engine — scene resolution, page capture, baseline storage, multi-dimensional diff, and result aggregation.

## Install

```bash
pnpm add @visual-guard/core
```

## Architecture

```
resolveScenes()        →  viewport × scene Cartesian product
captureScene()         →  browser capture (screenshot / DOM / network / console)
  injectStabilizers()  →  freeze Date/animations before screenshot
createLocalBaselineStore() → local filesystem baseline read/write
diffPixel/diffDom/diffLayout/diffNetwork/diffPerformance → 5-dimension comparison
generateSemanticReport() → human/AI-readable change descriptions
run()                  →  full pipeline → DiffManifest
```

## Key Features

### Dynamic Content Stabilization (`injectStabilizers`)

Before taking screenshots, the engine injects page stabilizers to reduce false positives:

| Strategy | Default | Description |
|----------|---------|-------------|
| `freezeTime` | `true` | Freeze `Date.now()` and `new Date()` |
| `disableAnimations` | `true` | Disable CSS animations & transitions |
| `freezeRAF` | `true` | Schedule `requestAnimationFrame` as sync callbacks |
| `freezeInterval` | `false` | Replace `setInterval` with one-shot `setTimeout` |
| `waitForFonts` | `true` | Wait for `document.fonts.ready` |
| `maskSelectors` | — | CSS selectors to mask with solid blocks |

Configurable via `stabilize` in `VisualGuardConfig`.

### Semantic Diff (`generateSemanticReport`)

Converts raw diff algorithm output into structured, human-readable descriptions:

```json
{
  "type": "visual",
  "severity": "high",
  "description": "页面像素差异比例为 8.06%，存在明显视觉差异",
  "element": ".header"
}
```

AI/notification plugins consume this directly.

### Automatic Branch Detection

`run()` automatically detects the current Git branch via:
1. Environment variables (`VG_BRANCH`, `CI_COMMIT_BRANCH`, etc.)
2. `git rev-parse --abbrev-ref HEAD`
3. Falls back to `"unknown"`

## API

### `run(options)`

Main entry point — executes the full pipeline:

```ts
import { run } from '@visual-guard/core';

const manifest = await run({ config, adapter, writeBaseline: false });
// manifest: DiffManifest { version, run, summary, scenarios }
```

### `captureScene(resolved, context, options)`

Captures a single scene snapshot (screenshot, DOM, network, console, performance).

```ts
import { captureScene } from '@visual-guard/core';
import type { StabilizeConfig } from '@visual-guard/shared';

const result = await captureScene(scene, context, {
  timeout: 30000,
  stabilize: { freezeTime: true, disableAnimations: true }
});
```

### `injectStabilizers(page, stabilize?)`

Inject page stabilizers before screenshot. Called automatically by `captureScene`.

### `generateSemanticReport(scenarioResult)`

Generate human-readable diff summary for a single scenario.

```ts
import { generateSemanticReport } from '@visual-guard/core';

const report = generateSemanticReport(scenarioResult);
// SemanticDiffReport { changes: SemanticChange[] }
```

### Diff Functions

```ts
import { diffPixel, diffDom, diffLayout, diffNetwork, diffPerformance } from '@visual-guard/core';

const pixel = await diffPixel(currentBuf, baselineBuf, config.diff);
const dom = diffDom(currentTree, baselineTree);
const layout = diffLayout(currentTree, baselineTree, config.diff);
const network = diffNetwork(currentRecords, baselineRecords);
const perf = await diffPerformance(currentMetrics, baselineMetrics);
```

### `createLocalBaselineStore(baselineDir)`

Creates a local filesystem baseline store.

```ts
import { createLocalBaselineStore } from '@visual-guard/core';

const store = createLocalBaselineStore('.visual-guard/baselines');
await store.write(key, bundle);
const baseline = await store.read(key);
```

## License

[MIT](./LICENSE) © luhanxin
