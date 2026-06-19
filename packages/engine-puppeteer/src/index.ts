/**
 * @visual-guard/engine-puppeteer — Puppeteer 浏览器引擎适配器
 *
 * 将 Puppeteer API 封装为 Visual Guard 的 BrowserEngineAdapter 接口。
 * 实现与 engine-playwright 同构的采集输出，能力略有降级。
 */

import {execSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import type {
  BrowserEngineAdapter,
  CookieInput,
  EngineCapabilities,
  EngineContext,
  EngineContextOptions,
  EngineLaunchOptions,
  EnginePage,
  EngineRuntime
} from '@visual-guard/shared';
import {logger} from '@visual-guard/shared';
import type {
  Browser,
  Page,
  ConsoleMessage as PpConsoleMessage,
  HTTPRequest as PpRequest,
  HTTPResponse as PpResponse
} from 'puppeteer';

type PuppeteerModule = {
  launch(options?: {
    headless?: boolean | 'new';
    args?: string[];
    executablePath?: string;
  }): Promise<Browser>;
  executablePath(): string;
};

function _loadPuppeteer(): PuppeteerModule {
  const requireFromProject = createRequire(join(process.cwd(), 'package.json'));
  const mod = requireFromProject('puppeteer') as {default?: PuppeteerModule} & PuppeteerModule;
  return mod.default ?? mod;
}

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

export function createPuppeteerAdapter(): BrowserEngineAdapter {
  return {
    name: 'puppeteer',
    capabilities,
    async launch(options: EngineLaunchOptions): Promise<EngineRuntime> {
      const puppeteer = _loadPuppeteer();

      try {
        const browser = await puppeteer.launch({
          headless: options.headless ?? true,
          args: options.args ?? ['--no-sandbox'],
          executablePath: options.executablePath
        });
        return createRuntime(browser);
      } catch (error) {
        if (
          !options.executablePath &&
          error instanceof Error &&
          error.message.includes('Could not find Chrome')
        ) {
          try {
            logger.info('Puppeteer 正在自动安装 Chrome（首次约 300MB，仅需一次）...');
            execSync('npx puppeteer browsers install chrome', {
              cwd: process.cwd(),
              stdio: 'inherit',
              timeout: 120_000
            });
            const chromePath = puppeteer.executablePath();
            logger.info(`Chrome 安装成功: ${chromePath}`);
            const browser = await puppeteer.launch({
              headless: options.headless ?? true,
              args: options.args ?? ['--no-sandbox'],
              executablePath: chromePath
            });
            return createRuntime(browser);
          } catch (e) {
            logger.error(
              `Chrome 自动安装后仍启动失败: ${e instanceof Error ? e.message : String(e)}`
            );
            logger.error('Chrome 安装失败，请手动尝试或切换引擎');
            logger.error('  npx puppeteer browsers install chrome');
            logger.error('  或在 browser.launchOptions 中设置 executablePath');
            logger.error('  或 visual-guard run --engine playwright');
            throw new Error('CHROME_INSTALL_FAILED');
          }
        }
        throw error;
      }
    }
  };
}

function createRuntime(browser: Browser): EngineRuntime {
  return {
    async createContext(options: EngineContextOptions): Promise<EngineContext> {
      const isSsr = options.renderMode === 'ssr';

      const context = await _createBrowserContext(browser);

      // Puppeteer 不支持 serviceWorker 控制，SSR 差异仅在 page 层处理
      return createContext(context, browser, options, isSsr);
    },

    async close() {
      await browser.close();
    }
  };
}

async function _createBrowserContext(browser: Browser) {
  const maybeModern = browser as Browser & {
    createBrowserContext?: () => Promise<Awaited<ReturnType<Browser['createBrowserContext']>>>;
    createIncognitoBrowserContext?: () => Promise<
      Awaited<ReturnType<Browser['createBrowserContext']>>
    >;
  };

  if (maybeModern.createBrowserContext) {
    return maybeModern.createBrowserContext();
  }

  if (maybeModern.createIncognitoBrowserContext) {
    return maybeModern.createIncognitoBrowserContext();
  }

  throw new Error('当前 Puppeteer 版本不支持 BrowserContext');
}

function createContext(
  ppContext: Awaited<ReturnType<Browser['createBrowserContext']>>,
  _browser: Browser,
  _options: EngineContextOptions,
  isSsr: boolean
): EngineContext {
  return {
    async newPage(): Promise<EnginePage> {
      const page = await ppContext.newPage();

      // 设置视口
      if (_options.viewport) {
        await page.setViewport({
          width: _options.viewport.width,
          height: _options.viewport.height,
          deviceScaleFactor: _options.viewport.deviceScaleFactor ?? 1,
          isMobile: _options.viewport.isMobile ?? false
        });
      }

      // 注入 cookies
      if (_options.cookies && _options.cookies.length > 0) {
        for (const c of _options.cookies) {
          await page.setCookie({
            name: c.name,
            value: c.value,
            domain: c.domain ?? '',
            path: c.path ?? '/',
            expires: c.expires ?? -1,
            httpOnly: c.httpOnly ?? false,
            secure: c.secure ?? false,
            sameSite: (c.sameSite ?? 'None') as 'Strict' | 'Lax' | 'None'
          });
        }
      }

      // 注入额外 headers
      if (_options.extraHTTPHeaders) {
        await page.setExtraHTTPHeaders(_options.extraHTTPHeaders);
      }

      return createPage(page, isSsr);
    },

    async setCookies(cookies: CookieInput[]): Promise<void> {
      const page = await ppContext.newPage();
      for (const c of cookies) {
        await page.setCookie({
          name: c.name,
          value: c.value,
          domain: c.domain ?? '',
          path: c.path ?? '/',
          expires: c.expires ?? -1,
          httpOnly: c.httpOnly ?? false,
          secure: c.secure ?? false,
          sameSite: (c.sameSite ?? 'None') as 'Strict' | 'Lax' | 'None'
        });
      }
      await page.close();
    },

    async setExtraHTTPHeaders(headers: Record<string, string>): Promise<void> {
      const page = await ppContext.newPage();
      await page.setExtraHTTPHeaders(headers);
      await page.close();
    },

    async close() {
      await ppContext.close();
    }
  };
}

function createPage(page: Page, isSsr: boolean): EnginePage {
  return {
    async goto(url, options) {
      await page.goto(url, {
        timeout: options?.timeout,
        waitUntil: isSsr
          ? 'domcontentloaded'
          : ((options?.waitUntil as
              | 'load'
              | 'domcontentloaded'
              | 'networkidle0'
              | 'networkidle2') ?? 'load')
      });
    },

    async waitForSelector(selector, options) {
      await page.waitForSelector(selector, {
        timeout: options?.timeout,
        visible: options?.state === 'visible'
      });
    },

    async waitForNetworkIdle(options) {
      if (!isSsr) {
        await page.waitForNetworkIdle({timeout: options?.timeout});
      }
    },

    async evaluate(fn, ...args) {
      return page.evaluate(fn, ...args);
    },

    async screenshot(options) {
      const buf = await page.screenshot({
        fullPage: options.fullPage ?? false,
        type: (options.type ?? 'png') as 'png' | 'jpeg' | 'webp',
        quality: options.quality,
        clip: options.clip
          ? {
              x: options.clip.x,
              y: options.clip.y,
              width: options.clip.width,
              height: options.clip.height
            }
          : undefined
      });
      return Buffer.from(buf);
    },

    async elementScreenshot(selector, options) {
      const el = await page.$(selector);
      if (!el) {
        throw new Error(`元素未找到: ${selector}`);
      }
      const buf = await el.screenshot({
        type: (options?.type ?? 'png') as 'png' | 'jpeg' | 'webp',
        quality: options?.quality
      });
      return Buffer.from(buf);
    },

    onConsole(handler) {
      if (!isSsr) {
        page.on('console', (msg: PpConsoleMessage) => {
          handler({
            type: msg.type() as 'log' | 'warn' | 'error' | 'info' | 'debug',
            text: msg.text(),
            location: msg.location()
              ? {
                  url: msg.location().url,
                  lineNumber: msg.location().lineNumber ?? 0,
                  columnNumber: msg.location().columnNumber ?? 0
                }
              : undefined
          });
        });
      }
    },

    onRequest(handler) {
      if (!isSsr) {
        page.on('request', (req: PpRequest) => {
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
        page.on('response', (res: PpResponse) => {
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
      await page.close();
    }
  };
}
