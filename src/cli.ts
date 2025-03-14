#!/usr/bin/env node
// bin/cli.ts
import { Command } from 'commander';
import { refineAction } from './commands/refine.js';
import { publishAction } from './commands/publish.js';

const program = new Command();

program
  .name('book-cli')
  .description('A CLI tool for book processing')
  .version('1.0.0');

program
  .command('refine <link>')
  .description('Refine an Obsidian link and analyze the file')
  .action(refineAction);

program
  .command('publish') // No arguments needed
  .description('Publish refined books to HTML')
  .action(publishAction); // Add the publish command

program.parse(process.argv);
