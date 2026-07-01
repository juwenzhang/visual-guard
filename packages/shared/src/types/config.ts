/**
 * 浏览器引擎名称
 *
 * @default "playwright"
 */
export type BrowserEngineName = 'playwright' | 'puppeteer';

/**
 * 视口配置 — 定义浏览器窗口大小和设备模拟参数
 */
export interface ViewportConfig {
  /** 视口名称，如 "desktop"、"mobile" */
  name: string;
  /** 视口宽度（px），>0 整数 */
  width: number;
  /** 视口高度（px），>0 整数 */
  height: number;
  /** 设备像素比，默认为 1 */
  deviceScaleFactor?: number;
  /** 是否模拟移动设备 */
  isMobile?: boolean;
  /** 自定义 User-Agent */
  userAgent?: string;
  /** 语言区域，如 "zh-CN" */
  locale?: string;
  /** 时区 ID，如 "Asia/Shanghai" */
  timezoneId?: string;
}

/**
 * 浏览器配置
 */
export interface BrowserConfig {
  /** 引擎类型 */
  engine: BrowserEngineName;
  /** 是否无头模式，默认 true */
  headless?: boolean;
  /** 透传给引擎的启动参数（如 --no-sandbox） */
  launchOptions?: Record<string, unknown>;
  /** 透传给引擎的浏览器上下文参数 */
  contextOptions?: Record<string, unknown>;
}

/**
 * Diff 对比配置
 */
export interface DiffConfig {
  /** 像素对比参数 */
  pixel?: {
    /** 像素差异阈值 0-1，默认 0.1 */
    threshold?: number;
    /** 允许的最大差异像素比例 0-1，默认 0.01 */
    maxDiffRatio?: number;
    /** 是否包含抗锯齿像素，默认 true */
    includeAA?: boolean;
  };
  /** 布局对比参数 */
  layout?: {
    /** 元素位移容差（px），≥0 整数，默认 4 */
    maxDistance?: number;
  };
  /** 对比时忽略的区域 */
  ignoreRegions?: Array<{
    /** 要忽略的 CSS 选择器 */
    selector?: string;
    /** 忽略区域左上角 x 坐标 */
    x?: number;
    /** 忽略区域左上角 y 坐标 */
    y?: number;
    /** 忽略区域宽度 */
    width?: number;
    /** 忽略区域高度 */
    height?: number;
  }>;
}

/**
 * 性能预算 — 各项指标的单位均为毫秒（cls 无单位）
 */
export interface PerformanceBudget {
  /** LCP 最大内容绘制，推荐 <2500 */
  lcp?: number;
  /** FCP 首次内容绘制，推荐 <1800 */
  fcp?: number;
  /** CLS 累计布局偏移，推荐 <0.1 */
  cls?: number;
  /** TTFB 首字节时间，推荐 <800 */
  ttfb?: number;
  /** FID 首次输入延迟，推荐 <100 */
  fid?: number;
  /** INP 交互到下次绘制，推荐 <200 */
  inp?: number;
}

/**
 * 性能检测配置
 */
export interface PerformanceConfig {
  /** 是否启用性能检测，默认 false */
  enabled?: boolean;
  /** 性能预算阈值 */
  budget?: PerformanceBudget;
}

/**
 * 场景配置 — 定义要检测的页面和交互流程
 */
export interface SceneConfig {
  /** 🔴 必填，唯一标识符 */
  id: string;
  /** 🔴 必填，场景显示名称 */
  name: string;
  /** 🔴 必填，页面路径（相对 baseUrl） */
  path: string;
  /** 场景标签，用于筛选执行 */
  tags?: string[];
  /** 等待指定 CSS 选择器出现后再截图 */
  waitForSelector?: string;
  /** 额外等待时间（ms），≥0 整数 */
  waitForTimeout?: number;
  /** 是否等待网络空闲，默认 false */
  waitForNetworkIdle?: boolean;
  /** 页面交互动作，按顺序执行 */
  actions?: Array<{
    /** 动作类型：click | type | wait | scroll | hover */
    type: 'click' | 'type' | 'wait' | 'scroll' | 'hover';
    /** 目标元素 CSS 选择器（click/type/hover 需要） */
    selector?: string;
    /** 输入文本（type）或滚动像素（scroll） */
    value?: string;
    /** 动作超时（ms） */
    timeout?: number;
  }>;
  /** 需要做元素级截图的 CSS 选择器列表 */
  elements?: string[];
  /** diff 时忽略的 CSS 选择器列表 */
  ignoreSelectors?: string[];
}

