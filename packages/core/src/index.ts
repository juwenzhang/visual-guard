export type {
  BaselineBundle,
  BaselineKey,
  BaselineMeta,
  BaselineQuery,
  BaselineStore,
  BrowserEngineAdapter,
  CleanPolicy,
  DiffManifest,
  DomDiffResult,
  EngineContext,
  EnginePage,
  EngineRuntime,
  LayoutDiffResult,
  NetworkDiffResult,
  PerformanceDiffResult,
  PixelDiffResult,
  ScenarioResult,
  SceneConfig,
  Snapshot,
  Summary,
  ViewportConfig,
  VisualGuardConfig
} from '@visual-guard/shared';
// 基线存储
export {createLocalBaselineStore} from './baseline-store';
export type {CaptureOptions, CaptureResult} from './capture';
// 页面采集
export {captureScene} from './capture';
// 多维对比
export {
  diffDom,
  diffLayout,
  diffNetwork,
  diffPerformance,
  diffPixel
} from './diff';
// Plugin 系统
export {PluginEventBus} from './plugin-event-bus';
export {loadPlugins} from './plugin-loader';
export type {RunnerOptions} from './runner';
// 核心运行器
export {run} from './runner';
export type {ResolvedScene} from './scene-resolver';
// 场景解析
export {resolveScenes} from './scene-resolver';
export type {
  HookContext,
  HookEvents,
  HookName,
  PluginAPI,
  VisualGuardPlugin
} from './types';
