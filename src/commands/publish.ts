// src/commands/publish.ts
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import * as process from 'process';
import chalk from 'chalk';
import Handlebars from 'handlebars';
import { marked } from 'marked';
import { execa } from 'execa'; // Import execa
import { minify } from 'html-minifier-terser'; // Import html-minifier-terser

// --- Utility Functions ---

function toWebFriendlyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace spaces/special characters with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
    .trim();
}

function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getDirectories(source: string): string[] {
  return fs
    .readdirSync(source, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);
}

function getFilesWithExtension(
  folderPath: string,
  extension: string
): string[] {
  return fs
    .readdirSync(folderPath, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith(extension))
    .map((dirent) => dirent.name);
}

async function markdownToHtml(markdownContent: string): Promise<string> {
  return await marked.parse(markdownContent);
}

function loadTemplate(templatePath: string): Handlebars.TemplateDelegate {
  const templateContent = fs.readFileSync(templatePath, 'utf-8');
  return Handlebars.compile(templateContent);
}

// Utility function to minify HTML
async function minifyHtml(html: string): Promise<string> {
  const minifiedHtml = await minify(html, {
    collapseWhitespace: true, // Remove unnecessary whitespace
    removeComments: true, // Remove HTML comments
    minifyCSS: true, // Minify inline CSS
    minifyJS: true, // Minify inline JavaScript
    removeAttributeQuotes: true, // Remove quotes around attributes when possible
    sortAttributes: true, // Sort attributes for better compression
    sortClassName: true, // Sort class names for better compression
  });
  return minifiedHtml;
}

async function writeToFile(filePath: string, content: string): Promise<void> {
  try {
    // Minify the HTML content
    const minifiedContent = await minifyHtml(content);
    // Write the minified content to the file
    fs.writeFileSync(filePath, minifiedContent, 'utf-8');
  } catch (error) {
    console.error(`${chalk.red('✘')} Error minifying or writing file:`, error);
    process.exit(1);
  }
}

// --- Core Logic Functions ---
function getRefinedFolders(booksDir: string): string[] {
  const refinedDirPath = path.join(booksDir, 'Refined');
  if (fs.existsSync(refinedDirPath)) {
    return getDirectories(refinedDirPath);
  } else {
    return [];
  }
}

function prepareTemplateData(
  markdownFilePath: string,
  htmlContent: string
): object {
  const fileName = path.basename(markdownFilePath, '.md');
  return {
    fileName: fileName,
    htmlContent: htmlContent,
  };
}

async function renderAndWriteHtml(
  markdownFilePath: string,
  outputFilePath: string,
  template: Handlebars.TemplateDelegate
): Promise<void> {
  try {
    const markdownContent = fs.readFileSync(markdownFilePath, 'utf-8');
    const htmlContent = await markdownToHtml(markdownContent);
    const templateData = prepareTemplateData(markdownFilePath, htmlContent);
    const renderedHtml = template(templateData);
    await writeToFile(outputFilePath, renderedHtml);
  } catch (error) {
    console.error(
      `${chalk.red('✘')} Error converting ${chalk.cyan(markdownFilePath)} to HTML:`,
      error
    );
    process.exit(1);
  }
}

async function processRefinedFolder(
  refinedFolderPath: string,
  outputDir: string,
  chapterTemplate: Handlebars.TemplateDelegate
): Promise<void> {
  const markdownFiles = getFilesWithExtension(refinedFolderPath, '.md');

  for (const markdownFile of markdownFiles) {
    if (markdownFile.toLowerCase() === 'index.md') {
      continue; // Skip Index.md, it will be handled separately
    }
    const markdownFilePath = path.join(refinedFolderPath, markdownFile);
    const htmlFileName =
      toWebFriendlyName(path.basename(markdownFile, '.md')) + '.html';
    const outputFilePath = path.join(outputDir, htmlFileName);
    await renderAndWriteHtml(markdownFilePath, outputFilePath, chapterTemplate);
  }
}

// --- FUNCTION: Process Index.md ---
interface IndexEntry {
  chapterName: string;
  link: string;
}

// Function: Parse Index.md and check file existence
function parseIndexMdContent(content: string, outputDir: string): IndexEntry[] {
  const lines = content
    .split('\n')
    .filter((line) => line.trim().startsWith('- [['));
  const entries: IndexEntry[] = [];

  for (const line of lines) {
    const match = line.match(/- \[\[(.*?)\]\]/);
    if (match) {
      const chapterName = match[1];
      const webFriendlyName = toWebFriendlyName(chapterName);
      const htmlFileName = webFriendlyName + '.html';
      const fullHtmlFilePath = path.join(outputDir, htmlFileName);

      // Check if the file exists
      const link = fs.existsSync(fullHtmlFilePath) ? htmlFileName : '#';
      entries.push({ chapterName, link });
    }
  }
  return entries;
}

