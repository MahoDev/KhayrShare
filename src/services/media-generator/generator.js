const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { OUTPUT_PATH } = require("../../config");
const VIDEO_OUTPUT_DIR = path.join(OUTPUT_PATH, "video-service-outputs");
const DAILY_RECITER_POOL_FILE = path.join(
  VIDEO_OUTPUT_DIR,
  "daily_reciter_pool.json",
);

// Ensure output directory exists
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

/**
 * Read JSON from file with fallback if missing/corrupt.
 */
function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * Write JSON to file (pretty-printed).
 */
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

/**
 * Background Video Generator
 * Generates Quran videos periodically using x_poster and video-publisher styles
 * without interfering with their normal operation.
 */
class VideoGenerator {
  constructor(configPath, cliConfig = null) {
    this.configPath = configPath;
    this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    this.cliConfig = cliConfig;
    this.baseDir = path.dirname(configPath);

    // Load shared modules
    const ContentFetcher = require("./content-fetcher");
    this.contentFetcher = new ContentFetcher(
      path.resolve(this.baseDir, this.config.paths.recitersJson),
      { excludedReciters: this.config.settings.excludedReciters || [] },
    );

    // Load Facebook config for group matching
    this.fbConfigPath = path.resolve(
      this.baseDir,
      this.config.paths.facebookConfig,
    );
  }

  /**
   * Normalize Arabic text for matching
   */
  normalizeArabic(text) {
    if (!text) return "";
    return text
      .replace(/[\u064B-\u0652]/g, "") // Remove Harakat
      .replace(/[أإآ]/g, "ا") // Normalize Alef
      .replace(/ة/g, "ه") // Normalize Teh Marbuta
      .replace(/ى/g, "ي") // Normalize Alef Maksura
      .replace(/\s+/g, "") // Remove all whitespace
      .toLowerCase();
  }

  /**
   * Pick a reciter using daily round-robin pool.
   * @param {boolean} skipPoolUpdate - If true, skip updating the pool (used by regeneration flow).
   * @returns {string} The chosen reciter ID as a string.
   */
  pickDailyReciter(skipPoolUpdate = false) {
    const today = new Date().toISOString().slice(0, 10);
    let pool = readJson(DAILY_RECITER_POOL_FILE, { date: null, usedIds: [] });

    if (pool.date !== today) {
      pool = { date: today, usedIds: [] };
    }

    const excludedIds = new Set(
      (this.config.settings?.excludedReciters || []).map(String),
    );
    const allIds = Object.keys(this.contentFetcher.reciters).filter(
      (id) => !excludedIds.has(id),
    );

    let eligibleIds = allIds.filter((id) => !pool.usedIds.includes(id));

    if (eligibleIds.length === 0) {
      // Pool exhausted — reset and start new round
      pool.usedIds = [];
      eligibleIds = allIds;
      console.log(
        `[VideoGen] Daily reciter pool exhausted — starting new round (all ${allIds.length} reciters used today)`,
      );
    }

    const chosen = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];

    if (!skipPoolUpdate) {
      pool.usedIds.push(chosen);
      writeJson(DAILY_RECITER_POOL_FILE, pool);
    }

