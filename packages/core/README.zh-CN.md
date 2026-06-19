# @visual-guard/core

> Visual Guard 核心运行包 — 场景解析、页面采集、基线存储、多维对比与结果聚合。

## 安装

```bash
npm install @visual-guard/core
# 或
pnpm add @visual-guard/core
```

## 架构

```
resolveScenes()    →  viewport × scene 笛卡尔积展开
captureScene()     →  浏览器采集（截图 / DOM / 网络 / 性能）
createLocalBaselineStore() → 本地文件系统基线读写
diffPixel/diffDom/diffLayout/diffNetwork/diffPerformance → 五维对比
run()              →  全流程编排 → DiffManifest
```

## API

### `run(options)`

核心入口，执行完整流水线：

```ts
import { run } from '@visual-guard/core';
import { loadConfig } from '@visual-guard/config';

const config = await loadConfig();
const manifest = await run({ config, adapter });
// manifest: DiffManifest { version, run, summary, scenarios }
```

### `resolveScenes(config)`

将配置中的 `scenarios` × `viewports` 展开为执行单元列表。

```ts
import { resolveScenes } from '@visual-guard/core';

const scenes = resolveScenes(config);
// scenes: ResolvedScene[] — 每个包含 scene, viewport, url, id
```

### `captureScene(resolved, context, options)`

采集单个场景的页面快照（截图、DOM、网络、控制台）。

```ts
import { captureScene } from '@visual-guard/core';

const result = await captureScene(resolvedScene, engineContext, { timeout: 30000 });
// result: CaptureResult { sceneId, snapshot, durationMs }
```

### `createLocalBaselineStore(baselineDir)`

创建本地文件系统基线存储实例，实现 `BaselineStore` 接口。

```ts
import { createLocalBaselineStore } from '@visual-guard/core';

const store = createLocalBaselineStore('.visual-guard/baselines');
await store.write(key, bundle);
const baseline = await store.read(key);
```

### Diff

```ts
import { diffPixel, diffDom, diffLayout, diffNetwork, diffPerformance } from '@visual-guard/core';

const pixel = await diffPixel(currentScreenshot, baselineBuf, config.diff);
const dom = await diffDom(currentDomTree, baselineDomTree);
const layout = await diffLayout(currentDomTree, baselineDomTree, config.diff);
const network = await diffNetwork(currentRecords, baselineRecords);
const perf = await diffPerformance(currentMetrics, baselineMetrics);
```

## License

[MIT](./LICENSE) © luhanxin
