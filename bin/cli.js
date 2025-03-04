#!/usr/bin/env node

import { program } from "commander";
import { extract } from "../src/commands/extract.js";
import { refine } from "../src/commands/refine.js"; // Import refine
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

program.version("1.0.0").description("A CLI tool for processing books");

program
  .command("extract <bookname>")
  .description("Extract and process an EPUB file.")
  .action(async (bookname) => {
    const epubFilePath = path.join(
      __dirname,
      "..",
      "data",
      "epub",
      `${bookname}.epub`
    );
    if (!fs.existsSync(epubFilePath)) {
      console.error(`Error: EPUB file not found at ${epubFilePath}`);
      process.exit(1);
    }
    const outputDir = path.join(__dirname, "..", "data", "extracted", bookname);
    await extract(epubFilePath, outputDir);
  });

program
  .command("refine <bookname>")
  .description("Refine the extracted content using Gemini.")
  .option(
    "--range <range>",
    "Specify the range of files to refine (e.g., 1-3 or 2)."
  )
  .action(async (bookname, options) => {
    if (!options.range) {
      console.error("Error: --range option is required.");
      program.help(); // Show help and exit
      process.exit(1);
    }
    await refine(bookname, options.range);
  });

program.parse(process.argv);