    console.log(
      `[VideoGen] Picked reciter: ${chosen} (${pool.usedIds.length}/${allIds.length} used today)`,
    );
    return chosen;
  }

  /**
   * Options builder for fetching content
   */
  getFetchOptions() {
    let options = {
      mode: ["FULL_RUKU", "SHORT_RUKU"][Math.floor(Math.random() * 2)],
      excludedRukus: [],
    };

    // 1. Check for manual params passed via environment variable (legacy ephemeral run)
    let manualParams = null;
    const envSource =
      process.env.MANUAL_PARAMS || process.env._ || process.env.PARAMS;

    if (envSource && envSource.trim().startsWith("{")) {
      try {
        manualParams = JSON.parse(envSource);
      } catch (e) {
        if (process.env.MANUAL_PARAMS) {
          console.error("[VideoGen] Failed to parse MANUAL_PARAMS:", e.message);
        }
      }
    }

    // 2. Merge configs: CLI args override environment/legacy overrides config defaults
    const manualConfig =
      this.cliConfig || manualParams || this.config.manualGeneration;

    if (manualConfig) {
      const rId =
        manualConfig.reciterId ||
        manualConfig.reciterid ||
        manualConfig.reciter_id;
      if (rId) {
        options.reciterId = rId;
        console.log(`[VideoGen] Manual Reciter ID detected: ${rId}`);
      }

      const isRnd =
        manualConfig.isRandom !== undefined
          ? manualConfig.isRandom
          : manualConfig.isandom;
      if (isRnd === false && manualConfig.surahId) {
        options.mode = "MANUAL";
        options.surah = manualConfig.surahId;
        const start = manualConfig.startVerse || 1;
        const end = manualConfig.endVerse || 10;
        options.verseRange = `${start}-${end}`;
        console.log(
          `[VideoGen] Manual Content Mode: Surah ${options.surah}, Range ${options.verseRange}`,
        );
      }
    }

    // NEW: If no reciterId set yet, pick one via daily round-robin pool
    // Skip pool update if this is a regeneration flow
    if (!options.reciterId) {
      const isRegen = this.cliConfig?._isRegeneration === true;
      if (isRegen) {
        console.log(
          `[VideoGen] Regeneration mode — using reciter ${this.cliConfig.reciterId}, skipping pool update`,
        );
        options.reciterId = this.cliConfig.reciterId;
      } else {
        options.reciterId = this.pickDailyReciter();
      }
    }

    return options;
  }

  /**
   * Generate video using X-Poster style
   * @param {Object} [overrideResolution] - Optional { width, height } to override resolution
   */
  async generateXPosterVideo(overrideResolution = null) {
    const flavor = overrideResolution
      ? `x-poster (${overrideResolution.width}x${overrideResolution.height})`
      : "x-poster (square)";
    console.log(`[VideoGen] Generating ${flavor} video...`);

    const TextRenderer = require("./text-renderer");
    const VideoGenerator = require(
      path.resolve(this.baseDir, this.config.paths.xPosterVideoGenerator),
    );

    const textRenderer = new TextRenderer();
    const xPosterConfig = { OUTPUT_PATH: VIDEO_OUTPUT_DIR };

    // Apply resolution: overrideResolution takes precedence, then cliConfig, then default
    const resWidth = overrideResolution?.width || this.cliConfig?.platformWidth;
    const resHeight =
      overrideResolution?.height || this.cliConfig?.platformHeight;
    if (resWidth && resHeight) {
      xPosterConfig.settings = {
        visuals: {
          resolution: {
            width: resWidth,
            height: resHeight,
          },
        },
      };
    }
    const videoGen = new VideoGenerator(xPosterConfig);

    const fetchOpts = this.getFetchOptions();
    const rukuData = await this.contentFetcher.fetchContent(fetchOpts);

    console.log(
      `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
    );

    await this.checkTrackingAndWarn(rukuData.reciterName);

    // Process audio
    const audioResult = await this.contentFetcher.processAudio(rukuData.verses);
    const audioPath = audioResult.path;

    // Render frame
    const framePath = await textRenderer.renderFrame(rukuData);

    // Generate video
    const videoPath = await videoGen.createVideo(
      audioPath,
      framePath,
      rukuData,
    );

    return {
      videoPath,
      metadata: rukuData,
      style: "square",
      resolution: { width: resWidth || 1080, height: resHeight || 1080 },
    };
  }

  /**
   * Prompt user for thumbnail snippet interactively
   */
  async promptThumbSnippet(rukuData) {
    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Show the first verse text as reference
    const firstVerseText = rukuData.verses?.[0]?.text || "";
    console.log(`\n[Interactive] No --thumb-text provided.`);
    console.log(`First verse text: "${firstVerseText}"`);

    return new Promise((resolve) => {
      rl.question(
        `Enter a thumbnail snippet (or press Enter to use the first verse): `,
        (answer) => {
          rl.close();
          const snippet = answer.trim() || firstVerseText.slice(0, 100);
          console.log(`Thumbnail snippet set to: "${snippet}"`);
          resolve(snippet);
        },
      );
    });
  }

  /**
   * Generate video using YouTube-Poster style
   * @param {Object} [overrideResolution] - Optional { width, height } to override resolution
   * @param {Object} [prefetchedData] - Optional pre-fetched { rukuData, audioResult } to share across platforms
   */
  async generateYouTubeVideo(overrideResolution = null, prefetchedData = null) {
    const flavor = overrideResolution
      ? `youtube (${overrideResolution.width}x${overrideResolution.height})`
      : "youtube (default)";
    console.log(`[VideoGen] Generating ${flavor} video...`);

    const VideoGenerator = require(
      path.resolve(this.baseDir, this.config.paths.youtubePosterVideoGenerator),
    );
    const ThumbnailGenerator = require(
      path.resolve(
        this.baseDir,
        this.config.paths.youtubePosterThumbnailGenerator,
      ),
    );

    // Resolve resolution: overrideResolution > cliConfig > config default
    const resWidth = overrideResolution?.width || this.cliConfig?.platformWidth;
    const resHeight =
      overrideResolution?.height || this.cliConfig?.platformHeight;

    // Use local config for backgrounds and settings
    const ytConfig = this.config;

    const ytGenConfig = { ...ytConfig, OUTPUT_PATH: VIDEO_OUTPUT_DIR };
    if (resWidth && resHeight) {
      ytGenConfig.settings = {
        ...(ytConfig.settings || {}),
        visuals: {
          ...(ytConfig.settings?.visuals || {}),
          resolution: {
            width: resWidth,
            height: resHeight,
          },
        },
      };
    } else if (this.cliConfig?.platformWidth) {
      ytGenConfig.settings = {
        ...(ytConfig.settings || {}),
        visuals: {
          ...(ytConfig.settings?.visuals || {}),
          resolution: {
            width: this.cliConfig.platformWidth,
            height: this.cliConfig.platformHeight,
          },
        },
      };
    }
    const videoGen = new VideoGenerator(ytGenConfig);

    // Use prefetched content if available (multi-platform flow), otherwise fetch fresh
    let rukuData, audioResult, audioPath;
    if (prefetchedData) {
      rukuData = prefetchedData.rukuData;
      audioResult = prefetchedData.audioResult;
      audioPath = audioResult.path;
      rukuData.verseTimings = audioResult.verseTimings || [];
    } else {
      const fetchOpts = this.getFetchOptions();
      rukuData = await this.contentFetcher.fetchContent(fetchOpts);
    }

    // Only do format/bgType/thumbText setup if NOT using prefetched data
    // (prefetched data already has these set)
    if (!prefetchedData) {
      // Attach format and bgType from CLI config
      const liveConfig = JSON.parse(
        fs.readFileSync(
          this.configPath
            ? path.join(this.configPath)
            : this.baseDir + "/config.json",
          "utf8",
        ),
      );
      let rawFormat =
        this.cliConfig?.format ||
        liveConfig.settings?.defaultFormat ||
        this.config.settings?.defaultFormat ||
        "classic";
      const availableFormats = [
        "classic",
        "reciter-portrait",
        "stock-video",
        "verse-display",
        "reciter-portrait-verse",
      ];
      if (rawFormat === "random") {
        rawFormat =
          availableFormats[Math.floor(Math.random() * availableFormats.length)];
        console.log(`[VideoGen] Random format selected: ${rawFormat}`);
      }
      rukuData.format = rawFormat;
      rukuData.bgType = this.cliConfig?.bgType || "classic";

      // Auto-map bgType for formats that imply a specific background type
      if (
        rukuData.format === "reciter-portrait" ||
        rukuData.format === "reciter-portrait-verse"
      ) {
        if (!this.cliConfig?.bgType) {
          rukuData.bgType = "portrait";
        }
      } else if (rukuData.format === "stock-video") {
        if (!this.cliConfig?.bgType) {
          rukuData.bgType = "stock";
        }
      }

      // Interactive prompt for thumbnail text if not provided
      const isRegeneration = this.cliConfig?._isRegeneration === true;
      const isSchedulerMode = !this.cliConfig || isRegeneration;

      if (
        this.cliConfig &&
        !this.cliConfig.thumbText &&
        this.cliConfig?.format !== "verse-display" &&
        !isSchedulerMode
      ) {
        rukuData.thumbSnippet = await this.promptThumbSnippet(rukuData);
      } else if (this.cliConfig?.thumbText) {
        rukuData.thumbSnippet = this.cliConfig.thumbText;
      } else {
        const firstVerseText = rukuData.verses?.[0]?.text || "";
        const words = firstVerseText.trim().split(/\s+/);
        rukuData.thumbSnippet = words.slice(0, 3).join(" ");
        console.log(
          `[VideoGen] Auto-snippet (first 3 words): "${rukuData.thumbSnippet}"...`,
        );
      }

      console.log(
        `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
      );
      console.log(
        `Format: ${rukuData.format}, Background Type: ${rukuData.bgType}`,
      );

      await this.checkTrackingAndWarn(rukuData.reciterName);

      // Process audio
      audioResult = await this.contentFetcher.processAudio(rukuData.verses);
      audioPath = audioResult.path;
      rukuData.verseTimings = audioResult.verseTimings || [];
    } else {
      console.log(
        `[VideoGen] Using prefetched content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
      );
    }

    // Select background based on bgType and orientation
    let bgPath = null;
    const bgType = rukuData.bgType;
    const isPortrait = resHeight > resWidth;

    if (isPortrait) {
      // For vertical videos, look in portraits/vertical/ folder for reciter-specific background
      const verticalDir = path.resolve(
        this.baseDir,
        "../video-publisher/assets/portraits/vertical",
      );
      const reciterId = rukuData.reciterId || "1";

      // Ensure the vertical directory exists
      if (!fs.existsSync(verticalDir)) {
        fs.mkdirSync(verticalDir, { recursive: true });
      }

      // Look for {reciterId}-vertical.* in the vertical folder
      const verticalFiles = fs
        .readdirSync(verticalDir)
        .filter(
          (f) =>
            f.startsWith(`${reciterId}-vertical`) &&
            f.match(/\.(jpg|jpeg|png)$/i),
        );

      if (verticalFiles.length > 0) {
        bgPath = path.join(verticalDir, verticalFiles[0]);
        console.log(
          `[VideoGen] Using vertical background for reciter ${reciterId}: ${verticalFiles[0]}`,
        );
      } else {
        console.log(
          `[VideoGen] No vertical background for reciter ${reciterId} in portraits/vertical/. Will fall back.`,
        );
      }
    }

    if (!bgPath && bgType === "portrait") {
      const portraitDir = path.resolve(
        this.baseDir,
        "../video-publisher/assets/portraits",
      );
      const reciterId = rukuData.reciterId || "1";
      const portraitPath = path.join(portraitDir, `${reciterId}.jpg`);
      if (fs.existsSync(portraitPath)) {
        bgPath = portraitPath;
        console.log(
          `[VideoGen] Using portrait background for reciter ${reciterId}`,
        );
      } else {
        const portraitPng = path.join(portraitDir, `${reciterId}.png`);
        if (fs.existsSync(portraitPng)) {
          bgPath = portraitPng;
          console.log(
            `[VideoGen] Using portrait background (PNG) for reciter ${reciterId}`,
          );
        } else {
          console.warn(
            `[VideoGen] Portrait not found for reciter ${reciterId}. Falling back to classic background.`,
          );
        }
      }
    }

    if (bgType === "stock") {
      const stockDir = path.resolve(
        this.baseDir,
        "../video-publisher/assets/stock-videos",
      );
      if (this.cliConfig?.background) {
        const stockPath = path.join(stockDir, this.cliConfig.background);
        if (fs.existsSync(stockPath)) {
          bgPath = stockPath;
        } else {
          throw new Error(
            `Stock video not found: ${this.cliConfig.background}. Run with --listStockVideos to see available files.`,
          );
        }
      } else {
        const stocks = fs
          .readdirSync(stockDir)
          .filter((f) => f.match(/\.(mp4|mov|webm|gif)$/i));
        if (stocks.length > 0) {
          bgPath = path.join(
            stockDir,
            stocks[Math.floor(Math.random() * stocks.length)],
          );
        } else {
          console.warn(
            `[VideoGen] No stock videos found. Falling back to classic background.`,
          );
        }
      }
    }

    // Fallback to classic background if no bgPath resolved
    if (!bgPath) {
      const bgDir = path.resolve(
        this.baseDir,
        "../video-publisher/backgrounds",
      );
      const backgrounds = fs
        .readdirSync(bgDir)
        .filter(
          (f) => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".gif"),
        );

      if (this.cliConfig?.background) {
        if (!backgrounds.includes(this.cliConfig.background)) {
          throw new Error(
            `Background file not found: ${this.cliConfig.background}. Run with --listBackgrounds to see available files.`,
          );
        }
        bgPath = path.join(bgDir, this.cliConfig.background);
      } else {
        bgPath =
          backgrounds.length > 0
            ? path.join(
                bgDir,
                backgrounds[Math.floor(Math.random() * backgrounds.length)],
              )
            : null;
      }

      if (!bgPath) {
        throw new Error("No backgrounds found in video-publisher/backgrounds");
      }
    }

    // Generate video
    const videoPath = await videoGen.createVideo(audioPath, bgPath, rukuData);

    return {
      videoPath,
      metadata: rukuData,
      style: overrideResolution
        ? `youtube-${overrideResolution.width}x${overrideResolution.height}`
        : "landscape",
      bgPath,
      resolution: { width: resWidth || 1920, height: resHeight || 1080 },
    };
  }

  /**
   * Generate platform-specific social media sections
   */
  generateSocialMediaSections(metadata) {
    const platforms = this.config.platforms || {};
    const lines = [];
    const sep = "─".repeat(60);

    const rName = metadata.reciterName || "قارئ";
    const sName = metadata.surahNameArabic || metadata.surahName || "سورة";
    // Strip tashkeel for clean display and matching
    const sNameClean = sName.replace(/[\u064B-\u0652]/g, "");
    // Build clean "سورة البقرة" display (without tashkeel, single space)
    const cleanSurahName = sNameClean.includes("سورة")
      ? sNameClean
      : "سورة " + sNameClean;
    // Strip tashkeel & spaces for hashtag/tag use, remove leading "سورة"
    const sNameNoSpaces = sNameClean.replace(/\s+/g, "").replace(/^سورة/g, "");
    const rNameNoSpaces = rName.replace(/\s+/g, "_");

    // Build clean surah name for display: "سورة البقرة" (tashkeel-free)
    const surahDisplayClean = cleanSurahName.replace(/\s+/g, " ").trim();
    // Build verse range string
    const verseRange = metadata.range ? `الآيات ${metadata.range}` : "";

    // Randomization Helpers (Spintax)
    const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const shuffleArray = (arr) => [...arr].sort(() => 0.5 - Math.random());

    // Caption Components (all use cleanSurahName without tashkeel)
    const hooks = [
      `تلاوة خاشعة تريح القلب من ${surahDisplayClean}`,
      `استمع وتدبر آيات من ${surahDisplayClean}`,
      `راحة نفسية وطمأنينة مع هذه التلاوة من ${surahDisplayClean}`,
      `تلاوة هادئة تأخذك لعالم آخر من ${surahDisplayClean}`,
      `أرح مسمعك وقلبك مع هذه التلاوة من ${surahDisplayClean}`,
    ];

    const bodies = [
      `بصوت القارئ ${rName}. 🎧✨`,
      `بصوت يبعث على السكينة للقارئ ${rName}. 🌙`,
      `تلاوة عطرة بصوت ${rName}. 🤍`,
      `أداء خاشع ومميز من القارئ ${rName}. ✨`,
    ];

    // Verse info to include in descriptions (no tacky CTAs)
    const verseInfo = [
      `${surahDisplayClean} | ${verseRange} | بصوت ${rName}`,
      `تلاوة من ${surahDisplayClean}، ${verseRange} بصوت القارئ ${rName}`,
      `تأمل في آيات من ${surahDisplayClean} (${verseRange}) بصوت ${rName}`,
    ];

    const ctasInstagram = [
      `${surahDisplayClean} | ${verseRange} | بصوت ${rName}`,
      `تلاوة من ${surahDisplayClean}، ${verseRange} بصوت القارئ ${rName}`,
      `تأمل في آيات من ${surahDisplayClean} (${verseRange}) بصوت ${rName}`,
    ];

    // Hashtags Pools (sNameNoSpaces already has tashkeel stripped + "سورة" removed)
    const baseHashtags = [`#سورة_${sNameNoSpaces}`, `#القارئ_${rNameNoSpaces}`];

    // TikTok hashtags: follow 3-5 structure:
    // 1 broad/trending, 2 niche topic, 1 specific search keyword
    const tiktokBroadTag = ["#قرآن", "#القرآن_الكريم"];
    const tiktokNicheTags = [
      "#تلاوة_خاشعة",
      "#مقاطع_دينية",
      "#راحة_نفسية",
      "#تلاوات",
      "#صدقة_جارية",
      "#quranrecitation",
    ];
    const tiktokSpecificTags = ["#اكسبلور", "#MuslimTikTok", "#islamic_video"];

    const instagramHashtagsPool = [
      "#قرآن",
      "#اسلاميات",
      "#القرآن_الكريم",
      "#قران",
      "#ذكر",
      "#تلاوات",
      "#اكسبلور",
      "#مقاطع_دينية",
      "#ريلز",
      "#IslamicReminders",
      "#Islam",
      "#Muslim",
      "#Deen",
      "#QuranQuotes",
      "#ExplorePage",
      "#Reels",
    ];

    // Pinterest: 2-5 refined hashtags to append at end of description
    const pinterestHashtagsPool = [
      "#قرآن",
      "#تلاوات_خاشعة",
      "#اسلاميات",
      "#القرآن_الكريم",
      "#مقاطع_دينية",
      "#Quran",
      "#QuranRecitation",
      "#IslamicReminders",
    ];

    // TikTok: max 4 hashtags total: 1 broad + 2 niche + 1 specific
    // Base hashtags (surah + reciter) are excluded from the count
    const getTiktokHashtags = () => {
      // 1 broad/trending
      const broad = getRandom(tiktokBroadTag);
      // 2 niche topic
      const niche = shuffleArray(tiktokNicheTags).slice(0, 2);
      // 1 specific search keyword
      const specific = getRandom(tiktokSpecificTags);
      // Combine max 4 with base
      return [...new Set([broad, ...niche, specific]), ...baseHashtags].join(
        " ",
      );
    };

    const getInstagramHashtags = () => {
      const pool = [...new Set([...baseHashtags, ...instagramHashtagsPool])];
      const selected = shuffleArray(pool).slice(0, 12);
      return selected.join(" ");
    };

    // TikTok caption: hook + body + verse range, NO tacky CTA
    if (platforms.tiktok?.enabled) {
      lines.push(``);
      lines.push(sep);
      lines.push(`[ TIKTOK POSTING DETAILS ]`);
      lines.push(`[ CAPTION ]`);
      lines.push(
        `${getRandom(hooks)}\n${getRandom(bodies)}\n\n${getRandom(verseInfo)}`,
      );
      lines.push(``);
      lines.push(`[ HASHTAGS ]`);
      lines.push(getTiktokHashtags());
    }

    if (platforms.instagram?.enabled) {
      lines.push(``);
      lines.push(sep);
      lines.push(`[ INSTAGRAM POSTING DETAILS ]`);
      lines.push(`[ CAPTION ]`);
      lines.push(
        `${getRandom(hooks)} ${getRandom(bodies)}\n\n${getRandom(verseInfo)}\n\n${getRandom(ctasInstagram)}`,
      );
      lines.push(``);
      lines.push(`[ HASHTAGS ]`);
      lines.push(getInstagramHashtags());
    }

    if (platforms.pinterest?.enabled) {
      // For Pinterest: convert tags to hashtags and append to description.
      // Select 2-5 niche Pinterest hashtags.
      const pinterestSelectedHashtags = shuffleArray(
        pinterestHashtagsPool,
      ).slice(0, 3);

      // Title: clean, no tashkeel, no double "سورة"
      const pinterestTitle = `${getRandom(hooks)} - بصوت ${rName}`;

      // Description: informative, verse info, no tacky CTA, hashtags at end
      const pinterestDescription = [
        `استمع إلى هذه التلاوة الهادئة من ${surahDisplayClean}.`,
        getRandom(verseInfo),
        "",
        pinterestSelectedHashtags.join(" "),
      ].join("\n");

      lines.push(``);
      lines.push(sep);
      lines.push(`[ PINTEREST POSTING DETAILS ]`);
      lines.push(`[ TITLE ]`);
      lines.push(pinterestTitle);
      lines.push(``);
      lines.push(`[ DESCRIPTION ]`);
      lines.push(pinterestDescription);
      lines.push(``);
      lines.push(`[ TAGGED TOPICS ]`);
      lines.push(`Quran, Quran Verses, Allah`);
    }

    return lines;
  }

  /**
   * Create suggestion file with caption and matching groups
   */
  async createSuggestionFile(videoResult) {
    const { videoPath, metadata, style, bgPath } = videoResult;

    // Ensure absolute video path
    const absVideoPath = path.resolve(videoPath);

    // Use MetadataGenerator to generate caption
    const MetadataGenerator = require(
      path.resolve(this.baseDir, "../video-publisher/metadata-generator.js"),
    );
    const metadataGen = new MetadataGenerator(this.config);
    const ytMetadata = metadataGen.generate(metadata);

    // Use the full description generated by MetadataGenerator as the caption
    const caption = ytMetadata.description;

    // Generate Thumbnail
    let thumbnailPath = "Thumbnail generation failed";
    let actualThumbBg = ""; // Track what background was actually used for the thumbnail
    try {
      const ThumbnailGenerator = require(
        path.resolve(this.baseDir, "../video-publisher/thumbnail-generator.js"),
      );
      const thumbGen = new ThumbnailGenerator({
        ...this.config,
        OUTPUT_PATH: VIDEO_OUTPUT_DIR,
      });
      // Use the same background as the video if available,
      // but fall back to a classic image background if bgPath is a video file (sharp cannot process video)
      const bgExt = bgPath ? path.extname(bgPath).toLowerCase() : "";
      const isVideoBg = [".mp4", ".mov", ".webm", ".gif"].includes(bgExt);
      let thumbBgPath = isVideoBg ? null : bgPath;

      // Enforce horizontal background if the selected one is vertical
      if (thumbBgPath && thumbBgPath.includes("vertical")) {
        const reciterId = metadata.reciterId || "0";
        const portraitPath = path.resolve(
          this.baseDir,
          `../video-publisher/assets/portraits/${reciterId}.jpg`,
        );
        if (fs.existsSync(portraitPath)) {
          thumbBgPath = portraitPath;
        } else {
          thumbBgPath = null;
        }
      }

      const thumbResult = await thumbGen.generate(metadata, thumbBgPath);
      thumbnailPath = path.resolve(thumbResult.thumbnailPath);
      // Record the actual background used for the thumbnail (may differ from video's bgPath)
      actualThumbBg = thumbBgPath || "";
    } catch (e) {
      console.error("[VideoGen] Thumbnail generation error:", e);
    }

    // Find matching Facebook groups
    const fbConfig = JSON.parse(fs.readFileSync(this.fbConfigPath, "utf8"));
    const normalizedReciter = this.normalizeArabic(metadata.reciterName);

    let candidates = [];
    let matchType = "General";

    if (metadata.reciterCategory === "muallim") {
      // For Muallim reciters, ONLY suggest groups from the muallim category
      candidates = fbConfig.groups?.muallim || [];
      matchType = "Muallim Category";

      // Further filter for specific reciter if possible within muallim groups
      const specificMatches = candidates.filter((g) => {
        if (!g.forReciter) return false;
        const reciters = Array.isArray(g.forReciter)
          ? g.forReciter
          : [g.forReciter];
        return reciters.some((r) =>
          normalizedReciter.includes(this.normalizeArabic(r)),
        );
      });

      if (specificMatches.length > 0) {
        candidates = specificMatches;
        matchType = "Muallim Specific";
      }

      if (metadata.includeGeneralGroups) {
        // Append general video groups too
        const videoGroups = fbConfig.groups?.video || [];
        const generalGroups = videoGroups.filter((g) => !g.forReciter);
        candidates = [...candidates, ...generalGroups];
        matchType += " + General";
      }
    } else {
      // Standard matching logic for other reciters
      const videoGroups = fbConfig.groups?.video || [];

      // Filter specific groups
      candidates = videoGroups.filter((g) => {
        if (!g.forReciter) return false;
        const reciters = Array.isArray(g.forReciter)
          ? g.forReciter
          : [g.forReciter];
        return reciters.some((r) =>
          normalizedReciter.includes(this.normalizeArabic(r)),
        );
      });

      matchType = "Specific";

      // Fallback to general video groups if no specific match found
      if (candidates.length === 0) {
        candidates = videoGroups.filter((g) => !g.forReciter);
        matchType = "General";
      } else if (metadata.includeGeneralGroups) {
        // If the reciter has includeGeneralGroups flag, append general groups too
        const generalGroups = videoGroups.filter((g) => !g.forReciter);
        candidates = [...candidates, ...generalGroups];
        matchType = "Specific + General";
      }
    }

    // Format groups
    const groupListText = candidates
      .map((g) => `${g.name} - ${g.url}`)
      .join("\n");

    // Generate YouTube Tags (using metadata generator)
    const youtubeTags = ytMetadata.tags || "";

    // Create suggestion file
    // Create suggestion file naming pattern: Reciter_Surah_Range_Timestamp.txt
    const timestamp = Date.now();
    const sanitize = (s) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|()[\]']/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\x00-\x7F]/g, "");

    const sReciter = sanitize(metadata.reciterName || "UnknownReciter");
    const sSurah = sanitize(metadata.surahName || "UnknownSurah");
    const sRange = sanitize(metadata.range || "0");

    const suggestionFile = path.join(
      VIDEO_OUTPUT_DIR,
      `${sReciter}_${sSurah}_${sRange}_${timestamp}.txt`,
    );

    const sep = "─".repeat(60);

    // Get the full first verse text with tashkeel for reference
    const firstVerseText = metadata.verses?.[0]?.text || "";

    const fileContent = [
      `[ KhayrShare Video Suggestion ]`,
      `Generated: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })}`,
      sep,
      ``,
      `[ VIDEO FILE ]`,
      absVideoPath,
      ``,
      `[ THUMBNAIL FILE ]`,
      thumbnailPath,
      ``,
      sep,
      `[ YOUTUBE TITLE ]`,
      ytMetadata.title || "",
      ``,
      `[ YOUTUBE DESCRIPTION / CAPTION ]`,
      caption,
      ``,
      `[ YOUTUBE TAGS ]`,
      youtubeTags,
      ``,
      sep,
      `[ FACEBOOK GROUPS TO POST IN (${matchType}) ]`,
      groupListText || "No matching groups found",
      ``,
      sep,
      `[ TARGET PLATFORMS & LINKS ]`,
      ...(() => {
        const platforms = this.config.platforms || {};
        const lines = [];
        for (const [platform, pConfig] of Object.entries(platforms)) {
          if (pConfig.enabled) {
            lines.push(
              `• ${platform.toUpperCase()}: ${pConfig.channel_link || "(No link configured)"}`,
            );
          }
        }
        if (lines.length === 0) lines.push("No additional platforms enabled.");
        return lines;
      })(),
      ...this.generateSocialMediaSections(metadata),
      ``,
      sep,
      `[ POSTING STATUS ]`,
      ...Object.entries(this.config.platforms || {})
        .filter(([, pConfig]) => pConfig.enabled)
        .map(([platform]) => `post_${platform}: false`),
      ``,
      sep,
      `[ THUMBNAIL ]`,
      `thumbnailText: ""`,
      `regenerateThumbnail: false`,
      `backgroundUsed: ${actualThumbBg || bgPath || ""}`,
      `firstVerseText: ${firstVerseText}`,
      ``,
      sep,
      `[ REGENERATE ]`,
      `regenerate: false`,
      `reciterId: ${metadata.reciterId}`,
    ].join("\n");

    fs.writeFileSync(suggestionFile, fileContent, "utf8");
    console.log(`[VideoGen] Suggestion file created: ${suggestionFile}`);

    // Open in default text editor
    let openCmd;
    if (process.platform === "win32") {
      openCmd = `explorer.exe "${suggestionFile}"`;
    } else if (process.platform === "darwin") {
      openCmd = `open "${suggestionFile}"`;
    } else {
      openCmd = `xdg-open "${suggestionFile}"`;
    }

    exec(openCmd, { windowsHide: true, shell: true });

    return suggestionFile;
  }

  /**
   * Create a combined suggestion file for multi-platform video generation.
   * Lists all generated video files with their platform labels and resolution.
   * @param {Array} videoResults - Array of video result objects with platform, videoPath, metadata, resolution
   */
  async createMultiPlatformSuggestionFile(videoResults) {
    if (!videoResults || videoResults.length === 0) return;

    const firstResult = videoResults[0];
    const metadata = firstResult.metadata;

    // Use MetadataGenerator to generate caption
    const MetadataGenerator = require(
      path.resolve(this.baseDir, "../video-publisher/metadata-generator.js"),
    );
    const metadataGen = new MetadataGenerator(this.config);
    const ytMetadata = metadataGen.generate(metadata);

    const caption = ytMetadata.description;
    const youtubeTags = ytMetadata.tags || "";

    // Generate Thumbnail (use first result's bgPath)
    let thumbnailPath = "Thumbnail generation failed";
    let actualThumbBg = ""; // Track what background was actually used for the thumbnail
    try {
      const ThumbnailGenerator = require(
        path.resolve(this.baseDir, "../video-publisher/thumbnail-generator.js"),
      );
      const thumbGen = new ThumbnailGenerator({
        ...this.config,
        OUTPUT_PATH: VIDEO_OUTPUT_DIR,
      });
      const bgPath = firstResult.bgPath;
      const bgExt = bgPath ? path.extname(bgPath).toLowerCase() : "";
      const isVideoBg = [".mp4", ".mov", ".webm", ".gif"].includes(bgExt);
      let thumbBgPath = isVideoBg ? null : bgPath;

      // Enforce horizontal background if the selected one is vertical
      if (thumbBgPath && thumbBgPath.includes("vertical")) {
        const reciterId = metadata.reciterId || "0";
        const portraitPath = path.resolve(
          this.baseDir,
          `../video-publisher/assets/portraits/${reciterId}.jpg`,
        );
        if (fs.existsSync(portraitPath)) {
          thumbBgPath = portraitPath;
        } else {
          thumbBgPath = null;
        }
      }

      const thumbResult = await thumbGen.generate(metadata, thumbBgPath);
      thumbnailPath = path.resolve(thumbResult.thumbnailPath);
      // Record the actual background used for the thumbnail (may differ from video's bgPath)
      actualThumbBg = thumbBgPath || "";
    } catch (e) {
      console.error("[VideoGen] Thumbnail generation error:", e);
    }

    // Facebook groups matching (same as createSuggestionFile)
    const fbConfig = JSON.parse(fs.readFileSync(this.fbConfigPath, "utf8"));
    const normalizedReciter = this.normalizeArabic(metadata.reciterName);

    let candidates = [];
    let matchType = "General";

    if (metadata.reciterCategory === "muallim") {
      candidates = fbConfig.groups?.muallim || [];
      matchType = "Muallim Category";
      const specificMatches = candidates.filter((g) => {
        if (!g.forReciter) return false;
        const reciters = Array.isArray(g.forReciter)
          ? g.forReciter
          : [g.forReciter];
        return reciters.some((r) =>
          normalizedReciter.includes(this.normalizeArabic(r)),
        );
      });
      if (specificMatches.length > 0) {
        candidates = specificMatches;
        matchType = "Muallim Specific";
      }
      if (metadata.includeGeneralGroups) {
        const videoGroups = fbConfig.groups?.video || [];
        const generalGroups = videoGroups.filter((g) => !g.forReciter);
        candidates = [...candidates, ...generalGroups];
        matchType += " + General";
      }
    } else {
      const videoGroups = fbConfig.groups?.video || [];
      candidates = videoGroups.filter((g) => {
        if (!g.forReciter) return false;
        const reciters = Array.isArray(g.forReciter)
          ? g.forReciter
          : [g.forReciter];
        return reciters.some((r) =>
          normalizedReciter.includes(this.normalizeArabic(r)),
        );
      });
      matchType = "Specific";
      if (candidates.length === 0) {
        candidates = videoGroups.filter((g) => !g.forReciter);
        matchType = "General";
      } else if (metadata.includeGeneralGroups) {
        const generalGroups = videoGroups.filter((g) => !g.forReciter);
        candidates = [...candidates, ...generalGroups];
        matchType = "Specific + General";
      }
    }

    const groupListText = candidates
      .map((g) => `${g.name} - ${g.url}`)
      .join("\n");

    const timestamp = Date.now();
    const sanitize = (s) =>
      (s || "")
        .toString()
        .replace(/[\\/:*?"<>|()[\]']/g, "")
        .replace(/\s+/g, "_")
        .replace(/[^\x00-\x7F]/g, "");

    const sReciter = sanitize(metadata.reciterName || "UnknownReciter");
    const sSurah = sanitize(metadata.surahName || "UnknownSurah");
    const sRange = sanitize(metadata.range || "0");

    const suggestionFile = path.join(
      VIDEO_OUTPUT_DIR,
      `${sReciter}_${sSurah}_${sRange}_${timestamp}_MULTI.txt`,
    );

    const sep = "─".repeat(60);
    const firstVerseText = metadata.verses?.[0]?.text || "";

    // Build the video files section: one entry per resolution group
    // Path is on its own line for easy copy-pasting, no resolution suffix
    const videoFilesSection = videoResults
      .map((r) => {
        const absPath = path.resolve(r.videoPath);
        const platformsLabel = (r.platforms || []).join(", ");
        return `  [GROUP: ${r.platformGroup || "?"}] → Platforms: ${platformsLabel}\n  ${absPath}`;
      })
      .join("\n\n");

    const fileContent = [
      `[ KhayrShare Video Suggestion - Multi-Platform ]`,
      `Generated: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })}`,
      sep,
      ``,
      `[ VIDEO FILES (${videoResults.length} platforms) ]`,
      videoFilesSection,
      ``,
      `[ THUMBNAIL FILE ]`,
      thumbnailPath,
      ``,
      sep,
      `[ YOUTUBE TITLE ]`,
      ytMetadata.title || "",
      ``,
      `[ YOUTUBE DESCRIPTION / CAPTION ]`,
      caption,
      ``,
      `[ YOUTUBE TAGS ]`,
      youtubeTags,
      ``,
      sep,
      `[ FACEBOOK GROUPS TO POST IN (${matchType}) ]`,
      groupListText || "No matching groups found",
      ``,
      sep,
      `[ TARGET PLATFORMS & LINKS ]`,
      ...(() => {
        const platforms = this.config.platforms || {};
        const lines = [];
        for (const [platform, pConfig] of Object.entries(platforms)) {
          if (pConfig.enabled) {
            lines.push(
              `• ${platform.toUpperCase()}: ${pConfig.channel_link || "(No link configured)"}`,
            );
          }
        }
        if (lines.length === 0) lines.push("No additional platforms enabled.");
        return lines;
      })(),
      ...this.generateSocialMediaSections(metadata),
      ``,
      sep,
      `[ POSTING STATUS ]`,
      ...Object.entries(this.config.platforms || {})
        .filter(([, pConfig]) => pConfig.enabled)
        .map(([platform]) => `post_${platform}: false`),
      ``,
      sep,
      `[ THUMBNAIL ]`,
      `thumbnailText: ""`,
      `regenerateThumbnail: false`,
      `backgroundUsed: ${actualThumbBg || firstResult.bgPath || ""}`,
      `firstVerseText: ${firstVerseText}`,
      ``,
      sep,
      `[ REGENERATE ]`,
      `regenerate: false`,
      `reciterId: ${metadata.reciterId}`,
    ].join("\n");

    fs.writeFileSync(suggestionFile, fileContent, "utf8");
    console.log(
      `[VideoGen] Multi-platform suggestion file created: ${suggestionFile}`,
    );

    // Open in default text editor
    let openCmd;
    if (process.platform === "win32") {
      openCmd = `explorer.exe "${suggestionFile}"`;
    } else if (process.platform === "darwin") {
      openCmd = `open "${suggestionFile}"`;
    } else {
      openCmd = `xdg-open "${suggestionFile}"`;
    }

    exec(openCmd, { windowsHide: true, shell: true });

    return suggestionFile;
  }

  /**
   * Select verses that fit within a target duration, respecting verse boundaries.
   * This ensures Quranic verses are NEVER truncated mid-verse.
   *
   * From the full verse list, picks the longest prefix of complete verses whose
   * total audio duration fits within `maxDurationSec`. If even the first verse
   * exceeds the limit, it still includes that one verse (the complete verse).
   *
   * @param {Array} verses - Array of verse objects (from rukuData)
   * @param {number|null} maxDurationSec - Target video duration in seconds, or null for no limit
   * @returns {Array} Filtered verses (complete, never truncated)
   */
  selectVersesForDuration(verses, maxDurationSec) {
    if (maxDurationSec == null || maxDurationSec <= 0) return verses;

    // Get verse timings if available (from processAudio)
    // verseTimings has: { numberInSurah, durationMs, startTimeMs }
    // If no timings yet, we estimate from verse length
    const maxDurationMs = maxDurationSec * 1000;

    // Try to find the longest prefix of complete verses fitting within limit
    let cumulativeMs = 0;
    let cutoffIndex = verses.length;

    for (let i = 0; i < verses.length; i++) {
      const v = verses[i];
      // Estimate verse duration: if we have timing info, use it; otherwise estimate
      const estMs =
        v._durationMs ||
        v.durationMs ||
        (v.text ? Math.max(3000, v.text.length * 80) : 5000);

      if (cumulativeMs + estMs > maxDurationMs) {
        // This verse would exceed the limit
        if (i === 0) {
          // Even the first verse exceeds limit — still include it (complete verse)
          // This is the minimum acceptable unit for Quran
          cutoffIndex = 1;
          console.log(
            `[VideoGen] ⚠ First verse (${estMs}ms) exceeds ${maxDurationSec}s limit. Including it as a complete verse.`,
          );
        } else {
          // Stop before this verse
          cutoffIndex = i;
          console.log(
            `[VideoGen] Duration limit: selected ${i} complete verses (${cumulativeMs}ms / ${maxDurationSec}s max)`,
          );
        }
        break;
      }
      cumulativeMs += estMs;
    }

    if (cutoffIndex >= verses.length) {
      console.log(
        `[VideoGen] All ${verses.length} verses fit within ${maxDurationSec}s limit (${cumulativeMs}ms total)`,
      );
    }

    return verses.slice(0, cutoffIndex);
  }

  /**
   * Group enabled platforms by their resolution group.
   * Platforms sharing the same `resolutionGroup` will share one generated video file.
   * @returns {Array} Array of { groupKey, resolution, platforms, style, maxDurationSec, verses }
   */
  groupPlatformsByResolution(enabledPlatforms) {
    const groups = new Map();
    for (const platform of enabledPlatforms) {
      const groupKey =
        platform.resolutionGroup || `${platform.width}x${platform.height}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          groupKey,
          resolution: { width: platform.width, height: platform.height },
          style: platform.style || "youtube",
          maxDurationSec: null,
          platforms: [],
          verses: null,
        });
      }
      const group = groups.get(groupKey);
      group.platforms.push(platform);
      // Track the strictest (lowest) maxDurationSec for the group
      // but keep each platform's individual maxDuration for smart dedup
      if (platform.maxDurationSec != null) {
        if (
          group.maxDurationSec == null ||
          platform.maxDurationSec < group.maxDurationSec
        ) {
          group.maxDurationSec = platform.maxDurationSec;
        }
      }
    }
    return Array.from(groups.values());
  }

  /**
   * Calculate actual total duration of verses in milliseconds.
   * Uses _durationMs if available, otherwise estimates from text length.
   * @param {Array} verses
   * @returns {number} Total duration in milliseconds
   */
  _calculateTotalDurationMs(verses) {
    if (!verses || verses.length === 0) return 0;
    return verses.reduce((sum, v) => {
      return (
        sum +
        (v._durationMs ||
          v.durationMs ||
          (v.text ? Math.max(3000, v.text.length * 80) : 5000))
      );
    }, 0);
  }

  /**
   * Main generation method
   */
  async generate() {
    try {
      console.log("\n========================================");
      console.log("Background Video Generator - Starting");
      console.log("========================================\n");

      // Determine which style to use
      let style;
      if (this.cliConfig?.platform) {
        const presetsPath = path.resolve(
          this.baseDir,
          "../../../global_assets/video_style_presets.json",
        );
        const presetsData = JSON.parse(fs.readFileSync(presetsPath, "utf8"));
        const pConf = presetsData.platforms?.[this.cliConfig.platform];
        if (!pConf) {
          throw new Error(
            `Unknown platform: ${this.cliConfig.platform}. Available platforms: ${Object.keys(presetsData.platforms || {}).join(", ")}`,
          );
        }
        style = pConf.defaultStyle === "x" ? "x_poster" : pConf.defaultStyle;
        this.cliConfig.platformWidth =
          this.cliConfig.platformWidth || pConf.width;
        this.cliConfig.platformHeight =
          this.cliConfig.platformHeight || pConf.height;
        console.log(
          `[VideoGen] Applying platform preset: ${this.cliConfig.platform} (${this.cliConfig.platformWidth}x${this.cliConfig.platformHeight}, style: ${style})`,
        );
      } else if (
        this.config.manualGeneration &&
        !this.config.manualGeneration.isRandom
      ) {
        style =
          this.config.manualGeneration.style === "youtube"
            ? "youtube"
            : "x_poster";
      } else if (
        this.config.videoMode.randomSelection &&
        this.config.videoMode.useXPosterStyle &&
        this.config.videoMode.useYouTubeStyle
      ) {
        style = Math.random() < 0.5 ? "x_poster" : "youtube";
      } else if (this.config.videoMode.useXPosterStyle) {
        style = "x_poster";
      } else if (this.config.videoMode.useYouTubeStyle) {
        style = "youtube";
      } else {
        throw new Error("No video style enabled in config");
      }

      // Override style if explicitly provided via --style
      if (this.cliConfig?.style) {
        style = this.cliConfig.style;
        console.log(`[VideoGen] Style explicitly overridden to: ${style}`);
      }

      console.log(`Selected style: ${style}\n`);

      if (this.cliConfig?.dryRun) {
        console.log("========================================");
        console.log("[DRY-RUN] Execution stopped before generation.");
        console.log("Resolved Configuration:");
        const fetchOpts = this.getFetchOptions();
        console.log(
          JSON.stringify({ style, fetchOpts, ...this.cliConfig }, null, 2),
        );
        console.log("========================================\n");
        return { dryRun: true };
      }

      // --- Multi-Platform Generation ---
      // Check if multiple platforms are enabled in config
      const tracking = require("./tracking.js");
      const enabledPlatforms = Object.entries(this.config.platforms || {})
        .filter(([, pConfig]) => pConfig.enabled)
        .map(([name, pConfig]) => ({ name, ...pConfig }))
        // Exclude platforms that have met their daily target
        .filter((pConfig) => {
          const target = pConfig.dailyTargetPosts;
          if (!target || target <= 0) return true; // unlimited
          if (tracking.isPlatformSaturated(pConfig.name, target)) {
            console.log(
              `[VideoGen] 🛑 ${pConfig.name.toUpperCase()} daily target (${target}) already met — excluding from generation.`,
            );
            return false;
          }
          return true;
        });

      let videoResults = [];

      if (enabledPlatforms.length > 1 && !this.cliConfig?.platform) {
        // Multi-platform mode: group platforms by resolution group,
        // then generate one video per unique resolution group
        const resolutionGroups =
          this.groupPlatformsByResolution(enabledPlatforms);

        console.log(
          `[VideoGen] Multi-platform mode: ${enabledPlatforms.length} platforms → ${resolutionGroups.length} unique resolution groups`,
        );
        console.log("Resolution groups:");
        for (const group of resolutionGroups) {
          const platformNames = group.platforms.map((p) => p.name).join(", ");
          console.log(
            `  [${group.groupKey}] ${group.resolution.width}x${group.resolution.height} — platforms: ${platformNames}` +
              (group.maxDurationSec
                ? ` (max ${group.maxDurationSec}s)`
                : " (no duration limit)"),
          );
        }

        // Fetch content ONCE
        const fetchOpts = this.getFetchOptions();
        const rukuData = await this.contentFetcher.fetchContent(fetchOpts);

        // Set up format/bgType/thumbText once
        const liveConfig = JSON.parse(
          fs.readFileSync(
            this.configPath
              ? path.join(this.configPath)
              : this.baseDir + "/config.json",
            "utf8",
          ),
        );
        let rawFormat =
          this.cliConfig?.format ||
          liveConfig.settings?.defaultFormat ||
          this.config.settings?.defaultFormat ||
          "classic";
        const availableFormats = [
          "classic",
          "reciter-portrait",
          "stock-video",
          "verse-display",
          "reciter-portrait-verse",
        ];
        if (rawFormat === "random") {
          rawFormat =
            availableFormats[
              Math.floor(Math.random() * availableFormats.length)
            ];
        }
        rukuData.format = rawFormat;
        rukuData.bgType = this.cliConfig?.bgType || "classic";

        if (
          rukuData.format === "reciter-portrait" ||
          rukuData.format === "reciter-portrait-verse"
        ) {
          if (!this.cliConfig?.bgType) rukuData.bgType = "portrait";
        } else if (rukuData.format === "stock-video") {
          if (!this.cliConfig?.bgType) rukuData.bgType = "stock";
        }

        // Auto-generate thumbnail snippet
        const firstVerseText = rukuData.verses?.[0]?.text || "";
        const words = firstVerseText.trim().split(/\s+/);
        rukuData.thumbSnippet = words.slice(0, 3).join(" ");

        console.log(
          `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
        );
        console.log(
          `Format: ${rukuData.format}, Background Type: ${rukuData.bgType}`,
        );

        await this.checkTrackingAndWarn(rukuData.reciterName);

        // Process audio once (full content)
        const audioResult = await this.contentFetcher.processAudio(
          rukuData.verses,
        );
        rukuData.verseTimings = audioResult.verseTimings || [];

        // Attach duration info to each verse for the duration-selection logic
        for (const vt of rukuData.verseTimings || []) {
          const verse = rukuData.verses.find(
            (v) => v.numberInSurah === vt.numberInSurah,
          );
          if (verse) verse._durationMs = vt.durationMs;
        }

        // Generate videos PER RESOLUTION GROUP with smart deduplication.
        // For each resolution group, we:
        //   1. Generate a "master" video with the full verse content
        //   2. Calculate actual total duration
        //   3. Only generate trimmed copies for platforms whose maxDuration is shorter.
        //   4. For platforms where master already fits (or has no limit), reuse the master.
        for (const group of resolutionGroups) {
          const platformStyle = group.style || style;
          const resolution = group.resolution;

          // Calculate actual total duration of all fetched verses
          const actualTotalMs = this._calculateTotalDurationMs(rukuData.verses);
          const actualTotalSec = actualTotalMs / 1000;
          console.log(
            `\n[VideoGen] Group "${group.groupKey}": actual total duration = ${actualTotalSec}s (${actualTotalMs}ms)`,
          );

          // Build a map of which platforms need a trimmed video vs can use the master
          const needsTrim = {}; // platformName -> { maxDurationSec, needsOwnVideo }
          let anyNeedsTrim = false;
          let masterAssignedPlatforms = [];

          for (const p of group.platforms) {
            const pMax = p.maxDurationSec;
            if (pMax == null) {
              // No limit → always reuse master
              needsTrim[p.name] = false;
              masterAssignedPlatforms.push(p.name);
            } else if (actualTotalSec <= pMax) {
              // Master already fits within this platform's limit → reuse
              needsTrim[p.name] = false;
              masterAssignedPlatforms.push(p.name);
              console.log(
                `  → ${p.name}: master fits (${actualTotalSec}s ≤ ${pMax}s). Reusing master video.`,
              );
            } else {
              // Master exceeds this platform's limit → needs own trimmed video
              needsTrim[p.name] = { maxDurationSec: pMax };
              anyNeedsTrim = true;
              console.log(
                `  → ${p.name}: master too long (${actualTotalSec}s > ${pMax}s). Will generate trimmed version.`,
              );
            }
          }

          // For the text file / suggestion, we still need to list all platforms.
          // Group platforms by which video they'll use for the suggestion file output.
          const masterPlatformNames = masterAssignedPlatforms;

          // --- Generate the MASTER video (full content, no trimming) ---
          console.log(
            `\n[VideoGen] --- Generating MASTER video for group: ${group.groupKey} (${resolution.width}x${resolution.height}, style: ${platformStyle}) ---`,
          );

          const masterRukuData = {
            ...rukuData,
            verses: [...rukuData.verses],
            verseTimings: [...(rukuData.verseTimings || [])],
          };

          let masterResult;
          if (platformStyle === "x_poster") {
            masterResult = await this.generateXPosterVideo(resolution);
          } else {
            masterResult = await this.generateYouTubeVideo(resolution, {
              rukuData: masterRukuData,
              audioResult: { ...audioResult },
            });
          }

          // Tag master result with platforms that reuse it
          masterResult.platforms = masterPlatformNames;
          masterResult.platformGroup = `${group.groupKey}-master`;
          videoResults.push(masterResult);

          // --- Generate trimmed videos for platforms that need them ---
          if (anyNeedsTrim) {
            // Group platforms by their maxDurationSec value to avoid re-encoding
            // when multiple platforms have the same limit
            const trimGroupMap = new Map();
            for (const [pName, pConfig] of Object.entries(needsTrim)) {
              if (pConfig === false) continue;
              const limitKey = String(pConfig.maxDurationSec);
              if (!trimGroupMap.has(limitKey)) {
                trimGroupMap.set(limitKey, {
                  maxDurationSec: pConfig.maxDurationSec,
                  platformNames: [],
                });
              }
              trimGroupMap.get(limitKey).platformNames.push(pName);
            }

            for (const [, tg] of trimGroupMap) {
              console.log(
                `\n[VideoGen] --- Generating TRIMMED video for ${tg.platformNames.join(", ")} (max ${tg.maxDurationSec}s) ---`,
              );

              // Select verses that fit within the stricter limit
              const trimmedVerses = this.selectVersesForDuration(
                [...rukuData.verses],
                tg.maxDurationSec,
              );

              // Re-process audio for the verse subset
              console.log(
                `[VideoGen] Re-processing audio for ${trimmedVerses.length} verses (was ${rukuData.verses.length})`,
              );
              const trimmedAudioResult =
                await this.contentFetcher.processAudio(trimmedVerses);
              const trimmedVerseTimings = trimmedAudioResult.verseTimings || [];

              // Build a clean rukuData copy for this trimmed version
              // WITHOUT mutating the shared master rukuData
              const trimmedRukuData = {
                ...rukuData,
                verses: trimmedVerses,
                verseTimings: trimmedVerseTimings,
                range: `${trimmedVerses[0].numberInSurah}-${trimmedVerses[trimmedVerses.length - 1].numberInSurah}`,
              };

              let trimmedResult;
              if (platformStyle === "x_poster") {
                trimmedResult = await this.generateXPosterVideo(resolution);
              } else {
                trimmedResult = await this.generateYouTubeVideo(resolution, {
                  rukuData: trimmedRukuData,
                  audioResult: { ...trimmedAudioResult },
                });
              }

              trimmedResult.platforms = tg.platformNames;
              trimmedResult.platformGroup = `${group.groupKey}-${tg.maxDurationSec}s`;
              videoResults.push(trimmedResult);
            }
          }

          // Log final assignment for this group
          console.log(
            `\n[VideoGen] Video assignment for group "${group.groupKey}":`,
          );
          for (const result of videoResults) {
            if (
              result.platformGroup &&
              result.platformGroup.startsWith(group.groupKey)
            ) {
              console.log(
                `  ${result.platformGroup}: ${result.platforms.join(", ")} → ${result.videoPath || "N/A"}`,
              );
            }
          }
        }

        // Create a combined suggestion file with all video paths
        await this.createMultiPlatformSuggestionFile(videoResults);

        // Record tracking for all enabled platforms
        this.recordTracking(rukuData.reciterName);
      } else {
        // Legacy single-platform mode (backward compatible)
        const videoResult =
          style === "x_poster"
            ? await this.generateXPosterVideo()
            : await this.generateYouTubeVideo();

        // Create suggestion file
        await this.createSuggestionFile(videoResult);

        // Record tracking
        this.recordTracking(videoResult.metadata?.reciterName);
      }

      // Cleanup temp files
      this.contentFetcher.cleanup();

      console.log("\n========================================");
      console.log("Video Generation Complete!");
      console.log("========================================\n");

      return videoResults.length > 0 ? videoResults : videoResult;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Check if reciter was already uploaded to target platforms this week and warn
   */
  async checkTrackingAndWarn(reciterName) {
    let tracking;
    try {
      tracking = require("./tracking.js");
    } catch (e) {
      console.warn("[Tracking] tracking.js not found, skipping check.");
      return;
    }
    const platforms = this.config.platforms || {};

    let duplicates = [];
    for (const [platform, pConfig] of Object.entries(platforms)) {
      if (pConfig.enabled) {
        if (tracking.isUploadedThisWeek(reciterName, platform)) {
          duplicates.push(platform);
        }
      }
    }

    if (duplicates.length > 0) {
      console.log(
        `\n\x1b[1m\x1b[31m[WARNING]\x1b[0m Reciter \x1b[1m${reciterName}\x1b[0m has already been generated for platforms: \x1b[1m${duplicates.join(", ")}\x1b[0m this week.`,
      );

      const isSchedulerMode =
        !this.cliConfig || this.cliConfig._isRegeneration === true;
      if (!isSchedulerMode && !this.cliConfig.force) {
        const readline = require("readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        return new Promise((resolve, reject) => {
          rl.question(`Do you want to proceed anyway? (y/N): `, (answer) => {
            rl.close();
            if (
              answer.toLowerCase() === "y" ||
              answer.toLowerCase() === "yes"
            ) {
              console.log("[VideoGen] Proceeding despite duplicate warning.");
              resolve();
            } else {
              reject(
                new Error(
                  "Generation aborted by user due to duplicate upload warning.",
                ),
              );
            }
          });
        });
      } else {
        console.log(
          `[VideoGen] Non-interactive mode (or --force). Proceeding despite duplicate warning.`,
        );
      }
    }
  }

  /**
   * Record that the reciter was generated/uploaded to target platforms
   */
  recordTracking(reciterName) {
    let tracking;
    try {
      tracking = require("./tracking.js");
    } catch (e) {
      return;
    }
    const platforms = this.config.platforms || {};
    for (const [platform, pConfig] of Object.entries(platforms)) {
      if (pConfig.enabled) {
        tracking.recordUpload(reciterName, platform);
      }
    }
  }
}

// Check execution
if (require.main === module) {
  (async () => {
    try {
      const configPath = path.join(__dirname, "config.json");
      const { reciters } = loadRecitersMapFromConfig(configPath);

      const cliConfig = resolveCliConfig(process.argv.slice(2), reciters);

      if (cliConfig == null) {
        // Fallback for null returned when no manual flags exist (full random mode)
      } else if (cliConfig.help) {
        printHelp(
          reciters,
          path.resolve(
            __dirname,
            "../../../global_assets/video_style_presets.json",
          ),
        );
        return;
      } else if (cliConfig.listReciters) {
        const rows = Object.keys(reciters)
          .map((id) => ({ id, name: reciters[id]?.name }))
          .sort((a, b) => Number(a.id) - Number(b.id));

        for (const r of rows) {
          if (!r.name) continue;
          console.log(`${r.id}: ${r.name}`);
        }
        return;
      }

      if (cliConfig?.listBackgrounds) {
        const bgDir = path.resolve(__dirname, "../video-publisher/backgrounds");
        if (fs.existsSync(bgDir)) {
          const bgs = fs
            .readdirSync(bgDir)
            .filter((f) => f.match(/\.(jpg|jpeg|png|gif)$/i));
          console.log(`Available backgrounds in video-publisher/backgrounds:`);
          bgs.forEach((b) => console.log(` - ${b}`));
        } else {
          console.log("Backgrounds directory not found.");
        }
        return;
      }

      if (cliConfig?.listPortraits) {
        const portraitDir = path.resolve(
          __dirname,
          "../video-publisher/assets/portraits",
        );
        if (fs.existsSync(portraitDir)) {
          const portraits = fs
            .readdirSync(portraitDir)
            .filter((f) => f.match(/\.(jpg|jpeg|png)$/i));
          console.log(`Available portraits in assets/portraits:`);
          portraits.forEach((p) => console.log(` - ${p}`));
        } else {
          console.log("Portraits directory not found.");
        }
        return;
      }

      if (cliConfig?.listStockVideos) {
        const stockDir = path.resolve(
          __dirname,
          "../video-publisher/assets/stock-videos",
        );
        if (fs.existsSync(stockDir)) {
          const stocks = fs
            .readdirSync(stockDir)
            .filter((f) => f.match(/\.(mp4|mov|webm|gif)$/i));
          console.log(`Available stock videos in assets/stock-videos:`);
          stocks.forEach((s) => console.log(` - ${s}`));
        } else {
          console.log("Stock videos directory not found.");
        }
        return;
      }

      const generator = new VideoGenerator(configPath, cliConfig);
      await generator.generate();
    } catch (err) {
      console.error("Fatal Error:", err.message);
      process.exit(1);
    }
  })();
}

module.exports = VideoGenerator;

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === "--help" || a === "-h") {
      args.help = true;
      continue;
    }
    if (a === "--listReciters") {
      args.listReciters = true;
      continue;
    }
    if (a.startsWith("--reciterId=") || a.startsWith("--id=")) {
      args.reciterId = a.split("=")[1];
      continue;
    }
    if (a === "--reciterId" || a === "--id") {
      args.reciterId = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--reciter=") || a.startsWith("-r=")) {
      args.reciter = a.split("=")[1];
      continue;
    }
    if (a === "--reciter" || a === "-r") {
      args.reciter = argv[i + 1];
      i++;
      continue;
    }

    if (a.startsWith("--surah=")) {
      args.surah = a.slice("--surah=".length);
      continue;
    }
    if (a === "--surah") {
      args.surah = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--platform=")) {
      args.platform = a.slice("--platform=".length);
      continue;
    }
    if (a === "--platform") {
      args.platform = argv[i + 1];
      i++;
      continue;
    }
    if (a === "--listBackgrounds") {
      args.listBackgrounds = true;
      continue;
    }
    if (a === "--listPortraits") {
      args.listPortraits = true;
      continue;
    }
    if (a === "--listStockVideos") {
      args.listStockVideos = true;
      continue;
    }
    if (a.startsWith("--format=")) {
      args.format = a.slice("--format=".length);
      continue;
    }
    if (a === "--format") {
      args.format = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--bg-type=")) {
      args.bgType = a.slice("--bg-type=".length);
      continue;
    }
    if (a === "--bg-type" || a === "--bg") {
      args.bgType = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--thumb-text=")) {
      args.thumbText = a.slice("--thumb-text=".length);
      continue;
    }
    if (a === "--thumb-text") {
      args.thumbText = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--background=")) {
      args.background = a.slice("--background=".length);
      continue;
    }
    if (a === "--background" || a === "-b") {
      args.background = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--style=")) {
      args.style = a.slice("--style=".length);
      continue;
    }
    if (a === "--style") {
      args.style = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--width=")) {
      args.width = a.slice("--width=".length);
      continue;
    }
    if (a === "--width") {
      args.width = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--height=")) {
      args.height = a.slice("--height=".length);
      continue;
    }
    if (a === "--height") {
      args.height = argv[i + 1];
      i++;
      continue;
    }
    if (a === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (a.startsWith("--page=")) {
      args.page = a.slice("--page=".length);
      continue;
    }
    if (a === "--page") {
      args.page = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--range=")) {
      args.range = a.slice("--range=".length);
      continue;
    }
    if (a === "--range") {
      args.range = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--startVerse=")) {
      args.startVerse = a.slice("--startVerse=".length);
      continue;
    }
    if (a === "--startVerse") {
      args.startVerse = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--endVerse=")) {
      args.endVerse = a.slice("--endVerse=".length);
      continue;
    }
    if (a === "--endVerse") {
      args.endVerse = argv[i + 1];
      i++;
      continue;
    }
  }
  return args;
}