async function processIndexFile(
  refinedFolderPath: string,
  outputDir: string,
  indexTemplate: Handlebars.TemplateDelegate,
  bookFolderName: string
): Promise<void> {
  const indexMdPath = path.join(refinedFolderPath, 'Index.md');
  const indexHtmlPath = path.join(outputDir, 'index.html'); // Each book has its own index.html

  if (fs.existsSync(indexMdPath)) {
    const indexMdContent = fs.readFileSync(indexMdPath, 'utf-8');
    const indexData = parseIndexMdContent(indexMdContent, outputDir); // Pass outputDir

    const templateData = {
      bookFolderName: bookFolderName, // Pass the book folder name
      lines: indexData,
    };

    const renderedHtml = indexTemplate(templateData);
    await writeToFile(indexHtmlPath, renderedHtml);
  } else {
    console.warn(
      `${chalk.yellow('⚠')} Index.md not found in ${chalk.cyan(refinedFolderPath)}. Skipping index.html generation.`
    );
  }
}

// --- Setup and Validation Functions ---

function getEnvironmentVariables(): {
  obsidianDir: string;
  easyReadDir: string;
} {
  const obsidianDir = process.env.OBSIDIAN_DIR;
  const easyReadDir = process.env.EASYREAD_DIR || 'D:\\Codes\\EasyRead';

  if (!obsidianDir) {
    console.error(
      `${chalk.red('✘')} OBSIDIAN_DIR environment variable not set.`
    );
    process.exit(1);
  }
  return { obsidianDir, easyReadDir };
}

function validateAndGetBooksDir(obsidianDir: string): string {
  const booksDir = path.join(obsidianDir, 'Books');
  if (!fs.existsSync(booksDir)) {
    console.error(
      `${chalk.red('✘')} Books directory not found: ${chalk.cyan(booksDir)}`
    );
    process.exit(1);
  }
  return booksDir;
}

function setupOutputDirectories(easyReadDir: string): string {
  const pagesOutputDir = path.join(easyReadDir, 'pages');
  ensureDirectoryExists(pagesOutputDir);
  return pagesOutputDir;
}

function getTemplate(
  templateDir: string,
  templateName: string
): Handlebars.TemplateDelegate {
  const templatePath = path.join(templateDir, templateName);
  return loadTemplate(templatePath);
}

// --- Home Page Generation Logic ---

function prepareHomeTemplateData(refinedFolders: string[]): object[] {
  return refinedFolders.map((refinedFolder) => {
    const webFriendlyName = toWebFriendlyName(refinedFolder);
    const indexPath = `/pages/${webFriendlyName}/index.html`; // Link to the book's index.html
    const coverPhoto = `/assets/cover/${webFriendlyName}.png`; // Use web-friendly name for cover photo

    return {
      bookName: refinedFolder, // Original name for display
      indexPath,
      coverPhoto,
    };
  });
}

async function renderAndWriteHomeHtml(
  homeTemplate: Handlebars.TemplateDelegate,
  templateData: object[],
  easyReadDir: string
): Promise<void> {
  try {
    const renderedHtml = homeTemplate({ books: templateData });
    const homeHtmlPath = path.join(easyReadDir, 'index.html'); // Rename home.html to index.html
    await writeToFile(homeHtmlPath, renderedHtml);
    // console.log(`${chalk.green('✔')} Generated index.html`);
  } catch (error) {
    console.error(`${chalk.red('✘')} Error generating index.html:`, error);
    process.exit(1);
  }
}

// --- Main Action Function ---

export async function publishAction(): Promise<void> {
  const { obsidianDir, easyReadDir } = getEnvironmentVariables();
  const booksDir = validateAndGetBooksDir(obsidianDir);
  const refinedFolders = getRefinedFolders(booksDir);

  if (refinedFolders.length === 0) {
    console.log(`${chalk.yellow('⚠')} No refined book folders found.`);
    return;
  }

  const pagesOutputDir = setupOutputDirectories(easyReadDir);

  // --- Clear the pages/ directory ---
  try {
    await execa('shx', ['rm', '-rf', pagesOutputDir]);
  } catch (error) {
    console.error(
      `${chalk.red('✘')} Error clearing the pages/ directory:`,
      error
    );
    process.exit(1);
  }
  ensureDirectoryExists(pagesOutputDir); // Recreate after deleting

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const templateDir = path.join(__dirname, '..', 'templates');

  // Load ALL templates
  const chapterTemplate = getTemplate(templateDir, 'chapter.hbs');
  const bookIndexTemplate = getTemplate(templateDir, 'book_index.hbs'); // Renamed from index.hbs
  const homeIndexTemplate = getTemplate(templateDir, 'home_index.hbs'); // Renamed from home.hbs

  // Process each refined folder
  for (const refinedFolder of refinedFolders) {
    const refinedFolderPath = path.join(booksDir, 'Refined', refinedFolder);
    const webFriendlyFolderName = toWebFriendlyName(refinedFolder); // Convert to web-friendly name
    const outputDir = path.join(pagesOutputDir, webFriendlyFolderName);
    ensureDirectoryExists(outputDir);

    // Process regular chapter files
    await processRefinedFolder(refinedFolderPath, outputDir, chapterTemplate);

    // Process Index.md separately
    await processIndexFile(
      refinedFolderPath,
      outputDir,
      bookIndexTemplate,
      refinedFolder
    );
    console.log(`\n🚀 Book Published: ${chalk.bold(refinedFolder)}`);
  }

  // Prepare and render home/index.html
  const homeTemplateData = prepareHomeTemplateData(refinedFolders);
  await renderAndWriteHomeHtml(
    homeIndexTemplate,
    homeTemplateData,
    easyReadDir
  );

  console.log();
}
