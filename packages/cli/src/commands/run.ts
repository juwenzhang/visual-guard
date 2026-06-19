// biome-ignore-all lint/complexity/useLiteralKeys: commander options 使用 Record 索引签名，TS4111 要求方括号访问
import {loadConfig} from '@visual-guard/config';
import {run} from '@visual-guard/core';
import {
  generateConsoleReport,
  generateHtmlReport,
  generateJsonReport
} from '@visual-guard/reporters';
import type {BrowserEngineAdapter} from '@visual-guard/shared';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

export function createRunCommand(): Command {
  const cmd = new Command('run');

  cmd
    .description('执行视觉回归检测')
    .option('-c, --config <path>', '配置文件路径')
    .option('--engine <engine>', '浏览器引擎 (playwright | puppeteer | cypress)，需安装对应包')
    .option('--scenes <scenes>', '仅执行指定场景，逗号分隔')
    .option('--tags <tags>', '按标签筛选场景，逗号分隔')
    .option('--env <env>', '环境名称')
    .option('--write-baseline', '更新基线，后续运行以此为对比基准')
    .option('--format <format>', '报告格式 (html,json,console)，逗号分隔', 'console')
    .action(async (options: Record<string, string | boolean | undefined>) => {
      logger.info(chalk.cyan('Visual Guard — 视觉回归检测'));

      const configPath = typeof options['config'] === 'string' ? options['config'] : undefined;
      const config = await loadConfig(undefined, configPath);

      // CLI 参数覆盖
      if (typeof options['engine'] === 'string') {
        config.browser = config.browser ?? {engine: 'playwright'};
        const eng = options['engine'];
        if (eng === 'playwright' || eng === 'puppeteer' || eng === 'cypress') {
          config.browser.engine = eng;
        }
      }
      if (typeof options['env'] === 'string') {
        config.env = options['env'];
      }

      // 动态加载引擎适配器
      const engineName = config.browser?.engine ?? 'playwright';
      let adapter: Awaited<ReturnType<typeof _loadAdapter>>;
      try {
        adapter = await _loadAdapter(engineName);
      } catch {
        // _loadAdapter 已通过 logger 输出具体原因，此处直接退出
        process.exit(2);
      }

      // 执行
      const writeBaseline = options['writeBaseline'] === true || options['write-baseline'] === true;
      let manifest: Awaited<ReturnType<typeof run>>;

      try {
        manifest = await run({
          config,
          adapter,
          concurrency: config.concurrency,
          writeBaseline
        });
      } catch {
        // 引擎层/runner 已通过 logger 输出具体原因，此处直接退出
        process.exit(2);
      }

      // 生成报告（先 JSON/HTML，再控制台，确保控制台能列出文件路径）
      const formats = _parseFormats(options['format'] as string);
      const outputDir = config.outputDir ?? '.visual-guard/reports';
      const reportFiles: string[] = [];

      for (const fmt of formats) {
        if (fmt === 'json') {
          const filePath = await generateJsonReport(manifest, outputDir, manifest.run.id);
          reportFiles.push(filePath);
        }
        if (fmt === 'html') {
          const filePath = await generateHtmlReport(manifest, outputDir, manifest.run.id);
          reportFiles.push(filePath);
        }
      }

      if (formats.includes('console')) {
        const output = generateConsoleReport(manifest, reportFiles);
        process.stdout.write(output);
      }

      // 退出码
      const {summary} = manifest;
      if (summary.errored > 0) {
        process.exit(2);
      }
      if (summary.changed > 0 || summary.failed > 0) {
        process.exit(1);
      }
      process.exit(0);
    });

  return cmd;
}

const ENGINE_PACKAGES = {
  playwright: '@visual-guard/engine-playwright',
  puppeteer: '@visual-guard/engine-puppeteer',
  cypress: '@visual-guard/engine-cypress'
} as const;

type EngineName = keyof typeof ENGINE_PACKAGES;

async function _tryLoadEngine(name: EngineName) {
  const pkg = ENGINE_PACKAGES[name];
  try {
    return await import(pkg);
  } catch {
    return null;
  }
}

async function _loadAdapter(engine: string) {
  const name = (
    engine === 'playwright' || engine === 'puppeteer' || engine === 'cypress' ? engine : null
  ) as EngineName | null;

  if (!name) {
    logger.error(`不支持的引擎: ${engine}（可选: ${Object.keys(ENGINE_PACKAGES).join(' | ')}）`);
    process.exit(2);
  }

  const mod = await _tryLoadEngine(name);

  if (!mod) {
    const pkg = ENGINE_PACKAGES[name];
    logger.error(`引擎 ${chalk.bold(pkg)} 未安装，请执行:`);
    logger.error(`  pnpm add ${pkg}`);
    process.exit(2);
  }

  if (name === 'playwright') {
    return (mod as {createPlaywrightAdapter: () => BrowserEngineAdapter}).createPlaywrightAdapter();
  }
  if (name === 'puppeteer') {
    return (mod as {createPuppeteerAdapter: () => BrowserEngineAdapter}).createPuppeteerAdapter();
  }
  return (mod as {createCypressAdapter: () => BrowserEngineAdapter}).createCypressAdapter();
}

function _parseFormats(raw: string): Array<'console' | 'json' | 'html' | 'pdf'> {
  const parts = raw.split(',').map(s => s.trim().toLowerCase());
  const valid = new Set(['console', 'json', 'html', 'pdf']);
  return parts.filter((f): f is 'console' | 'json' | 'html' | 'pdf' => valid.has(f));
}
