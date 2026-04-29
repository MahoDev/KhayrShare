const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const { OUTPUT_PATH } = require("../../config");

/**
 * Background Video Generator
 * Generates Quran videos periodically using x_poster and youtube_poster styles
 * without interfering with their normal operation.
 */
class VideoGenerator {
  constructor(configPath) {
    this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    this.baseDir = path.dirname(configPath);

    // Load shared modules
    const ContentFetcher = require(
      path.resolve(this.baseDir, this.config.paths.xPosterContentFetcher),
    );
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

    // 1. Check for manual params passed via environment variable (ephemeral run)
    let manualParams = null;
    const envSource = process.env.MANUAL_PARAMS || process.env._ || process.env.PARAMS;
    
    if (envSource && envSource.trim().startsWith('{')) {
      try {
        manualParams = JSON.parse(envSource);
      } catch (e) {
        // Only log error if it was intended to be JSON
        if (process.env.MANUAL_PARAMS) {
          console.error("[VideoGen] Failed to parse MANUAL_PARAMS:", e.message);
        }
      }
    }

    // 2. Fallback to config file's manualGeneration (legacy/fallback)
    const manualConfig = manualParams || this.config.manualGeneration;

    if (manualConfig) {
      // Support common typo variations or lowercase
      const rId = manualConfig.reciterId || manualConfig.reciterid || manualConfig.reciter_id;
      if (rId) {
        options.reciterId = rId;
        console.log(`[VideoGen] Manual Reciter ID detected: ${rId}`);
      }

      // Only force MANUAL mode if surah is specified
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

    const TextRenderer = require(
      path.resolve(this.baseDir, this.config.paths.xPosterTextRenderer),
    );
    const VideoGenerator = require(
      path.resolve(this.baseDir, this.config.paths.xPosterVideoGenerator),
    );

    const textRenderer = new TextRenderer();
    const videoGen = new VideoGenerator();

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

    // Load youtube config for backgrounds
    const ytConfig = JSON.parse(
      fs.readFileSync(
        path.resolve(this.baseDir, "../youtube_poster/config.json"),
        "utf8",
      ),
    );

    const videoGen = new VideoGenerator(ytConfig);

    const fetchOpts = this.getFetchOptions();
    const rukuData = await this.contentFetcher.fetchContent(fetchOpts);

    console.log(
      `Content: ${rukuData.surahName} (${rukuData.range}) - ${rukuData.reciterName}`,
    );

    // Process audio
    const audioPath = await this.contentFetcher.processAudio(rukuData.verses);

    // Select random background
    const bgDir = path.resolve(this.baseDir, "../youtube_poster/backgrounds");
    const backgrounds = fs
      .readdirSync(bgDir)
      .filter(
        (f) => f.endsWith(".jpg") || f.endsWith(".png") || f.endsWith(".gif"),
      );
    const bgPath =
      backgrounds.length > 0
        ? path.join(
            bgDir,
            backgrounds[Math.floor(Math.random() * backgrounds.length)],
          )
        : null;

    if (!bgPath) {
      throw new Error("No backgrounds found in youtube_poster/backgrounds");
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
      path.resolve(this.baseDir, "../youtube_poster/metadata-generator.js"),
    );
    const metadataGen = new MetadataGenerator();
    const ytMetadata = metadataGen.generate(metadata);

    // Use the full description generated by MetadataGenerator as the caption
    const caption = ytMetadata.description;

    // Generate Thumbnail
    let thumbnailPath = "Thumbnail generation failed";
    try {
      const ThumbnailGenerator = require(
        path.resolve(this.baseDir, "../youtube_poster/thumbnail-generator.js"),
      );
      // Load YouTube config for thumbnail settings if needed, or rely on defaults
      const ytConfig = JSON.parse(
        fs.readFileSync(
          path.resolve(this.baseDir, "../youtube_poster/config.json"),
          "utf8",
        ),
      );
      const thumbGen = new ThumbnailGenerator(ytConfig);
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
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const suggestionFile = path.join(
      OUTPUT_PATH,
      `suggestion_${timestamp}.txt`,
    );

    const fileContent = `Generated: ${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })}
Style: ${style === "x_poster" ? "X-Poster (1080x1080)" : "YouTube (1920x1080)"}

Matching Groups (${matchType}):
${groupListText || "No matching groups found"}

Caption:
${caption}

YouTube Tags:
${youtubeTags}

Video Path:
${absVideoPath}

Thumbnail Path:
${thumbnailPath}`;

    fs.writeFileSync(suggestionFile, fileContent, "utf8");
    console.log(`[VideoGen] Suggestion file created: ${suggestionFile}`);

    // Open in default text editor
    const openCmd =
      process.platform === "win32"
        ? `start "" "${suggestionFile}"`
        : process.platform === "darwin"
          ? `open "${suggestionFile}"`
          : `xdg-open "${suggestionFile}"`;

    exec(openCmd, { windowsHide: true });

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
      if (
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

      console.log(`Selected style: ${style}\n`);

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
      console.error("[VideoGen] Error:", error);
      throw error;
    }
  }
}

// Check execution
if (require.main === module) {
  (async () => {
    try {
      const configPath = path.join(__dirname, "config.json");
      const cli = parseCliArgs(process.argv.slice(2));

      const { reciters } = loadRecitersMapFromConfig(configPath);

      if (cli.listReciters) {
        const rows = Object.keys(reciters)
          .map((id) => ({ id, name: reciters[id]?.name }))
          .sort((a, b) => Number(a.id) - Number(b.id));

        for (const r of rows) {
          if (!r.name) continue;
          console.log(`${r.id}: ${r.name}`);
        }
        return;
      }

      const wantsManualVerses =
        cli.surah != null ||
        cli.range != null ||
        cli.startVerse != null ||
        cli.endVerse != null;

      const wantsReciter = cli.reciterId || cli.reciter;

      if (wantsManualVerses || wantsReciter) {
        const manual = {};

        // Optional reciter selection
        if (wantsReciter) {
          let reciterId = cli.reciterId;

          if (!reciterId && cli.reciter) {
            const wanted = cli.reciter.toString().trim();
            const lowered = wanted.toLowerCase();

            const matchId = Object.keys(reciters).find((id) => {
              const nm = reciters[id]?.name;
              if (!nm) return false;
              return nm === wanted || nm.toLowerCase() === lowered;
            });

            if (!matchId) {
              throw new Error(
                `Unknown reciter name: ${wanted}. Use --listReciters to see available reciters.`,
              );
            }

            reciterId = matchId;
          }

          if (!reciterId) {
            throw new Error("Missing reciterId");
          }

          if (!reciters[reciterId]) {
            throw new Error(
              `Unknown reciterId: ${reciterId}. Use --listReciters to see available reciters.`,
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

        process.env.MANUAL_PARAMS = JSON.stringify(manual);
      }

      const generator = new VideoGenerator(configPath);
      await generator.generate();
    } catch (err) {
      console.error("Fatal Error:", err);
    }
  })();
}

module.exports = VideoGenerator;

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === "--listReciters") {
      args.listReciters = true;
      continue;
    }
    if (a.startsWith("--reciterId=")) {
      args.reciterId = a.slice("--reciterId=".length);
      continue;
    }
    if (a === "--reciterId") {
      args.reciterId = argv[i + 1];
      i++;
      continue;
    }
    if (a.startsWith("--reciter=")) {
      args.reciter = a.slice("--reciter=".length);
      continue;
    }
    if (a === "--reciter") {
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

function loadRecitersMapFromConfig(configPath) {
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const baseDir = path.dirname(configPath);
  const recitersJsonPath = path.resolve(baseDir, cfg.paths.recitersJson);
  return {
    recitersJsonPath,
    reciters: JSON.parse(fs.readFileSync(recitersJsonPath, "utf8")),
  };
}
