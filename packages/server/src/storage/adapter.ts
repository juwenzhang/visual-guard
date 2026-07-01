/**
 * 趋势数据点
 */
export interface TrendPoint {
  runId: string;
  timestamp: string;
  value: number;
}

/**
 * 运行记录（入库/查询）
 */
export interface RunRecord {
  id: string;
  project: string;
  env: string;
  branch: string;
  startedAt: string;
  endedAt: string;
  summary: Record<string, unknown>;
  /** 聚合的趋势指标 */
  trends: Record<string, unknown>;
  /** gzip 压缩后的 manifest JSON Buffer（可选，节省存储） */
  manifest?: Buffer;
}

/**
 * 趋势存储适配器协议
 */
export interface TrendStorageAdapter {
  /** 入库单次运行 */
  ingest(record: RunRecord): Promise<void>;

  /** 查询某项目某指标的 N 日趋势 */
  query(opts: {
    project: string;
    env?: string;
    branch?: string;
    metric: string;
    days: number;
  }): Promise<TrendPoint[]>;

  /** 获取某次运行的压缩 manifest */
  getManifest(runId: string): Promise<Buffer | undefined>;

  /** 历史运行列表 */
  listRuns(opts: {project: string; env?: string; limit?: number}): Promise<RunRecord[]>;

  /** 清理 before 之前的过期数据，返回删除条数 */
  purge(before: Date): Promise<number>;

  /** 重新入库（回填/迁移） */
  reingest(runId: string, record: RunRecord): Promise<void>;

  /** 关闭连接 */
  close(): Promise<void>;
}
