const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { OUTPUT_PATH } = require("../../config");
const VIDEO_OUTPUT_DIR = path.join(OUTPUT_PATH, "video-service-outputs");

// Ensure output directory exists
if (!fs.existsSync(VIDEO_OUTPUT_DIR)) {
  fs.mkdirSync(VIDEO_OUTPUT_DIR, { recursive: true });
}

/**
 * Background Video Generator
 * Generates Quran videos periodically using x_poster and video-publisher styles
 * without interfering with their normal operation.
 */
class VideoGenerator {
  constructor(configPath, cliConfig = null) {
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
   * Options builder for fetching content
   */
  getFetchOptions() {
    let options = {
      mode: ["FULL_RUKU", "SHORT_RUKU"][Math.floor(Math.random() * 2)],
      excludedRukus: [],
    };

    // 1. Check for manual params passed via environment variable (legacy ephemeral run)
    let manualParams = null;
    const envSource = process.env.MANUAL_PARAMS || process.env._ || process.env.PARAMS;

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
    const manualConfig = this.cliConfig || manualParams || this.config.manualGeneration;

    if (manualConfig) {
      const rId = manualConfig.reciterId || manualConfig.reciterid || manualConfig.reciter_id;
      if (rId) {
        options.reciterId = rId;
        console.log(`[VideoGen] Manual Reciter ID detected: ${rId}`);
      }

      const isRnd = manualConfig.isRandom !== undefined ? manualConfig.isRandom : manualConfig.isandom;
      if (isRnd === false && manualConfig.surahId) {
        options.mode = "MANUAL";
        options.surah = manualConfig.surahId;
        const start = manualConfig.startVerse || 1;
        const end = manualConfig.endVerse || 10;
        options.verseRange = `${start}-${end}`;
        console.log(`[VideoGen] Manual Content Mode: Surah ${options.surah}, Range ${options.verseRange}`);
      }
    }

    return options;
  }

  /**
   * Generate video using X-Poster style
   */
  async generateXPosterVideo() {
    console.log("[VideoGen] Generating square-format video...");

    const TextRenderer = require("./text-renderer");
    const VideoGenerator = require(
      path.resolve(this.baseDir, this.config.paths.xPosterVideoGenerator),
    );

    const textRenderer = new TextRenderer();
    const xPosterConfig = { OUTPUT_PATH: VIDEO_OUTPUT_DIR };
    if (this.cliConfig?.platformWidth) {
      xPosterConfig.settings = { visuals: { resolution: {
        width: this.cliConfig.platformWidth,
        height: this.cliConfig.platformHeight
      }}};
    }
    const videoGen = new VideoGenerator(xPosterConfig);

    const fetchOpts = this.getFetchOptions();
    const rukuData = await this.contentFetcher.fetchContent(fetchOpts);

    console.log(
      `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
    );

    // Process audio
    const audioPath = await this.contentFetcher.processAudio(rukuData.verses);

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
    };
  }

  /**
   * Generate video using YouTube-Poster style
   */
  async generateYouTubeVideo() {
    console.log("[VideoGen] Generating landscape-format video...");

    const VideoGenerator = require(
      path.resolve(this.baseDir, this.config.paths.youtubePosterVideoGenerator),
    );
    const ThumbnailGenerator = require(
      path.resolve(
        this.baseDir,
        this.config.paths.youtubePosterThumbnailGenerator,
      ),
    );

    // Use local config for backgrounds and settings
    const ytConfig = this.config;

    const ytGenConfig = { ...ytConfig, OUTPUT_PATH: VIDEO_OUTPUT_DIR };
    if (this.cliConfig?.platformWidth) {
      // Deep-merge resolution into settings.visuals so the downstream VideoGenerator picks it up
      ytGenConfig.settings = {
        ...(ytConfig.settings || {}),
        visuals: {
          ...(ytConfig.settings?.visuals || {}),
          resolution: {
            width: this.cliConfig.platformWidth,
            height: this.cliConfig.platformHeight
          }
        }
      };
    }
    const videoGen = new VideoGenerator(ytGenConfig);

    const fetchOpts = this.getFetchOptions();
    const rukuData = await this.contentFetcher.fetchContent(fetchOpts);

    console.log(
      `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
    );

    // Process audio
    const audioPath = await this.contentFetcher.processAudio(rukuData.verses);

    // Select background
    const bgDir = path.resolve(this.baseDir, "../video-publisher/backgrounds");
    const backgrounds = fs
      .readdirSync(bgDir)
      .filter(
        (f) => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".gif"),
      );
      
    let bgPath = null;
    if (this.cliConfig?.background) {
      if (!backgrounds.includes(this.cliConfig.background)) {
        throw new Error(`Background file not found: ${this.cliConfig.background}. Run with --listBackgrounds to see available files.`);
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

    // Generate video
    const videoPath = await videoGen.createVideo(audioPath, bgPath, rukuData);

    return {
      videoPath,
      metadata: rukuData,
      style: "landscape",
      bgPath,
    };
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
    try {
      const ThumbnailGenerator = require(
        path.resolve(this.baseDir, "../video-publisher/thumbnail-generator.js"),
      );
      const thumbGen = new ThumbnailGenerator({ ...this.config, OUTPUT_PATH: VIDEO_OUTPUT_DIR });
      // Use the same background as the video if available
      const thumbResult = await thumbGen.generate(metadata, bgPath);
      thumbnailPath = path.resolve(thumbResult.thumbnailPath);
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
    const sanitize = (s) => (s || "").toString().replace(/[\\/:*?"<>|()[\]']/g, "").replace(/\s+/g, "_").replace(/[^\x00-\x7F]/g, "");
    
    const sReciter = sanitize(metadata.reciterName || "UnknownReciter");
    const sSurah = sanitize(metadata.surahName || "UnknownSurah");
    const sRange = sanitize(metadata.range || "0");
    
    const suggestionFile = path.join(
      VIDEO_OUTPUT_DIR,
      `${sReciter}_${sSurah}_${sRange}_${timestamp}.txt`,
    );

    const sep = "─".repeat(60);

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
        const presetsPath = path.resolve(this.baseDir, "../../../global_assets/video_style_presets.json");
        const presetsData = JSON.parse(fs.readFileSync(presetsPath, "utf8"));
        const pConf = presetsData.platforms?.[this.cliConfig.platform];
        if (!pConf) {
           throw new Error(`Unknown platform: ${this.cliConfig.platform}. Available platforms: ${Object.keys(presetsData.platforms || {}).join(", ")}`);
        }
        style = pConf.defaultStyle === "x" ? "x_poster" : pConf.defaultStyle;
        this.cliConfig.platformWidth = this.cliConfig.platformWidth || pConf.width;
        this.cliConfig.platformHeight = this.cliConfig.platformHeight || pConf.height;
        console.log(`[VideoGen] Applying platform preset: ${this.cliConfig.platform} (${this.cliConfig.platformWidth}x${this.cliConfig.platformHeight}, style: ${style})`);
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
        console.log(JSON.stringify({ style, fetchOpts, ...this.cliConfig }, null, 2));
        console.log("========================================\n");
        return { dryRun: true };
      }

      // Generate video
      const videoResult =
        style === "x_poster"
          ? await this.generateXPosterVideo()
          : await this.generateYouTubeVideo();

      // Create suggestion file
      await this.createSuggestionFile(videoResult);

      // Cleanup temp files
      this.contentFetcher.cleanup();

      console.log("\n========================================");
      console.log("Video Generation Complete!");
      console.log("========================================\n");

      return videoResult;
    } catch (error) {
      throw error;
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
        printHelp(reciters, path.resolve(__dirname, "../../../global_assets/video_style_presets.json"));
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

      if (cliConfig.listBackgrounds) {
        const bgDir = path.resolve(__dirname, "../video-publisher/backgrounds");
        if (fs.existsSync(bgDir)) {
          const bgs = fs.readdirSync(bgDir).filter(f => f.match(/\.(jpg|jpeg|png|gif)$/i));
          console.log(`Available backgrounds in video-publisher/backgrounds:`);
          bgs.forEach(b => console.log(` - ${b}`));
        } else {
          console.log("Backgrounds directory not found.");
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
      throw new Error(`Invalid --page value: ${cli.page}. Expected a number 1-604.`);
    }
    
    const mappingPath = path.resolve(__dirname, "../../../global_assets/quran_page_mapping.json");
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

  const wantsManualVerses = cli.surah != null || cli.range != null || cli.startVerse != null || cli.endVerse != null;
  const wantsReciter = cli.reciterId || cli.reciter;
  const wantsPlatform = cli.platform != null;
  const wantsBackground = cli.background != null;
  const wantsStyle = cli.style != null;
  const wantsResolution = cli.width != null || cli.height != null;
  const wantsDryRun = cli.dryRun === true;
  
  if (cli.listBackgrounds) {
    return { listBackgrounds: true };
  }
  
  // If no arguments passed, we return an empty config (defaults to full random)
  if (!wantsManualVerses && !wantsReciter && !wantsPlatform && !wantsBackground && !wantsStyle && !wantsResolution && !wantsDryRun) {
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
        throw new Error(`Invalid style: ${cli.style}. Valid styles: youtube, x_poster`);
    }
    manual.style = cli.style.toLowerCase() === "x" ? "x_poster" : cli.style.toLowerCase();
  }

  if (wantsResolution) {
    if (cli.width == null || cli.height == null) {
      throw new Error(`Both --width and --height must be provided together.`);
    }
    const w = Number(cli.width);
    const h = Number(cli.height);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
      throw new Error(`Invalid resolution: ${cli.width}x${cli.height}. Width and height must be positive numbers.`);
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
          throw new Error(`Unknown reciter: ${wanted}. Use --listReciters to see available reciters.`);
        }
        reciterId = matchId;
      }
    }

    if (!reciterId) {
      throw new Error("Missing reciter identifier (name or ID).");
    }
    if (!reciters[reciterId]) {
      throw new Error(`Unknown reciter ID: ${reciterId}. Use --listReciters to see available reciters.`);
    }

    manual.reciterId = Number(reciterId);
  }

  // Manual verse range selection
  if (wantsManualVerses) {
    const surahNum = Number(cli.surah);
    if (!Number.isFinite(surahNum) || surahNum < 1 || surahNum > 114) {
      throw new Error(`Invalid --surah value: ${cli.surah}. Expected a number 1-114.`);
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
      throw new Error(`Invalid verse start. Provide --range like 1-5 or --startVerse N.`);
    }
    if (!Number.isFinite(endVerse) || endVerse < 1) {
      endVerse = startVerse;
    }
    if (endVerse < startVerse) {
      throw new Error(`Invalid range: endVerse < startVerse (${startVerse}-${endVerse})`);
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
  --platform <name>         Apply resolution & style preset
  --style <name>            Override style (youtube or x_poster)
  --background, -b <file>   Use a specific background file
  --listBackgrounds         List all available background files
  --width <px>              Custom video width (must be paired with --height)
  --height <px>             Custom video height (must be paired with --width)

Miscellaneous:
  --help, -h                Show this help message

Behavior:
  If no content flags are provided, a random Ruku will be selected.
  If no visual flags are provided, style and resolution will be randomized or use config defaults.

Available Platforms:
  ${platformList}
`);
}
