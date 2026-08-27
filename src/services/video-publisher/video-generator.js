const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const arabicReshaper = require("arabic-reshaper");
const QuranicTextRenderer = require("./quranic-text-renderer.js");
const { mergeLoneVerseMarkers } = require("../shared/text-utils");

/**
 * VideoGenerator handles creating MP4 files from audio and backgrounds.
 */
class VideoGenerator {
  constructor(config = {}) {
    this.outputDir = config.OUTPUT_PATH || path.join(__dirname, "output");
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
      fontVerseDisplay: "UthmanicHafsV22.ttf",
      verseDisplayFontSize: 85,
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
    const {
      reciterName,
      surahNameArabic,
      surahName,
      surahNumber,
      range,
      verseText,
      format,
    } = metadata;

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

    // NOTE: sanitizeQuranText hack removed.
    // Quranic text is now rendered via node-canvas (HarfBuzz/Pango)
    // which properly handles OpenType mark-to-mark (mkmk) positioning.
    // See quranic-text-renderer.js for the proper implementation.
    // Detect single verse: range like "19-19" or "19"
    let label = "الآيات";
    let displayRange = range || "";
    if (range) {
      const rangeStr = range.toString().trim();
      if (!rangeStr.match(/[-,]/)) {
        label = "الآية";
      } else if (rangeStr.includes("-")) {
        const [start, end] = rangeStr.split("-").map((s) => s.trim());
        if (start === end) {
          label = "الآية";
          displayRange = start;
        }
      }
    }

    const safeReciter = escapeXml(reciterName || "القارئ");
    const safeSurah = escapeXml(surahDisplay);
    const safeRange = toArabicNumerals(escapeXml(displayRange));

    // Load fonts as Base64 (Proven method for this system to ensure rendering)
    // Supports .ttf, .woff, .woff2 formats
    const fontReciterPath = this.resolveFontPath(this.fonts.fontReciter);
    const fontSurahPath = this.resolveFontPath(this.fonts.fontSurah);
    const fontVersePath = this.resolveFontPath(this.fonts.fontVerse);
    const fontVerseDisplayPath = this.resolveFontPath(
      this.fonts.fontVerseDisplay,
    );

    const fontReciterB64 = this.loadFontBase64(fontReciterPath);
    const fontSurahB64 = this.loadFontBase64(fontSurahPath);
    const fontVerseB64 = this.loadFontBase64(fontVersePath);
    const fontVerseDisplayB64 = this.loadFontBase64(fontVerseDisplayPath);

    // Extract font extensions for CSS @font-face declarations
    const fontReciterExt = path
      .extname(fontReciterPath)
      .toLowerCase()
      .replace(".", "");
    const fontSurahExt = path
      .extname(fontSurahPath)
      .toLowerCase()
      .replace(".", "");
    const fontVerseExt = path
      .extname(fontVersePath)
      .toLowerCase()
      .replace(".", "");
    const fontVerseDisplayExt = path
      .extname(fontVerseDisplayPath)
      .toLowerCase()
      .replace(".", "");

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

    const isVerseDisplay =
      (format === "verse-display" || format === "reciter-portrait-verse") &&
      verseText;
    let cleanedVerseText = "";
    let verseTextImageDataUri = null; // For canvas-rendered verse text (proper OpenType shaping)
    if (isVerseDisplay) {
      // Only strip Arabic End of Ayah (U+06DD) and Arabic Small High Word (U+06DE)
      cleanedVerseText = verseText.replace(/[\u06DD\u06DE]/g, "").trim();

      // NOTE: We no longer use the sanitizeQuranText hack (ZWNJ insertion).
      // Instead, we render the verse text with node-canvas (HarfBuzz/Pango)
      // which properly handles OpenType mark-to-mark (mkmk) positioning.
    }
    const safeVerseText = isVerseDisplay ? escapeXml(cleanedVerseText) : "";

    // Helper: wrap Arabic verse text into multiple lines that fit within maxWidth
    const wrapArabicText = (text, maxCharsPerLine) => {
      const words = text.trim().split(/\s+/);
      const lines = [];
      let currentLine = "";
      for (const word of words) {
        if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
          if (currentLine) lines.push(currentLine.trim());
          currentLine = word;
        } else {
          currentLine = currentLine ? currentLine + " " + word : word;
        }
      }
      if (currentLine) lines.push(currentLine.trim());
      return mergeLoneVerseMarkers(lines);
    };

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
                        src: url('${fontReciterB64}') format('${fontReciterExt}');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }
                    @font-face {
                        font-family: 'SurahFont';
                        src: url('${fontSurahB64}') format('${fontSurahExt}');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }
                    @font-face {
                        font-family: 'VerseFont';
                        src: url('${fontVerseB64}') format('${fontVerseExt}');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }
                    @font-face {
                        font-family: 'KFGQPC HAFS Uthmanic Script';
                        src: url('${fontVerseDisplayB64}') format('truetype');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }
                    @font-face {
                        font-family: 'DisplayFont';
                        src: url('${fontVerseDisplayB64}') format('truetype');
                        font-weight: normal;
                        font-style: normal;
                        font-display: swap;
                    }

                    /* Common text style with stroke and shadow for visibility */
                    .common-text {
                        fill: white;
                        stroke: black;
                        stroke-width: ${this.fonts.textStrokeWidth}px;
                        paint-order: stroke;
                        filter: url(#dropShadow);
                    }

                    .verse-text {
                        fill: white;
                        stroke: black;
                        stroke-width: ${this.fonts.textStrokeWidth}px;
                        paint-order: stroke;
                        filter: url(#dropShadow);
                    }

                    .surah { 
                        font-family: 'SurahFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${isVerseDisplay ? Math.round(this.fonts.videoFontSizeSurah * 0.55) : this.fonts.videoFontSizeSurah}px;
                        font-weight: bold; 
                    }
                    .reciter { 
                        font-family: 'ReciterFont', 'Scheherazade New', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${isVerseDisplay ? Math.round(this.fonts.videoFontSizeReciter * 0.6) : this.fonts.videoFontSizeReciter}px;
                        font-weight: normal;
                    }
                    .range { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${isVerseDisplay ? Math.round(this.fonts.videoFontSizeRange * 0.55) : this.fonts.videoFontSizeRange}px;
                        fill: #FFD700; 
                    }
                    .verse-line {
                        font-family: 'KFGQPC HAFS Uthmanic Script';
                        font-size: ${isVerseDisplay ? this.fonts.verseDisplayFontSize : Math.round(this.fonts.videoFontSizeSurah * 1.2)}px;
                        font-weight: normal;
                        text-rendering: optimizeLegibility;
                        font-variant-ligatures: common-ligatures contextual;
                        -webkit-font-feature-settings: "liga" 1, "clig" 1, "ccmp" 1, "calt" 1;
                        font-feature-settings: "liga" 1, "clig" 1, "ccmp" 1, "calt" 1;
                    }
                    .dua { 
                        font-family: 'VerseFont', 'Amiri', 'Traditional Arabic', 'Arial', sans-serif; 
                        font-size: ${isVerseDisplay ? Math.round(this.fonts.videoFontSizeReciter * 0.6) : this.fonts.videoFontSizeDua}px;
                        font-weight: normal;
                    }
                </style>
            </defs>
            <!-- Background Gradient (if enabled) -->
            ${bgRect}

            ${
              isVerseDisplay
                ? (() => {
                    // ── Resolution-aware scaling ──────────────────────────────────
                    // Scale layout (line widths, char thresholds) by width relative to 1920.
                    // For font size, apply a higher floor so portrait text doesn't get tiny.
                    // Portrait (1080×1920): widthScale = 0.56 for layout, fontScale = 0.85 for fonts
                    // Landscape (1920×1080): widthScale = 1.0, fontScale = 1.0
                    const isPortrait = this.height > this.width;
                    const widthScale = this.width / 1920;
                    // Boost font scale for portrait to 0.85 (up from 0.75) for better readability
                    const fontScale = isPortrait
                      ? Math.max(0.85, widthScale)
                      : widthScale;

                    // Dynamic font sizing based on verse length
                    // Box starts at same position (25%) for all orientations.
                    // For portrait, box is shorter to leave room for header/dua text.
                    // For portrait, move box up to just under reciter text (y=12%)
                    // so bottom space is left clear for reciter portrait image.
                    const boxTopPercent = isPortrait ? 16 : 25;
                    const boxHeightPercent = isPortrait ? 40 : 60;
                    const baseFontSize = Math.round(
                      this.fonts.verseDisplayFontSize * fontScale,
                    );
                    const charCount = cleanedVerseText.length;
                    const scaledCharThreshold = (threshold) =>
                      Math.round(threshold * Math.min(1, fontScale));

                    let fontSize = baseFontSize;
                    let maxCharsPerLine = Math.round(85 * widthScale);

                    const T600 = scaledCharThreshold(600);
                    const T350 = scaledCharThreshold(350);
                    const T180 = scaledCharThreshold(180);
                    const T120 = scaledCharThreshold(120);
                    const T70 = scaledCharThreshold(70);

                    if (charCount > T600) {
                      // Extremely long verses (e.g. Al-Baqarah 282: 1110+ chars)
                      fontSize = Math.round(baseFontSize * 0.6);
                      maxCharsPerLine = Math.round(160 * widthScale);
                    } else if (charCount > T350) {
                      // Long verses (350-600 chars) — moderate sizing to avoid excessive empty space
                      fontSize = Math.round(baseFontSize * 0.65);
                      maxCharsPerLine = Math.round(150 * widthScale);
                    } else if (charCount > T180) {
                      fontSize = Math.round(baseFontSize * 0.75);
                      maxCharsPerLine = Math.round(125 * widthScale);
                    } else if (charCount > T120) {
                      fontSize = Math.round(baseFontSize * 0.88);
                      maxCharsPerLine = Math.round(103 * widthScale);
                    } else if (charCount > T70) {
                      fontSize = Math.round(baseFontSize * 0.95);
                      maxCharsPerLine = Math.round(97 * widthScale);
                    }

                    // Wrap text into multiple lines — use slightly wider padding to fit more chars
                    const paddingPercent = 2; // more horizontal space than before (was 2)
                    const effectiveWidth = 100 - paddingPercent * 2;
                    const maxCharsPerLinePadded = Math.floor(
                      maxCharsPerLine * (effectiveWidth / 100),
                    );
                    const lines = wrapArabicText(
                      cleanedVerseText,
                      maxCharsPerLinePadded,
                    );

                    // Use more of the available vertical space with equal distribution
                    const boxTopPx = (boxTopPercent / 100) * this.height;
                    const boxHeightPx = (boxHeightPercent / 100) * this.height;
                    const availableHeightPx = boxHeightPx * 0.92;

                    let lineHeight;
                    if (lines.length <= 3) {
                      // Slightly increased line-height for better readability on few lines
                      lineHeight =
                        fontSize * Math.min(1.65, 1.45 + 0.2 * widthScale);
                    } else {
                      lineHeight = Math.min(
                        fontSize * 1.7,
                        availableHeightPx / lines.length,
                      );
                    }
                    // Ensure lineHeight is never smaller than 1.3x font (readability floor)
                    if (lineHeight < fontSize * 1.3) {
                      lineHeight = fontSize * 1.3;
                    }

                    const totalTextHeight = lines.length * lineHeight;
                    const startYPx =
                      charCount > T600
                        ? boxTopPx + (boxHeightPx - totalTextHeight) / 2 + 55
                        : boxTopPx + (boxHeightPx - totalTextHeight) / 2;

                    // Render the verse text with node-canvas (HarfBuzz/Pango) for proper OpenType shaping
                    // This is the key fix: canvas handles mark-to-mark (mkmk) positioning that librsvg cannot
                    if (!this._quranRenderer) {
                      this._quranRenderer = new QuranicTextRenderer({
                        fontFamily: "KFGQPC HAFS Uthmanic Script",
                        strokeWidth: this.fonts.textStrokeWidth || 2,
                        shadowOpacity: this.fonts.textShadowOpacity ?? 0.95,
                      });
                      this._quranRenderer.registerDisplayFont(
                        fontVerseDisplayPath,
                      );
                    }

                    // Calculate canvas dimensions for the verse text
                    // IMPORTANT: The canvas must have generous top padding because HarfBuzz
                    // positions diacritics above the baseline. Stacked marks (e.g. Dagger Alif
                    // U+0670 + Maddah Above U+0653) need significant clearance above the first
                    // line's baseline. The SVG <image> compositor will blend the transparent
                    // padding correctly — we just need it not to clip.
                    const verseCanvasWidth = Math.round(this.width * 0.88);
                    const topPadding = Math.round(fontSize * 1.4); // tall padding so stacked diacritics never clip
                    const bottomPadding = Math.round(fontSize * 0.4);
                    const verseCanvasHeight = Math.round(
                      totalTextHeight + topPadding + bottomPadding,
                    );
                    // Baseline of the first line: far enough from top to clear the tallest possible
                    // diacritic stack (Dagger Alif + Maddah + Shadda etc.)
                    const verseStartY = Math.round(topPadding * 0.85);

                    const verseTextBuffer = this._quranRenderer.renderLines(
                      lines,
                      {
                        fontSize,
                        lineHeight,
                        canvasWidth: verseCanvasWidth,
                        canvasHeight: verseCanvasHeight,
                        startY: verseStartY,
                        strokeWidth: this.fonts.textStrokeWidth || 2,
                        shadowOpacity: this.fonts.textShadowOpacity ?? 0.95,
                        fillColor: "white",
                        strokeColor: "black",
                      },
                    );

                    // Convert PNG buffer to Base64 data URI for embedding in SVG
                    const verseTextB64 = verseTextBuffer.toString("base64");
                    const verseTextDataUri = `data:image/png;base64,${verseTextB64}`;

                    // Calculate image placement in the SVG
                    const imageX = Math.round(
                      (this.width - verseCanvasWidth) / 2,
                    );
                    // Place the canvas so the first line's text baseline lands at startYPx.
                    // verseStartY is the baseline Y within the canvas (distance from canvas top).
                    // So: canvas top = startYPx - verseStartY
                    const imageY = Math.max(
                      0,
                      Math.round(startYPx - verseStartY),
                    );

                    // Scale header/dua font sizes for narrow videos
                    const headerFontScale = 0.55 * widthScale;
                    const reciterFontScale = 0.6 * widthScale;
                    const duaFontScale = 0.6 * widthScale;
                    const surahFontSize = Math.round(
                      this.fonts.videoFontSizeSurah * headerFontScale,
                    );
                    const reciterFontSize = Math.round(
                      this.fonts.videoFontSizeReciter * reciterFontScale,
                    );
                    const rangeFontSize = Math.round(
                      this.fonts.videoFontSizeRange * 0.55 * widthScale,
                    );
                    const duaFontSize = Math.round(
                      this.fonts.videoFontSizeReciter * duaFontScale,
                    );

                    return `
            <!-- Verse-Display Mode: Show verse text prominently -->
            <!-- Wider semi-transparent dark box for the verse text with padding -->
            <rect x="3%" y="${boxTopPercent}%" width="94%" height="${boxHeightPercent}%" rx="15" ry="15" fill="rgba(0,0,0,0.25)"/>
            <!-- Verse text rendered with node-canvas (HarfBuzz) for proper OpenType mkmk positioning -->
            <image x="${imageX}" y="${imageY}" width="${verseCanvasWidth}" height="${verseCanvasHeight}" href="${verseTextDataUri}" />

            ${
              isPortrait
                ? `
            <!-- Portrait: Surah at 7%, Reciter at 12% (closer together), Dua at 88% -->
            <text x="50%" y="7%" text-anchor="middle" class="surah common-text" direction="rtl" font-size="${surahFontSize}">${safeSurah} - ${label} ${safeRange}</text>
            <text x="50%" y="12%" text-anchor="middle" class="reciter common-text" direction="rtl" font-size="${reciterFontSize}">${safeReciter}</text>
            <text x="50%" y="88%" text-anchor="middle" class="dua common-text" direction="rtl" font-size="${duaFontSize}">نسألكم الدعاء | جزاكم الله خيراً</text>`
                : `
            <!-- Landscape: Surah at 8%, Reciter at 16%, Dua at 92% (original positions) -->
            <text x="50%" y="8%" text-anchor="middle" class="surah common-text" direction="rtl" font-size="${surahFontSize}">${safeSurah} - ${label} ${safeRange}</text>
            <text x="50%" y="16%" text-anchor="middle" class="reciter common-text" direction="rtl" font-size="${reciterFontSize}">${safeReciter}</text>
            <text x="50%" y="92%" text-anchor="middle" class="dua common-text" direction="rtl" font-size="${duaFontSize}">نسألكم الدعاء | جزاكم الله خيراً</text>`
            }
            `;
                  })()
                : `
            <!-- Bottom-aligned layout with hierarchical spacing -->
            <!-- Positioning: Adjusted by bottomOffset=${bottomOffset}px -->
            
            <!-- Surah Name (Top of group) -->
            <text x="50%" y="${ySurah}" text-anchor="middle" class="surah common-text" direction="rtl">${safeSurah}</text>
            
            <!-- Reciter Name -->
            <text x="50%" y="${yReciter}" text-anchor="middle" class="reciter common-text" direction="rtl">${safeReciter}</text>
            
            <!-- Verse Range -->
            <text x="50%" y="${yRange}" text-anchor="middle" class="range common-text" direction="rtl">${label} ${safeRange}</text>
            
            <!-- Dua Request Phrase -->
            <text x="50%" y="${yDua}" text-anchor="middle" class="dua common-text" direction="rtl">نسألكم الدعاء | جزاكم الله خيراً</text>
            `
            }
        </svg>`;

    const overlayPath = path.join(
      this.outputDir,
      `temp_khayr_${timestamp}.png`,
    );
    const sharp = require("sharp");
    await sharp(Buffer.from(svg)).png().toFile(overlayPath);

    return overlayPath;
  }

  async createVideo(audioPath, backgroundPath, metadata = {}) {
    // Verify audio file exists before running ffmpeg
    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error(
        `Audio file not found: ${audioPath || "(empty path)"}. ` +
          `The merged audio may have failed to generate or was cleaned up prematurely.`,
      );
    }

    const sanitize = (s) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|()[\]']/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\x00-\x7F]/g, "");
    const reciter = sanitize(metadata.reciterName || "UnknownReciter");
    const surah = sanitize(metadata.surahName || "UnknownSurah");
    const range = sanitize(metadata.range || "0");
    const timestamp = Date.now();
    const outputPath = path.join(
      this.outputDir,
      `${reciter}_${surah}_${range}_${timestamp}.mp4`,
    );

    const bgExt = path.extname(backgroundPath).toLowerCase();
    const isGif = bgExt === ".gif";
    const isVideo = [".mp4", ".mov", ".webm"].includes(bgExt);
    const format = metadata.format;

    // Determine if we need verse-display mode (dynamic overlays per verse)
    const isVerseDisplay =
      format === "verse-display" || format === "reciter-portrait-verse";

    if (
      isVerseDisplay &&
      metadata.verseTimings &&
      metadata.verseTimings.length > 0
    ) {
      // Verse-display mode: generate sequential overlays with timing
      return this._createVerseDisplayVideo(
        audioPath,
        backgroundPath,
        metadata,
        outputPath,
        timestamp,
      );
    }

    // 1. Create text overlay image using sharp
    const overlayPath = await this.createTextOverlayImage(metadata, timestamp);

    // 2. Build FFmpeg command with overlay
    const baseFilter = `scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height}`;
    const zoom = `zoompan=z='min(zoom+0.0005,1.1)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${this.width}x${this.height}`;

    let filter;
    if (isVideo || isGif) {
      // For video/gif backgrounds: no zoompan, just scale and overlay
      filter = `[0:v]${baseFilter}[bg];[bg][1:v]overlay=0:0`;
    } else {
      filter = `[0:v]${baseFilter},${zoom}[bg];[bg][1:v]overlay=0:0`;
    }

    // For stock video backgrounds, use -stream_loop -1 for seamless looping
    const inputLoop = isVideo
      ? "-stream_loop -1"
      : isGif
        ? "-ignore_loop 0"
        : "-loop 1";
    const tune = isVideo ? "animation" : isGif ? "animation" : "stillimage";

    const command =
      `ffmpeg -y ${inputLoop} -i "${backgroundPath}" -i "${overlayPath}" -i "${audioPath}" ` +
      `-filter_complex "${filter}" -c:v libx264 -tune ${tune} ` +
      `-preset medium -crf 18 -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -movflags +faststart "${outputPath}"`;

    console.log(`[VideoGenerator] Creating video with sharp overlay...`);

    return new Promise((resolve, reject) => {
      exec(
        command,
        { maxBuffer: 1024 * 1024 * 100, windowsHide: true },
        (error, stdout, stderr) => {
          // Cleanup this overlay and any orphaned temp files
          if (fs.existsSync(overlayPath)) fs.unlinkSync(overlayPath);
          this._cleanupOrphanedTempFiles();

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
   * Create a verse-display video with dynamic overlays per verse
   * Uses sequential overlay filters with enable='between(t,start,end)' for each verse.
   * Adds a fade-out transition and 2 seconds of clean background at the end.
   */
  async _createVerseDisplayVideo(
    audioPath,
    backgroundPath,
    metadata,
    outputPath,
    timestamp,
  ) {
    // Verify audio file exists before running ffmpeg
    if (!audioPath || !fs.existsSync(audioPath)) {
      throw new Error(
        `Audio file not found: ${audioPath || "(empty path)"}. ` +
          `The merged audio may have failed to generate or was cleaned up prematurely.`,
      );
    }

    const verseTimings = metadata.verseTimings || [];
    const bgExt = path.extname(backgroundPath).toLowerCase();
    const isVideo = [".mp4", ".mov", ".webm"].includes(bgExt);
    const isGif = bgExt === ".gif";

    console.log(
      `[VideoGenerator] Creating verse-display video with ${verseTimings.length} verses...`,
    );

    // Calculate total audio duration from last verse's end time
    const lastVerse = verseTimings[verseTimings.length - 1];
    const totalAudioSec = lastVerse
      ? ((lastVerse.startTimeMs || 0) + (lastVerse.durationMs || 5000)) / 1000
      : 10;

    const isVertical = this.height > this.width;

    // Total video = audio duration + 2 extra seconds for clean tail (skip tail for vertical videos)
    const tailSec = isVertical ? 0 : 2.0;
    const totalVideoSec = totalAudioSec + tailSec;
    // Fade out smoothly over 1 second starting at the audio end time
    // so overlays fade to black, then 1 more second of pure black
    const fadeStartSec = totalAudioSec;

    // Generate overlay images for each verse
    const overlayPaths = [];
    for (let i = 0; i < verseTimings.length; i++) {
      const verseMeta = { ...metadata, verseText: verseTimings[i].text };
      const overlayPath = await this.createTextOverlayImage(
        verseMeta,
        `${timestamp}_${i}`,
      );
      overlayPaths.push(overlayPath);
    }

    // Build filter complex with overlays timed to each verse
    // Each overlay chains from the previous one so all overlays are visible simultaneously
    const baseFilter = `scale=${this.width}:${this.height}:force_original_aspect_ratio=increase,crop=${this.width}:${this.height}`;
    let filter = `[0:v]${baseFilter}[bg]`;

    for (let i = 0; i < overlayPaths.length; i++) {
      const timing = verseTimings[i];
      const startSec = (timing.startTimeMs || 0) / 1000;
      // For the last verse, extend its visibility through the fade-out period
      // so it fades to black smoothly with the background instead of snapping off
      const isLastVerse = i === overlayPaths.length - 1;
      const endSec = isLastVerse
        ? totalVideoSec
        : ((timing.startTimeMs || 0) + (timing.durationMs || 5000)) / 1000;
      const inputIdx = i + 1;
      const prevLabel = i === 0 ? "[bg]" : `[bg${i - 1}]`;
      filter += `;${prevLabel}[${inputIdx}:v]overlay=0:0:enable='between(t,${startSec},${endSec})'[bg${i}]`;
    }

    // After last overlay, add fade-out to black for smooth ending (skip for vertical videos)
    const lastLabelName =
      overlayPaths.length > 0 ? `bg${overlayPaths.length - 1}` : "bg";
    let finalLabel = lastLabelName;

    if (!isVertical) {
      finalLabel = "faded";
      filter += `;[${lastLabelName}]fade=out:st=${fadeStartSec}:d=1.0[${finalLabel}]`;
    }

    // Build input arguments
    let inputs = "";
    const inputLoop = isVideo
      ? "-stream_loop -1"
      : isGif
        ? "-ignore_loop 0"
        : "-loop 1";
    inputs += `${inputLoop} -i "${backgroundPath}" `;
    for (const op of overlayPaths) {
      inputs += `-i "${op}" `;
    }
    inputs += `-i "${audioPath}"`;

    const tune = isVideo ? "animation" : isGif ? "animation" : "stillimage";

    const command =
      `ffmpeg -y ${inputs} ` +
      `-filter_complex "${filter}" -map "[${finalLabel}]" -map "${overlayPaths.length + 1}:a" ` +
      `-c:v libx264 -tune ${tune} -preset medium -crf 18 -c:a aac -b:a 192k ` +
      `-pix_fmt yuv420p -movflags +faststart -t ${totalVideoSec} "${outputPath}"`;

    console.log(
      `[VideoGenerator] Creating verse-display video (${totalVideoSec}s total, fade at ${fadeStartSec}s)...`,
    );

    return new Promise((resolve, reject) => {
      exec(
        command,
        { maxBuffer: 1024 * 1024 * 100, windowsHide: true },
        (error, stdout, stderr) => {
          // Cleanup overlay files
          for (const op of overlayPaths) {
            if (fs.existsSync(op)) fs.unlinkSync(op);
          }
          this._cleanupOrphanedTempFiles();

          if (error) {
            console.error(`[VideoGenerator] FFmpeg Error Log:`, stderr);
            return reject(error);
          }
          console.log(
            `[VideoGenerator] Success (verse-display): ${outputPath}`,
          );
          resolve(outputPath);
        },
      );
    });
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

  /**
   * Load font file as Base64, supporting .ttf, .woff, .woff2 formats
   * Returns the full data URI with proper MIME type
   */
  loadFontBase64(fontPath) {
    if (!fs.existsSync(fontPath)) {
      return "";
    }
    const buffer = fs.readFileSync(fontPath);
    const ext = path.extname(fontPath).toLowerCase();

    let mimeType;
    if (ext === ".woff") {
      mimeType = "font/woff";
    } else if (ext === ".woff2") {
      mimeType = "font/woff2";
    } else if (ext === ".ttf") {
      mimeType = "font/truetype";
    } else {
      mimeType = "application/octet-stream";
    }

    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  }

  /**
   * Delete any leftover temporary files (temp_khayr_*.png) that were not cleaned up
   * after a previous video generation (e.g. process crash or error).
   */
  _cleanupOrphanedTempFiles() {
    if (!fs.existsSync(this.outputDir)) return;
    const files = fs.readdirSync(this.outputDir);
    for (const file of files) {
      // Only clean up files matching our temp naming convention
      if (file.startsWith("temp_khayr_") && file.endsWith(".png")) {
        const filePath = path.join(this.outputDir, file);
        try {
          fs.unlinkSync(filePath);
          console.log(`[VideoGenerator] Cleaned up temp file: ${file}`);
        } catch (_) {
          // ignore race conditions
        }
      }
    }
  }

  /**
   * Clean up old videos and temp files
   */
  async cleanup(maxAgeDays = 7) {
    if (!fs.existsSync(this.outputDir)) return;

    // Always purge any orphaned temp files first
    this._cleanupOrphanedTempFiles();

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
