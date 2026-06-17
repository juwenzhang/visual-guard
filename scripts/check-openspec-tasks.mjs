import {execFile} from 'node:child_process';
import {access} from 'node:fs/promises';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const OPENSPEC_DIR = 'openspec';
const SUCCESS_EXIT_CODE = 0;
const FAILED_EXIT_CODE = 1;

const exists = async path => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

const runOpenSpec = async args => {
  try {
    const {stdout} = await execFileAsync('openspec', args, {cwd: process.cwd()});
    return stdout.trim();
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error('未找到 openspec CLI，请先安装：npm install -g @fission-ai/openspec');
      process.exit(FAILED_EXIT_CODE);
    }

    const message = error.stderr || error.stdout || error.message;
    console.error(message);
    process.exit(FAILED_EXIT_CODE);
  }
};

const parseJson = (content, fallback) => {
  if (!content) {
    return fallback;
  }

  return JSON.parse(content);
};

const normalizeChanges = listResult => {
  if (Array.isArray(listResult)) {
    return listResult;
  }

  if (Array.isArray(listResult.changes)) {
    return listResult.changes;
  }

  return [];
};

const getChangeId = change => {
  if (typeof change === 'string') {
    return change;
  }

  return change.id;
};

const getTaskStatus = change => {
  if (typeof change === 'string') {
    return null;
  }

  return change.taskStatus ?? null;
};

const hasOpenSpecContent = async () => {
  const specsDir = `${OPENSPEC_DIR}/specs`;
  const changesDir = `${OPENSPEC_DIR}/changes`;

  const [specsExists, changesExists] = await Promise.all([exists(specsDir), exists(changesDir)]);

  return specsExists || changesExists;
};

const main = async () => {
  if (!(await exists(OPENSPEC_DIR))) {
    console.log('OpenSpec 未初始化，跳过校验。');
    process.exit(SUCCESS_EXIT_CODE);
  }

  if (!(await hasOpenSpecContent())) {
    console.log('OpenSpec 已初始化，但 specs/ 和 changes/ 目录不存在，跳过校验。');
    process.exit(SUCCESS_EXIT_CODE);
  }

  const listOutput = await runOpenSpec(['list', '--json']);
  const listResult = parseJson(listOutput, {changes: []});
  const changes = normalizeChanges(listResult);

  if (changes.length === 0) {
    console.log('OpenSpec 已初始化，但没有活跃 change，校验通过。');
    process.exit(SUCCESS_EXIT_CODE);
  }

  const failures = [];

  for (const change of changes) {
    const changeId = getChangeId(change);
    const taskStatus = getTaskStatus(change);
    const statusOutput = await runOpenSpec(['status', '--change', changeId, '--json']);
    const status = parseJson(statusOutput, {});

    if (taskStatus && taskStatus.completed < taskStatus.total) {
      failures.push(`${changeId}: tasks ${taskStatus.completed}/${taskStatus.total}`);
      continue;
    }

    if (!status.isComplete) {
      failures.push(`${changeId}: OpenSpec artifacts 未全部完成`);
    }
  }

  if (failures.length === 0) {
    console.log('OpenSpec 活跃 change 均已完成，校验通过。');
    process.exit(SUCCESS_EXIT_CODE);
  }

  console.error('OpenSpec 校验失败，存在未完成 change：');

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  console.error('\n请先完成 OpenSpec artifacts / tasks，或归档不再需要的 change。');
  process.exit(FAILED_EXIT_CODE);
};

await main();
