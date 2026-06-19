# @visual-guard/shared

> Visual Guard 共享类型定义与工具函数，供所有子包使用。

## 安装

```bash
npm install @visual-guard/shared
# 或
pnpm add @visual-guard/shared
```

## 包含内容

### 类型定义

| 模块 | 说明 |
|------|------|
| `types/engine` | `BrowserEngineAdapter`、`EngineRuntime`、`EngineContext`、`EnginePage` 等浏览器引擎抽象接口 |
| `types/config` | `VisualGuardConfig`、`SceneConfig`、`ViewportConfig`、`DiffConfig` 等配置类型 |
| `types/snapshot` | `Snapshot`、`DomNodeSnapshot`、`NetworkRecord`、`PerformanceMetrics` 等快照类型 |
| `types/baseline` | `BaselineKey`、`BaselineBundle`、`BaselineStore`、`BaselineQuery` 等基线类型 |
| `types/diff` | `DiffManifest`、`ScenarioResult`、`PixelDiffResult`、`DomDiffResult` 等对比结果类型 |
| `types/plugin` | `VisualGuardPlugin`、`PluginAPI`、`HookName` 等插件系统类型 |

### 工具函数

| 函数 | 说明 |
|------|------|
| `hash(str)` | SHA-1 哈希 |
| `sleep(ms)` | 异步等待 |
| `retry(fn, options)` | 重试机制（支持固定/指数退避） |
| `stableStringify(obj)` | 稳定 JSON 序列化（key 有序） |
| `generateSceneUrl(baseUrl, scene)` | 生成场景访问 URL |
| `generateBaselinePath(key, baseDir)` | 生成基线存储路径 |
| `generateScreenshotPath(basePath, type, elementName?)` | 生成截图路径 |
| `generateReportPath(outputDir, runId, format)` | 生成报告路径 |
| `normalizePath(inputPath)` | 规范化路径分隔符 |

### 日志

| 导出 | 说明 |
|------|------|
| `logger` | 默认日志实例 |
| `createLogger(options?)` | 创建自定义日志实例 |
| `useLogger(tag)` | 带标签的日志工厂 |
| `LogLevel` | 日志级别枚举 |

## 用法

```ts
import {
  VisualGuardConfig,
  SceneConfig,
  BaselineStore,
  BrowserEngineAdapter,
  DiffManifest,
} from '@visual-guard/shared';
import { logger, useLogger } from '@visual-guard/shared';
import { hash, sleep, generateSceneUrl } from '@visual-guard/shared';
```

## License

[MIT](./LICENSE) © luhanxin
