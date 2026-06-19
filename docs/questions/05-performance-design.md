# Visual Guard 性能评测方案

> 状态：方案探讨 | 日期：2026-06-20 | 依赖：[03-plugin-mechanism-design](./03-plugin-mechanism-design.md)

## 一、性能评测方案

### 1.1 Lighthouse 可行性评估

**可接入**，但有代价：

| 接入方式 | 复杂度 | 问题 |
|----------|--------|------|
| `playwright-lighthouse` npm 包 | 中 | 需要 `--remote-debugging-port` 启动参数，额外依赖，与 Playwright/Puppeteer 版本绑定 |
| Lighthouse CLI 子进程 | 低 | 需要独立启动浏览器，不能复用已有 page |
| Lighthouse Node API (`lighthouse(url, {port})`) | 中 | 需要 CDP port，lighthouse 内置 puppeteer-core 可能版本冲突 |

**结论**：Lighthouse 作为远期可选增强，MVP 阶段使用更轻量的方案。

### 1.2 MVP 推荐方案：page.evaluate() + web-vitals + CDP Performance

**方案 A（推荐）**：`page.evaluate()` 注入 web-vitals 采集

```ts
// 在 afterCapture 阶段，plugin-perf 通过 enginePage 注入采集
await enginePage.evaluate(() => {
  // 注入 web-vitals 或手写 PerformanceObserver
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      // 收集 LCP
    }
  }).observe({ type: 'largest-contentful-paint', buffered: true });
});
```

**方案 B**：CDP Performance 域（需要 EnginePage 暴露 `getCDPSession()`）

```ts
const cdp = await enginePage.getCDPSession?.();
await cdp.send('Performance.enable');
const metrics = await cdp.send('Performance.getMetrics');
```

**推荐组合**：方案 A（web-vitals）+ 现有 `performance.evaluate()` 收集 Navigation Timing，足以产出 Core Web Vitals 报告。方案 B 作为可选增强，需改造 EnginePage 接口。

### 1.3 现有架构已具备的能力

`Snapshot.performance` 已定义完整的 `PerformanceMetrics` 类型：

```ts
interface PerformanceMetrics {
  navigation: { domContentLoaded, load, firstPaint?, firstContentfulPaint?,
                largestContentfulPaint?, cumulativeLayoutShift?,
                timeToFirstByte?, interactionToNextPaint? };
  resources: Array<{ url, type, size, duration, startTime }>;
  memory?: { jsHeapSizeLimit, totalJSHeapSize, usedJSHeapSize };
  longTasks?: Array<{ startTime, duration }>;
}
```

当前 capture 并**未填充**`performance` 字段，plugin-perf 可直接在 `afterCapture` hook 中填充。

### 1.4 性能评测流程

```text
afterCapture hook:
  1. enginePage.evaluate() → 收集 Navigation Timing API 数据
  2. enginePage.evaluate() → 注入 PerformanceObserver 收集 LCP/FCP/CLS/INP
  3. 填充 snapshot.performance
  → 后续 diffPerformance() 自动对比基线

afterCompare hook (performance regression detected):
  1. 读取 performance diff 结果
  2. 检查 budget 是否超出
  3. 生成性能退化报告

afterReport hook:
  1. 合并视觉报告 + 性能报告 → 统一输出
```

### 二、性能采集技术深探

 性能采集技术深探

#### 二、性能采集技术深探

.1 各指标的可采集性验证

| 指标 | `page.evaluate()` | Playwright `page.metrics()` | CDP `Performance.getMetrics()` | 可靠性 |
|------|:-:|:-:|:-:|------|
| **FCP** (首次内容绘制) | ✅ `PerformanceObserver` buffered | ✅ 有 | ✅ 有 | 高 |
| **LCP** (最大内容绘制) | ✅ `PerformanceObserver` buffered + 等待稳定 | ❌ 无 | ❌ 无 | 中 — 需要等页面稳定后取值 |
| **CLS** (累计布局偏移) | ✅ `PerformanceObserver` buffered 累加 | ❌ 无 | ❌ 无 | 中 — 需要观察整个页面生命周期 |
| **TTFB** (首字节时间) | ✅ `NavigationTiming` | ❌ 无 | ❌ 无 | 高 |
| **DOMContentLoaded** | ✅ `NavigationTiming` | ❌ 无 | ❌ 无 | 高 |
| **Load** | ✅ `NavigationTiming` | ❌ 无 | ❌ 无 | 高 |
| **INP** (交互到下次绘制) | ❌ 需要真实用户交互 | ❌ 无 | ❌ 无 | 不可用 — MVP 不做 |
| **FID** (首次输入延迟) | ❌ 需要真实用户交互 | ❌ 无 | ❌ 无 | 不可用 — MVP 不做 |

**关键发现**：Playwright 的 `page.metrics()` 仅提供 FP/FCP/FMP，**不包含 LCP 和 CLS**。必须用 `page.evaluate()` 注入 PerformanceObserver。

#### 二、性能采集技术深探

.2 LCP 采集难点与对策

LCP 的问题在于它是**动态变化的**——页面加载过程中 LCP 元素可能从文本→图片→大图逐步变大。需要在合适的时间点截断观察。

