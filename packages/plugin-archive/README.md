# @visual-guard/plugin-archive

截图与报告归档插件包（规划中）。

## 目标能力

- 将 `.visual-guard/reports` 打包归档
- 上传到远程存储（后续可接 COS / S3）
- 生成可分享的报告链接
- 清理历史运行产物

## 设计原则

归档只消费产物目录和 `DiffManifest`，不参与采集和 diff 决策。

当前包仍为骨架。
