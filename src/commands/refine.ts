// src/commands/refine.ts

import * as fs from 'fs';
import * as path from 'path';
import * as process from 'process';
import _ from 'lodash';
import { processChunk } from '../lib/gemini_client.js';
import ora from 'ora';

// --- Constants ---
const OG_DIR_NAME = 'OG';
const REFINED_DIR_NAME = 'Refined';

export async function refineAction(link: string) {
  try {
    const parsedLink = parseObsidianLink(link);
    if (!parsedLink) {
      console.error('❌ Invalid Obsidian link format.');
      process.exit(1);
    }

    console.log(`📚 Processing Chapter: ${parsedLink.filePath}.md\n`);

    const obsidianDir = getObsidianDirectory();
    if (!obsidianDir) {
      console.error(
        '❌ Environment variable OBSIDIAN_DIR is not set. Please set it to your Obsidian vault directory.'
      );
      process.exit(1);
    }

    const fullPath = constructFilePath(obsidianDir, parsedLink.filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`❌ File not found: ${fullPath}`);
      process.exit(1);
    }

    const fileContent = readFileContent(fullPath);
    const paragraphs = extractNonBlankParagraphs(fileContent);
    const chunkSize = 10;
    const chunks = paragraphsToChunks(paragraphs, chunkSize);

    // Array to accumulate all refined non-blank lines
    const allNonBlankLines = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const spinner = ora(`Processing Chunk ${i + 1} of ${chunks.length}`).start();

      try {
        const processedChunk = await processChunk(chunk);

        // Ensure processedChunk is an array of strings
        if (!Array.isArray(processedChunk)) {
          throw new Error('Unexpected output from processChunk: not an array.');
        }

        // Flatten the processed paragraphs into individual lines
        const nonBlankLines = _.flatten(
          processedChunk.map((paragraph) =>
            _.filter(paragraph.split('\n'), (line) => !_.isEmpty(_.trim(line)))
          )
        );

        // Add non-blank lines to the global array
        allNonBlankLines.push(...nonBlankLines);
        spinner.succeed(` Processed Chunk ${i + 1} of ${chunks.length}`);
      } catch (error) {
        spinner.fail(` Failed to process Chunk ${i + 1} of ${chunks.length}`);
        handleErrors(error);
        return;
      }
    }

    // Write the refined Markdown file
    const { outputFilePath, relativeOutputPath } = constructOutputFilePath(
      obsidianDir,
      parsedLink.filePath
    );
    writeRefinedMarkdown(allNonBlankLines, outputFilePath);

    // --- COPY INDEX.md ---
    copyIndexFile(obsidianDir, parsedLink.filePath);

    console.log('\n🎉 Refinement completed successfully!');
    console.log(`✨ Refined File: ${relativeOutputPath}.md\n`);
  } catch (error) {
    console.error('\n❌ An error occurred during refinement.');
    handleErrors(error);
  }
}

// --- Helper Functions ---

function parseObsidianLink(link: string): { filePath: string } | null {
  try {
    const parsedUrl = new URL(link);
    if (parsedUrl.protocol !== 'obsidian:' || parsedUrl.hostname !== 'open') {
      return null;
    }

    const queryParams = new URLSearchParams(parsedUrl.search);
    const filePath = queryParams.get('file');
    if (!filePath) {
      return null;
    }

    return { filePath: decodeURIComponent(filePath).replace(/\//g, path.sep) };
  } catch {
    return null;
  }
}

function getObsidianDirectory(): string | null {
  return process.env.OBSIDIAN_DIR || null;
}

function constructFilePath(obsidianDir: string, filePath: string): string {
  return path.join(obsidianDir, `${filePath}.md`);
}

function readFileContent(filePath: string): string {
  return fs.readFileSync(filePath, 'utf-8');
}

function extractNonBlankParagraphs(content: string): string[] {
  return _.filter(content.split(/\n\s*\n/), (p) => !_.isEmpty(_.trim(p)));
}

function paragraphsToChunks(paragraphs: string[], chunkSize: number): string[][] {
  return _.chunk(paragraphs, chunkSize);
}

function constructOutputFilePath(
  obsidianDir: string,
  relativeFilePath: string
): { outputFilePath: string; relativeOutputPath: string } {
  const relativeOutputPath = relativeFilePath.replace(
    OG_DIR_NAME,
    REFINED_DIR_NAME
  );
  const outputFilePath = path.join(obsidianDir, relativeOutputPath + '.md');

  const dir = path.dirname(outputFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  return { outputFilePath, relativeOutputPath };
}

function writeRefinedMarkdown(lines: string[], outputFilePath: string): void {
  // Join lines with a single blank line between them
  const refinedContent = lines.join('\n\n');
  fs.writeFileSync(outputFilePath, refinedContent, 'utf-8');
}

function handleErrors(error: unknown): void {
  if (error instanceof Error) {
    console.error(`Error Details: ${error.message}`);
  } else {
    console.error('An unknown error occurred.');
  }
  process.exit(1);
}

function copyIndexFile(obsidianDir: string, relativeFilePath: string): void {
  const ogBookPath = relativeFilePath.substring(
    0,
    relativeFilePath.indexOf(OG_DIR_NAME) + OG_DIR_NAME.length
  ); // "Books/OG"
  const bookName = relativeFilePath
    .substring(ogBookPath.length + 1)
    .split(path.sep)[0]; // "+1" to skip the slash

  const sourceIndexPath = path.join(
    obsidianDir,
    ogBookPath,
    bookName,
    'Index.md'
  );
  const destIndexPath = path.join(
    obsidianDir,
    ogBookPath.replace(OG_DIR_NAME, REFINED_DIR_NAME),
    bookName,
    'Index.md'
  );

  try {
    fs.copyFileSync(
      sourceIndexPath,
      destIndexPath,
      fs.constants.COPYFILE_FICLONE
    );
  } catch (error) {
    // Fail silently
  }
}