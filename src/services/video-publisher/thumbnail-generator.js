const sharp = require("sharp");
const path = require("path");
const fs = require("fs");
const QuranicTextRenderer = require("./quranic-text-renderer.js");

class ThumbnailGenerator {
  constructor(config = {}) {
    this.width = 1920;
    this.height = 1080;
    this.backgroundsDir = path.join(__dirname, "backgrounds");
    this.outputDir = config.OUTPUT_PATH || path.join(__dirname, "output");
    this.config = config;

    // Default fonts if not in config
    this.fonts = config.settings?.visuals || {};
    this.fonts.fontReciter =
      this.fonts.fontReciter || "ScheherazadeNew-Bold.ttf";
    this.fonts.fontSurah =
      this.fonts.fontSurah || "SurahNameEjazahstyle-Regular.ttf";
    this.fonts.fontVerse = this.fonts.fontVerse || "Amiri-Bold.ttf";
    this.fonts.fontVerseDisplay =
      this.fonts.fontVerseDisplay || "UthmanicHafsV22.ttf";
    this.fonts.thumbFontSizeSurah = this.fonts.thumbFontSizeSurah || 180;
    this.fonts.thumbFontSizeReciter = this.fonts.thumbFontSizeReciter || 130;
    this.fonts.thumbFontSizeRange = this.fonts.thumbFontSizeRange || 100;

    // Load Surah Info (for clean Arabic names)
    const surahInfoPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "global_assets",
      "surah_info.json",
    );
    this.surahInfo = fs.existsSync(surahInfoPath)
      ? JSON.parse(fs.readFileSync(surahInfoPath, "utf8"))
      : {};
  }

  /**
   * Get a random background image from the backgrounds directory
   */
  getRandomBackground() {
    const validExtensions = [".jpg", ".jpeg", ".png"];
    const files = fs
      .readdirSync(this.backgroundsDir)
      .filter((f) => validExtensions.includes(path.extname(f).toLowerCase()));

    if (files.length === 0) {
      throw new Error("No background images found in backgrounds/ directory");
    }

    const randomFile = files[Math.floor(Math.random() * files.length)];
    return path.join(this.backgroundsDir, randomFile);
  }

  /**
   * Create SVG text overlay
   */
  createTextOverlay(metadata) {
    const {
      reciterName,
      surahNameArabic,
      surahName,
      surahNumber,
      range,
      thumbSnippet,
    } = metadata;

    // Use clean Arabic name from surah_info if available (for Ejazah font compatibility)
    let surahDisplay = surahNameArabic || surahName || "سورة";
    if (surahNumber && this.surahInfo[surahNumber]) {
      surahDisplay = `سورة ${this.surahInfo[surahNumber].name_arabic}`;
    }

    // Helper to escape XML special characters
    const escapeXml = (unsafe) => {
      return (unsafe || "")
        .toString()
        .replace(/&/g, "&" + "amp;")
        .replace(/</g, "&" + "lt;")
        .replace(/>/g, "&" + "gt;")
        .replace(/"/g, "&" + "quot;")
        .replace(/'/g, "&" + "apos;");
    };

    // Helper to convert to Standard Arabic numerals
    const toArabicNumerals = (str) => {
      return (str || "").toString().replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
    };

    const safeReciter = escapeXml(reciterName || "القارئ");
    const safeSurah = escapeXml(surahDisplay);

    // Determine label (Singular/Plural) and convert range to Arabic numerals
    // Handle single-verse ranges like "5" or "5-5" to show "الآية 5" instead of "الآيات 5-5"
    // Also strip any existing "الآية" or "الآيات" prefix from the range value itself
    // (the scheduler may pass range as "الآية 5" instead of just "5")
    let label = "الآيات";
    let displayRange = (range || "").toString().trim();
    // Strip any existing label prefix from the range value
    displayRange = displayRange.replace(/^(الآية|الآيات)\s+/i, "");
    if (displayRange) {
      if (!displayRange.match(/[-,]/)) {
        label = "الآية";
      } else if (displayRange.includes("-")) {
        const [start, end] = displayRange.split("-").map((s) => s.trim());
        if (start === end) {
          label = "الآية";
          displayRange = start;
        }
      }
    }
    const safeRange = toArabicNumerals(escapeXml(displayRange));

    // Use thumbSnippet if provided, otherwise fallback to the first verse text
    // Replace three dots "..." with single Unicode ellipsis "…" (U+2026)
    // because the KFGQPC Hafs font doesn't include punctuation for "..."
    let snippetText = thumbSnippet || "";
    if (snippetText) {
      snippetText = snippetText.replace(/\.\.\./g, "…");
    }

    // Base64 encode fonts (Proven method for this system to ensure rendering)
    const fontReciterPath = path.join(
      __dirname,
      "fonts",
      this.fonts.fontReciter,
    );
    const fontSurahPath = path.join(__dirname, "fonts", this.fonts.fontSurah);
    const fontVersePath = path.join(__dirname, "fonts", this.fonts.fontVerse);
    const fontVerseDisplayPath = this.resolveFontPath(
      this.fonts.fontVerseDisplay,
    );

    const fontReciterB64 = fs.existsSync(fontReciterPath)
      ? fs.readFileSync(fontReciterPath).toString("base64")
      : "";
    const fontSurahB64 = fs.existsSync(fontSurahPath)
      ? fs.readFileSync(fontSurahPath).toString("base64")
      : "";
    const fontVerseB64 = fs.existsSync(fontVersePath)
      ? fs.readFileSync(fontVersePath).toString("base64")
      : "";
    const fontVerseDisplayB64 = fs.existsSync(fontVerseDisplayPath)
      ? fs.readFileSync(fontVerseDisplayPath).toString("base64")
      : "";

    // Redesigned sizes: verse range & snippet are the heroes, reciter & surah are smaller context
    const reciterFontSize = Math.round(this.fonts.thumbFontSizeReciter * 0.55); // Smaller context
    const surahFontSize = Math.round(this.fonts.thumbFontSizeSurah * 0.55); // Smaller context
    const rangeFontSize = Math.round(this.fonts.thumbFontSizeRange * 1.0); // Bigger, prominent
    const snippetFontSize = Math.round(this.fonts.thumbFontSizeRange * 0.85); // Slightly reduced for better spacing

    // Render snippet text with node-canvas (HarfBuzz/Pango) for proper OpenType shaping
    // This solves the madda/alif stacking issue that SVG + librsvg cannot handle
    let snippetDataUri = null;
    // Declare these outside the if block so they're accessible in the SVG template
    let imageX = 0;
    let imageY = 0;
    let snippetImageWidth = 0;
    let snippetCanvasHeight = 0;
    if (snippetText) {
      if (!this._quranRenderer) {
        this._quranRenderer = new QuranicTextRenderer({
          fontFamily: "KFGQPC HAFS Uthmanic Script",
          strokeWidth: 2,
          shadowOpacity: 0.95,
        });
        this._quranRenderer.registerDisplayFont(fontVerseDisplayPath);
      }

      snippetImageWidth = Math.round(this.width * 0.8);
      imageX = Math.round((this.width - snippetImageWidth) / 2);
      const topPadding = Math.round(snippetFontSize * 1.2);
      const bottomPadding = Math.round(snippetFontSize * 0.3);
      snippetCanvasHeight = Math.round(
        snippetFontSize + topPadding + bottomPadding,
      );
      const textStartY = Math.round(topPadding * 0.9);
      // Position the snippet baseline at ~75% of height:
      // range text baseline is at 61%, the standard gap between elements is ~13%,
      // so the next element baseline should be 61% + 13% + 1% extra = ~75%
      imageY = Math.round(this.height * 0.75 - textStartY);

      const buffer = this._quranRenderer.renderLines([snippetText], {
        fontSize: snippetFontSize,
        lineHeight: snippetFontSize * 1.5,
        canvasWidth: snippetImageWidth,
        canvasHeight: snippetCanvasHeight,
        startY: textStartY,
        strokeWidth: 2,
        shadowOpacity: 0.95,
        fillColor: "white",
        strokeColor: "black",
      });

      const b64 = buffer.toString("base64");
      snippetDataUri = `data:image/png;base64,${b64}`;
    }

    // SVG with Arabic text - right-to-left, centered, with lighter overlay
    const svg = `
        <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3"/>
                    <feOffset dx="3" dy="3" result="offsetblur"/>
                    <feFlood flood-color="rgba(0,0,0,0.7)"/>
                    <feComposite in2="offsetblur" operator="in"/>
                    <feMerge>
                        <feMergeNode/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
                <style>
                    /* Using Base64 encoded fonts */
                    @font-face {
                        font-family: 'ReciterFont';
                        src: url('data:font/ttf;base64,${fontReciterB64}');
                    }
                    @font-face {
                        font-family: 'SurahFont';
                        src: url('data:font/ttf;base64,${fontSurahB64}');
                    }
                    @font-face {
                        font-family: 'VerseFont';
                        src: url('data:font/ttf;base64,${fontVerseB64}');
                    }
                    @font-face {
                        font-family: 'KFGQPC HAFS Uthmanic Script';
                        src: url('data:font/ttf;base64,${fontVerseDisplayB64}');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }
                    
                    /* Common text style with stroke and shadow */
                    .common-text {
                        fill: white;
                        stroke: black;
                        stroke-width: 1.5px;
                        paint-order: stroke;
                        filter: url(#dropShadow);
                    }

                    .reciter { 
                        font-family: 'ReciterFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${reciterFontSize}px; 
                        font-weight: bold;
                    }
                    .surah { 
                        font-family: 'SurahFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${surahFontSize}px; 
                        font-weight: bold;
                    }
                    .range { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${rangeFontSize}px; 
                        fill: #FFD700;
                    }
                </style>
            </defs>
            
            <!-- Lighter semi-transparent overlay for readability -->
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.3)"/>

            <!-- Centered layout with lighter background box -->
            <rect x="10%" y="15%" width="80%" height="70%" rx="15" ry="15" fill="rgba(0,0,0,0.4)" stroke="#FFD700" stroke-width="1.5"/>

            <!-- Evenly spaced elements with consistent gaps -->
            <text x="50%" y="27%" text-anchor="middle" class="reciter common-text" direction="rtl">${safeReciter}</text>

            <line x1="30%" y1="35%" x2="70%" y2="35%" stroke="#FFD700" stroke-width="2" opacity="0.8"/>

            <text x="50%" y="48%" text-anchor="middle" class="surah common-text" direction="rtl">${safeSurah}</text>

            <!-- Verse range and snippet with consistent spacing -->
            <text x="50%" y="61%" text-anchor="middle" class="range common-text" direction="rtl">${label} ${safeRange}</text>
            
            ${
              snippetText && snippetDataUri
                ? `<!-- Verse snippet rendered with node-canvas (HarfBuzz) for proper OpenType mkmk positioning -->
            <image x="${imageX}" y="${imageY}" width="${snippetImageWidth}" height="${snippetCanvasHeight}" href="${snippetDataUri}" />`
                : ""
            }
        </svg>`;

    return Buffer.from(svg);
  }

  /**
   * Generate a thumbnail with text overlay
   * @param {Object} metadata - { reciterName, surahName, surahNameArabic, range }
   * @param {string} [backgroundPath] - Optional specific background, otherwise random
   * @returns {Promise<{thumbnailPath: string, backgroundPath: string}>}
   */
  async generate(metadata, backgroundPath = null) {
    const bgPath = backgroundPath || this.getRandomBackground();

    // Create text overlay SVG
    const textOverlay = this.createTextOverlay(metadata);

    // Process: resize background, composite text overlay
    const timestamp = Date.now();
    const sanitize = (s) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|()[\]']/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\x00-\x7F]/g, "");

    const reciter = sanitize(metadata.reciterName || "UnknownReciter");
    const surah = sanitize(metadata.surahName || "UnknownSurah");
    const range = sanitize(metadata.range || "0");
    const fileName = `${reciter}_${surah}_${range}_${timestamp}.jpg`;
    const outputPath = path.join(this.outputDir, fileName);

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    await sharp(bgPath)
      .resize(this.width, this.height, { fit: "cover" })
      .composite([{ input: textOverlay, top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toFile(outputPath);

    console.log(`[ThumbnailGenerator] Created: ${fileName}`);
    return { thumbnailPath: outputPath, backgroundPath: bgPath };
  }

  /**
   * Resolve font file path, supporting .ttf, .woff, .woff2 extensions
   */
  resolveFontPath(fontFileName) {
    const fontsDir = path.join(__dirname, "fonts");
    const globalFontsDir = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "global_assets",
      "fonts",
    );
    const baseName = path.basename(fontFileName, path.extname(fontFileName));

    // Try exact filename in local fonts directory first
    const exactPath = path.join(fontsDir, fontFileName);
    if (fs.existsSync(exactPath)) {
      return exactPath;
    }

    // Try exact filename in global fonts directory
    const globalExactPath = path.join(globalFontsDir, fontFileName);
    if (fs.existsSync(globalExactPath)) {
      return globalExactPath;
    }

    // Try common font extensions in local directory
    const extensions = [".ttf", ".woff", ".woff2"];
    for (const ext of extensions) {
      const testPath = path.join(fontsDir, `${baseName}${ext}`);
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    // Try common font extensions in global directory
    for (const ext of extensions) {
      const testPath = path.join(globalFontsDir, `${baseName}${ext}`);
      if (fs.existsSync(testPath)) {
        return testPath;
      }
    }

    // Return original path even if not found (will fallback to default font)
    return exactPath;
  }
}

module.exports = ThumbnailGenerator;
