/**
 * puppeteer 类型声明桩
 *
 * puppeteer 是可选 peerDependency，本桩保证在不安装 puppeteer 时 typecheck 仍可通过。
 * 用户安装 puppeteer 后，真实类型会覆盖此声明。
 */

declare module 'puppeteer' {
  export interface LaunchOptions {
    headless?: boolean | 'new';
    args?: string[];
    executablePath?: string;
  }

  export class Browser {
    createBrowserContext(): Promise<BrowserContext>;
    createIncognitoBrowserContext(): Promise<BrowserContext>;
    close(): Promise<void>;
  }

  export class BrowserContext {
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }

  export class Page {
    goto(
      url: string,
      options?: {
        timeout?: number;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';
      }
    ): Promise<HTTPResponse | null>;

    setViewport(viewport: {
      width: number;
      height: number;
      deviceScaleFactor?: number;
      isMobile?: boolean;
    }): Promise<void>;

    setCookie(cookie: {
      name: string;
      value: string;
      domain?: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }): Promise<void>;

    setExtraHTTPHeaders(headers: Record<string, string>): Promise<void>;

    waitForSelector(
      selector: string,
      options?: {
        timeout?: number;
        visible?: boolean;
      }
    ): Promise<ElementHandle | null>;

    waitForNetworkIdle(options?: {timeout?: number}): Promise<void>;

    evaluate<T>(fn: (...args: unknown[]) => T, ...args: unknown[]): Promise<T>;

    screenshot(options?: {
      fullPage?: boolean;
      type?: 'png' | 'jpeg' | 'webp';
      quality?: number;
      clip?: {x: number; y: number; width: number; height: number};
    }): Promise<Buffer | string>;

    $(selector: string): Promise<ElementHandle | null>;

    on(event: 'console', handler: (msg: ConsoleMessage) => void): void;
    on(event: 'request', handler: (req: HTTPRequest) => void): void;
    on(event: 'response', handler: (res: HTTPResponse) => void): void;

    removeAllListeners(): void;
    close(): Promise<void>;
  }

  export class ElementHandle {
    screenshot(options?: {
      type?: 'png' | 'jpeg' | 'webp';
      quality?: number;
    }): Promise<Buffer | string>;
  }

  export class HTTPResponse {
    url(): string;
    status(): number;
    statusText(): string;
    headers(): Record<string, string>;
  }

  export class HTTPRequest {
    url(): string;
    method(): string;
    headers(): Record<string, string>;
    postData(): string | undefined;
  }

  export class ConsoleMessage {
    type(): string;
    text(): string;
    location(): {url: string; lineNumber?: number; columnNumber?: number};
  }

  export function executablePath(): string;

  const puppeteer: {
    launch(options?: LaunchOptions): Promise<Browser>;
    executablePath(): string;
  };

  export default puppeteer;
}
