import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { parseString } from "xml2js";
import TurndownService from "turndown";
import { fileURLToPath } from "url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function extract(epubPath, outputDir) {
  try {
    const zip = new AdmZip(epubPath);
    const extractPath = outputDir;

    zip.extractAllTo(extractPath, true);
    console.log("EPUB extracted successfully.");

    const opfFilePath = findOpfFile(extractPath);
    if (!opfFilePath) {
      throw new Error("Could not find .opf file in the extracted folder.");
    }
    console.log(`Found .opf file at: ${opfFilePath}`);

    const opfContent = fs.readFileSync(opfFilePath, "utf8");
    let opfData;
    parseString(opfContent, (err, result) => {
      if (err) throw err;
      opfData = result;
    });

    const manifest = opfData.package.manifest[0].item;
    const baseDir = path.dirname(opfFilePath);

    // --- TOC Handling (toc.ncx ONLY) ---
    const ncxFilePath = findNcxFile(manifest, baseDir);
    if (!ncxFilePath) {
      throw new Error("Could not find toc.ncx file in the extracted folder.");
    }
    console.log(`Found toc.ncx file at: ${ncxFilePath}`);
    const chapterMap = parseTocNcx(ncxFilePath);
    // --- End TOC Handling ---

    const contentDir = path.join(extractPath, "content");
    const imgDir = path.join(extractPath, "img");
    if (!fs.existsSync(contentDir))
      fs.mkdirSync(contentDir, { recursive: true });
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true });

    const turndownService = new TurndownService();
    const renamedFiles = [];
    const tocEntries = [];

    let serialNumber = 1;
    for (const [fileRef, chapterName] of Object.entries(chapterMap)) {
      const filePath = path.join(baseDir, fileRef);

      // --- Check if file exists ---
      if (!fs.existsSync(filePath)) {
        console.warn(`Warning: File not found: ${filePath}. Skipping.`);
        continue; // Skip to the next chapter
      }
      // --- End file existence check ---

      const xhtmlContent = fs.readFileSync(filePath, "utf8");
      const cleanedHtml = cleanXhtml(xhtmlContent, imgDir, extractPath);
      const markdownContent = turndownService.turndown(cleanedHtml);

      const sanitizedTitle = sanitizeFilename(chapterName);
      const newFileName = `${sanitizedTitle}.md`;
      const newFilePath = path.join(contentDir, newFileName);
      fs.writeFileSync(newFilePath, markdownContent, "utf8");

      renamedFiles.push({ oldName: fileRef, newName: newFileName });
      tocEntries.push({ sl: serialNumber, filename: newFileName });
      serialNumber++;
    }

    moveImagesToFolder(baseDir, imgDir, chapterMap);
    cleanupExtractedFolder(extractPath, [contentDir, imgDir]);

    const tocJsonPath = path.join(extractPath, "toc.json");
    fs.writeFileSync(tocJsonPath, JSON.stringify(tocEntries, null, 2), "utf8");
    console.log(`Generated toc.json at: ${tocJsonPath}`);

    fs.unlinkSync(opfFilePath);
    console.log(`Deleted .opf file.`);

    console.log("Files converted to Markdown and organized successfully:");
    console.table(renamedFiles);
  } catch (error) {
    console.error("Error processing EPUB:", error);
  }
}
function findOpfFile(directory) {
  const files = fs.readdirSync(directory, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(directory, file.name);
    if (file.isDirectory()) {
      const found = findOpfFile(fullPath);
      if (found) return found;
    }
    if (file.isFile() && file.name.toLowerCase().endsWith(".opf")) {
      return fullPath;
    }
  }
  return null;
}

// Helper function to find the toc.ncx file
function findNcxFile(manifest, baseDir) {
  const ncxItem = manifest.find(
    (item) => item["$"]["media-type"] === "application/x-dtbncx+xml"
  );
  if (ncxItem) {
    return path.join(baseDir, ncxItem["$"].href);
  }
  return null;
}

// Helper function to parse toc.ncx (EPUB 2)
function parseTocNcx(ncxFilePath) {
  const ncxContent = fs.readFileSync(ncxFilePath, "utf8");
  let ncxData;
  parseString(ncxContent, (err, result) => {
    if (err) throw err;
    ncxData = result;
  });

  const chapterMap = {};
  const navPoints = ncxData.ncx.navMap[0].navPoint || [];
  navPoints.forEach((navPoint) => {
    const chapterName = navPoint.navLabel[0].text[0];
    const contentSrc = navPoint.content[0].$.src;
    chapterMap[contentSrc] = chapterName;
  });
  return chapterMap;
}

function cleanXhtml(xhtmlContent, imgDir, extractPath) {
  const $ = cheerio.load(xhtmlContent);

  $("style, script, meta, link").remove();
  $("[style]").removeAttr("style");
  $("[class]").removeAttr("class");
  $("[id]").removeAttr("id");

  $("img").each((_, img) => {
    const src = $(img).attr("src");
    if (src) {
      const absoluteImagePath = path.resolve(extractPath, src);
      const relativeImagePath = path.relative(extractPath, absoluteImagePath);
      const finalPath = path.join("img", path.basename(relativeImagePath));
      $(img).attr("src", finalPath);
    }
  });

  return $.html();
}

function moveImagesToFolder(extractPath, imgDir, chapterMap) {
  const files = fs.readdirSync(extractPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(extractPath, file.name);
    if (file.isDirectory()) {
      moveImagesToFolder(fullPath, imgDir, chapterMap);
    }
    if (file.isFile() && /\.(jpg|jpeg|png|gif|svg)$/i.test(file.name)) {
      const newImagePath = path.join(imgDir, path.basename(file.name));
      fs.renameSync(fullPath, newImagePath);
    }
  }
}

function cleanupExtractedFolder(extractPath, keepDirs) {
  const files = fs.readdirSync(extractPath, { withFileTypes: true });

  for (const file of files) {
    const fullPath = path.join(extractPath, file.name);

    if (file.isDirectory()) {
      if (!keepDirs.includes(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanupExtractedFolder(fullPath, keepDirs);
      }
    } else if (file.isFile()) {
      if (!keepDirs.some((dir) => fullPath.startsWith(dir))) {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

function sanitizeFilename(filename) {
  return filename.replace(/[<>:"/\\|?*]/g, "_").trim();
}
