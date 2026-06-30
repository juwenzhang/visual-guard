# 12. Windows 平台适配

项目目录：
  ./packages/engine-playwright/src/
  ./packages/engine-puppeteer/src/
  ./packages/engine-cypress/src/

问题描述：
  1. 当前引擎策略明确声明「只保证 macOS / Linux，暂不适配 Windows」
  2. README.md 中标注「当前主线只保证 macOS / Linux」
  3. 设计文档 §4.1 引擎策略中同样标记不支持 Windows
  4. 对于 Windows 开发团队（大量前端项目使用 Windows），这是明显的使用门槛

解决方案：
  1. 在 engine-playwright 中适配 Windows 路径和进程管理：
     - Playwright 自身已良好支持 Windows，主要是 Chrome 路径查找和进程启停差异
     - 确保 `npx playwright install chromium` 在 Windows 下正常执行

  2. engine-puppeteer 适配 Windows：
     - Chrome/Chromium 可执行文件路径查找（`Program Files`、`AppData\Local` 等）
     - `resolveSystemChromeExecutablePath()` 增加 Windows 路径分支
     - 添加 Windows 平台的 Chrome 安装指引

  3. engine-cypress 适配 Windows：
     - Cypress 本身支持 Windows，主要是路径分隔符和命令执行差异
     - spec 生成路径使用 `path.join()` 而非硬编码 `/`

  4. shared/path 工具适配：
     - 确保 `generateBaselinePath`、`generateScreenshotPath` 等使用跨平台路径
     - 路径对比和 glob 匹配兼容 Windows 反斜杠

  5. CLI 适配：
     - `spawn` / `exec` 子进程调用适配 Windows（cmd vs bash）
     - 交互式命令（`init`）兼容 Windows Terminal / PowerShell

  6. CI 验证：
     - `.github/workflows/ci.yml` 增加 `windows-latest` matrix
     - 覆盖 Windows 下的 `pnpm build` + `pnpm test` + `pnpm guard:run`

  7. 注意：部分能力在 Windows 下可能有已知限制：
     - Docker 镜像构建暂不覆盖
     - Cypress runner 模式在 Windows 下可能需要额外配置
     - 远程基线服务的本地开发服务端不要求 Windows 支持
