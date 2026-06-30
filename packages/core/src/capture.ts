import type {
  ConsoleMessage,
  EngineContext,
  EnginePage,
  NetworkRecord,
  RequestInfo,
  ResponseInfo,
  Snapshot,
  StabilizeConfig
} from '@visual-guard/shared';
import type {ResolvedScene} from './scene-resolver';

export interface CaptureOptions {
  timeout: number;
  /** 动态内容稳定策略 */
  stabilize?: StabilizeConfig;
}

export interface CaptureResult {
  sceneId: string;
  snapshot: Snapshot;
  durationMs: number;
  /** 采集时的活跃页面引用，用于 afterCapture hook 中的性能采集等操作 */
  page: EnginePage;
}

export async function captureScene(
  resolved: ResolvedScene,
  context: EngineContext,
  options: CaptureOptions
): Promise<CaptureResult> {
  const startTime = Date.now();
  const page = await context.newPage();

  try {
    await page.goto(resolved.url, {
      timeout: options.timeout,
      waitUntil: 'load'
    });

    // 注入页面稳定策略（冻结时间、禁用动画等），再做后续等待和截图
    await injectStabilizers(page, options.stabilize);

    await _waitForPage(resolved, page, options.timeout);
    await _executeActions(resolved, page);

    const fullPageScreenshot = await page.screenshot({
      fullPage: true,
      type: 'png'
    });
    const fullPageBase64 = fullPageScreenshot.toString('base64');

    const elementScreenshots: Record<string, string> = {};
    for (const selector of resolved.scene.elements ?? []) {
      if (page.elementScreenshot) {
        const buf = await page.elementScreenshot(selector, {type: 'png'});
        elementScreenshots[selector] = buf.toString('base64');
      }
    }

    const domTree = await page.evaluate(_serializeDom);

    const networkRecords: NetworkRecord[] = [];
    page.onResponse?.((response: ResponseInfo) => {
      networkRecords.push({
        url: response.url,
        method: '',
        status: response.status,
        requestHeaders: {},
        responseHeaders: response.headers,
        timing: {startTime: Date.now(), responseEnd: Date.now(), duration: 0},
        size: response.body ? response.body.length : 0
      });
    });
    page.onRequest?.((request: RequestInfo) => {
      networkRecords.push({
        url: request.url,
        method: request.method,
        status: 0,
        requestHeaders: request.headers,
        responseHeaders: {},
        timing: {startTime: Date.now(), responseEnd: 0, duration: 0},
        size: request.postData ? request.postData.length : 0
      });
    });

    const consoleMessages: ConsoleMessage[] = [];
    page.onConsole?.((msg: ConsoleMessage) => {
      consoleMessages.push(msg);
    });

    const snapshot: Snapshot = {
      timestamp: new Date().toISOString(),
      url: resolved.url,
      viewport: {
        width: resolved.viewport.width,
        height: resolved.viewport.height,
        deviceScaleFactor: resolved.viewport.deviceScaleFactor ?? 1
      },
      dom: domTree,
      screenshots: {
        fullPage: fullPageBase64,
        elements: Object.keys(elementScreenshots).length > 0 ? elementScreenshots : undefined
      },
      network: networkRecords,
      console: consoleMessages.map(m => ({
        type: m.type,
        text: m.text,
        location: m.location ? `${m.location.url}:${m.location.lineNumber}` : undefined
      }))
    };

    return {
      sceneId: resolved.id,
      snapshot,
      durationMs: Date.now() - startTime,
      page
    };
  } catch (error) {
    // 采集失败时关闭页面
    await page.close();
    throw error;
  }
}

async function _waitForPage(
  resolved: ResolvedScene,
  page: EnginePage,
  timeout: number
): Promise<void> {
  if (resolved.scene.waitForSelector) {
    await page.waitForSelector(resolved.scene.waitForSelector, {timeout});
  }
  if (resolved.scene.waitForTimeout) {
    await new Promise(r => setTimeout(r, resolved.scene.waitForTimeout));
  }
  if (resolved.scene.waitForNetworkIdle && page.waitForNetworkIdle) {
    await page.waitForNetworkIdle({timeout});
  }
}

async function _executeActions(resolved: ResolvedScene, page: EnginePage): Promise<void> {
  for (const action of resolved.scene.actions ?? []) {
    if (action.type === 'click' && action.selector) {
      await page.evaluate((selector: unknown) => {
        const el = document.querySelector(selector as string);
        if (el instanceof HTMLElement) el.click();
      }, action.selector);
    } else if (action.type === 'type' && action.selector && action.value) {
      await page.evaluate(
        (sel: unknown, val: unknown) => {
          const el = document.querySelector(sel as string);
          if (el instanceof HTMLInputElement) el.value = val as string;
        },
        action.selector,
        action.value
      );
    } else if (action.type === 'scroll' && action.value) {
      const px = Number(action.value);
      if (!Number.isNaN(px)) {
        await page.evaluate((scrollPx: unknown) => {
          window.scrollBy(0, scrollPx as number);
        }, px);
      }
    } else if (action.type === 'hover' && action.selector) {
      await page.evaluate((selector: unknown) => {
        const el = document.querySelector(selector as string);
        if (el) el.dispatchEvent(new MouseEvent('mouseenter'));
      }, action.selector);
    } else if (action.type === 'wait' && action.timeout) {
      await new Promise(r => setTimeout(r, action.timeout));
    }
  }
}

