// biome-ignore-all lint/complexity/useLiteralKeys: commander options 使用 Record 索引签名
import {execFileSync} from 'node:child_process';
import {loadConfig} from '@visual-guard/config';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

const DEFAULT_SPEC = 'cypress/e2e/visual-guard.generated.cy.js';
const DEFAULT_CYPRESS_CONFIG = 'cypress.config.js';
const DEFAULT_ARTIFACT_DIR = '.visual-guard/cypress-artifacts';

export function createCypressCommand(): Command {
  const cmd = new Command('cypress');

  cmd.description('Cypress 桥接工具');

  cmd
    .command('spec')
    .description('根据 Visual Guard 配置生成 Cypress spec 与 cypress.config.ts')
    .option('-c, --config <path>', 'Visual Guard 配置文件路径')
    .option('--spec <path>', '输出 Cypress spec 文件路径', DEFAULT_SPEC)
    .option('--cypress-config <path>', '输出 Cypress 配置文件路径', DEFAULT_CYPRESS_CONFIG)
    .option('--artifact-dir <path>', 'Cypress 采集产物目录', DEFAULT_ARTIFACT_DIR)
    .action(async (options: Record<string, string | undefined>) => {
      const result = await _generateFiles(options);

      logger.info(chalk.green('✅ Cypress 桥接文件已生成'));
      logger.info(`  spec: ${result.specPath}`);
      logger.info(`  config: ${result.configPathOut}`);
      logger.info('');
      logger.info('下一步执行:');
      logger.info(`  npx cypress run --config-file ${result.cypressConfig}`);
    });

  cmd
    .command('run')
    .description('生成 Cypress 桥接文件并执行 cypress run')
    .option('-c, --config <path>', 'Visual Guard 配置文件路径')
    .option('--spec <path>', '输出 Cypress spec 文件路径', DEFAULT_SPEC)
    .option('--cypress-config <path>', '输出 Cypress 配置文件路径', DEFAULT_CYPRESS_CONFIG)
    .option('--artifact-dir <path>', 'Cypress 采集产物目录', DEFAULT_ARTIFACT_DIR)
    .option('--browser <browser>', 'Cypress 浏览器（electron/chrome/chromium）', 'electron')
    .action(async (options: Record<string, string | undefined>) => {
      const result = await _generateFiles(options);
      const browser = options['browser'] ?? 'electron';

      logger.info(chalk.green('✅ Cypress 桥接文件已生成'));
      logger.info(`  spec: ${result.specPath}`);
      logger.info(`  config: ${result.configPathOut}`);
      logger.info('');
      logger.info('开始执行 Cypress...');

      try {
        execFileSync(
          'npx',
          ['cypress', 'run', '--config-file', result.cypressConfig, '--browser', browser],
          {
            cwd: process.cwd(),
            stdio: 'inherit',
            env: process.env
          }
        );
      } catch {
        logger.error('Cypress 执行失败，请检查上方 Cypress 日志。');
        process.exit(2);
      }
    });

  return cmd;
}

async function _generateFiles(options: Record<string, string | undefined>) {
  const configPath = typeof options['config'] === 'string' ? options['config'] : undefined;
  const config = await loadConfig(undefined, configPath);
  const cypress = await _loadCypressBridge();

  const specFile = options['spec'] ?? DEFAULT_SPEC;
  const cypressConfig = options['cypress-config'] ?? DEFAULT_CYPRESS_CONFIG;
  const artifactDir = options['artifact-dir'] ?? DEFAULT_ARTIFACT_DIR;

  const specPath = await cypress.writeCypressSpec(
    {
      project: config.project,
      baseUrl: config.baseUrl,
      scenarios: config.scenarios,
      viewport: config.viewport,
      artifactDir
    },
    specFile
  );

  const configPathOut = await cypress.writeCypressConfig(
    {
      baseUrl: config.baseUrl,
      specPattern: specFile,
      artifactDir
    },
    cypressConfig
  );

  return {specPath, configPathOut, cypressConfig};
}

async function _loadCypressBridge() {
  try {
    return await import('@visual-guard/engine-cypress');
  } catch (e) {
    logger.error('Cypress 引擎包未安装，请执行:');
    logger.error('  pnpm add -D @visual-guard/engine-cypress cypress');
    throw e;
  }
}
