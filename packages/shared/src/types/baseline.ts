/**
 * 基线键
 */
export interface BaselineKey {
  project: string;
  env: string;
  branch: string;
  sceneId: string;
  viewport: string;
  deviceScaleFactor: number;
  locale: string;
  hash?: string;
}

/**
 * 基线元信息
 */
export interface BaselineMeta {
  key: BaselineKey;
  createdAt: string;
  updatedAt: string;
  version: number;
  runId: string;
  commit?: string;
  author?: string;
  size: {
    dom: number;
    screenshots: number;
    network: number;
    performance: number;
  };
}

/**
 * 基线包
 */
export interface BaselineBundle {
  meta: BaselineMeta;
  dom: Record<string, unknown>;
  screenshots: {
    fullPage?: Buffer;
    elements?: Record<string, Buffer>;
  };
  network: Array<Record<string, unknown>>;
  performance?: Record<string, unknown>;
  accessibility?: Record<string, unknown>;
}

/**
 * 基线查询
 */
export interface BaselineQuery {
  project?: string;
  env?: string;
  branch?: string;
  sceneId?: string;
  viewport?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'version';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 清理策略
 */
export interface CleanPolicy {
  keepLatest?: number;
  olderThanDays?: number;
  branch?: string;
  dryRun?: boolean;
}

/**
 * 基线存储接口
 */
export interface BaselineStore {
  read(key: BaselineKey): Promise<BaselineBundle | null>;
  write(key: BaselineKey, bundle: BaselineBundle): Promise<void>;
  list(query: BaselineQuery): Promise<BaselineMeta[]>;
  delete(key: BaselineKey): Promise<void>;
  clean(policy: CleanPolicy): Promise<{deleted: number; kept: number}>;
}
