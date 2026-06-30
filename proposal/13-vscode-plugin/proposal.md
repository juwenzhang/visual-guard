# 11. VSCode 插件

项目目录：
  新包 ./packages/vscode-extension/

问题描述：
  1. 当前所有操作依赖 CLI，开发体验不够直观
  2. 设计文档 §5.1 提到「支持后续扩展 VSCode 插件」
  3. 竞品（Percy、Chromatic）均有 VSCode/Browser 可视化能力

解决方案：
  1. 新增 `packages/vscode-extension/` 包

  2. 核心功能：
     - 侧边栏面板：显示项目场景列表、基线状态、最近运行记录
     - 截图对比视图：并排显示基线与当前截图，支持 diff overlay
     - 右键菜单：对选中 HTML/CSS 文件「添加到视觉检查」
     - 状态栏指示器：显示上次运行结果（✅ 通过 / ⚠️ 有差异 / ❌ 失败）
     - 命令面板：`Visual Guard: Run`、`Visual Guard: Write Baseline`、`Visual Guard: Open Report`

  3. 报告预览：在 VSCode 内置 Webview 中渲染 HTML 报告

  4. 配置可视化：通过 VSCode Settings UI 编辑 `visualguard.config.*`

  5. 集成 monorepo 中的其他包（core/reporters/config），复用逻辑

  6. 打包为 `.vsix`，发布到 VSCode Marketplace

  7. 技术选型：`@types/vscode`、Webview API、vscode-languageclient
