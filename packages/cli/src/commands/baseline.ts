// biome-ignore-all lint/complexity/useLiteralKeys: commander options 使用 Record 索引签名
import {existsSync} from 'node:fs';
import {createLocalBaselineStore} from '@visual-guard/core';
import {logger} from '@visual-guard/shared';
import chalk from 'chalk';
import {Command} from 'commander';

export function createBaselineCommand(): Command {
  const cmd = new Command('baseline');

  cmd.description('基线管理');

  // baseline list
  cmd
    .command('list')
    .description('列出所有基线')
    .option('-p, --project <project>', '按项目筛选')
    .option('-e, --env <env>', '按环境筛选')
    .option('-b, --branch <branch>', '按分支筛选')
    .action(async (options: Record<string, string>) => {
      const dir = '.visual-guard/baselines';
      if (!existsSync(dir)) {
        logger.info(chalk.gray('暂无基线数据。'));
        return;
      }

      const store = createLocalBaselineStore(dir);
      const metas = await store.list({
        project: options['project'],
        env: options['env'],
        branch: options['branch'] ?? 'main',
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (metas.length === 0) {
        logger.info(chalk.gray('暂无匹配的基线。'));
        return;
      }

      logger.info(chalk.bold(`共 ${chalk.cyan(String(metas.length))} 条基线:`));
      logger.info('');

      for (const meta of metas) {
        const key = meta.key;
        const created = new Date(meta.createdAt).toLocaleString('zh-CN');
        const updated = new Date(meta.updatedAt).toLocaleString('zh-CN');
        const size = _formatSize(meta.size);

        logger.info(chalk.white(`  ${chalk.bold(`${key.project}/${key.env}/${key.branch}`)}`));
        logger.info(chalk.gray(`    场景: ${key.sceneId}  |  视口: ${key.viewport}`));
        logger.info(chalk.gray(`    创建: ${created}  |  更新: ${updated}`));
        logger.info(
          chalk.gray(
            `    大小: DOM ${size.dom}  |  截图 ${size.screenshots}  |  版本 ${meta.version}`
          )
        );
        logger.info('');
      }
    });

  // baseline clean
  cmd
    .command('clean')
    .description('清理旧基线')
    .option('--keep <n>', '保留最近 N 个版本', '20')
    .option('--older-than <days>', '删除 N 天前的基线')
    .option('--dry-run', '预览模式，不实际删除')
    .action(async (options: Record<string, string>) => {
      const dir = '.visual-guard/baselines';
      if (!existsSync(dir)) {
        logger.info(chalk.gray('暂无基线数据，无需清理。'));
        return;
      }

      const keep = Number(options['keep']);
      const olderThan = options['older-than'] ? Number(options['older-than']) : undefined;
      const dryRun = options['dry-run'] !== undefined;

      const store = createLocalBaselineStore(dir);
      const metas = await store.list({
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      if (metas.length === 0) {
        logger.info(chalk.gray('暂无基线数据。'));
        return;
      }

      const toKeep: typeof metas = [];
      const toDelete: typeof metas = [];

      for (let i = 0; i < metas.length; i++) {
        const meta = metas[i];
        if (meta === undefined) continue;

        let shouldDelete = false;

        if (i >= keep) {
          shouldDelete = true;
        }

        if (olderThan) {
          const age = Date.now() - new Date(meta.createdAt).getTime();
          const maxAge = olderThan * 24 * 60 * 60 * 1000;
          if (age > maxAge) {
            shouldDelete = true;
          }
        }

        if (shouldDelete) {
          toDelete.push(meta);
        } else {
          toKeep.push(meta);
        }
      }

      if (toDelete.length === 0) {
        logger.info(chalk.green(`无需清理，当前共 ${metas.length} 条基线。`));
        return;
      }

      logger.info(chalk.yellow(`将删除 ${toDelete.length} 条旧基线，保留 ${toKeep.length} 条`));

      if (dryRun) {
        logger.info(chalk.gray('（预览模式，未实际删除）'));
        for (const meta of toDelete) {
          logger.info(
            chalk.gray(
              `  [预览] ${meta.key.project}/${meta.key.sceneId} v${meta.version} (${meta.createdAt})`
            )
          );
        }
        return;
      }

      for (const meta of toDelete) {
        await store.delete(meta.key);
        logger.info(
          chalk.gray(`  已删除: ${meta.key.project}/${meta.key.sceneId} v${meta.version}`)
        );
      }

      logger.info('');
      logger.info(chalk.green(`✅ 清理完成: 删除 ${toDelete.length} 条，保留 ${toKeep.length} 条`));
    });

  return cmd;
}

function _formatSize(size: {
  dom: number;
  screenshots: number;
  network: number;
  performance: number;
}) {
  const format = (bytes: number): string => {
    if (bytes === 0) return '—';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };
  return {
    dom: format(size.dom),
    screenshots: format(size.screenshots),
    network: format(size.network),
    performance: format(size.performance)
  };
}
