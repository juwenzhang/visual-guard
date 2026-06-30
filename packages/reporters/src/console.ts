import type {DiffManifest} from '@visual-guard/shared';
import chalk from 'chalk';

/**
 * 控制台报告器 — 输出彩色终端摘要 + 下一步指引
 *
 * @param manifest - 对比结果清单
 * @param reportFiles - 已生成的报告文件路径列表（json/html）
 */
export function generateConsoleReport(manifest: DiffManifest, reportFiles: string[] = []): string {
  const {summary, run, scenarios} = manifest;
  const lines: string[] = [];
  const isAllBaseline = summary.baseline > 0 && summary.baseline === summary.total;
  const hasDiffs = summary.changed > 0;

  // 标题
  lines.push('');
  lines.push(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  lines.push(chalk.bold.cyan('  Visual Guard — 视觉回归检测'));
  lines.push(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  lines.push('');

  // 运行信息（精简）
  lines.push(chalk.gray(`${run.project} / ${run.env} / ${run.branch}  ·  ${run.id}`));
  lines.push('');

  // 汇总
  lines.push(chalk.bold('结果:'));
  if (isAllBaseline) {
    lines.push(chalk.blue(`  基线建立  ${chalk.gray(`${summary.baseline} 个场景`)}`));
  } else {
    const parts: string[] = [];
    if (summary.passed > 0) parts.push(chalk.green(`${summary.passed} 通过`));
    if (summary.changed > 0) parts.push(chalk.yellow(`${summary.changed} 有变化`));
    if (summary.baseline > 0) parts.push(chalk.blue(`${summary.baseline} 基线`));
    if (summary.failed > 0) parts.push(chalk.red(`${summary.failed} 失败`));
    if (summary.errored > 0) parts.push(chalk.red(`${summary.errored} 错误`));
    lines.push(`  ${parts.join('  ')}`);
  }
  lines.push('');

  // 场景详情
  const detailScenes = scenarios.filter(s => s.status !== 'passed');
  if (detailScenes.length > 0) {
    lines.push(chalk.bold('场景:'));
    for (const scene of detailScenes) {
      const icon = _statusIcon(scene.status);
      const name = scene.name || scene.id;
      lines.push(`  ${icon} ${chalk.bold(name)}  ${chalk.gray(`${scene.durationMs}ms`)}`);

      if (scene.status === 'baseline') {
        lines.push(`    ${chalk.blue('📸 基线截图已保存')}`);
      }

      // 优先使用语义化摘要
      if (scene.semantic && scene.semantic.changes.length > 0) {
        for (const c of scene.semantic.changes) {
          const icon =
            c.severity === 'critical'
              ? '🔴'
              : c.severity === 'high'
                ? '🟠'
                : c.severity === 'medium'
                  ? '🟡'
                  : '🔵';
          lines.push(`    ${icon} [${c.type}] ${c.description}`);
        }
      } else if (scene.status !== 'baseline') {
        // fallback: raw diff 数据
        if (scene.diffs.pixel) {
          const ratio =
            scene.diffs.pixel.diffRatio !== undefined
              ? (scene.diffs.pixel.diffRatio * 100).toFixed(2)
              : '—';
          const hasDiff = (scene.diffs.pixel.diffRatio ?? 0) > 0;
          const color = hasDiff ? chalk.yellow : chalk.gray;
          lines.push(
            `    ${color('◉')} 像素: ${color(`${ratio}%`)} (${scene.diffs.pixel.diffPixels} / ${scene.diffs.pixel.totalPixels} px)`
          );
        }
        if (scene.diffs.dom && scene.diffs.dom.changeRatio > 0) {
          const r = (scene.diffs.dom.changeRatio * 100).toFixed(2);
          lines.push(
            `    ${chalk.yellow('◈')} DOM: ${chalk.yellow(`${r}%`)} (+${scene.diffs.dom.added.length}/-${scene.diffs.dom.removed.length}/~${scene.diffs.dom.changed.length})`
          );
        }
        if (scene.diffs.layout && scene.diffs.layout.changeCount > 0) {
          lines.push(
            `    ${chalk.yellow('↕')} 布局: ${chalk.yellow(String(scene.diffs.layout.changeCount))} 处偏移`
          );
        }
      }

      for (const err of scene.errors) {
        lines.push(`    ${chalk.red('✖')} ${err.message}`);
      }
    }
    lines.push('');
  }

  // 报告文件
  if (reportFiles.length > 0) {
    lines.push(chalk.bold('报告文件:'));
    for (const f of reportFiles) {
      lines.push(`  ${chalk.gray(f)}`);
    }
    lines.push('');
  }

  // 下一步指引
  lines.push(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  if (isAllBaseline) {
    lines.push('');
    lines.push(chalk.white('  📌 这是首次运行，已为所有场景建立基线。'));
    lines.push(chalk.white('     修改页面后再次运行即可检测视觉变化。'));
    lines.push('');
  } else if (hasDiffs) {
    lines.push('');
    lines.push(chalk.yellow('  ⚠ 检测到视觉差异，请检查报告文件了解详情。'));
    lines.push('');
  } else if (summary.errored > 0) {
    lines.push('');
    lines.push(chalk.red('  ✖ 部分场景执行失败，请检查错误信息。'));
    lines.push('');
  } else {
    lines.push('');
    lines.push(chalk.green('  ✓ 全部场景通过，无视觉变化。'));
    lines.push('');
  }
  lines.push(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  lines.push('');

  return lines.join('\n');
}

function _statusIcon(status: string): string {
  if (status === 'passed') return chalk.green('✓');
  if (status === 'changed') return chalk.yellow('△');
  if (status === 'baseline') return chalk.blue('●');
  if (status === 'failed') return chalk.red('✗');
  return chalk.red('⚠');
}