/**
 * 注入页面动态内容稳定策略
 *
 * 在 goto 之后、截图之前执行，减少时间戳、动画、字体等动态因素导致的误报。
 * 策略按顺序执行：冻结时间 → 禁用动画 → 冻结 rAF → 冻结 setInterval → 遮罩区域。
 * 字体加载等待在最后执行（异步）。
 */
export async function injectStabilizers(
  page: EnginePage,
  stabilize?: StabilizeConfig
): Promise<void> {
  if (!stabilize?.enabled) return;

  const freezeDate = stabilize.freezeDate ?? new Date().toISOString();

  // 稳定脚本在浏览器上下文中执行
  // biome-ignore lint/suspicious/noExplicitAny: 浏览器 evaluate 上下文，需要操作全局对象
  await (page.evaluate as any)(
    (opts: {
      freezeTime: boolean;
      freezeDate: string;
      disableAnimations: boolean;
      freezeRAF: boolean;
      freezeInterval: boolean;
      maskSelectors: string[] | null;
    }) => {
      // biome-ignore lint/suspicious/noExplicitAny: 浏览器端覆盖全局 Date/rAF/setInterval
      const win = window as any;
      const doc = document;

      // 1. 冻结 Date.now() 和 new Date()
      if (opts.freezeTime) {
        const frozenNow = new Date(opts.freezeDate).getTime();
        const OrigDate = Date;
        const FakeDate = function (this: Date, ...a: unknown[]) {
          if (a.length === 0) return new OrigDate(frozenNow) as Date;
          return new (OrigDate as unknown as new (...args_: unknown[]) => Date)(...a) as Date;
        } as unknown as DateConstructor;
        Object.defineProperty(FakeDate, 'prototype', {value: OrigDate.prototype});
        FakeDate.UTC = OrigDate.UTC;
        FakeDate.parse = OrigDate.parse;
        FakeDate.now = () => frozenNow;
        win.Date = FakeDate;
      }

      // 2. 禁用 CSS animation / transition
      if (opts.disableAnimations) {
        const style = doc.createElement('style');
        style.id = 'vg-stabilize-anim';
        style.textContent =
          '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; animation-delay: 0s !important; transition-delay: 0s !important; }';
        doc.head.appendChild(style);
      }

      // 3. 冻结 requestAnimationFrame
      if (opts.freezeRAF) {
        let rafId = 0;
        win.requestAnimationFrame = (cb: FrameRequestCallback): number => {
          const id = ++rafId;
          setTimeout(() => {
            try {
              cb(performance.now());
            } catch {
              /* 忽略 */
            }
          }, 0);
          return id;
        };
        win.cancelAnimationFrame = () => {};
      }

      // 4. 冻结 setInterval（可选）
      if (opts.freezeInterval) {
        // biome-ignore lint/suspicious/noExplicitAny: 浏览器端 setInterval mock
        win.setInterval = (fn: any) => {
          setTimeout(fn, 0);
          return 0;
        };
      }

      // 5. 遮罩动态区域
      if (opts.maskSelectors && opts.maskSelectors.length > 0) {
        for (let i = 0; i < opts.maskSelectors.length; i++) {
          try {
            const els = doc.querySelectorAll(opts.maskSelectors[i] as string);
            for (let j = 0; j < els.length; j++) {
              const el = els[j] as HTMLElement;
              if (el?.style) {
                el.style.setProperty('background', '#999', 'important');
                el.style.setProperty('color', 'transparent', 'important');
                el.style.setProperty('opacity', '0.3', 'important');
              }
            }
          } catch {
            /* 无效选择器跳过 */
          }
        }
      }
    },
    {
      freezeTime: stabilize.freezeTime ?? true,
      freezeDate,
      disableAnimations: stabilize.disableAnimations ?? true,
      freezeRAF: stabilize.freezeRAF ?? true,
      freezeInterval: stabilize.freezeInterval ?? false,
      maskSelectors: stabilize.maskSelectors ?? null
      // biome-ignore lint/suspicious/noExplicitAny: evaluate 参数需要动态类型
    } as any
  );

  // 6. 等待字体加载完成（异步，独立执行）
  if (stabilize.waitForFonts ?? true) {
    try {
      await page.evaluate(() => document.fonts.ready);
    } catch {
      /* 字体 API 不可用时静默跳过 */
    }
  }
}

// biome-ignore lint/suspicious/noExplicitAny: DOM 序列化返回类型为 any 树
function _serializeDom(): any {
  function serialize(node: Node): unknown {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim();
      return text || null;
    }
    const el = node as Element;
    const children: unknown[] = [];
    for (const child of Array.from(el.childNodes)) {
      const s = serialize(child);
      if (s != null) children.push(s);
    }
    if (el.tagName === undefined) return null;
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
      attrs[attr.name] = attr.value;
    }
    const rect = el.getBoundingClientRect();
    // 使用 getAttribute('class') 兼容 SVG 元素（SVG className 是 SVGAnimatedString 而非 string）
    const cls = el.getAttribute('class') || undefined;

    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: cls,
      attributes: attrs,
      text: children.length === 0 && el.textContent ? el.textContent.trim() : undefined,
      children,
      boundings: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      }
    };
  }

  return serialize(document.documentElement);
}
