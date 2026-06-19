# @visual-guard/engine-playwright

Playwright 浏览器引擎适配器，当前 Visual Guard 推荐主线引擎。

## 安装

```bash
pnpm add -D @visual-guard/cli @visual-guard/engine-playwright
```

## 使用

```bash
visual-guard run --engine playwright
```

或在配置中：

```json
{
  "browser": {
    "engine": "playwright",
    "headless": true
  }
}
```

## 能力

- 全页截图 / 元素截图
- DOM 快照
- 网络 / 控制台事件采集
- 多 context 隔离
- Cookie / Header 注入
- SSR 模式：禁用 serviceWorker、跳过网络监听、避免 streaming 页面关闭时的 Playwright tracker 问题

## 浏览器安装

若 Chromium 缺失，适配器会自动执行：

```bash
npx playwright install chromium
```

失败时可手动执行同一命令。
