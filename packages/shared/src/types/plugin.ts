import type {DiffManifest, RuntimeError, ScenarioResult} from './diff';

/**
 * 生命周期钩子名称
 */
export type HookName =
  | 'beforeRun'
  | 'afterRun'
  | 'beforeScenario'
  | 'afterScenario'
  | 'beforeCapture'
  | 'afterCapture'
  | 'beforeCompare'
  | 'afterCompare'
  | 'onError'
  | 'onWarning';

/**
 * 钩子上下文
 */
export interface HookContext {
  runId: string;
  project: string;
  env: string;
  branch: string;
  scenario?: {
    id: string;
    name: string;
    url: string;
  };
  manifest?: DiffManifest;
  scenarioResult?: ScenarioResult;
  error?: RuntimeError;
  warning?: string;
}

/**
 * 钩子处理函数
 */
export type HookHandler = (context: HookContext) => void | Promise<void>;

/**
 * 插件 API
 */
export interface PluginAPI {
  on(hookName: HookName, handler: HookHandler): void;
  off(hookName: HookName, handler: HookHandler): void;
  emit(hookName: HookName, context: HookContext): Promise<void>;
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
