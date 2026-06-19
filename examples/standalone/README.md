# Visual Guard 独立工程示例

模拟真实用户从安装到运行的完整流程。

## 快速开始

```bash
# 安装依赖
pnpm install

# 首次运行 — 建立基线（主线：Playwright）
pnpm guard:run

# 修改页面后再次运行 — 检测视觉变化
pnpm guard:run

# 更新基线
pnpm guard:run -- --write-baseline

# 查看基线列表
pnpm guard:baseline

# 清理旧基线（预览模式）
pnpm guard:clean
```

## 引擎说明

| 引擎 | 状态 | 说明 |
|------|------|------|
| Playwright | ✅ 推荐 | 当前主线，稳定跑通 |
| Cypress | 🟡 桥接规划中 | 后续通过 Cypress spec + task 输出采集产物 |
| Puppeteer | ⚠️ 实验/暂停 | 已确认在多版本、Chrome 缓存、headless、连接生命周期上不稳定 |

本示例会声明所有引擎 peer 依赖，方便验证安装关系；但实际执行建议使用 Playwright：

```bash
pnpm guard:run
```

Cypress 当前走桥接模式，会先生成 Cypress spec/config，再执行 Cypress：

```bash
pnpm guard:run:cypress
```

Puppeteer 保留脚本但不作为主线验证：

```bash
pnpm guard:run:puppeteer
```

## 配置要点

| 字段 | 说明 | 示例 |
|------|------|------|
| `project` | 项目名称 | `"my-web-app"` |
| `baseUrl` | 被测页面根地址 | `"http://localhost:3000"` |
| `browser.engine` | 浏览器引擎 | `"playwright"` |
| `scenarios[].path` | 页面相对路径 | `"/"` / `"/about"` |
| `viewport` | 视口列表 | `[{width: 1280, height: 800}]` |

## 发布后安装方式

```bash
# 推荐安装方式
npm install -D @visual-guard/cli @visual-guard/engine-playwright

# 初始化项目
visual-guard init

# 运行检测
visual-guard run
```
