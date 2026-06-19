import type {Dirent} from 'node:fs';
import {existsSync} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  BaselineBundle,
  BaselineMeta,
  BaselineQuery,
  BaselineStore,
  CleanPolicy
} from '@visual-guard/shared';
import {generateBaselinePath, generateScreenshotPath} from '@visual-guard/shared';

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, {recursive: true});
}

async function readJson<T>(p: string): Promise<T> {
  const content = await fs.readFile(p, 'utf-8');
  return JSON.parse(content) as T;
}

async function writeJson(p: string, data: unknown): Promise<void> {
  const dir = path.dirname(p);
  await ensureDir(dir);
  await fs.writeFile(p, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

async function glob(pattern: string): Promise<string[]> {
  const parts = pattern.split('/');
  const results: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth >= parts.length) {
      return;
    }

    const segment = parts[depth];
    if (segment === undefined) return;
    let entries: Dirent[];

    try {
      entries = (await fs.readdir(dir, {
        withFileTypes: true
      })) as unknown as Dirent[];
    } catch {
      return;
    }

    if (depth === parts.length - 1) {
      // 最后一层，匹配文件名
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (_matchSegment(entry.name, segment)) {
          results.push(path.join(dir, entry.name));
        }
      }
    } else {
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (_matchSegment(entry.name, segment)) {
          await walk(path.join(dir, entry.name), depth + 1);
        }
      }
    }
  }

  await walk('.', 0);
  return results;
}

function _matchSegment(name: string, pattern: string): boolean {
  if (pattern === '*') {
    return true;
  }
  return name === pattern;
}

/**
 * 本地文件系统基线存储实现
 *
 * 目录结构：
 * `<baselineDir>/<project>/<env>/<branch>/<sceneId>/<viewport>/bundle.json`
 */
export function createLocalBaselineStore(baselineDir: string): BaselineStore {
  return {
    async read(key) {
      const dir = generateBaselinePath(key, baselineDir);
      const bundlePath = path.join(dir, 'bundle.json');
      if (!(await pathExists(bundlePath))) {
        return null;
      }
      return readJson<BaselineBundle>(bundlePath);
    },

    async write(key, bundle) {
      const dir = generateBaselinePath(key, baselineDir);
      const bundlePath = path.join(dir, 'bundle.json');
      await writeJson(bundlePath, bundle);
      await writeJson(path.join(dir, 'meta.json'), bundle.meta);
      await writeScreenshots(dir, bundle);
    },

    async list(query) {
      const results: BaselineMeta[] = [];
      const patternSegments = [
        query.project ?? '*',
        query.env ?? '*',
        query.branch ?? '*',
        query.sceneId ?? '*',
        query.viewport ?? '*',
        'meta.json'
      ];
      const pattern = patternSegments.join('/');
      const fullPattern = path.join(baselineDir, pattern);

      const metaFiles = await glob(fullPattern);

      for (const file of metaFiles) {
        const meta = await readJson<BaselineMeta>(file);
        if (_matchesQuery(meta, query)) {
          results.push(meta);
        }
      }

      results.sort((a, b) => {
        const key = query.sortBy ?? 'createdAt';
        const order = query.sortOrder === 'asc' ? 1 : -1;
        return (a[key] > b[key] ? 1 : -1) * order;
      });

      const offset = query.offset ?? 0;
      const limit = query.limit ?? results.length;
      return results.slice(offset, offset + limit);
    },

    async delete(key) {
      const dir = generateBaselinePath(key, baselineDir);
      if (existsSync(dir)) {
        await fs.rm(dir, {recursive: true, force: true});
      }
    },

    async clean(policy) {
      if (policy.dryRun) {
        return {deleted: 0, kept: 0};
      }

      const metas = await this.list({
        branch: policy.branch,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });

      let deleted = 0;
      let kept = 0;

      for (const meta of metas) {
        if (_shouldClean(meta, policy)) {
          await this.delete(meta.key);
          deleted++;
        } else {
          kept++;
        }
      }

      return {deleted, kept};
    }
  };
}

async function writeScreenshots(dir: string, bundle: BaselineBundle): Promise<void> {
  if (bundle.screenshots.fullPage) {
    await writePng(generateScreenshotPath(dir, 'full'), bundle.screenshots.fullPage);
  }

  const elements = bundle.screenshots.elements ?? {};
  for (const [selector, screenshot] of Object.entries(elements)) {
    await writePng(
      generateScreenshotPath(dir, 'element', encodeURIComponent(selector)),
      screenshot
    );
  }
}

async function writePng(filePath: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, data);
}

function _matchesQuery(meta: BaselineMeta, query: BaselineQuery): boolean {
  if (query.project && meta.key.project !== query.project) return false;
  if (query.env && meta.key.env !== query.env) return false;
  if (query.branch && meta.key.branch !== query.branch) return false;
  if (query.sceneId && meta.key.sceneId !== query.sceneId) return false;
  if (query.viewport && meta.key.viewport !== query.viewport) return false;
  return true;
}

function _shouldClean(meta: BaselineMeta, policy: CleanPolicy): boolean {
  if (policy.olderThanDays) {
    const age = Date.now() - new Date(meta.createdAt).getTime();
    const maxAge = policy.olderThanDays * 24 * 60 * 60 * 1000;
    if (age > maxAge) {
      return true;
    }
  }
  return false;
}
