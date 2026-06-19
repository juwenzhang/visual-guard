# @visual-guard/config

> Visual Guard 配置加载、校验与环境变量覆盖。

## 安装

```bash
npm install @visual-guard/config
# 或
pnpm add @visual-guard/config
```

## 配置文件参考

配置文件支持以下格式：`.visualguardrc.json`、`.visualguardrc.js`、`visualguard.config.js`、`package.json`（`visualguard` 字段）。

### 最小配置

仅需 3 个必填字段，其余均走默认值：

```json
{
  "project": "my-app",
  "baseUrl": "http://localhost:3000",
  "scenarios": [
    { "id": "home", "name": "首页", "path": "/" }
  ]
}
```

### 🔴 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `project` | `string` | 项目名称 |
| `baseUrl` | `string`（合法 URL） | 被测页面基础地址 |
| `scenarios` | `SceneConfig[]` | 场景列表，至少一个 |

### 🟡 可选字段（有默认值）

#### 运行环境

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `env` | `string` | `"development"` | 环境名称 |
| `outputDir` | `string` | `".visual-guard/reports"` | 报告输出目录 |
| `baselineDir` | `string` | `".visual-guard/baselines"` | 基线存储目录 |
| `concurrency` | `number`（1–32） | `4` | 并发执行数 |
| `timeout` | `number`（ms） | `30000` | 全局超时 |
| `retry` | `number`（≥0） | `0` | 失败重试次数 |

#### `browser` 浏览器配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `browser.engine` | `"playwright" \| "puppeteer" \| "cypress"` | `"playwright"` | 引擎 |
| `browser.headless` | `boolean` | `true` | 无头模式 |
| `browser.launchOptions` | 任意对象 | `{}` | 透传引擎启动参数 |
| `browser.contextOptions` | 任意对象 | `{}` | 透传上下文参数 |

#### `viewport[]` 视口列表

每个元素：

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `name` | `string` | — | 视口名称，如 `"desktop"` |
| `width` | `number`（>0） | `1280` | 宽度（px） |
| `height` | `number`（>0） | `800` | 高度（px） |
| `deviceScaleFactor` | `number`（>0） | `1` | 设备像素比 |
| `isMobile` | `boolean` | `false` | 移动端模拟 |
| `locale` | `string` | — | 语言，如 `"zh-CN"` |
| `timezoneId` | `string` | — | 时区，如 `"Asia/Shanghai"` |
| `userAgent` | `string` | — | 自定义 UA |

默认值：`[{ "name": "desktop", "width": 1280, "height": 800 }]`

#### `diff` 对比配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `diff.pixel.threshold` | `number`（0–1） | `0.1` | 像素差异阈值 |
| `diff.pixel.maxDiffRatio` | `number`（0–1） | `0.01` | 允许的最大差异比例 |
| `diff.pixel.includeAA` | `boolean` | `true` | 包含抗锯齿像素 |
| `diff.layout.maxDistance` | `number`（≥0 整数） | `4` | 元素位移容差（px） |
| `diff.ignoreRegions[]` | 数组 | — | 对比时忽略的区域 |

`ignoreRegions` 中每项：`selector`（CSS 选择器）或 `x, y, width, height`（像素坐标）。

#### `scenarios[]` 场景配置

每个元素：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `string` | 🔴 | 唯一标识符 |
| `name` | `string` | 🔴 | 场景名称 |
| `path` | `string` | 🔴 | 页面路径（相对 baseUrl） |
| `tags` | `string[]` | | 标签，用于筛选 |
| `waitForSelector` | `string` | | 等待 selector 出现 |
| `waitForTimeout` | `number`（≥0） | | 额外等待（ms） |
| `waitForNetworkIdle` | `boolean` | | 等网络空闲 |
| `elements` | `string[]` | | 元素级截图的 selector 列表 |
| `ignoreSelectors` | `string[]` | | diff 时忽略的 selector |
| `actions[]` | 数组 | | 页面交互动作，按序执行 |

`actions` 每项：

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `"click" \| "type" \| "wait" \| "scroll" \| "hover"` | 动作类型 |
| `selector` | `string` | 目标 CSS 选择器 |
| `value` | `string` | 输入文本 / 滚动像素 |
| `timeout` | `number` | 动作超时（ms） |

#### `performance` 性能配置

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `performance.enabled` | `boolean` | `false` | 是否启用 |
| `performance.budget.lcp` | `number`（ms） | — | LCP 预算，推荐 <2500 |
| `performance.budget.fcp` | `number`（ms） | — | FCP 预算，推荐 <1800 |
| `performance.budget.cls` | `number` | — | CLS 预算，推荐 <0.1 |
| `performance.budget.ttfb` | `number`（ms） | — | TTFB 预算，推荐 <800 |
| `performance.budget.fid` | `number`（ms） | — | FID 预算，推荐 <100 |
| `performance.budget.inp` | `number`（ms） | — | INP 预算，推荐 <200 |

#### `reporters` 报告器

| 类型 | 说明 |
|------|------|
| `"console"` | 终端输出（默认） |
| `"json"` | JSON 文件 |
| `"html"` | HTML 报告 |
| `"pdf"` | PDF 报告 |

默认 `["console"]`。

#### `plugins[]` 插件

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | `string` | 插件名称 |
| `options` | 任意对象 | 插件自定义选项 |

默认 `[]`。

## API

### `loadConfig(searchFrom?, explicitPath?)`

异步加载配置文件。

```ts
import { loadConfig } from '@visual-guard/config';

const config = await loadConfig();
```

加载顺序：**cosmiconfig 搜索 → 合并默认值 → 环境变量覆盖 → zod 校验**。

### `validateConfig(config)` / `assertValidConfig(config)`

```ts
import { validateConfig, assertValidConfig } from '@visual-guard/config';

const result = validateConfig(userConfig);
if (!result.ok) console.error(result.errors);

assertValidConfig(userConfig); // 不合法时抛异常
```

### `applyEnvOverrides(config)`

环境变量覆盖（`VG_` 前缀）。

| 环境变量 | 对应字段 |
|----------|----------|
| `VG_ENGINE` | `browser.engine` |
| `VG_HEADLESS` | `browser.headless` |
| `VG_BASE_URL` | `baseUrl` |
| `VG_TIMEOUT` | `timeout` |
| `VG_CONCURRENCY` | `concurrency` |
| `VG_RETRY` | `retry` |
| `VG_ENV` | `env` |
| `VG_OUTPUT_DIR` | `outputDir` |
| `VG_BASELINE_DIR` | `baselineDir` |

### `DEFAULT_CONFIG` / `REQUIRED_FIELDS`

```ts
import { DEFAULT_CONFIG, REQUIRED_FIELDS } from '@visual-guard/config';

DEFAULT_CONFIG;  // 所有默认值
REQUIRED_FIELDS; // ['project', 'baseUrl', 'scenarios']
```

## License

[MIT](./LICENSE) © luhanxin
