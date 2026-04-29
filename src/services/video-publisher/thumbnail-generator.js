const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

class ThumbnailGenerator {
  constructor(config = {}) {
    this.width = 1920;
    this.height = 1080;
    this.backgroundsDir = path.join(__dirname, "backgrounds");
    this.outputDir = path.join(__dirname, "output");
    this.config = config;

    // Default fonts if not in config
    this.fonts = config.settings?.visuals || {};
    this.fonts.fontReciter =
      this.fonts.fontReciter || "ScheherazadeNew-Bold.ttf";
    this.fonts.fontSurah =
      this.fonts.fontSurah || "SurahNameEjazahstyle-Regular.ttf";
    this.fonts.fontVerse = this.fonts.fontVerse || "Amiri-Bold.ttf";
    this.fonts.thumbFontSizeSurah = this.fonts.thumbFontSizeSurah || 180;
    this.fonts.thumbFontSizeReciter = this.fonts.thumbFontSizeReciter || 130;
    this.fonts.thumbFontSizeRange = this.fonts.thumbFontSizeRange || 100;

    // Load Surah Info (for clean Arabic names)
    const surahInfoPath = path.resolve(
      __dirname,
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
    const { reciterName, surahNameArabic, surahName, surahNumber, range } =
      metadata;

    // Use clean Arabic name from surah_info if available (for Ejazah font compatibility)
    let surahDisplay = surahNameArabic || surahName || "سورة";
    if (surahNumber && this.surahInfo[surahNumber]) {
      surahDisplay = `سورة ${this.surahInfo[surahNumber].name_arabic}`;
    }

    // Helper to escape XML special characters
    const escapeXml = (unsafe) => {
      return (unsafe || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
    };

    // Helper to convert to Standard Arabic numerals
    const toArabicNumerals = (str) => {
      return (str || "").toString().replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);
    };

    const safeReciter = escapeXml(reciterName || "القارئ");
    const safeSurah = escapeXml(surahDisplay);

    // Determine label (Singular/Plural) and convert range to Arabic numerals
    let label = "الآيات";
    if (range && !range.toString().match(/[-,]/)) {
      label = "الآية";
    }
    const safeRange = toArabicNumerals(escapeXml(range || ""));

    // Base64 encode fonts (Proven method for this system to ensure rendering)
    const fontReciterPath = path.join(
      __dirname,
      "fonts",
      this.fonts.fontReciter,
    );
    const fontSurahPath = path.join(__dirname, "fonts", this.fonts.fontSurah);
    const fontVersePath = path.join(__dirname, "fonts", this.fonts.fontVerse);

    const fontReciterB64 = fs.existsSync(fontReciterPath)
      ? fs.readFileSync(fontReciterPath).toString("base64")
      : "";
    const fontSurahB64 = fs.existsSync(fontSurahPath)
      ? fs.readFileSync(fontSurahPath).toString("base64")
      : "";
    const fontVerseB64 = fs.existsSync(fontVersePath)
      ? fs.readFileSync(fontVersePath).toString("base64")
      : "";

    // SVG with Arabic text - right-to-left
    const svg = `
        <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
                    <feOffset dx="4" dy="4" result="offsetblur"/>
                    <feFlood flood-color="rgba(0,0,0,0.95)"/>
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
                        font-size: ${this.fonts.thumbFontSizeReciter}px; 
                        font-weight: bold;
                    }
                    .surah { 
                        font-family: 'SurahFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.thumbFontSizeSurah}px; 
                        font-weight: bold;
                    }
                    .range { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.thumbFontSizeRange}px; 
                        fill: #FFD700;
                    }
                </style>
            </defs>
            
            <!-- Dark overlay -->
            <rect width="100%" height="100%" fill="rgba(0,0,0,0.3)"/>

            <text x="50%" y="30%" text-anchor="middle" class="reciter common-text" direction="rtl">${safeReciter}</text>

            <line x1="25%" y1="45%" x2="75%" y2="45%" stroke="#FFD700" stroke-width="4" opacity="0.9"/>

            <text x="50%" y="62%" text-anchor="middle" class="surah common-text" direction="rtl">${safeSurah}</text>

            <text x="50%" y="76%" text-anchor="middle" class="range common-text" direction="rtl">${label} ${safeRange}</text>        </svg>`;

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
      (s || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, "_");
    const fileName = `thumb_${sanitize(metadata.surahName || "unknown")}_${timestamp}.jpg`;
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
}

module.exports = ThumbnailGenerator;
