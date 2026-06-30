// biome-ignore-all lint/complexity/useLiteralKeys: overrides 是动态键对象（Record<string, ...>），必须用字符串索引访问
import type {VisualGuardConfig} from '@visual-guard/shared';

/**
 * 环境变量前缀
 */
const ENV_PREFIX = 'VG_';

/**
 * 从环境变量读取并覆盖配置
 *
 * 支持的环境变量：
 * - `VG_ENGINE`：浏览器引擎（playwright/puppeteer）
 * - `VG_HEADLESS`：是否无头模式（true/false）
 * - `VG_BASE_URL`：基础 URL
 * - `VG_TIMEOUT`：超时时间（ms）
 * - `VG_CONCURRENCY`：并发数
 * - `VG_RETRY`：重试次数
 * - `VG_ENV`：环境名称
 * - `VG_OUTPUT_DIR`：输出目录
 * - `VG_BASELINE_DIR`：基线目录
 *
 * @param config - 已合并默认值的配置
 * @returns 覆盖后的配置（新对象，不修改原对象）
 */
export function applyEnvOverrides(config: VisualGuardConfig): VisualGuardConfig {
  const overrides: Partial<Record<string, string | undefined>> = {};

  for (const key of Object.keys(process.env)) {
    if (key.startsWith(ENV_PREFIX)) {
      const configKey = key.slice(ENV_PREFIX.length).toLowerCase();
      overrides[configKey] = process.env[key];
    }
  }

  if (Object.keys(overrides).length === 0) {
    return config;
  }

  const result = structuredClone(config);

  // VG_ENGINE
  if (overrides['engine']) {
    const val = overrides['engine'];
    if (val === 'playwright' || val === 'puppeteer') {
      result.browser = result.browser ?? {engine: val};
      result.browser.engine = val;
    }
  }

  // VG_HEADLESS
  if (overrides['headless']) {
    const val = overrides['headless'].toLowerCase();
    result.browser = result.browser ?? {engine: 'playwright'};
    result.browser.headless = val === 'true' || val === '1';
  }

  // VG_BASE_URL
  if (overrides['base_url']) {
    result.baseUrl = overrides['base_url'];
  }

  // VG_TIMEOUT
  if (overrides['timeout']) {
    const val = Number(overrides['timeout']);
    if (!Number.isNaN(val) && val > 0) {
      result.timeout = val;
    }
  }

  // VG_CONCURRENCY
  if (overrides['concurrency']) {
    const val = Number(overrides['concurrency']);
    if (!Number.isNaN(val) && val > 0) {
      result.concurrency = val;
    }
  }

  // VG_RETRY
  if (overrides['retry']) {
    const val = Number(overrides['retry']);
    if (!Number.isNaN(val) && val >= 0) {
      result.retry = val;
    }
  }

  // VG_ENV
  if (overrides['env']) {
    result.env = overrides['env'];
  }

  // VG_OUTPUT_DIR
  if (overrides['output_dir']) {
    result.outputDir = overrides['output_dir'];
  }

  // VG_BASELINE_DIR
  if (overrides['baseline_dir']) {
    result.baselineDir = overrides['baseline_dir'];
  }

  return result;
}
