/**
 * 浏览器引擎名称
 */
export type BrowserEngineName = 'playwright' | 'puppeteer' | 'cypress';

/**
 * 引擎启动选项
 */
export interface EngineLaunchOptions {
  headless?: boolean;
  args?: string[];
  executablePath?: string;
  timeout?: number;
  env?: Record<string, string>;
}

/**
 * 引擎上下文选项
 */
export interface EngineContextOptions {
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
    isMobile?: boolean;
  };
  locale?: string;
  timezoneId?: string;
  extraHTTPHeaders?: Record<string, string>;
  cookies?: CookieInput[];
}

/**
 * 页面跳转选项
 */
export interface GotoOptions {
  timeout?: number;
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
}

/**
 * 等待选项
 */
export interface WaitOptions {
  timeout?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

/**
 * 截图选项
 */
export interface ScreenshotOptions {
  fullPage?: boolean;
  type?: 'png' | 'jpeg' | 'webp';
  quality?: number;
  clip?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  animations?: 'allow' | 'disabled';
}

/**
 * Cookie 输入
 */
export interface CookieInput {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 控制台事件处理器
 */
export type ConsoleHandler = (message: ConsoleMessage) => void;

/**
 * 请求事件处理器
 */
export type RequestHandler = (request: RequestInfo) => void;

/**
 * 响应事件处理器
 */
export type ResponseHandler = (response: ResponseInfo) => void;

/**
 * 控制台消息
 */
export interface ConsoleMessage {
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  text: string;
  location?: {
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * 请求信息
 */
export interface RequestInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string;
}

/**
 * 响应信息
 */
export interface ResponseInfo {
  url: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body?: string;
}

/**
 * 引擎能力声明
 */
export interface EngineCapabilities {
  fullPageScreenshot: boolean;
  elementScreenshot: boolean;
  domSnapshot: boolean;
  networkInterception: boolean;
  consoleListening: boolean;
  multiContext: boolean;
  lighthouse: boolean;
  cookies: boolean;
  extraHTTPHeaders: boolean;
}

/**
 * 浏览器引擎适配器接口
 */
export interface BrowserEngineAdapter {
  name: BrowserEngineName;
  capabilities: EngineCapabilities;
  launch(options: EngineLaunchOptions): Promise<EngineRuntime>;
}

/**
 * 引擎运行时接口
 */
export interface EngineRuntime {
  createContext(options: EngineContextOptions): Promise<EngineContext>;
  close(): Promise<void>;
}

/**
 * 引擎上下文接口
 */
export interface EngineContext {
  newPage(): Promise<EnginePage>;
  setCookies?(cookies: CookieInput[]): Promise<void>;
  setExtraHTTPHeaders?(headers: Record<string, string>): Promise<void>;
  close(): Promise<void>;
}

/**
 * 引擎页面接口
 */
export interface EnginePage {
  goto(url: string, options?: GotoOptions): Promise<void>;
  waitForSelector(selector: string, options?: WaitOptions): Promise<void>;
  waitForNetworkIdle?(options?: WaitOptions): Promise<void>;
  evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;
  screenshot(options: ScreenshotOptions): Promise<Buffer>;
  elementScreenshot?(selector: string, options?: ScreenshotOptions): Promise<Buffer>;
  onConsole?(handler: ConsoleHandler): void;
  onRequest?(handler: RequestHandler): void;
  onResponse?(handler: ResponseHandler): void;
  close(): Promise<void>;
}
