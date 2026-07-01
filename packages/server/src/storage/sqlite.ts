import Database from 'better-sqlite3';
import type {RunRecord, TrendPoint, TrendStorageAdapter} from './adapter';

/**
 * SQLite 趋势存储适配器
 */
export class SQLiteAdapter implements TrendStorageAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this._migrate();
  }

  private _migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id         TEXT PRIMARY KEY,
        project    TEXT NOT NULL,
        env        TEXT NOT NULL DEFAULT 'development',
        branch     TEXT NOT NULL DEFAULT 'unknown',
        started_at TEXT NOT NULL,
        ended_at   TEXT NOT NULL,
        summary    TEXT NOT NULL DEFAULT '{}',
        trends     TEXT NOT NULL DEFAULT '{}',
        manifest   BLOB
      );
      CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project);
      CREATE INDEX IF NOT EXISTS idx_runs_env ON runs(project, env);
      CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
    `);
  }

  async ingest(record: RunRecord): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO runs (id, project, env, branch, started_at, ended_at, summary, trends, manifest)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.project,
        record.env,
        record.branch,
        record.startedAt,
        record.endedAt,
        JSON.stringify(record.summary),
        JSON.stringify(record.trends),
        record.manifest ?? null
      );
  }

  async getManifest(runId: string): Promise<Buffer | undefined> {
    const row = this.db.prepare('SELECT manifest FROM runs WHERE id = ?').get(runId) as
      | {manifest: Buffer | null}
      | undefined;
    return row?.manifest ?? undefined;
  }

  async query(opts: {
    project: string;
    env?: string;
    branch?: string;
    metric: string;
    days: number;
  }): Promise<TrendPoint[]> {
    const rows = this.db
      .prepare(
        `SELECT id, started_at, trends
       FROM runs
       WHERE project = ? AND env = ? AND started_at >= ?
       ORDER BY started_at ASC`
      )
      .all(
        opts.project,
        opts.env ?? 'development',
        new Date(Date.now() - opts.days * 86400000).toISOString()
      ) as Array<{id: string; started_at: string; trends: string}>;

    return rows.map(row => {
      const trends = JSON.parse(row.trends) as Record<string, Record<string, number>>;
      const dotIdx = opts.metric.indexOf('.');
      let value: number | undefined;
      if (dotIdx > 0) {
        const category = opts.metric.slice(0, dotIdx);
        const key = opts.metric.slice(dotIdx + 1);
        value = trends[category]?.[key];
      } else {
        for (const category of Object.values(trends)) {
          if (category && typeof category === 'object' && opts.metric in category) {
            value = category[opts.metric];
            break;
          }
        }
      }
      return {runId: row.id, timestamp: row.started_at, value: value ?? 0};
    });
  }

  async listRuns(opts: {project: string; env?: string; limit?: number}): Promise<RunRecord[]> {
    const rows = this.db
      .prepare(
        `SELECT id, project, env, branch, started_at, ended_at, summary, trends
       FROM runs
       WHERE project = ? AND env = ?
       ORDER BY started_at DESC
       LIMIT ?`
      )
      .all(opts.project, opts.env ?? 'development', opts.limit ?? 50) as Array<{
      id: string;
      project: string;
      env: string;
      branch: string;
      started_at: string;
      ended_at: string;
      summary: string;
      trends: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      project: row.project,
      env: row.env,
      branch: row.branch,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      summary: JSON.parse(row.summary) as Record<string, unknown>,
      trends: JSON.parse(row.trends) as Record<string, unknown>
    }));
  }

  async purge(before: Date): Promise<number> {
    const result = this.db
      .prepare('DELETE FROM runs WHERE started_at < ?')
      .run(before.toISOString());
    return result.changes;
  }

  async reingest(_runId: string, record: RunRecord): Promise<void> {
    return this.ingest(record);
  }

  async close(): Promise<void> {
    this.db.close();
  }
}
