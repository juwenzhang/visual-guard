import fs from 'node:fs/promises';
import path from 'node:path';
import type {DiffManifest} from '@visual-guard/shared';

export {generateConsoleReport} from './console';
export {generateHtmlReport} from './html';
export {generateJsonReport} from './json';
export type {ReporterOptions} from './types';

/**
 * 根 reports 索引 — 列出所有历史运行记录
 *
 * 生成 `outputDir/index.html`，提供运行历史概览入口。
 */
export async function generateReportsIndex(outputDir: string): Promise<string> {
  await fs.mkdir(outputDir, {recursive: true});

  const entries = await fs.readdir(outputDir, {withFileTypes: true});
  const runs: Array<{
    id: string;
    time: string;
    reportHtml: string;
    summaryJson: string;
  }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const runDir = path.join(outputDir, entry.name);
    const reportHtml = path.join(runDir, 'report.html');
    const summaryJson = path.join(runDir, 'summary.json');

    try {
      await fs.access(reportHtml);
      let time = entry.name;
      try {
        const summaryRaw = await fs.readFile(summaryJson, 'utf-8');
        const s = JSON.parse(summaryRaw);
        time = s.run?.startedAt ?? entry.name;
      } catch {
        // 无 summary.json 时用目录名
      }
      runs.push({
        id: entry.name,
        time,
        reportHtml: `${entry.name}/report.html`,
        summaryJson: `${entry.name}/summary.json`
      });
    } catch {
      // 目录中无 report.html 则跳过
    }
  }

  runs.sort((a, b) => b.time.localeCompare(a.time));

  const html = _buildIndexHtml(runs);
  const filePath = path.join(outputDir, 'index.html');
  await fs.writeFile(filePath, html, 'utf-8');
  return filePath;
}

function _buildIndexHtml(runs: Array<{id: string; time: string; reportHtml: string}>): string {
  const rows = runs
    .map(
      r => `
    <tr>
      <td><a href="${r.reportHtml}">${r.id}</a></td>
      <td>${new Date(r.time).toLocaleString('zh-CN')}</td>
    </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Guard — 运行历史</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; color: #333; }
    .container { max-width: 960px; margin: 0 auto; padding: 40px 24px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.1); }
    th, td { padding: 14px 20px; text-align: left; }
    th { background: #f9fafb; color: #666; font-size: 13px; font-weight: 600; text-transform: uppercase; }
    td { border-top: 1px solid #f0f0f0; font-size: 14px; }
    a { color: #6366f1; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { text-align: center; padding: 48px; color: #aaa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🔍 Visual Guard — 运行历史</h1>
    <p class="subtitle">共 ${runs.length} 次运行记录</p>
    ${runs.length === 0 ? '<div class="empty">暂无运行记录</div>' : `<table><thead><tr><th>运行 ID</th><th>时间</th></tr></thead><tbody>${rows}</tbody></table>`}
  </div>
</body>
</html>`;
}

/**
 * 根据报告类型列表生成所有报告
 */
export async function generateReports(
  generate: {
    console: (m: DiffManifest) => string;
    json: (m: DiffManifest, outputDir: string, runId: string) => Promise<string[]>;
    html: (m: DiffManifest, outputDir: string, runId: string) => Promise<string>;
  },
  manifest: DiffManifest,
  outputDir: string,
  runId: string,
  formats: Array<'console' | 'json' | 'html' | 'pdf'>
): Promise<{files: string[]; consoleOutput: string}> {
  const files: string[] = [];
  let consoleOutput = '';

  for (const fmt of formats) {
    if (fmt === 'console') {
      consoleOutput = generate.console(manifest);
    }
    if (fmt === 'json') {
      const filePaths = await generate.json(manifest, outputDir, runId);
      files.push(...filePaths);
    }
    if (fmt === 'html') {
      const filePath = await generate.html(manifest, outputDir, runId);
      files.push(filePath);
    }
  }

  return {files, consoleOutput};
}
