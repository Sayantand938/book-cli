import fs from "fs";
import path from "path";
import { refineTextWithGemini } from "../utils/gemini_ai.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function refine(bookname, range) {
  try {
    const extractedDir = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "extracted",
      bookname
    );
    const refinedDir = path.join(
      __dirname,
      "..",
      "..",
      "data",
      "refined",
      bookname
    );
    const tocPath = path.join(extractedDir, "toc.json");
    const refinedTocPath = path.join(refinedDir, "toc.json");
    const refinedContentDir = path.join(refinedDir, "content"); // Path to refined content dir
    const extractedImgDir = path.join(extractedDir, "img"); // Path to extracted img dir
    const refinedImgDir = path.join(refinedDir, "img"); // Path to refined img dir

    if (!fs.existsSync(extractedDir) || !fs.existsSync(tocPath)) {
      console.error(
        `Error: Book "${bookname}" not found in extracted data. Run extract first.`
      );
      process.exit(1);
    }

    if (!fs.existsSync(refinedDir)) {
      fs.mkdirSync(refinedDir, { recursive: true });
    }

    // Create refined content directory
    if (!fs.existsSync(refinedContentDir)) {
      fs.mkdirSync(refinedContentDir, { recursive: true });
    }

    if (!fs.existsSync(refinedTocPath)) {
      fs.copyFileSync(tocPath, refinedTocPath);
      console.log("Copied toc.json to refined folder.");
    }

    const toc = JSON.parse(fs.readFileSync(tocPath, "utf8"));

    let start, end;
    if (range.includes("-")) {
      [start, end] = range.split("-").map(Number);
    } else {
      start = Number(range);
      end = start;
    }
    start--;
    end--;

    if (
      isNaN(start) ||
      isNaN(end) ||
      start < 0 ||
      end >= toc.length ||
      start > end
    ) {
      console.error(
        "Error: Invalid range. Check toc.json for valid file numbers."
      );
      process.exit(1);
    }

    for (let i = start; i <= end; i++) {
      const fileEntry = toc[i];
      const filename = fileEntry.filename;
      const extractedFilePath = path.join(extractedDir, "content", filename);
      const refinedFilePath = path.join(refinedContentDir, filename); // Save in refined/content

      if (!fs.existsSync(extractedFilePath)) {
        console.warn(
          `Warning: File not found: ${extractedFilePath}. Skipping.`
        );
        continue;
      }

      console.log(`Processing ${filename}...`);

      const content = fs.readFileSync(extractedFilePath, "utf8");
      const paragraphs = content.split("\n\n");
      const chunks = [];

      for (let j = 0; j < paragraphs.length; j += 10) {
        const chunk = paragraphs.slice(j, j + 10).join("\n\n");
        chunks.push(chunk);
      }

      let refinedContent = "";
      for (let k = 0; k < chunks.length; k++) {
        console.log(`  Processing chunk ${k + 1}/${chunks.length}...`);
        const refinedChunk = await refineTextWithGemini(chunks[k]);
        refinedContent += refinedChunk + "\n\n";
      }

      fs.writeFileSync(refinedFilePath, refinedContent, "utf8");

      let finalContent = fs.readFileSync(refinedFilePath, "utf8");
      finalContent = finalContent.replace(/\n\n+/g, "\n\n");
      fs.writeFileSync(refinedFilePath, finalContent, "utf8");

      console.log(`Refined content saved to ${refinedFilePath}`);
    }

    // --- Move img folder ---
    if (fs.existsSync(extractedImgDir)) {
      fs.renameSync(extractedImgDir, refinedImgDir);
      console.log("Moved img folder to refined folder.");
    } else {
      console.warn("Warning: img folder not found in extracted directory.");
    }

    console.log("Refinement process complete.");
  } catch (error) {
    console.error("Error during refinement:", error);
    process.exit(1);
  }
}
