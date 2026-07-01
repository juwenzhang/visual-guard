# Visual Guard 存储、服务器与 Dashboard 方案

> 状态：方案探讨 | 日期：2026-06-30 | 依赖：[06-trends-data-metrics](./06-trends-data-metrics.md)

## 一、总体架构

```
┌─ Dashboard (Preact + Chart.js) ────────────────────┐
│  读取 HTTP API → sparkline 趋势图 + 历史回溯         │
└──────────────────┬──────────────────────────────────┘
                   │ HTTP JSON (Fastify)
┌─ HTTP Server ──────────────────────────────────────┐
│  POST   /api/runs        ← CI 运行后入库            │
│  GET    /api/runs/:id     → 历史详情                │
│  GET    /api/trends?      → 趋势查询                │
│  DELETE /admin/purge      ← 清理过期数据             │
│  POST   /admin/reingest   ← 历史回填                │
│  鉴权: Authorization: Bearer <api-key>               │
└──────────────────┬──────────────────────────────────┘
                   │ TrendStorageAdapter 接口
┌─ Storage Layer ────────────────────────────────────┐
│  SQLiteAdapter (本地)  |  PostgresAdapter (服务端)   │
└────────────────────────────────────────────────────┘
```

每层可独立替换：Dashboard 可以托管在 CDN，Server 可以水平扩展，Storage 可以随时换引擎。

## 二、HTTP Server — Fastify

### 2.1 选型理由

| | Express | Koa | Fastify |
|------|:--:|:--:|:--:|
| 性能 | 慢 | 中 | 最快 |
| JSON Schema 校验 | 无 | 无 | ✅ 内置 |
| TypeScript | 一般 | 好 | ✅ 一流 |
| 生态 | 巨 | 中 | 够用 |

Fastify 的 JSON Schema 可从 Zod schema 直接转换（`zod-to-json-schema`），复用已有的 config 校验逻辑。

### 2.2 包结构

```text
packages/server/
  src/
    index.ts              ← createServer(opts) 工厂函数
    routes/
      runs.ts             ← POST /api/runs, GET /api/runs/:id
      trends.ts           ← GET /api/trends?project=&metric=&days=
      admin.ts            ← DELETE /admin/purge, POST /admin/reingest
    storage/
      adapter.ts          ← TrendStorageAdapter 接口定义
      sqlite.ts           ← SQLiteAdapter 实现
      postgres.ts         ← PostgresAdapter 实现
    auth.ts               ← API key 鉴权中间件
    dashboard.ts          ← 托管 Preact SPA 静态文件
  package.json
    dependencies: fastify, better-sqlite3, pg, zod-to-json-schema
```

### 2.3 启动

```bash
# 本地个人开发 — SQLite 零配置
visual-guard serve --storage sqlite://./vg.db --port 3456

# 团队服务器 — PostgreSQL
visual-guard serve --storage postgres://user:pass@host:5432/vg

# 环境变量
VG_STORAGE=postgres://... VG_API_KEY=xxx visual-guard serve
```

## 三、TrendStorageAdapter 协议

```ts
interface TrendPoint {
  runId: string;
  timestamp: string;
  value: number;
}

interface RunRecord {
  id: string;
  project: string;
  env: string;
  branch: string;
  startedAt: string;
  endedAt: string;
  summary: Record<string, unknown>;
  trends: Record<string, unknown>;
}

interface TrendStorageAdapter {
  /** 入库单次运行的趋势数据 */
  ingest(run: RunRecord): Promise<void>;

  /** 查询某项目某指标的 N 日趋势 */
  query(opts: {
    project: string;
    env?: string;
    branch?: string;
    metric: string;
    days: number;
  }): Promise<TrendPoint[]>;

  /** 获取历史运行列表 */
  listRuns(opts: {
    project: string;
    env?: string;
    limit?: number;
  }): Promise<RunRecord[]>;

  /** 清理 N 天前的过期数据，返回删除条数 */
  purge(before: Date): Promise<number>;

  /** 重新入库指定 run（历史回填/迁移） */
  reingest(runId: string, record: RunRecord): Promise<void>;

  /** 关闭连接 */
  close(): Promise<void>;
}
```

## 四、双数据库引擎

| 场景 | 引擎 | 理由 |
|------|------|------|
| `visual-guard serve` 本地开发 | SQLite | 零配置，单一文件 |
| 团队服务器部署 | PostgreSQL | 多项目并发写入、JSONB 查询、备份 |
| GitHub Actions + 远程 server | PostgreSQL | CI runner 无状态，数据持久化在 server |

### 数据迁移

```bash
# SQLite → PostgreSQL
visual-guard storage migrate --from sqlite://vg.db --to postgres://...
```

全量迁移，不丢历史趋势数据。

## 五、多租户隔离

通过数据自带维度实现隔离，无需额外租户表：

```json
{
  "run": {
    "project": "my-web-app",    // ← 项目级
    "env": "production",         // ← 环境级
    "branch": "main"             // ← 分支级
  }
}
```

所有查询接口按 `project + env + branch` 过滤。

### 三种部署模式

| 模式 | 适用 | 鉴权 |
|------|------|------|
| **本地单用户** | 个人项目 `visual-guard serve` | 无 |
| **团队私有部署** | N 个项目共享一个 server | API key（简单白名单） |
| **SaaS 多租户** | 公共平台，用户账户体系 | OAuth + 配额（远期） |

