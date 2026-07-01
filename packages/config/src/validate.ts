import type {VisualGuardConfig} from '@visual-guard/shared';
import {z} from 'zod';

/**
 * 视口配置 schema
 */
const ViewportConfigSchema = z.object({
  name: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().optional(),
  isMobile: z.boolean().optional(),
  userAgent: z.string().optional(),
  locale: z.string().optional(),
  timezoneId: z.string().optional()
});

/**
 * 浏览器配置 schema
 */
const BrowserConfigSchema = z.object({
  engine: z.enum(['playwright', 'puppeteer']),
  headless: z.boolean().optional(),
  launchOptions: z.record(z.unknown()).optional(),
  contextOptions: z.record(z.unknown()).optional()
});

/**
 * Diff 配置 schema
 */
const DiffConfigSchema = z.object({
  pixel: z
    .object({
      threshold: z.number().min(0).max(1).optional(),
      maxDiffRatio: z.number().min(0).max(1).optional(),
      includeAA: z.boolean().optional()
    })
    .optional(),
  layout: z
    .object({
      maxDistance: z.number().int().nonnegative().optional()
    })
    .optional(),
  ignoreRegions: z
    .array(
      z.object({
        selector: z.string().optional(),
        x: z.number().int().optional(),
        y: z.number().int().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional()
      })
    )
    .optional()
});

/**
 * 性能预算 schema
 */
const PerformanceBudgetSchema = z.object({
  lcp: z.number().positive().optional(),
  fcp: z.number().positive().optional(),
  cls: z.number().min(0).optional(),
  ttfb: z.number().positive().optional(),
  fid: z.number().positive().optional(),
  inp: z.number().positive().optional()
});

/**
 * 性能配置 schema
 */
const PerformanceConfigSchema = z.object({
  enabled: z.boolean().optional(),
  budget: PerformanceBudgetSchema.optional()
});

/**
 * 场景动作 schema
 */
const SceneActionSchema = z.object({
  type: z.enum(['click', 'type', 'wait', 'scroll', 'hover']),
  selector: z.string().optional(),
  value: z.string().optional(),
  timeout: z.number().int().nonnegative().optional()
});

/**
 * 场景配置 schema
 */
const SceneConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  tags: z.array(z.string()).optional(),
  waitForSelector: z.string().optional(),
  waitForTimeout: z.number().int().nonnegative().optional(),
  waitForNetworkIdle: z.boolean().optional(),
  actions: z.array(SceneActionSchema).optional(),
  elements: z.array(z.string()).optional(),
  ignoreSelectors: z.array(z.string()).optional()
});

/**
 * 报告类型 schema
 */
const ReporterTypeSchema = z.enum(['html', 'json', 'console', 'pdf']);

/**
 * 插件配置 schema
 */
const PluginConfigSchema = z.object({
  name: z.string().min(1),
  options: z.record(z.unknown()).optional()
});

/**
 * 动态内容稳定策略 schema
 */
const StabilizeConfigSchema = z.object({
  enabled: z.boolean().optional(),
  freezeTime: z.boolean().optional(),
  freezeDate: z.string().optional(),
  disableAnimations: z.boolean().optional(),
  freezeRAF: z.boolean().optional(),
  freezeInterval: z.boolean().optional(),
  waitForFonts: z.boolean().optional(),
  maskSelectors: z.array(z.string()).optional()
});

/**
 * Visual Guard 完整配置 schema
 */
const VisualGuardConfigSchema = z.object({
  project: z.string().min(1, 'project 不能为空'),
  env: z.string().min(1),
  baseUrl: z.string().url('baseUrl 必须是合法的 URL'),
  renderMode: z.enum(['ssr', 'csr', 'auto']).optional(),
  baselineUrls: z.array(z.string().url('baselineUrls 每项必须是合法 URL')).optional(),
  outputDir: z.string().optional(),
  baselineDir: z.string().optional(),
  concurrency: z.number().int().positive().max(32).optional(),
  timeout: z.number().int().positive().optional(),
  retry: z.number().int().nonnegative().optional(),
  browser: BrowserConfigSchema.optional(),
  viewport: z.array(ViewportConfigSchema).optional(),
  diff: DiffConfigSchema.optional(),
  performance: PerformanceConfigSchema.optional(),
  scenarios: z.array(SceneConfigSchema).min(1, 'scenarios 至少配置一个场景'),
  reporters: z.array(ReporterTypeSchema).optional(),
  stabilize: StabilizeConfigSchema.optional(),
  plugins: z.array(PluginConfigSchema).optional(),
  server: z
    .object({
      port: z.number().int().positive().optional(),
      host: z.string().optional(),
      apiKey: z.string().optional()
    })
    .optional(),
  storage: z
    .object({
      dsn: z.string().optional()
    })
    .optional()
});

/**
 * 校验 Visual Guard 配置
 *
 * @param config - 待校验的配置对象
 * @returns 校验结果，包含成功时的配置和失败时的错误列表
 *
 * @example
 * ```ts
 * import { validateConfig } from '@visual-guard/config';
 *
 * const result = validateConfig(userConfig);
 * if (!result.ok) {
 *   console.error(result.errors);
 *   process.exit(1);
 * }
 * const config = result.value;
 * ```
 */
export function validateConfig(config: unknown):
  | {
      ok: true;
      value: VisualGuardConfig;
    }
  | {
      ok: false;
      errors: string[];
    } {
  const result = VisualGuardConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.errors.map(
      err => `${err.path.join('.') || '(root)'}: ${err.message}`
    );
    return {ok: false, errors};
  }

  return {ok: true, value: result.data as VisualGuardConfig};
}

/**
 * 断言配置合法，不合法则抛出包含详细错误的异常
 *
 * @param config - 待校验的配置对象
 * @throws 当配置不合法时抛出 ZodError
 *
 * @example
 * ```ts
 * import { assertValidConfig } from '@visual-guard/config';
 *
 * try {
 *   assertValidConfig(userConfig);
 * } catch (e) {
 *   console.error(e.issues);
 * }
 * ```
 */
export function assertValidConfig(config: unknown): asserts config is VisualGuardConfig {
  const result = validateConfig(config);
  if (!result.ok) {
    throw new Error(`配置校验失败:\n${result.errors.map(e => `  - ${e}`).join('\n')}`);
  }
}

export {PluginConfigSchema, SceneConfigSchema, VisualGuardConfigSchema};
