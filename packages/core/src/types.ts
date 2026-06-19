import type {
  DiffManifest,
  EnginePage,
  RuntimeError,
  ScenarioResult,
  Snapshot,
  VisualGuardConfig
} from '@visual-guard/shared';

/**
 * Plugin 生命周期钩子名称（联合类型）
 */
export type HookName =
  | 'beforeRun'
  | 'afterRun'
  | 'beforeCapture'
  | 'afterCapture'
  | 'beforeScreenshot'
  | 'afterScreenshot'
  | 'beforeCompare'
  | 'afterCompare'
  | 'afterReport'
  | 'onError'
  | 'onWarning';

/**
 * Plugin 生命周期钩子名称常量（用于 emit/on 调用，避免裸字符串拼写错误）
 */
export const HOOK_NAMES = {
  BeforeRun: 'beforeRun',
  AfterRun: 'afterRun',
  BeforeCapture: 'beforeCapture',
  AfterCapture: 'afterCapture',
  BeforeScreenshot: 'beforeScreenshot',
  AfterScreenshot: 'afterScreenshot',
  BeforeCompare: 'beforeCompare',
  AfterCompare: 'afterCompare',
  AfterReport: 'afterReport',
  OnError: 'onError',
  OnWarning: 'onWarning'
} as const;

/**
 * 钩子上下文 — 按 hook 类型分步注入不同数据
 */
export interface HookContext {
  runId: string;
  project: string;
  env: string;
  branch: string;
  config: VisualGuardConfig;

  scenario?: {
    id: string;
    name: string;
    url: string;
    viewport: {width: number; height: number; deviceScaleFactor: number};
  };

  enginePage?: EnginePage;
  snapshot?: Snapshot;
  scenarioResult?: ScenarioResult;
  manifest?: DiffManifest;
  reportFiles?: string[];
  error?: RuntimeError;
  warning?: string;
  data?: Record<string, unknown>;
}

/**
 * mitt 事件类型映射
 */
export type HookEvents = {
  [K in HookName]: HookContext;
};

/**
 * 插件 API
 */
export interface PluginAPI {
  on<K extends keyof HookEvents>(
    name: K,
    handler: (context: HookEvents[K]) => void | Promise<void>
  ): void;
  off<K extends keyof HookEvents>(
    name: K,
    handler: (context: HookEvents[K]) => void | Promise<void>
  ): void;
  emit<K extends keyof HookEvents>(name: K, context: HookEvents[K]): Promise<void>;
  getConfig(): Record<string, unknown>;
  getLogger(): {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug(message: string): void;
  };
}

/**
 * 插件接口
 */
export interface VisualGuardPlugin {
  name: string;
  setup(api: PluginAPI): void | Promise<void>;
}
