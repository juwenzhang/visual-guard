/**
 * 浏览器引擎名称
 */
export type BrowserEngineName = 'playwright' | 'puppeteer' | 'cypress';

/**
 * 视口配置
 */
export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
}

/**
 * 浏览器配置
 */
export interface BrowserConfig {
  engine: BrowserEngineName;
  headless?: boolean;
  launchOptions?: Record<string, unknown>;
  contextOptions?: Record<string, unknown>;
}

/**
 * Diff 配置
 */
export interface DiffConfig {
  pixel?: {
    threshold?: number;
    maxDiffRatio?: number;
    includeAA?: boolean;
  };
  layout?: {
    maxDistance?: number;
  };
  ignoreRegions?: Array<{
    selector?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }>;
}

/**
 * 性能预算
 */
export interface PerformanceBudget {
  lcp?: number;
  fcp?: number;
  cls?: number;
  ttfb?: number;
  fid?: number;
  inp?: number;
}

/**
 * 性能配置
 */
export interface PerformanceConfig {
  enabled?: boolean;
  budget?: PerformanceBudget;
}

/**
 * 场景配置
 */
export interface SceneConfig {
  id: string;
  name: string;
  path: string;
  tags?: string[];
  waitForSelector?: string;
  waitForTimeout?: number;
  waitForNetworkIdle?: boolean;
  actions?: Array<{
    type: 'click' | 'type' | 'wait' | 'scroll' | 'hover';
    selector?: string;
    value?: string;
    timeout?: number;
  }>;
  elements?: string[];
  ignoreSelectors?: string[];
}

/**
 * 报告格式
 */
export type ReporterType = 'html' | 'json' | 'console' | 'pdf';

/**
 * 主配置
 */
export interface VisualGuardConfig {
  project: string;
  env: string;
  baseUrl: string;
  outputDir?: string;
  baselineDir?: string;
  concurrency?: number;
  timeout?: number;
  retry?: number;
  browser?: BrowserConfig;
  viewport?: ViewportConfig[];
  diff?: DiffConfig;
  performance?: PerformanceConfig;
  scenarios: SceneConfig[];
  reporters?: ReporterType[];
  plugins?: PluginConfig[];
}

/**
 * 插件配置
 */
export interface PluginConfig {
  name: string;
  options?: Record<string, unknown>;
}
