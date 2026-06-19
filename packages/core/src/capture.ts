import type {
  ConsoleMessage,
  EngineContext,
  EnginePage,
  NetworkRecord,
  RequestInfo,
  ResponseInfo,
  Snapshot
} from '@visual-guard/shared';
import type {ResolvedScene} from './scene-resolver';

export interface CaptureOptions {
  timeout: number;
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
    return {
      tagName: el.tagName.toLowerCase(),
      id: el.id || undefined,
      className: el.className || undefined,
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
