const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const arabicReshaper = require("arabic-reshaper");

/**
 * VideoGenerator handles creating MP4 files from audio and backgrounds.
 */
class VideoGenerator {
  constructor(config = {}) {
    this.outputDir = path.join(__dirname, "output");
    this.config = config;

    // Allow custom resolution (used by the new style editor / presets)
    this.width =
      Number(config.settings?.visuals?.resolution?.width) ||
      Number(config.settings?.visuals?.width) ||
      1920;
    this.height =
      Number(config.settings?.visuals?.resolution?.height) ||
      Number(config.settings?.visuals?.height) ||
      1080;

    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Default visuals configuration
    const defaultVisuals = {
      fontReciter: "ScheherazadeNew-Bold.ttf",
      fontSurah: "ScheherazadeNew-Bold.ttf",
      fontVerse: "Amiri-Bold.ttf",
      videoTextPosition: "top",
      videoTextShadow: true,
      videoTextOutline: true,
      videoFontSizeSurah: 110,
      videoFontSizeReciter: 75,
      videoFontSizeRange: 50,
      videoFontSizeDua: 35,
      textBottomOffset: 70,
      textStrokeWidth: 2,
      textShadowOpacity: 0.95,
      textBackgroundOpacity: 0,
      comment: "Offset in pixels to raise text from default bottom position",
    };

    // Merge config settings with defaults
    this.fonts = { ...defaultVisuals, ...(config.settings?.visuals || {}) };

    // Fallback for missing individual font size properties in config.settings.visuals
    this.fonts.videoFontSizeSurah = this.fonts.videoFontSizeSurah || 120;
    this.fonts.videoFontSizeReciter = this.fonts.videoFontSizeReciter || 90;
    this.fonts.videoFontSizeRange = this.fonts.videoFontSizeRange || 70;
    this.fonts.videoFontSizeDua = this.fonts.videoFontSizeDua || 45;
    this.fonts.textStrokeWidth = this.fonts.textStrokeWidth || 2;
    this.fonts.textShadowOpacity = this.fonts.textShadowOpacity ?? 0.95;
    this.fonts.textBackgroundOpacity = this.fonts.textBackgroundOpacity ?? 0;

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
   * Create a transparent PNG with text overlay using sharp (same method as thumbnail)
   * This ensures perfect Arabic rendering
   */
  async createTextOverlayImage(metadata, timestamp) {
    const { reciterName, surahNameArabic, surahName, surahNumber, range } =
      metadata;

    let surahDisplay = surahNameArabic || surahName || "سورة";
    if (surahNumber && this.surahInfo[surahNumber]) {
      surahDisplay = `سورة ${this.surahInfo[surahNumber].name_arabic}`;
    }

    const escapeXml = (unsafe) =>
      (unsafe || "")
        .toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const toArabicNumerals = (str) =>
      (str || "").toString().replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

    let label = "الآيات";
    if (range && !range.toString().match(/[-,]/)) label = "الآية";

    const safeReciter = escapeXml(reciterName || "القارئ");
    const safeSurah = escapeXml(surahDisplay);
    const safeRange = toArabicNumerals(escapeXml(range || ""));

    // Load fonts as Base64 (Proven method for this system to ensure rendering)
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

    // Layout support (preferred): config.settings.visuals.layout
    const layout = this.config.settings?.visuals?.layout || null;

    // Legacy positioning fallback
    const bottomOffset = this.config.settings?.visuals?.textBottomOffset || 70;
    const legacyBaseY = {
      surah: 730,
      reciter: 860,
      range: 960,
      dua: 1040,
    };

    const resolveY = (key, fallbackY) => {
      const raw = layout?.[key]?.y;
      const n = Number(raw);
      return Number.isFinite(n) ? n : fallbackY;
    };

    const ySurah = resolveY("surah", legacyBaseY.surah - bottomOffset);
    const yReciter = resolveY("reciter", legacyBaseY.reciter - bottomOffset);
    const yRange = resolveY("range", legacyBaseY.range - bottomOffset);
    const yDua = resolveY("dua", legacyBaseY.dua - bottomOffset);

    // Optional background gradient
    const bgOpacity = this.fonts.textBackgroundOpacity;
    const bgRectCfg = layout?.textBackground;
    const bgRectY = Number(bgRectCfg?.y);
    const bgRectH = Number(bgRectCfg?.height);
    const bgRectEnabled = bgRectCfg?.enabled === true;
    const bgRect =
      bgOpacity > 0 && (bgRectEnabled || !layout)
        ? `<rect x="0" y="${Number.isFinite(bgRectY) ? bgRectY : Math.round(this.height * 0.46)}" width="${this.width}" height="${Number.isFinite(bgRectH) ? bgRectH : Math.round(this.height * 0.54)}" fill="url(#bottomGrad)" />`
        : "";

    const svg = `
        <svg width="${this.width}" height="${this.height}" xmlns="http://www.w3.org/2000/svg">
             <defs>
                <linearGradient id="bottomGrad" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="black" stop-opacity="0"/>
                    <stop offset="100%" stop-color="black" stop-opacity="${bgOpacity}"/>
                </linearGradient>
                <filter id="dropShadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="4"/>
                    <feOffset dx="4" dy="4" result="offsetblur"/>
                    <feFlood flood-color="rgba(0,0,0,${this.fonts.textShadowOpacity})"/>
                    <feComposite in2="offsetblur" operator="in"/>
                    <feMerge>
                        <feMergeNode/><feMergeNode in="SourceGraphic"/>
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

                    /* Common text style with stroke and shadow for visibility */
                    .common-text {
                        fill: white;
                        stroke: black;
                        stroke-width: ${this.fonts.textStrokeWidth}px;
                        paint-order: stroke;
                        filter: url(#dropShadow);
                    }

                    .surah { 
                        font-family: 'SurahFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.videoFontSizeSurah}px; /* Largest */
                        font-weight: bold; 
                    }
                    .reciter { 
                        font-family: 'ReciterFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.videoFontSizeReciter}px; /* Medium */
                        font-weight: normal;
                    }
                    .range { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.videoFontSizeRange}px; /* Smallest */
                        fill: #FFD700; 
                    }
                    .dua { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${this.fonts.videoFontSizeDua}px; /* Subtle, smaller than range */
                        font-weight: normal;
                    }
                </style>
            </defs>
            <!-- Background Gradient (if enabled) -->
            ${bgRect}

            <!-- Bottom-aligned layout with hierarchical spacing -->
            <!-- Positioning: Adjusted by bottomOffset=${bottomOffset}px -->
            
            <!-- Surah Name (Top of group) -->
            <text x="50%" y="${ySurah}" text-anchor="middle" class="surah common-text" direction="rtl">${safeSurah}</text>
            
            <!-- Reciter Name -->
            <text x="50%" y="${yReciter}" text-anchor="middle" class="reciter common-text" direction="rtl">${safeReciter}</text>
            
            <!-- Verse Range -->
            <text x="50%" y="${yRange}" text-anchor="middle" class="range common-text" direction="rtl">${label} ${safeRange}</text>
            
            <!-- Dua Request Phrase -->
            <text x="50%" y="${yDua}" text-anchor="middle" class="dua common-text" direction="rtl">نسألكم الدعاء لنا ولأهلنا ولمن ساهم في نشر المقطع | جزاكم الله خيراً</text>
        </svg>`;

    const overlayPath = path.join(this.outputDir, `overlay_${timestamp}.png`);
    const sharp = require("sharp");
    await sharp(Buffer.from(svg)).png().toFile(overlayPath);

    return overlayPath;
  }

  async createVideo(audioPath, backgroundPath, metadata = {}) {
    const sanitize = (s) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|()[\]']/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\x00-\x7F]/g, "");
    const surah = sanitize(metadata.surahName || "UnknownSurah");
    const range = sanitize(metadata.range || "0");
    const timestamp = Date.now();
    const outputPath = path.join(
      this.outputDir,
      `yt_${surah}_${range}_${timestamp}.mp4`,
    );
    const isGif = path.extname(backgroundPath).toLowerCase() === ".gif";

    // 1. Create text overlay image using sharp
    const overlayPath = await this.createTextOverlayImage(metadata, timestamp);

    // 2. Build FFmpeg command with overlay
    const baseFilter = `scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height}`;
    const zoom = `zoompan=z='min(zoom+0.0005,1.1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${this.width}x${this.height}`;

    let filter;
    if (isGif) {
      filter = `[0:v]${baseFilter}[bg];[bg][1:v]overlay=0:0`;
    } else {
      filter = `[0:v]${baseFilter},${zoom}[bg];[bg][1:v]overlay=0:0`;
    }

    const command =
      `ffmpeg -y ${isGif ? "-ignore_loop 0" : "-loop 1"} -i "${backgroundPath}" -i "${overlayPath}" -i "${audioPath}" ` +
      `-filter_complex "${filter}" -c:v libx264 -tune ${isGif ? "animation" : "stillimage"} ` +
      `-preset medium -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -movflags +faststart "${outputPath}"`;

    console.log(`[VideoGenerator] Creating video with sharp overlay...`);

    return new Promise((resolve, reject) => {
      exec(
        command,
        { maxBuffer: 1024 * 1024 * 100 },
        (error, stdout, stderr) => {
          // Cleanup overlay file
          if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);

          if (error) {
            console.error(`[VideoGenerator] FFmpeg Error Log:`, stderr);
            return reject(error);
          }
          console.log(`[VideoGenerator] Success: ${outputPath}`);
          resolve(outputPath);
        },
      );
    });
  }

  /**
   * Clean up old videos and temp files
   */
  async cleanup(maxAgeDays = 7) {
    if (!fs.existsSync(this.outputDir)) return;
    const files = fs.readdirSync(this.outputDir);
    const now = Date.now();
    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    files.forEach((file) => {
      const filePath = path.join(this.outputDir, file);
      if (fs.lstatSync(filePath).isDirectory()) {
        if (file === "temp_text") {
          const tempFiles = fs.readdirSync(filePath);
          tempFiles.forEach((tf) => {
            const tp = path.join(filePath, tf);
            const stats = fs.statSync(tp);
            if (now - stats.mtimeMs > maxAgeMs) fs.unlinkSync(tp);
          });
        }
        return;
      }
      if (!file.endsWith(".mp4") && !file.endsWith(".jpg")) return;
      const stats = fs.statSync(filePath);
      if (now - stats.mtimeMs > maxAgeMs) {
        console.log(`[VideoGenerator] Cleaning up: ${file}`);
        fs.unlinkSync(filePath);
      }
    });
  }
}

module.exports = VideoGenerator;
