/**
 * @visual-guard/core 功能演示 — 多版本 URL 对比
 *
 * 核心概念：同一个场景路径（如 /），可在多组 URL 间对比：
 *   baselineUrls[n]  →  baseUrl
 *
 * 合适场景：生产 vs 预发布、旧版 vs 新版、多环境对比
 * 运行：pnpm run start
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {loadConfig, validateConfig} from '@visual-guard/config';
import {resolveScenes, run} from '@visual-guard/core';
import {createPlaywrightAdapter} from '@visual-guard/engine-playwright';
import {generateReportPath} from '@visual-guard/shared';

// ─────────────────── 1. 加载 & 展示配置 ───────────────────
console.log('📋 1. 加载配置文件...');
const config = await loadConfig();
const baselineUrls = config.baselineUrls ?? [];

console.log(`   项目: ${config.project}`);
console.log(`   当前 URL: ${config.baseUrl}`);
console.log(`   对比 URL 数: ${baselineUrls.length}`);
for (const [i, url] of baselineUrls.entries()) {
  console.log(`     [${i}] ${url}`);
}

// ─────────────────── 2. 场景解析 ───────────────────
console.log('\n🔀 2. 场景解析...');
const scenes = resolveScenes(config);
console.log(
  `   ${scenes.length} 个执行单元（${config.scenarios.length} 场景 × ${config.viewport?.length ?? 1} 视口）`
);

// ─────────────────── 3. 配置校验 ───────────────────
console.log('\n🧪 3. 配置校验...');
console.log(`   合法: ${validateConfig(config).ok ? '✅' : '❌'}`);

// ─────────────────── 4. 多版本对比 ───────────────────
console.log('\n🚀 4. 多版本对比...');

for (const [i, baselineUrl] of baselineUrls.entries()) {
  console.log(`\n   [${i + 1}/${baselineUrls.length}] ${baselineUrl} → ${config.baseUrl}`);

  // 4a. 用 baselineUrl 建基线
  const baselineConfig = {...config, baseUrl: baselineUrl, baselineUrls: []};
  const first = await run({
    config: baselineConfig,
    adapter: createPlaywrightAdapter(),
    concurrency: 2
  });
  console.log(`   ✅ 基线: ${first.summary.total} 场景 | ${first.run.endedAt}`);

  // 4b. 用当前 baseUrl 对比
  const currentConfig = {...config, baselineUrls: []};
  const manifest = await run({
    config: currentConfig,
    adapter: createPlaywrightAdapter(),
    concurrency: 2
  });

  const changed = manifest.summary.changed;
  const passed = manifest.summary.passed;
  console.log(`   🔬 对比: ${passed} 通过 | ${changed} 变化 | ${manifest.summary.errored} 错误`);

  for (const r of manifest.scenarios) {
    const icon = r.status === 'passed' ? '✅' : '⚠️';
    const parts = [`     ${icon} ${r.id}`];
    if (r.diffs.pixel) parts.push(`像素=${(r.diffs.pixel.diffRatio * 100).toFixed(1)}%`);
    if (r.diffs.dom) parts.push(`DOM=${(r.diffs.dom.changeRatio * 100).toFixed(1)}%`);
    if (r.diffs.layout) parts.push(`布局=${r.diffs.layout.changeCount}`);
    console.log(parts.join(' | '));
  }

  // 4c. 写入报告（每组对比生成独立报告）
  const reportsDir = config.outputDir ?? '.visual-guard/reports';
  const reportPath = generateReportPath(reportsDir, manifest.run.id, 'json');
  await fs.mkdir(path.dirname(reportPath), {recursive: true});
  await fs.writeFile(reportPath, JSON.stringify(manifest, null, 2), 'utf-8');

  // Diff 截图
  let diffCount = 0;
  for (const r of manifest.scenarios) {
    if (r.artifacts.diffScreenshot) {
      const dir = path.join(path.dirname(reportPath), r.id.replace(/[@/]/g, '_'));
      await fs.mkdir(dir, {recursive: true});
      await fs.writeFile(
        path.join(dir, 'diff.png'),
        Buffer.from(r.artifacts.diffScreenshot, 'base64')
      );
      diffCount++;
    }
  }
  console.log(`   📄 ${reportPath}`);
  console.log(`   🖼️  ${diffCount} 张 diff 截图`);
}

// ─────────────────── 5. 总览 ───────────────────
console.log('\n📁 5. 输出物总览...');
console.log(`   📂 基线: ${path.resolve(config.baselineDir ?? '.visual-guard/baselines')}`);
console.log(`   📂 报告: ${path.resolve(config.outputDir ?? '.visual-guard/reports')}`);

console.log('\n🎉 所有测试完成！');
