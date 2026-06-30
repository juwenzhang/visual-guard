# 5. CI 集成模板

项目目录：
  ./examples/

问题描述：
  1. 当前只有项目自身的 GitHub Actions CI，没有面向用户的 CI 集成模板
  2. 用户缺少开箱即用的 CI 配置参考，难以将 Visual Guard 接入现有流水线
  3. 设计文档 P1 明确要求 CI 集成示例

解决方案：
  1. 新增 `examples/ci/` 目录，包含多个 CI 平台模板

  2. GitHub Actions 模板 (`examples/ci/github-actions.yml`)：
     - 安装依赖 → 启动 dev server → `visual-guard run` → 上传报告 artifact
     - 支持 PR comment 通知差异摘要
     - 配置 `--write-baseline` 在 main 分支自动更新基线

  3. GitLab CI 模板 (`examples/ci/gitlab-ci.yml`)：
     - 使用 `image: mcr.microsoft.com/playwright:v1.x.x` 内置浏览器
     - stages: baseline → test → report
     - 报告发布到 GitLab Pages

  4. 通用 CI 脚本 (`examples/ci/run-guard.sh`)：
     - 检查基线是否存在，不存在则 `--write-baseline`
     - 根据分支决定基线策略（feature 分支 vs main）
     - 退出码处理与 CI 兼容

  5. 新增 `examples/ci/README.md` 使用说明，覆盖三种场景：
     - PR 检查模式（与主分支基线对比）
     - 基线更新模式（合并到 main 后自动更新）
     - 定时回归模式（深夜定时全量检查）

  6. 可选：GitHub Action Marketplace 发布 `visual-guard-action`
