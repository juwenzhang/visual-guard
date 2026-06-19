export {generateConsoleReport} from './console';
export {generateHtmlReport} from './html';
export {generateJsonReport} from './json';
export type {ReporterOptions} from './types';

/**
 * 根据报告类型列表生成所有报告
 *
 * @param options - 报告选项
 * @param formats - 报告类型列表
 * @returns 生成的文件路径列表和终端输出
 */
export async function generateReports(
  generate: {
    console: (m: import('@visual-guard/shared').DiffManifest) => string;
    json: (
      m: import('@visual-guard/shared').DiffManifest,
      outputDir: string,
      runId: string
    ) => Promise<string>;
    html: (
      m: import('@visual-guard/shared').DiffManifest,
      outputDir: string,
      runId: string
    ) => Promise<string>;
  },
  manifest: import('@visual-guard/shared').DiffManifest,
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
      const filePath = await generate.json(manifest, outputDir, runId);
      files.push(filePath);
    }
    if (fmt === 'html') {
      const filePath = await generate.html(manifest, outputDir, runId);
      files.push(filePath);
    }
  }

  return {files, consoleOutput};
}