function resolveCliConfig(argv, reciters) {
  const cli = parseCliArgs(argv);

  if (cli.help) {
    return { help: true };
  }

  if (cli.listReciters) {
    return { listReciters: true };
  }

  if (cli.page != null) {
    const pageNum = Number(cli.page);
    if (!Number.isFinite(pageNum) || pageNum < 1 || pageNum > 604) {
      throw new Error(
        `Invalid --page value: ${cli.page}. Expected a number 1-604.`,
      );
    }

    const mappingPath = path.resolve(
      __dirname,
      "../../../global_assets/quran_page_mapping.json",
    );
    const pageMap = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
    const pageData = pageMap[String(pageNum)];
    if (!pageData) {
      throw new Error(`Mapping not found for page: ${pageNum}`);
    }

    // Transparently convert page into surah and verses
    cli.surah = String(pageData.surahId);
    cli.startVerse = String(pageData.startVerse);
    cli.endVerse = String(pageData.endVerse);
    cli.range = null; // unset range to prioritize start/end
  }

  const wantsManualVerses =
    cli.surah != null ||
    cli.range != null ||
    cli.startVerse != null ||
    cli.endVerse != null;
  const wantsReciter = cli.reciterId || cli.reciter;
  const wantsPlatform = cli.platform != null;
  const wantsBackground = cli.background != null;
  const wantsStyle = cli.style != null;
  const wantsResolution = cli.width != null || cli.height != null;
  const wantsDryRun = cli.dryRun === true;
  const wantsFormat = cli.format != null;
  const wantsBgType = cli.bgType != null;
  const wantsThumbText = cli.thumbText != null;
  const wantsListPortraits = cli.listPortraits === true;
  const wantsListStockVideos = cli.listStockVideos === true;

  if (cli.listBackgrounds) {
    return { listBackgrounds: true };
  }

  if (wantsListPortraits) {
    return { listPortraits: true };
  }

  if (wantsListStockVideos) {
    return { listStockVideos: true };
  }

  // If no arguments passed, we return an empty config (defaults to full random)
  if (
    !wantsManualVerses &&
    !wantsReciter &&
    !wantsPlatform &&
    !wantsBackground &&
    !wantsStyle &&
    !wantsResolution &&
    !wantsDryRun &&
    !wantsFormat &&
    !wantsBgType &&
    !wantsThumbText &&
    !wantsListPortraits &&
    !wantsListStockVideos
  ) {
    return null;
  }

  const manual = {};

  if (wantsDryRun) {
    manual.dryRun = true;
  }

  if (wantsPlatform) {
    manual.platform = cli.platform;
  }

  if (wantsBackground) {
    manual.background = cli.background;
  }

  if (wantsStyle) {
    const validStyles = ["x_poster", "youtube", "x"];
    if (!validStyles.includes(cli.style.toLowerCase())) {
      throw new Error(
        `Invalid style: ${cli.style}. Valid styles: youtube, x_poster`,
      );
    }
    manual.style =
      cli.style.toLowerCase() === "x" ? "x_poster" : cli.style.toLowerCase();
  }

  if (wantsFormat) {
    const validFormats = [
      "classic",
      "reciter-portrait",
      "stock-video",
      "verse-display",
      "reciter-portrait-verse",
      "random",
    ];
    if (!validFormats.includes(cli.format)) {
      throw new Error(
        `Invalid format: ${cli.format}. Valid formats: ${validFormats.join(", ")}`,
      );
    }
    manual.format = cli.format;
  }

  if (wantsBgType) {
    const validBgTypes = ["classic", "portrait", "stock"];
    if (!validBgTypes.includes(cli.bgType)) {
      throw new Error(
        `Invalid bg-type: ${cli.bgType}. Valid types: ${validBgTypes.join(", ")}`,
      );
    }
    manual.bgType = cli.bgType;
  }

  if (wantsThumbText) {
    manual.thumbText = cli.thumbText;
  }

  if (wantsResolution) {
    if (cli.width == null || cli.height == null) {
      throw new Error(`Both --width and --height must be provided together.`);
    }
    const w = Number(cli.width);
    const h = Number(cli.height);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      throw new Error(
        `Invalid resolution: ${cli.width}x${cli.height}. Width and height must be positive numbers.`,
      );
    }
    manual.platformWidth = w;
    manual.platformHeight = h;
  }

  // Optional reciter selection
  if (wantsReciter) {
    let reciterId = cli.reciterId;

    if (!reciterId && cli.reciter) {
      const wanted = cli.reciter.toString().trim();
      const lowered = wanted.toLowerCase();

      // Check if it's already an ID
      if (reciters[wanted]) {
        reciterId = wanted;
      } else {
        const matchId = Object.keys(reciters).find((id) => {
          const nm = reciters[id]?.name;
          if (!nm) return false;
          return nm === wanted || nm.toLowerCase() === lowered;
        });

        if (!matchId) {
          throw new Error(
            `Unknown reciter: ${wanted}. Use --listReciters to see available reciters.`,
          );
        }
        reciterId = matchId;
      }
    }

    if (!reciterId) {
      throw new Error("Missing reciter identifier (name or ID).");
    }
    if (!reciters[reciterId]) {
      throw new Error(
        `Unknown reciter ID: ${reciterId}. Use --listReciters to see available reciters.`,
      );
    }

    manual.reciterId = Number(reciterId);
  }

  // Manual verse range selection
  if (wantsManualVerses) {
    const surahNum = Number(cli.surah);
    if (!Number.isFinite(surahNum) || surahNum < 1 || surahNum > 114) {
      throw new Error(
        `Invalid --surah value: ${cli.surah}. Expected a number 1-114.`,
      );
    }

    let startVerse = null;
    let endVerse = null;

    if (cli.range != null) {
      const raw = cli.range.toString().trim();
      if (raw.includes("-")) {
        const parts = raw.split("-").map((x) => Number(x.trim()));
        startVerse = parts[0];
        endVerse = parts[1];
      } else {
        startVerse = Number(raw);
        endVerse = Number(raw);
      }
    } else {
      if (cli.startVerse != null) startVerse = Number(cli.startVerse);
      if (cli.endVerse != null) endVerse = Number(cli.endVerse);
    }

    if (!Number.isFinite(startVerse) || startVerse < 1) {
      throw new Error(
        `Invalid verse start. Provide --range like 1-5 or --startVerse N.`,
      );
    }
    if (!Number.isFinite(endVerse) || endVerse < 1) {
      endVerse = startVerse;
    }
    if (endVerse < startVerse) {
      throw new Error(
        `Invalid range: endVerse < startVerse (${startVerse}-${endVerse})`,
      );
    }

    manual.isRandom = false;
    manual.surahId = surahNum;
    manual.startVerse = startVerse;
    manual.endVerse = endVerse;
  } else {
    // Keep random content (default behavior) if only reciter is provided
    manual.isRandom = true;
  }

  return manual;
}

