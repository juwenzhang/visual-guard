import fs from 'node:fs/promises';
import path from 'node:path';
import {confirm, input, select} from '@inquirer/prompts';
import {validateConfig} from '@visual-guard/config';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

export function createInitCommand(): Command {
  const cmd = new Command('init');

  cmd.description('交互式生成 Visual Guard 配置文件').action(async () => {
    logger.info(chalk.cyan('Visual Guard — 初始化配置'));
    logger.info('');

    const project = await input({
      message: '项目名称',
      default: path.basename(process.cwd())
    });

    const baseUrl = await input({
      message: '被测页面根地址 (baseUrl)',
      default: 'http://localhost:3000',
      validate: (v: string) => {
        try {
          new URL(v);
          return true;
        } catch {
          return '请输入合法的 URL（如 https://example.com）';
        }
      }
    });

    const engine = await select({
      message: '浏览器引擎',
      choices: [
        {name: 'playwright (推荐)', value: 'playwright'},
        {name: 'cypress (桥接模式，规划中)', value: 'cypress'},
        {name: 'puppeteer (实验性，暂不推荐)', value: 'puppeteer'}
      ]
    });

    const headless = await confirm({
      message: '是否使用无头模式？',
      default: true
    });

    const scenarios: Array<{id: string; name: string; path: string}> = [];
    let addMore = true;

    while (addMore) {
      const name = await input({
        message: `场景${scenarios.length > 0 ? ` #${scenarios.length + 1}` : ''} 名称（如「首页」）`,
        default: scenarios.length === 0 ? '首页' : ''
      });

      const pagePath = await input({
        message: '页面路径（如 /、/about）',
        default: scenarios.length === 0 ? '/' : '',
        validate: (v: string) => (v.length > 0 ? true : '路径不能为空')
      });

      const id = pagePath.replaceAll('/', '_').replace(/^_/, '').replace(/_$/, '') || 'root';
      scenarios.push({id, name, path: pagePath});

      addMore = await confirm({
        message: '添加更多场景？',
        default: false
      });
    }

    const formats = await select({
      message: '报告格式',
      choices: [
        {name: 'console + json + html (推荐)', value: 'all'},
        {name: 'console + json', value: 'json'},
        {name: '仅控制台', value: 'console'}
      ]
    });

    const formatList =
      formats === 'all'
        ? ['console', 'json', 'html']
        : formats === 'json'
          ? ['console', 'json']
          : ['console'];

    const config = {
      project,
      env: 'development',
      baseUrl,
      renderMode: 'auto',
      outputDir: '.visual-guard/reports',
      baselineDir: '.visual-guard/baselines',
      concurrency: 1,
      timeout: 30000,
      browser: {
        engine,
        headless,
        launchOptions: {
          args: ['--ignore-certificate-errors', '--disable-web-security']
        }
      },
      viewport: [
        {name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false}
      ],
      diff: {
        pixel: {threshold: 0.1, maxDiffRatio: 0.01, includeAA: true},
        layout: {maxDistance: 4}
      },
      scenarios: scenarios.map(s => ({
        ...s,
        tags: ['smoke'],
        waitForSelector: 'body'
      })),
      reporters: formatList
    };

    // 校验
    const result = validateConfig(config);
    if (!result.ok) {
      logger.error('配置校验失败:');
      for (const err of result.errors) {
        logger.error(`  - ${err}`);
      }
      process.exit(2);
    }

    const filePath = path.join(process.cwd(), 'visualguard.config.json');
    await fs.writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');

    logger.info('');
    logger.info(chalk.green(`✅ 配置文件已生成: ${filePath}`));
    logger.info('');
    logger.info('接下来:');
    logger.info(chalk.white(`  visual-guard run -c ${path.basename(filePath)}`));
    logger.info('');
  });

  return cmd;
}
