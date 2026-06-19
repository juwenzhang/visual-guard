import type {PluginAPI, VisualGuardPlugin} from '@visual-guard/core';
import {HOOK_NAMES} from '@visual-guard/core';
import type {EnginePage, PerformanceMetrics} from '@visual-guard/shared';

/**
 * 性能预算指标名称常量（SSOT）
 */
export const PERF_BUDGET_KEYS = {
  LCP: 'lcp',
  FCP: 'fcp',
  CLS: 'cls',
  TTFB: 'ttfb'
} as const;

export type PerfBudgetKey = (typeof PERF_BUDGET_KEYS)[keyof typeof PERF_BUDGET_KEYS];

/**
 * 性能预算配置
 */
export interface PerfBudget {
  lcp?: number;
  fcp?: number;
  cls?: number;
  ttfb?: number;
}

/**
 * 采集 Navigation Timing 指标
 */
async function collectNavigationTiming(page: EnginePage): Promise<{
  domContentLoaded: number;
  load: number;
  ttfb: number;
  fcp: number | undefined;
}> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (!nav) {
      return {domContentLoaded: 0, load: 0, ttfb: 0, fcp: undefined};
    }

    const paint = performance.getEntriesByType('paint');
    const fcpEntry = paint.find(e => e.name === 'first-contentful-paint');

    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      fcp: fcpEntry ? Math.round(fcpEntry.startTime) : undefined
    };
  });
}

/**
 * 采集 LCP（最大内容绘制）
 *
 * LCP 在页面加载过程中可能多次更新（文本 → 图片 → 大图），需要等待稳定。
 * 策略：5s 后截断，或用户交互后 1s 截断。
 */
async function collectLCP(page: EnginePage): Promise<number | undefined> {
  return page.evaluate(() => {
    return new Promise<number | undefined>(resolve => {
      let lcpValue: number | undefined;

      const observer = new PerformanceObserver(list => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1]!.startTime;
        }
      });

      observer.observe({type: 'largest-contentful-paint', buffered: true});

      let resolved = false;
      const finish = (value: number | undefined) => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        resolve(value);
      };

      // 5s 超时截断
      const timeout = setTimeout(() => finish(lcpValue), 5000);

      // 用户交互后 1s 截断
      ['click', 'keydown', 'scroll'].forEach(event => {
        document.addEventListener(
          event,
          () => {
            clearTimeout(timeout);
            setTimeout(() => finish(lcpValue), 1000);
          },
          {once: true}
        );
      });
    });
  });
}

/**
 * 采集 CLS（累计布局偏移）
 *
 * CLS 在整个页面生命周期中累积，需要排除用户交互触发的 shift。
 */
async function collectCLS(page: EnginePage): Promise<number | undefined> {
  return page.evaluate(() => {
    return new Promise<number | undefined>(resolve => {
      let clsValue = 0;
      let resolved = false;

      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
      });

      observer.observe({type: 'layout-shift', buffered: true});

      const finish = () => {
        if (resolved) return;
        resolved = true;
        observer.disconnect();
        resolve(clsValue);
      };

      // 5s 后截断
      setTimeout(finish, 5000);

      // 用户交互后 1s 截断
      ['click', 'keydown', 'scroll'].forEach(event => {
        document.addEventListener(
          event,
          () => {
            setTimeout(finish, 1000);
          },
          {once: true}
        );
      });
    });
  });
}

/**
 * 创建 perf plugin
 */
export function createPerfPlugin(): VisualGuardPlugin {
  return {
    name: 'perf',

    async setup(api: PluginAPI) {
      const options = api.getConfig();
      const log = api.getLogger();

      api.on(HOOK_NAMES.AfterCapture, async ctx => {
        const page = ctx.enginePage;
        if (!page) return;

        try {
          const [nav, lcp, cls] = await Promise.all([
            collectNavigationTiming(page),
            collectLCP(page),
            collectCLS(page)
          ]);

          const metrics: PerformanceMetrics = {
            navigation: {
              domContentLoaded: nav.domContentLoaded,
              load: nav.load,
              timeToFirstByte: nav.ttfb,
              firstContentfulPaint: nav.fcp,
              largestContentfulPaint: lcp ? Math.round(lcp) : undefined,
              cumulativeLayoutShift: cls
            },
            resources: []
          };

          // 填充 snapshot.performance，供 diffPerformance() 使用
          if (ctx.snapshot) {
            ctx.snapshot.performance = metrics;
          }

          const scenarioName = ctx.scenario?.name ?? 'unknown';
          const lcpStr = lcp ? `${Math.round(lcp)}ms` : 'N/A';
          const clsStr = cls !== undefined ? cls.toFixed(3) : 'N/A';
          log.warn(
            `[perf] ${scenarioName}: LCP=${lcpStr}, CLS=${clsStr}, FCP=${nav.fcp ?? 'N/A'}ms, TTFB=${nav.ttfb}ms`
          );

          // Budget 检查（如果配置了）
          const budget = options['budget'] as PerfBudget | undefined;
          if (budget) {
            checkBudget(metrics, budget, log);
          }
        } catch (_error: unknown) {
          const error = _error as Error;
          log.warn(`[perf] 性能采集失败: ${error?.message ?? String(_error)}`);
        }
      });
    }
  };
}

/**
 * 检查性能指标是否超预算
 */
function checkBudget(
  metrics: PerformanceMetrics,
  budget: PerfBudget,
  log: {warn: (msg: string) => void}
): void {
  const K = PERF_BUDGET_KEYS;
  const checks: Array<{label: string; value: number | undefined; budget: number}> = [];

  if (budget.lcp && metrics.navigation.largestContentfulPaint !== undefined) {
    checks.push({
      label: K.LCP.toUpperCase(),
      value: metrics.navigation.largestContentfulPaint,
      budget: budget.lcp
    });
  }
  if (budget.fcp && metrics.navigation.firstContentfulPaint !== undefined) {
    checks.push({
      label: K.FCP.toUpperCase(),
      value: metrics.navigation.firstContentfulPaint,
      budget: budget.fcp
    });
  }
  if (budget.cls !== undefined && metrics.navigation.cumulativeLayoutShift !== undefined) {
    checks.push({
      label: K.CLS.toUpperCase(),
      value: metrics.navigation.cumulativeLayoutShift,
      budget: budget.cls
    });
  }
  if (budget.ttfb && metrics.navigation.timeToFirstByte !== undefined) {
    checks.push({
      label: K.TTFB.toUpperCase(),
      value: metrics.navigation.timeToFirstByte,
      budget: budget.ttfb
    });
  }

  for (const check of checks) {
    if (check.value !== undefined && check.value > check.budget) {
      log.warn(`[perf] ${check.label} 超出预算: ${check.value} > ${check.budget}`);
    }
  }
}

export default createPerfPlugin;