## 六、数据生命周期

```
CI cron → guard:run → POST /api/runs → DB
                                          │
                      ┌───────────────────┘
                      ▼
                  查询 GET /api/trends → Dashboard
                      │
                      ▼
                  清理策略:
                    ├─ 保留最近 30 天全量
                    ├─ 30~90 天降采样（每天保留 1 条）
                    └─ 90+ 天归档/删除
```

### CLI 数据管理命令

```bash
# 将本地 summary.json 提交到远程 server
visual-guard storage ingest reports/1782809990248-0b5cceaa \
  --server https://vg.example.com \
  --api-key xxx

# 历史回填
visual-guard storage reingest --all --server https://...

# 清理
visual-guard storage purge --before 2026-01-01
```

## 七、Dashboard — Preact + Chart.js

### 7.1 选型理由

| | Vanilla HTML | Vue/React SPA | **Preact + Chart.js** | Next.js |
|------|:--:|:--:|:--:|:--:|
| 构建 | 零 | Vite | tsup/esbuild | Next build |
| 体积 | ~5KB | ~200KB | ~30KB | ~500KB |
| 图表 | 手写 SVG | ECharts | Chart.js CDN | 同左 |
| TS/交互 | 累 | 好 | ✅ 好 | 重 |

- **Preact**：3KB，React 语法全兼容，hooks 写交互舒服
- **Chart.js**：轻量趋势图，line chart 开箱即用
- 整体 bundle < 40KB，Fastify 启动时静态托管

### 7.2 页面布局

```text
┌─────────────────────────────────────────────────────────────┐
│  🔍 Visual Guard — my-web-app                               │
│  项目选择器 | 环境 | 时间范围                                  │
├─────────────────────────────────────────────────────────────┤
│  ⚡ 性能趋势                                                  │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┐        │
│  │  LCP    │  FCP    │  CLS    │ TTFB    │  Load   │        │
│  │  ↗ 2.1s │  ↘ 0.7s │  → 0.02│  ↘ 0.2s │  ↗ 3.2s │        │
│  │  ▁▂▃▄█  │  ▆▅▄▂▁ │  ▁▁▂▂  │  ▄▂▁▁▁ │  ▁▂▃▆█ │        │
│  └─────────┴─────────┴─────────┴─────────┴─────────┘        │
├─────────────────────────────────────────────────────────────┤
│  📸 视觉 & 结构                                               │
│  ┌─────────────┬─────────────┬──────────────┐               │
│  │ Diff Ratio  │ DOM Changes │ Layout Shift │               │
│  │ ↗ 9.98%    │ ↗ 3,361    │ ↗ 252        │               │
│  └─────────────┴─────────────┴──────────────┘               │
├─────────────────────────────────────────────────────────────┤
│  🌐 网络 & 资源                                               │
│  ┌─────────────┬─────────────┬──────────────┐               │
│  │ New Reqs    │ Size Delta  │ 3rd Domains  │               │
│  └─────────────┴─────────────┴──────────────┘               │
├─────────────────────────────────────────────────────────────┤
│  🐛 质量                                                      │
│  ┌─────────────┬─────────────┬──────────────┐               │
│  │ Pass Rate   │ Errors      │ Avg Duration │               │
│  └─────────────┴─────────────┴──────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

顶部项目/环境选择器，每个指标一个 sparkline 卡片，hover 查看具体值。

### 7.3 技术细节

- **数据获取**：`fetch(/api/trends?project=xxx&metric=lcp&days=30)` → 30 个点画折线
- **图表**：Chart.js `line` 类型，`pointRadius: 0` 滑过才显示
- **路由**：纯前端，不依赖 hash router——只有两个视图：Dashboard + 运行详情
- **静态托管**：Fastify `fastify-static` 指向 `packages/server/dist/dash`

## 八、完整的 CLI 命令规划

```bash
# ====== 现有 ======
visual-guard init              # 交互式生成配置
visual-guard run               # 执行检测
visual-guard run --engine puppeteer
visual-guard run --write-baseline
visual-guard baseline list
visual-guard baseline clean

# ====== Server & Dashboard ======
visual-guard serve             # 启动 HTTP server + Dashboard
  --port 3456
  --storage sqlite://./vg.db
  --api-key xxx

# ====== Storage 管理 ======
visual-guard storage ingest <reportDir>
  --server https://vg.example.com
  --api-key xxx
visual-guard storage reingest --all
visual-guard storage purge --before 2026-01-01
visual-guard storage migrate --from sqlite://... --to postgres://...
```

## 九、实施计划

| 阶段 | 内容 | 依赖 |
|------|------|------|
| P0 | TrendStorageAdapter 接口定义 + SQLiteAdapter | — |
| P1 | Fastify Server 骨架 + API routes (runs/trends) | P0 |
| P2 | API key 鉴权 + summarize & query 逻辑 | P1 |
| P3 | Preact + Chart.js Dashboard 可视化 | P1 |
| P4 | CLI `serve` / `storage ingest` 命令 | P1 |
| P5 | PostgresAdapter + 迁移工具 | P0 |
| P6 | 清理策略 (降采样 / purge) | P1 |
