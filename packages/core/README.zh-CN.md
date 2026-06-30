# @visual-guard/core

> Visual Guard 核心运行包 — 场景解析、页面采集、基线存储、多维对比与结果聚合。

## 安装

```bash
pnpm add @visual-guard/core
```

## 架构

```
resolveScenes()        →  viewport × scene 笛卡尔积展开
captureScene()         →  浏览器采集（截图 / DOM / 网络 / 控制台）
  injectStabilizers()  →  截图前冻结 Date/动画以降低误报
createLocalBaselineStore() → 本地文件系统基线读写
diffPixel/diffDom/diffLayout/diffNetwork/diffPerformance → 五维对比
generateSemanticReport() → 生成人类/AI 可读的变化描述
run()                  →  全流程编排 → DiffManifest
```

## 核心特性

### 动态内容稳定化 (`injectStabilizers`)

截图前向页面注入稳定策略，减少时间戳、动画等动态因素导致的误报：

| 策略 | 默认值 | 说明 |
|------|--------|------|
| `freezeTime` | `true` | 冻结 `Date.now()` 和 `new Date()` |
| `disableAnimations` | `true` | 禁用 CSS 动画和过渡 |
| `freezeRAF` | `true` | 将 `requestAnimationFrame` 替换为同步回调 |
| `freezeInterval` | `false` | 将 `setInterval` 替换为单次 `setTimeout` |
| `waitForFonts` | `true` | 等待 `document.fonts.ready` 完成 |
| `maskSelectors` | — | 用纯色块遮罩指定 CSS 选择器区域 |

通过 `VisualGuardConfig` 中的 `stabilize` 字段配置。

### 语义化差异 (`generateSemanticReport`)

将底层 diff 算法输出转化为结构化、自然语言描述：

```json
{
  "type": "visual",
  "severity": "high",
  "description": "页面像素差异比例为 8.06%，存在明显视觉差异",
  "element": ".header"
}
```

AI 分析插件和通知插件可直接消费此数据。

### 分支自动检测

`run()` 自动检测当前 Git 分支名：
1. 环境变量 (`VG_BRANCH`, `CI_COMMIT_BRANCH` 等)
2. `git rev-parse --abbrev-ref HEAD`
3. 兜底 `"unknown"`

## API

### `run(options)`

核心入口，执行完整流水线：

```ts
import { run } from '@visual-guard/core';

const manifest = await run({ config, adapter, writeBaseline: false });
// manifest: DiffManifest { version, run, summary, scenarios }
```

### `captureScene(resolved, context, options)`

采集单个场景的页面快照。

```ts
import { captureScene } from '@visual-guard/core';
import type { StabilizeConfig } from '@visual-guard/shared';

const result = await captureScene(scene, context, {
  timeout: 30000,
  stabilize: { freezeTime: true, disableAnimations: true }
});
```

### `injectStabilizers(page, stabilize?)`

在截图前注入页面稳定策略，`captureScene` 会自动调用。

### `generateSemanticReport(scenarioResult)`

为单个场景生成人类可读的差异摘要。

```ts
import { generateSemanticReport } from '@visual-guard/core';

const report = generateSemanticReport(scenarioResult);
// SemanticDiffReport { changes: SemanticChange[] }
```

### Diff 函数

```ts
import { diffPixel, diffDom, diffLayout, diffNetwork, diffPerformance } from '@visual-guard/core';

const pixel = await diffPixel(currentBuf, baselineBuf, config.diff);
const dom = diffDom(currentTree, baselineTree);
const layout = diffLayout(currentTree, baselineTree, config.diff);
const network = diffNetwork(currentRecords, baselineRecords);
const perf = await diffPerformance(currentMetrics, baselineMetrics);
```

### `createLocalBaselineStore(baselineDir)`

创建本地文件系统基线存储。

```ts
import { createLocalBaselineStore } from '@visual-guard/core';

const store = createLocalBaselineStore('.visual-guard/baselines');
await store.write(key, bundle);
const baseline = await store.read(key);
```

## License

[MIT](./LICENSE) © luhanxin
