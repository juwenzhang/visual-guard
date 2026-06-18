// 日志工具
export {
  createLogger,
  LogLevel,
  logger,
  useLogger
} from './logger';
// 路径工具
export {
  generateBaselinePath,
  generateReportPath,
  generateSceneUrl,
  generateScreenshotPath,
  normalizePath
} from './path';
// 基线类型
export type {
  BaselineBundle,
  BaselineKey,
  BaselineMeta,
  BaselineQuery,
  BaselineStore,
  CleanPolicy
} from './types/baseline';
// 配置类型
export type {
  BrowserConfig,
  BrowserEngineName as EngineName,
  DiffConfig,
  PerformanceBudget,
  PerformanceConfig,
  PluginConfig,
  ReporterType,
  SceneConfig,
  ViewportConfig,
  VisualGuardConfig
} from './types/config';
// Diff 类型
export type {
  DiffManifest,
  DomDiffResult,
  LayoutDiffResult,
  NetworkChange,
  NetworkDiffResult,
  PerformanceDiffResult,
  PixelDiffResult,
  RunInfo,
  RuntimeError,
  ScenarioResult,
  ScenarioStatus,
  Summary
} from './types/diff';
// 引擎类型
export type {
  BrowserEngineAdapter,
  ConsoleHandler,
  ConsoleMessage,
  CookieInput,
  EngineCapabilities,
  EngineContext,
  EngineContextOptions,
  EngineLaunchOptions,
  EnginePage,
  EngineRuntime,
  GotoOptions,
  RequestHandler,
  RequestInfo,
  ResponseHandler,
  ResponseInfo,
  ScreenshotOptions,
  WaitOptions
} from './types/engine';
// 插件类型
export type {
  HookContext,
  HookHandler,
  HookName,
  PluginAPI,
  VisualGuardPlugin
} from './types/plugin';
// 快照类型
export type {
  AccessibilitySnapshot,
  DomNodeSnapshot,
  NetworkRecord,
  PerformanceMetrics,
  Snapshot
} from './types/snapshot';
// 工具类型
export type {RetryOptions} from './utils';
// 工具函数
export {
  hash,
  retry,
  sleep,
  stableStringify
} from './utils';
