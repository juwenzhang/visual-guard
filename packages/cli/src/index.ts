/**
 * @visual-guard/cli — Visual Guard 命令行入口
 */

import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {Command} from 'commander';
import {createBaselineCommand} from './commands/baseline';
import {createInitCommand} from './commands/init';
import {createRunCommand} from './commands/run';
import {createServeCommand} from './commands/server';
import {createStorageCommand} from './commands/storage';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as {
  version: string;
  description: string;
};

const program = new Command();

program
  .name('visual-guard')
  .description(pkg.description)
  .version(pkg.version)
  .addCommand(createInitCommand())
  .addCommand(createRunCommand())
  .addCommand(createBaselineCommand())
  .addCommand(createServeCommand())
  .addCommand(createStorageCommand());

export function main(argv: string[] = process.argv): void {
  program.parse(argv);
}
