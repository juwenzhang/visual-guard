/**
 * @visual-guard/engine-puppeteer — Puppeteer 浏览器引擎适配器
 *
 * 将 Puppeteer API 封装为 Visual Guard 的 BrowserEngineAdapter 接口。
 * 实现与 engine-playwright 同构的采集输出，能力略有降级。
 */

import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {homedir} from 'node:os';
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

type PuppeteerPackageName = 'puppeteer' | 'puppeteer-core';

type PuppeteerLaunchOptions = {
  headless?: boolean | 'new';
  args?: string[];
  executablePath?: string;
};

type PuppeteerModule = {
  launch(options?: PuppeteerLaunchOptions): Promise<Browser>;
  executablePath?: () => string;
};

type PuppeteerModuleExport = {default?: PuppeteerModule} & PuppeteerModule;

type LoadedPuppeteer = {
  packageName: PuppeteerPackageName;
  module: PuppeteerModule;
};

const PUPPETEER_PACKAGE_NAMES: PuppeteerPackageName[] = ['puppeteer', 'puppeteer-core'];
const DEFAULT_LAUNCH_ARGS = ['--no-sandbox'];
const MODULE_NOT_FOUND_CODE = 'MODULE_NOT_FOUND';
const PUPPETEER_EXECUTABLE_PATH_ENV = 'PUPPETEER_EXECUTABLE_PATH';
const PROGRAM_FILES_ENV = 'PROGRAMFILES';
const PROGRAM_FILES_X86_ENV = 'PROGRAMFILES(X86)';
const LOCAL_APP_DATA_ENV = ['LOCAL', 'APP', 'DATA'].join('');
const DARWIN_CHROME_EXECUTABLE_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  join(homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
  join(homedir(), 'Applications/Chromium.app/Contents/MacOS/Chromium')
];
const LINUX_CHROME_EXECUTABLE_PATHS = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium'
];

function _loadPuppeteer(): LoadedPuppeteer {
  const requireFromProject = createRequire(join(process.cwd(), 'package.json'));

  for (const packageName of PUPPETEER_PACKAGE_NAMES) {
    try {
      const mod = requireFromProject(packageName) as PuppeteerModuleExport;
      return {
        packageName,
        module: mod.default ?? mod
      };
    } catch (error) {
      if (isMissingOptionalDependency(error, packageName)) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    [
      '未找到 Puppeteer 运行时依赖。',
      '请按需安装其中一种：',
      '  pnpm add puppeteer      # 安装时下载兼容 Chrome',
      '  pnpm add puppeteer-core # 仅安装库，需要配置 executablePath',
      '如果使用 puppeteer-core，请在 browser.launchOptions.executablePath 或 PUPPETEER_EXECUTABLE_PATH 中指定 Chrome 路径。'
    ].join('\n')
  );
}

function isMissingOptionalDependency(error: unknown, packageName: PuppeteerPackageName): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as {code?: string}).code;
  return code === MODULE_NOT_FOUND_CODE && error.message.includes(packageName);
}

function getExecutablePath(
  packageName: PuppeteerPackageName,
  options: EngineLaunchOptions
): string | undefined {
  const configuredPath = options.executablePath ?? process.env[PUPPETEER_EXECUTABLE_PATH_ENV];
  if (configuredPath) {
    return configuredPath;
  }

  if (packageName === 'puppeteer-core') {
    return resolveSystemChromeExecutablePath();
  }

  return undefined;
}

function resolveSystemChromeExecutablePath(): string | undefined {
  const executablePaths = getSystemChromeExecutablePaths();

  for (const executablePath of executablePaths) {
    if (existsSync(executablePath)) {
      return executablePath;
    }
  }

  return undefined;
}

function getSystemChromeExecutablePaths(): string[] {
  if (process.platform === 'darwin') {
    return DARWIN_CHROME_EXECUTABLE_PATHS;
  }

  if (process.platform === 'linux') {
    return LINUX_CHROME_EXECUTABLE_PATHS;
  }

  if (process.platform === 'win32') {
    return getWindowsChromeExecutablePaths();
  }

  return [];
}

function getWindowsChromeExecutablePaths(): string[] {
  const rootPaths = [
    process.env[PROGRAM_FILES_ENV],
    process.env[PROGRAM_FILES_X86_ENV],
    process.env[LOCAL_APP_DATA_ENV]
  ].filter((rootPath): rootPath is string => Boolean(rootPath));

  return rootPaths.map(rootPath => join(rootPath, 'Google/Chrome/Application/chrome.exe'));
}

function isChromeLaunchConfigError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.message.includes('Could not find Chrome') ||
    error.message.includes('An `executablePath` or `channel` must be specified')
  );
}

function logChromeLaunchHelp(
  packageName: PuppeteerPackageName,
  executablePath: string | undefined
): void {
  if (executablePath) {
    logger.error(`Puppeteer 已使用 Chrome 路径但启动失败: ${executablePath}`);
    return;
  }

  if (packageName === 'puppeteer-core') {
    logger.error('当前使用 puppeteer-core，它不会下载 Chrome，且未自动找到本机 Chrome。');
    logger.error(
      '请在 browser.launchOptions.executablePath 或 PUPPETEER_EXECUTABLE_PATH 中指定 Chrome 路径。'
    );
    logger.error('如果希望安装时自动下载兼容 Chrome，请改装 puppeteer：pnpm add puppeteer');
    return;
  }

  logger.error('当前使用 puppeteer，但未找到可启动的 Chrome。');
  logger.error(
    '请确认安装阶段未跳过 Chrome 下载，或执行：pnpm exec puppeteer browsers install chrome'
  );
  logger.error(
    '也可以在 browser.launchOptions.executablePath 或 PUPPETEER_EXECUTABLE_PATH 中指定 Chrome 路径。'
  );
}

const capabilities: EngineCapabilities = {
  fullPageScreenshot: true,
  elementScreenshot: true,
  domSnapshot: true,
  networkInterception: true,
  consoleListening: true,
  multiContext: true,
  lighthouse: false,
  cdpAccess: true,
  cookies: true,
  extraHTTPHeaders: true
};

export function createPuppeteerAdapter(): BrowserEngineAdapter {
  return {
    name: 'puppeteer',
    capabilities,
    async launch(options: EngineLaunchOptions): Promise<EngineRuntime> {
      const loaded = _loadPuppeteer();
      const executablePath = getExecutablePath(loaded.packageName, options);

      try {
        const browser = await loaded.module.launch({
          headless: options.headless ?? true,
          args: options.args ?? DEFAULT_LAUNCH_ARGS,
          executablePath
        });
        return createRuntime(browser);
      } catch (error) {
        if (isChromeLaunchConfigError(error)) {
          logChromeLaunchHelp(loaded.packageName, executablePath);
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

    async getCDPSession() {
      const cdp = await page.createCDPSession();
      return {
        async send<T>(method: string, params?: Record<string, unknown>): Promise<T> {
          return cdp.send(method, params) as Promise<T>;
        },
        on(event: string, handler: (params: unknown) => void): void {
          cdp.on(event, handler);
        },
        async detach() {
          await cdp.detach();
        }
      };
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