```ts
// 正确的 LCP 采集方式
async function collectLCP(page: EnginePage): Promise<number | undefined> {
  return page.evaluate(() => {
    return new Promise<number | undefined>((resolve) => {
      let lcpValue: number | undefined;

      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        // LCP 取最后一个 entry（即最终的最大值）
        if (entries.length > 0) {
          lcpValue = entries[entries.length - 1]!.startTime;
        }
      });

      observer.observe({ type: 'largest-contentful-paint', buffered: true });

      // 等待 LCP 稳定：5s 超时或用户交互后 1s
      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(lcpValue);
      }, 5000);

      // 如果有交互（click/scroll/keydown），提前 1s 结束
      ['click', 'keydown', 'scroll'].forEach((event) => {
        document.addEventListener(event, () => {
          clearTimeout(timeout);
          setTimeout(() => {
            observer.disconnect();
            resolve(lcpValue);
          }, 1000);
        }, { once: true });
      });
    });
  });
}
```

#### 二、性能采集技术深探

.3 CLS 采集难点与对策

CLS 在整个页面生命周期中累积，**必须使用 buffered 模式**才能回溯到页面加载初期的 layout shift。

```ts
async function collectCLS(page: EnginePage): Promise<number | undefined> {
  return page.evaluate(() => {
    return new Promise<number | undefined>((resolve) => {
      let clsValue = 0;

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // 忽略用户交互触发的 shift
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
          }
        }
      });

      // buffered: true 获取页面加载到当前的累计数据
      observer.observe({ type: 'layout-shift', buffered: true });

      // 5s 后截断（自动化测试不需要无限等待）
      setTimeout(() => {
        observer.disconnect();
        resolve(clsValue);
      }, 5000);
    });
  });
}
```

#### 二、性能采集技术深探

.4 Navigation Timing 采集

```ts
async function collectNavigationTiming(page: EnginePage): Promise<{
  domContentLoaded: number;
  load: number;
  ttfb: number;
  fcp: number | undefined;
}> {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const paint = performance.getEntriesByType('paint');

    return {
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
      load: Math.round(nav.loadEventEnd - nav.startTime),
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      fcp: paint.find(e => e.name === 'first-contentful-paint')?.startTime
        ? Math.round(paint.find(e => e.name === 'first-contentful-paint')!.startTime)
        : undefined
    };
  });
}
```

#### 二、性能采集技术深探

.5 完整采集流程（合并版）

```ts
// plugin-perf 在 afterCapture hook 中执行
async function collectAllPerformance(page: EnginePage): Promise<PerformanceMetrics> {
  const [nav, lcp, cls] = await Promise.all([
    collectNavigationTiming(page),
    collectLCP(page),
    collectCLS(page)
  ]);

  return {
    navigation: {
      domContentLoaded: nav.domContentLoaded,
      load: nav.load,
      timeToFirstByte: nav.ttfb,
      firstContentfulPaint: nav.fcp,
      largestContentfulPaint: lcp ? Math.round(lcp) : undefined,
      cumulativeLayoutShift: cls
    },
    resources: [],
    // 采样总耗时 5s，不监控 longTasks（可后续加入）
  };
}
```

#### 二、性能采集技术深探

.6 Perf Budget 检查与报告

```ts
interface PerfBudget {
  lcp?: number;   // ms, 推荐 < 2500
  fcp?: number;   // ms, 推荐 < 1800
  cls?: number;   // 无单位, 推荐 < 0.1
  ttfb?: number;  // ms, 推荐 < 800
}

function checkBudget(
  metrics: PerformanceMetrics,
  budget: PerfBudget
): Array<{ metric: string; value: number; budget: number; exceeded: boolean }> {
  const checks: Array<{ metric: string; value: number; budget: number }> = [];

  if (budget.lcp && metrics.navigation.largestContentfulPaint)
    checks.push({ metric: 'LCP', value: metrics.navigation.largestContentfulPaint, budget: budget.lcp });
  if (budget.fcp && metrics.navigation.firstContentfulPaint)
    checks.push({ metric: 'FCP', value: metrics.navigation.firstContentfulPaint, budget: budget.fcp });
  if (budget.cls && metrics.navigation.cumulativeLayoutShift)
    checks.push({ metric: 'CLS', value: metrics.navigation.cumulativeLayoutShift, budget: budget.cls });
  if (budget.ttfb && metrics.navigation.timeToFirstByte)
    checks.push({ metric: 'TTFB', value: metrics.navigation.timeToFirstByte, budget: budget.ttfb });

  return checks.map(c => ({
    ...c,
    exceeded: c.value > c.budget
  }));
}
```

#### 二、性能采集技术深探

.7 与现有 diffPerformance 的对接

现有 `diffPerformance()` 对比 `current.performance` vs `baseline.performance` 需要**数字值**。Plugin-perf 填充 `snapshot.performance` 后，后续流程自动生效，无需修改 diff 逻辑：

```text
afterCapture        → plugin-perf 填充 snapshot.performance（新增）
store.write(key)    → bundle.performance（已有，自动序列化）
store.read(key)     → baseline.performance（已有，自动反序列化）
diffPerformance()   → 对比 current vs baseline（已有，自动生效）
```