function loadRecitersMapFromConfig(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const baseDir = path.dirname(configPath);
  const recitersJsonPath = path.resolve(baseDir, cfg.paths.recitersJson);
  return {
    recitersJsonPath,
    reciters: JSON.parse(fs.readFileSync(recitersJsonPath, "utf8")),
  };
}

function printHelp(reciters, presetsPath) {
  let platformList = "tiktok, instagram, shorts, youtube, x";
  try {
    const presetsData = JSON.parse(fs.readFileSync(presetsPath, "utf8"));
    if (presetsData.platforms) {
      platformList = Object.keys(presetsData.platforms).join(", ");
    }
  } catch (e) {}

  console.log(`
KhayrShare Video Generator CLI
==============================
Usage: node src/services/media-generator/generator.js [options]

Content Selection:
  --surah <1-114>           Specific Surah number
  --range <start-end>       Specific verse range (e.g., 1-5 or just 255)
  --page <1-604>            Specific Quran page (automatically resolves surah & range)
  --reciter, -r <name|id>   Specific reciter name or ID
  --listReciters            List all available reciters and their IDs

Visual Customization:
  --format <name>           Video format: classic, reciter-portrait, stock-video, verse-display, reciter-portrait-verse, random (default: classic)
  --bg-type <type>          Background type: classic, portrait, stock (default: classic)
  --background, -b <file>   Use a specific background file
  --listBackgrounds         List all available background files
  --listPortraits           List all available reciter portraits
  --listStockVideos         List all available stock video files
  --platform <name>         Apply resolution & style preset
  --style <name>            Override style (youtube or x_poster)
  --width <px>              Custom video width (must be paired with --height)
  --height <px>             Custom video height (must be paired with --width)

Thumbnail:
  --thumb-text <text>       Custom thumbnail text snippet (if omitted, interactive prompt will ask)

Miscellaneous:
  --help, -h                Show this help message

Behavior:
  If no content flags are provided, a random Ruku will be selected.
  If no visual flags are provided, style and resolution will be randomized or use config defaults.

Available Platforms:
  ${platformList}
`);
}
