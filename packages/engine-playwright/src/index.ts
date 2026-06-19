/**
 * @visual-guard/engine-playwright — Playwright 浏览器引擎适配器
 *
 * 将 Playwright API 封装为 Visual Guard 的 BrowserEngineAdapter 接口。
 * SSR 模式通过禁用 serviceWorker + 跳过事件监听，避免流式响应导致的 stream 错误。
 */

import type {
  BrowserEngineAdapter,
  ConsoleHandler,
  CookieInput,
  EngineCapabilities,
  EngineContext,
  EngineContextOptions,
  EngineLaunchOptions,
  EnginePage,
  EngineRuntime,
  RequestHandler,
  ResponseHandler
} from '@visual-guard/shared';
import {
  type Browser,
  type BrowserContext,
  chromium,
  type Page,
  type ConsoleMessage as PwConsoleMessage,
  type Request as PwRequest,
  type Response as PwResponse
} from 'playwright';

const capabilities: EngineCapabilities = {
  fullPageScreenshot: true,
  elementScreenshot: true,
  domSnapshot: true,
  networkInterception: true,
  consoleListening: true,
  multiContext: true,
  lighthouse: false,
  cookies: true,
  extraHTTPHeaders: true
};

export function createPlaywrightAdapter(): BrowserEngineAdapter {
  return {
    name: 'playwright',
    capabilities,
    async launch(options: EngineLaunchOptions): Promise<EngineRuntime> {
      const browser = await chromium.launch({
        headless: options.headless ?? true,
        args: options.args,
        executablePath: options.executablePath
      });
      return createRuntime(browser);
    }
  };
}

function createRuntime(browser: Browser): EngineRuntime {
  return {
    async createContext(options: EngineContextOptions): Promise<EngineContext> {
      const isSsr = options.renderMode === 'ssr';

      const context = await browser.newContext({
        viewport: options.viewport
          ? {width: options.viewport.width, height: options.viewport.height}
          : undefined,
        deviceScaleFactor: options.viewport?.deviceScaleFactor,
        isMobile: options.viewport?.isMobile,
        locale: options.locale,
        timezoneId: options.timezoneId,
        extraHTTPHeaders: options.extraHTTPHeaders,
        // SSR 模式禁用 serviceWorker，阻断流式响应的 request tracking
        serviceWorkers: isSsr ? 'block' : 'allow'
      });

      if (options.cookies && options.cookies.length > 0) {
        await context.addCookies(options.cookies.map(_toPlaywrightCookie));
      }

      return createContext(context, isSsr);
    },

    async close() {
      await browser.close();
    }
  };
}

function createContext(context: BrowserContext, isSsr: boolean): EngineContext {
  return {
    async newPage(): Promise<EnginePage> {
      const page = await context.newPage();
      return createPage(page, isSsr);
    },

    async setCookies(cookies: CookieInput[]): Promise<void> {
      await context.addCookies(cookies.map(_toPlaywrightCookie));
    },

    async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
      await context.setExtraHTTPHeaders(headers);
    },

    async close() {
      await context.close();
    }
  };
}

function createPage(page: Page, isSsr: boolean): EnginePage {
  return {
    async goto(url, options) {
      // SSR 只等 domcontentloaded，不等网络空闲
      await page.goto(url, {
        timeout: options?.timeout,
        waitUntil: isSsr ? 'domcontentloaded' : (options?.waitUntil ?? 'load')
      });
    },

    async waitForSelector(selector, options) {
      await page.waitForSelector(selector, {timeout: options?.timeout, state: options?.state});
    },

    async waitForNetworkIdle(options) {
      // SSR 模式跳过（流式响应会导致死锁）
      if (!isSsr) {
        await page.waitForLoadState('networkidle', {timeout: options?.timeout});
      }
    },

    async evaluate(fn, ...args) {
      return page.evaluate(fn, ...args);
    },

    async screenshot(options) {
      return page.screenshot({
        fullPage: options.fullPage ?? false,
        type: (options.type ?? 'png') as 'png' | 'jpeg',
        quality: options.quality,
        clip: options.clip,
        animations: options.animations
      });
    },

    async elementScreenshot(selector, options) {
      const el = page.locator(selector);
      return el.screenshot({
        type: (options?.type ?? 'png') as 'png' | 'jpeg',
        quality: options?.quality,
        animations: options?.animations
      });
    },

    // SSR 模式跳过事件监听注册，避免 Playwright 追踪流式响应
    onConsole(handler) {
      if (!isSsr) {
        page.on('console', (msg: PwConsoleMessage) => {
          handler({
            type: msg.type() as 'log' | 'warn' | 'error' | 'info' | 'debug',
            text: msg.text(),
            location: msg.location()
          });
        });
      }
    },

    onRequest(handler) {
      if (!isSsr) {
        page.on('request', (req: PwRequest) => {
          handler({
            url: req.url(),
            method: req.method(),
            headers: req.headers(),
            postData: req.postData() ?? undefined
          });
        });
      }
    },

    onResponse(handler) {
      if (!isSsr) {
        page.on('response', (res: PwResponse) => {
          handler({
            url: res.url(),
            status: res.status(),
            statusText: res.statusText(),
            headers: res.headers()
          });
        });
      }
    },

    async close() {
      page.removeAllListeners();
      await page.close();
    }
  };
}

function _toPlaywrightCookie(c: CookieInput) {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain ?? '',
    path: c.path ?? '/',
    expires: c.expires ?? -1,
    httpOnly: c.httpOnly ?? false,
    secure: c.secure ?? false,
    sameSite: (c.sameSite ?? 'None') as 'Strict' | 'Lax' | 'None'
  };
}
