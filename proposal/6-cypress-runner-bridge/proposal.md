# 4. Cypress Runner 桥接闭环

项目目录：
  ./packages/engine-cypress/src/index.ts
  ./packages/core/src/runner.ts

问题描述：
  1. `engine-cypress` 当前只实现了 spec 生成（`generateCypressSpec`、`generateCypressConfig`），但 `launch()` 直接抛 `CYPRESS_BRIDGE_MODE_ONLY` 错误
  2. 无法通过 `visual-guard run --engine cypress` 完成完整的采集→对比→报告流程
  3. 设计文档 `docs/questions/01-browser-engine-adapter-tradeoffs.md` 已有完整闭环方案设计

解决方案：
  1. 定义 Cypress artifact 协议目录结构：
     ```text
     .visual-guard/cypress-artifacts/
       cases/
         {sceneId}@{viewportName}/
           meta.json
           dom.html
           screenshot.png
           elements/{encodedSelector}.png
     ```

  2. 实现 `readCypressArtifacts(artifactDir): Promise<CaptureResult[]>` 在 core 中，将 Cypress 产物转换为标准 CaptureResult

  3. 在 CLI `run` 命令中区分引擎分型：`adapter.kind === 'realtime'` 走实时引擎路径，`adapter.kind === 'runner'` 走 Runner 桥接路径

  4. Runner 桥接执行流程：
     - 生成临时 Cypress spec + config
     - 调用 `cypress.run({ configFile, spec })`
     - Cypress 执行 → 写入 artifacts
     - Core 读取 artifacts → 转换为 Snapshot
     - 复用 baseline / diff / reporter

  5. 扩展 `BrowserEngineAdapter` 接口，增加 `kind: 'realtime' | 'runner'` 分型字段

  6. Runner 引擎的 `capabilities` 声明限制（无 CDP access、无 multiContext 池化）

  7. 最终用户入口保持一致：`visual-guard run --engine cypress`
