//Run this after adding images to /images folder
//As long as the filename follows the pattern [cat]--[days]--[desc].ext
//Saving you having to add them manually to content.json

const fs = require("fs");
const path = require("path");

const { CONTENT_LIBRARY_PATH, OUTPUT_PATH } = require("../../config");

const IMAGES_DIR = CONTENT_LIBRARY_PATH;
const CONTENT_FILE = path.join(OUTPUT_PATH, "content.json");
const CONFIG_FILE = path.resolve(__dirname, "config.json");

function getAllFiles(dirPath, arrayOfFiles) {
  arrayOfFiles = arrayOfFiles || [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else if (/\.(jpg|jpeg|png|mp4|mov|avi|mkv)$/i.test(entry.name)) {
      arrayOfFiles.push(fullPath);
    }
  }

  return arrayOfFiles;
}

function sync() {
  console.log("Loading configuration...");
  const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const taxonomy = config.taxonomy || { categories: {}, days: {} };

  const CAT_MAP = taxonomy.categories || {};
  const DAY_MAP = taxonomy.days || { any: "any" };

  console.log("Scanning content folder recursively...");
  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR);
  }

  const absoluteImagesDir = path.resolve(IMAGES_DIR);
  const allFilePaths = getAllFiles(absoluteImagesDir);

  let currentContent = [];
  if (fs.existsSync(CONTENT_FILE)) {
    currentContent = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));
  }

  // Optimize lookup by creating maps
  const contentByPath = new Map();
  const contentByFilename = new Map();
  currentContent.forEach((c) => {
    if (c.image) contentByPath.set(c.image, c);
    const fname = path.basename(c.image);
    if (fname) contentByFilename.set(fname, c);
  });

  const newContent = allFilePaths.map((filePath) => {
    const relativePath = path
      .relative(absoluteImagesDir, filePath)
      .replace(/\\/g, "/");
    const filename = path.basename(filePath);
    const nameWithoutExt = path.basename(filePath, path.extname(filePath));

    // Try to find existing entry to preserve caption
    const existing =
      contentByPath.get(relativePath) || contentByFilename.get(filename);

    let categories = existing ? existing.categories : ["general"];
    let allowedDays = existing ? existing.allowedDays : "any";
    let caption = existing && existing.caption ? existing.caption : "";

    // Create a case-insensitive lookup for CAT_MAP
    const getMappedCat = (val) => {
      const lowerVal = val.toLowerCase();
      // Check if the lowercase version exists as a key in CAT_MAP (which might have mixed case keys from taxonomy)
      // Actually, we should probably check against both the key and the value or just standardize.
      // Let's look for a key that matches case-insensitively.
      const taxonomyKey = Object.keys(CAT_MAP).find(
        (k) => k.toLowerCase() === lowerVal,
      );
      return taxonomyKey ? CAT_MAP[taxonomyKey] : lowerVal;
    };

    // 1. Infer from subfolders (Primary)
    const pathParts = relativePath.split("/");
    if (pathParts.length > 1) {
      const folderCategories = pathParts
        .slice(0, -1)
        .map((folder) => getMappedCat(folder).toLowerCase());
      categories = [...new Set(folderCategories)];
    }

    // 2. Parse filename features
    // Try double dash first (Legacy/Explicit)
    const dparts = nameWithoutExt.split("--");

    if (dparts.length >= 3) {
      // [Cat]--[Days]--[Desc]
      const catPart = dparts[0];
      const dayPart = dparts[1].toLowerCase();
      categories = [getMappedCat(catPart).toLowerCase()];
      allowedDays = DAY_MAP[dayPart] || dayPart;
    } else if (dparts.length === 2) {
      // [Day/Cat]--[Desc/Day]
      const part1 = dparts[0].toLowerCase();
      const part2 = dparts[1].toLowerCase();

      if (DAY_MAP[part1]) {
        allowedDays = DAY_MAP[part1];
      } else {
        const mappedCat = getMappedCat(part1);
        // If it was actually a category
        if (taxonomyKeyForCat(part1, CAT_MAP)) {
          categories = [mappedCat.toLowerCase()];
          if (DAY_MAP[part2]) allowedDays = DAY_MAP[part2];
        }
      }
    } else {
      // Single part or dash separated: fri-1.jpg, fri.jpg, rel-1.jpg
      // ONLY parse filename for categories if the file is NOT in a subdirectory
      // (folder-based categories should take precedence)
      const isInSubdirectory = pathParts.length > 1;

      const sparts = nameWithoutExt.split("-");
      const prefix = sparts[0].toLowerCase();

      if (DAY_MAP[prefix]) {
        allowedDays = DAY_MAP[prefix];
      } else if (!isInSubdirectory) {
        // Only override category from filename if NOT in a subdirectory
        const taxonomyKey = Object.keys(CAT_MAP).find(
          (k) => k.toLowerCase() === prefix,
        );
        if (taxonomyKey) {
          categories = [CAT_MAP[taxonomyKey].toLowerCase()];
        }
      }
    }

    // Helper to check if a string matches any taxonomy category key case-insensitively
    function taxonomyKeyForCat(str, map) {
      return Object.keys(map).find(
        (k) => k.toLowerCase() === str.toLowerCase(),
      );
    }

    // 3. Apply default caption if still empty
    if (!caption && config.settings && config.settings.categoryDefaults) {
      const mainCat = categories[0]; // This is now standardized to lowercase
      // We should also check categoryDefaults case-insensitively
      const defKey = Object.keys(config.settings.categoryDefaults).find(
        (k) => k.toLowerCase() === mainCat,
      );
      if (defKey) {
        caption = config.settings.categoryDefaults[defKey];
      }
    }

    // Clear caption for hadith category as requested
    if (categories.includes("hadith")) {
      caption = "";
    }

    return {
      image: relativePath,
      caption: caption,
      allowedDays: allowedDays,
      categories: categories,
    };
  });

  const serialized = JSON.stringify(newContent, null, 2);
  let existingSerialized = "";
  if (fs.existsSync(CONTENT_FILE)) {
    existingSerialized = fs.readFileSync(CONTENT_FILE, "utf8");
  }

  if (serialized !== existingSerialized) {
    fs.writeFileSync(CONTENT_FILE, serialized, "utf8");
    console.log(
      `Successfully synced ${newContent.length} files to ${CONTENT_FILE}`,
    );
  } else {
    console.log("No changes detected in content.json (already in sync).");
  }
}

if (require.main === module) {
  sync();
}

module.exports = { sync };
