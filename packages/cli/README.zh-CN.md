# @visual-guard/cli

Visual Guard 命令行入口。

## 安装

```bash
pnpm add -D @visual-guard/cli @visual-guard/engine-playwright
```

引擎是可选 peer dependency，按需安装：

```bash
pnpm add -D @visual-guard/engine-playwright   # 推荐主线
pnpm add -D @visual-guard/engine-puppeteer    # 实验性
```

## 命令

```bash
# 交互式生成配置
visual-guard init

# 执行视觉回归检测
visual-guard run
visual-guard run --engine playwright
visual-guard run --write-baseline
visual-guard run --engine puppeteer
visual-guard run --format html,json,console

# 基线管理
visual-guard baseline list
visual-guard baseline clean --dry-run
```

## `init` — 交互式初始化

通过交互问答生成 `visualguard.config.json`：

1. 项目名称
2. 基础 URL
3. 浏览器引擎（playwright / puppeteer）
4. 无头模式
5. 场景设置（名称 + 路径，可添加多个）
6. 报告格式
7. **通知配置**（可选）— 企业微信 / 飞书 / 钉钉 / QQ 邮箱 / 通用 Webhook

敏感值使用 `env:` 前缀引用环境变量，同时生成 `.env.example` 文件包含实际值供参考：

```json
{
  "plugins": [{
    "name": "notify",
    "options": {
      "email": {
        "user": "env:VG_EMAIL_USER",
        "pass": "env:VG_EMAIL_PASS"
      }
    }
  }]
}
```

## `run` — 执行检测

| 选项 | 说明 |
|------|------|
| `-c, --config <path>` | 配置文件路径 |
| `--engine <engine>` | 浏览器引擎（playwright / puppeteer） |
| `--scenes <scenes>` | 仅执行指定场景（逗号分隔） |
| `--tags <tags>` | 按标签筛选场景 |
| `--env <env>` | 覆盖环境名称 |
| `--write-baseline` | 更新基线为后续对比基准 |
| `--format <format>` | 报告格式（html,json,console） |

退出码：`0` = 全部通过 | `1` = 检测到差异 | `2` = 运行错误

## 引擎策略

- **playwright** — 稳定主线，默认引擎
- **puppeteer** — 实验性，可作为备选

## License

[MIT](./LICENSE) © luhanxin
