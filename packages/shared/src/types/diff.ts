/**
 * 场景状态
 */
export type ScenarioStatus = 'passed' | 'changed' | 'failed' | 'errored';

/**
 * 运行时错误
 */
export interface RuntimeError {
  message: string;
  stack?: string;
  scenarioId?: string;
  sceneName?: string;
  element?: string;
}

/**
 * 像素对比结果
 */
export interface PixelDiffResult {
  totalPixels: number;
  diffPixels: number;
  diffRatio: number;
  diffImage?: string;
  regions?: Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    diffRatio: number;
  }>;
}

/**
 * DOM 对比结果
 */
export interface DomDiffResult {
  added: Array<Record<string, unknown>>;
  removed: Array<Record<string, unknown>>;
  changed: Array<{
    path: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  unchanged: number;
  changeRatio: number;
}

/**
 * 布局对比结果
 */
export interface LayoutDiffResult {
  moved: Array<{
    selector: string;
    oldBounds: {x: number; y: number; width: number; height: number};
    newBounds: {x: number; y: number; width: number; height: number};
    distance: number;
  }>;
  resized: Array<{
    selector: string;
    oldBounds: {x: number; y: number; width: number; height: number};
    newBounds: {x: number; y: number; width: number; height: number};
  }>;
  changeCount: number;
}

/**
 * 网络对比结果
 */
export interface NetworkDiffResult {
  added: NetworkChange[];
  removed: NetworkChange[];
  timingChanges: Array<{
    url: string;
    oldDuration: number;
    newDuration: number;
    changeRatio: number;
  }>;
  sizeChanges: Array<{
    url: string;
    oldSize: number;
    newSize: number;
    changeBytes: number;
  }>;
}

/**
 * 网络变化
 */
export interface NetworkChange {
  url: string;
  method: string;
  status: number;
  size: number;
  duration: number;
}

/**
 * 性能对比结果
 */
export interface PerformanceDiffResult {
  regressions: Array<{
    metric: string;
    baseline: number;
    current: number;
    change: number;
    changeRatio: number;
    budget?: number;
    budgetExceeded?: boolean;
  }>;
  improvements: Array<{
    metric: string;
    baseline: number;
    current: number;
    change: number;
    changeRatio: number;
  }>;
  summary: {
    totalMetrics: number;
    regressed: number;
    improved: number;
    unchanged: number;
  };
}

/**
 * 场景结果
 */
export interface ScenarioResult {
  id: string;
  name: string;
  url: string;
  status: ScenarioStatus;
  durationMs: number;
  artifacts: {
    baselineScreenshot?: string;
    currentScreenshot?: string;
    diffScreenshot?: string;
    domSnapshot?: string;
  };
  diffs: {
    pixel?: PixelDiffResult;
    dom?: DomDiffResult;
    layout?: LayoutDiffResult;
    network?: NetworkDiffResult;
    performance?: PerformanceDiffResult;
  };
  errors: RuntimeError[];
  warnings?: string[];
}

/**
 * 运行信息
 */
export interface RunInfo {
  id: string;
  project: string;
  env: string;
  branch: string;
  commit?: string;
  startedAt: string;
  endedAt: string;
}

/**
 * 汇总信息
 */
export interface Summary {
  total: number;
  passed: number;
  failed: number;
  changed: number;
  errored: number;
  pixelDiffCount: number;
  domDiffCount: number;
  layoutDiffCount: number;
  networkDiffCount: number;
  performanceRegressionCount: number;
}

/**
 * Diff Manifest（统一输出协议）
 */
export interface DiffManifest {
  version: string;
  run: RunInfo;
  summary: Summary;
  scenarios: ScenarioResult[];
}