/**
 * 报告输出格式
 */
export type ReporterType = 'html' | 'json' | 'console' | 'pdf';

/**
 * 渲染模式
 * - `ssr` — 服务端渲染（Next.js/Remix），用 domcontentloaded + 关闭事件监听避免 stream 冲突
 * - `csr` — 客户端渲染（React/Vue SPA），用 networkidle + 完整事件采集
 * - `auto` — 自动检测（默认），用 load + 完整事件采集
 */
export type RenderMode = 'ssr' | 'csr' | 'auto';

/**
 * 动态内容稳定策略配置
 *
 * 在截图前注入页面脚本，冻结时间、禁用动画等，减少因动态内容导致的误报。
 */
export interface StabilizeConfig {
  /** 是否启用稳定策略，默认 true */
  enabled?: boolean;
  /** 冻结 Date.now() 和 new Date() 为固定值，默认 true */
  freezeTime?: boolean;
  /** 自定义冻结时间（ISO 8601），不填则使用采集启动时间 */
  freezeDate?: string;
  /** 禁用 CSS animation 和 transition，默认 true */
  disableAnimations?: boolean;
  /** 冻结 requestAnimationFrame 为同步回调，默认 true */
  freezeRAF?: boolean;
  /** 冻结 setInterval，默认 false（可能影响 SPA 路由） */
  freezeInterval?: boolean;
  /** 等待 document.fonts.ready 后再截图，默认 true */
  waitForFonts?: boolean;
  /** 截图前涂上固定色块的 CSS 选择器列表（用于遮罩动态广告等） */
  maskSelectors?: string[];
}

/**
 * Visual Guard 主配置 — 完整配置入口
 *
 * @example 最小配置
 * ```json
 * {
 *   "project": "my-app",
 *   "baseUrl": "http://localhost:3000",
 *   "scenarios": [{ "id": "home", "name": "首页", "path": "/" }]
 * }
 * ```
 */
export interface VisualGuardConfig {
  /** 🔴 必填，项目名称 */
  project: string;
  /** 环境名称，默认 "development" */
  env: string;
  /** 🔴 必填，被测页面基础 URL */
  baseUrl: string;
  /** 对比的基线 URL 列表，不填则默认 [baseUrl]（仅对比当前版本） */
  baselineUrls?: string[];
  /** 渲染模式，默认 `auto` */
  renderMode?: RenderMode;
  /** 报告输出目录，默认 ".visual-guard/reports" */
  outputDir?: string;
  /** 基线存储目录，默认 ".visual-guard/baselines" */
  baselineDir?: string;
  /** 并发执行数，默认 4，最大 32 */
  concurrency?: number;
  /** 全局超时（ms），默认 30000 */
  timeout?: number;
  /** 失败重试次数，默认 0 */
  retry?: number;
  /** 浏览器配置，默认 playwright + headless */
  browser?: BrowserConfig;
  /** 视口列表，默认 1280×800 desktop */
  viewport?: ViewportConfig[];
  /** Diff 对比配置 */
  diff?: DiffConfig;
  /** 性能检测配置，默认关闭 */
  performance?: PerformanceConfig;
  /** 🔴 必填，场景列表，至少一个 */
  scenarios: SceneConfig[];
  /** 报告输出格式，默认 ["console"] */
  reporters?: ReporterType[];
  /** 动态内容稳定策略，默认启用 */
  stabilize?: StabilizeConfig;
  /** 插件列表 */
  plugins?: PluginConfig[];
  /** Server 配置（visual-guard serve 时使用） */
  server?: ServerConfig;
  /** 存储配置（visual-guard storage 命令 + serve 共用） */
  storage?: StorageConfig;
}

/**
 * Server 配置
 */
export interface ServerConfig {
  /** 服务端口，默认 3456 */
  port?: number;
  /** 绑定地址，默认 "0.0.0.0" */
  host?: string;
  /** API 鉴权密钥，空则无鉴权 */
  apiKey?: string;
}

/**
 * 存储配置
 */
export interface StorageConfig {
  /** 存储连接串，如 "sqlite://./vg.db" 或 "postgres://..." */
  dsn?: string;
}

/**
 * 插件配置
 */
export interface PluginConfig {
  /** 插件名称 */
  name: string;
  /** 插件自定义选项 */
  options?: Record<string, unknown>;
}
