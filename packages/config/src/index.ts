export type {
  BrowserConfig,
  DiffConfig,
  ReporterType,
  SceneConfig,
  ViewportConfig,
  VisualGuardConfig
} from '@visual-guard/shared';
// 默认配置
export {DEFAULT_CONFIG, REQUIRED_FIELDS} from './defaults';

// 环境变量覆盖
export {applyEnvOverrides} from './env-override';
// 配置加载
// 配置合并工具
export {loadConfig, shallowMerge as mergeConfig} from './load';
// 配置校验
export {assertValidConfig, validateConfig} from './validate';
