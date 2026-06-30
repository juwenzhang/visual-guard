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
        {name: 'puppeteer (实验性)', value: 'puppeteer'}
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

    // Webhook 通知
    const plugins: Array<{name: string; options?: Record<string, unknown>}> = [];
    const enableNotify = await confirm({
      message: 'CI 运行后通知（Webhook / 邮件）？',
      default: false
    });
    if (enableNotify) {
      const channel = await select({
        message: '通知渠道',
        choices: [
          {name: '企业微信机器人', value: 'wecom'},
          {name: '飞书机器人', value: 'feishu'},
          {name: '钉钉机器人', value: 'dingtalk'},
          {name: 'QQ 邮箱 (SMTP)', value: 'email'},
          {name: '通用 Webhook', value: 'generic'}
        ]
      });

      if (channel === 'email') {
        const prefix = 'VG_EMAIL_';
        const smtpHost = await input({message: 'SMTP 服务器', default: 'smtp.qq.com'});
        const smtpPort = await input({message: 'SMTP 端口', default: '465'});
        const smtpUser = await input({message: '发件邮箱（如 xxx@qq.com）'});
        const smtpPass = await input({message: 'SMTP 授权码（QQ 邮箱 → 设置 → 账户 → POP3/SMTP）'});
        const to = await input({message: '收件邮箱'});
        plugins.push({
          name: 'notify',
          options: {
            email: {
              host: smtpHost,
              port: Number(smtpPort),
              user: `env:${prefix}USER`,
              pass: `env:${prefix}PASS`,
              to: `env:${prefix}TO`
            }
          }
        });
        // 生成 .env 示例
        await _writeEnvExample(process.cwd(), [
          ['# Visual Guard — 邮件通知配置', ''],
          [`${prefix}USER=${smtpUser}`, ''],
          [`${prefix}PASS=${smtpPass}`, ''],
          [`${prefix}TO=${to}`, '']
        ]);
      } else {
        const webhookUrl = await input({
          message: 'Webhook URL',
          validate: (v: string) => (v.startsWith('https://') ? true : '请输入完整的 https:// URL')
        });
        const optKey =
          channel === 'wecom'
            ? 'wecomWebhook'
            : channel === 'feishu'
              ? 'feishuWebhook'
              : channel === 'dingtalk'
                ? 'dingtalkWebhook'
                : 'webhook';
        const envKey = `VG_NOTIFY_${channel.toUpperCase()}`;
        plugins.push({name: 'notify', options: {[optKey]: `env:${envKey}`}});
        await _writeEnvExample(process.cwd(), [
          ['# Visual Guard — 通知 Webhook', ''],
          [`${envKey}=${webhookUrl}`, '']
        ]);
      }
    }

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
      reporters: formatList,
      plugins
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
    if (plugins.length > 0) {
      logger.info('');
      logger.info('⚠ 通知插件使用 env: 前缀引用环境变量，请设置对应的环境变量后运行');
      logger.info('  参考 .env.example 文件了解所需变量');
    }
    logger.info('');
    logger.info('接下来:');
    logger.info(chalk.white(`  visual-guard run -c ${path.basename(filePath)}`));
    logger.info('');
  });

  return cmd;
}

/**
 * 将敏感环境变量写入 .env.example 文件（追加模式）
 * 避免密码/授权码等直接写入配置文件中
 */
async function _writeEnvExample(cwd: string, entries: Array<[string, string]>): Promise<void> {
  const filePath = path.join(cwd, '.env.example');
  try {
    // read existing content to avoid duplicates
    const existing = await fs.readFile(filePath, 'utf-8').catch(() => '');
    const lines = entries.filter(([k]) => !existing.includes(k.split('=')[0] ?? ''));
    if (lines.length === 0) return;
    const content = (existing ? `${existing}\n` : '') + lines.map(([k]) => k).join('\n') + '\n';
    await fs.writeFile(filePath, content, 'utf-8');
  } catch {
    // 写入 .env.example 失败不阻断主流程
  }
}
