import type {VisualGuardConfig} from '@visual-guard/shared';

/**
 * 默认视口配置
 */
const defaultViewports = [
  {
    name: 'desktop',
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    isMobile: false
  }
];

/**
 * 默认浏览器配置
 */
const defaultBrowser = {
  engine: 'playwright' as const,
  headless: true
};

/**
 * 默认 Diff 配置
 */
const defaultDiff = {
  pixel: {
    threshold: 0.1,
    maxDiffRatio: 0.01,
    includeAA: true
  },
  layout: {
    maxDistance: 4
  }
};

/**
 * 默认性能配置
 */
const defaultPerformance = {
  enabled: false
};

/**
 * 默认报告器
 */
const defaultReporters = ['console'] as const;

/**
 * 默认稳定策略
 */
const defaultStabilize = {
  enabled: true,
  freezeTime: true,
  disableAnimations: true,
  freezeRAF: true,
  freezeInterval: false,
  waitForFonts: true
};

/**
 * Visual Guard 默认配置
 */
export const DEFAULT_CONFIG: Partial<VisualGuardConfig> = {
  env: 'development',
  outputDir: '.visual-guard/reports',
  baselineDir: '.visual-guard/baselines',
  concurrency: 4,
  timeout: 30000,
  retry: 0,
  browser: defaultBrowser,
  viewport: defaultViewports,
  diff: defaultDiff,
  performance: defaultPerformance,
  reporters: [...defaultReporters],
  renderMode: 'auto' as const,
  stabilize: defaultStabilize,
  plugins: []
};

/**
 * 必须显式提供的配置字段
 */
export const REQUIRED_FIELDS: (keyof VisualGuardConfig)[] = ['project', 'baseUrl', 'scenarios'];
