const cron = require("node-cron");
const path = require("path");
const fs = require("fs");
const VideoGenerator = require("./generator");

/**
 * Background Video Generator Scheduler
 * Periodically checks if a video should be generated based on configured probability
 */
class Scheduler {
  constructor(configPath) {
    this.configPath = configPath;
    this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    this.generator = new VideoGenerator(configPath);
    this.lastGeneration = null;
    this.fileModCache = new Map(); // Cache to optimize file scanning
  }

  /**
   * Check if we should trigger generation based on probability
   */
  shouldTrigger() {
    if (!this.config.trigger.enabled) {
      return false;
    }

    const randomValue = Math.random();
    const triggered = randomValue < this.config.trigger.probability;

    console.log(
      `[Scheduler] Probability check: ${(randomValue * 100).toFixed(2)}% vs ${(this.config.trigger.probability * 100).toFixed(2)}% threshold - ${triggered ? "TRIGGERED" : "skipped"}`,
    );

    return triggered;
  }

  /**
   * Scan all .txt files in VIDEO_OUTPUT_DIR for regeneration flags.
   * - regenerate: true   → delete old file, generate a new video for the same reciter.
   * - regenerateThumbnail: true → parse thumbnailText, regenerate just the thumbnail.
   * - posted: true → record upload in tracking and rename file to .txt.posted
   */
  async scanForRegenerate() {
    try {
      const VIDEO_OUTPUT_DIR = path.join(
        require("../../config").OUTPUT_PATH,
        "video-service-outputs",
      );
      const txtFiles = fs
        .readdirSync(VIDEO_OUTPUT_DIR)
        .filter((f) => f.endsWith(".txt"))
        .map((f) => path.join(VIDEO_OUTPUT_DIR, f));

      // Prune cache for deleted or renamed files
      const currentFiles = new Set(txtFiles);
      for (const key of this.fileModCache.keys()) {
        if (!currentFiles.has(key)) {
          this.fileModCache.delete(key);
        }
      }

      for (const filePath of txtFiles) {
        let content;
        try {
          const stats = fs.statSync(filePath);
          const lastMtime = this.fileModCache.get(filePath);
          
          // Skip if file hasn't been modified since last check
          if (lastMtime && stats.mtimeMs <= lastMtime) {
            continue;
          }
          
          this.fileModCache.set(filePath, stats.mtimeMs);
          content = fs.readFileSync(filePath, "utf8");
        } catch (fileErr) {
          console.error(`[Scheduler] Could not read file ${path.basename(filePath)}:`, fileErr.message);
          continue;
        }

        // --- Handle posting status ---
        if (/posted:\s*true/i.test(content)) {
          console.log(`[Scheduler] Detected posted flag in ${path.basename(filePath)}`);
          
          try {
            const tracking = require("./tracking.js");
            const reciterMatch = content.match(/reciterId:\s*(\d+)/);
            // We need the reciter name as well, which is in the title block
            const titleMatch = content.match(/\[ YOUTUBE TITLE \]\n(.+)/);
            let reciterName = "Unknown";
            
            if (titleMatch) {
              const titleParts = titleMatch[1].trim().split("|").map(s => s.trim());
              reciterName = titleParts[0] || "Unknown";
            } else if (reciterMatch) {
              // fallback to ID if title isn't there
              reciterName = reciterMatch[1];
            }
            
            // Record upload across all enabled platforms
            const platforms = this.config.platforms || {};
            let recordedAny = false;
            for (const [platform, pConfig] of Object.entries(platforms)) {
              if (pConfig.enabled) {
                tracking.recordUpload(reciterName, platform);
                recordedAny = true;
              }
            }
            
            if (recordedAny) {
              console.log(`[Scheduler] Tracking recorded for ${reciterName}. Archiving suggestion file.`);
              // Rename to .txt.posted
              const newPath = filePath + ".posted";
              fs.renameSync(filePath, newPath);
              this.fileModCache.delete(filePath); // Remove old path from cache
              continue; // Move to next file since this one is processed and renamed
            } else {
              console.warn(`[Scheduler] posted: true found but no platforms are enabled in config.`);
            }
          } catch (e) {
            console.error(`[Scheduler] Error recording tracking from ${path.basename(filePath)}:`, e.message);
          }
        }

        // --- Handle thumbnail regeneration ---
        if (/regenerateThumbnail:\s*true/i.test(content)) {
          const thumbTextMatch = content.match(/thumbnailText:\s*(?:"([^"]*)"|(.+))/);
          const vidMatch = content.match(/\[ VIDEO FILE \]\n(.+)/);

          if (!vidMatch) {
            console.warn(
              `[Scheduler] regenerateThumbnail:true found in ${filePath} but no video path — skipping.`,
            );
            // Reset the flags to avoid spinning
            let updated = content
              .replace(
                /regenerateThumbnail:\s*true/i,
                "regenerateThumbnail: false",
              )
              .replace(/thumbnailText:\s*(?:"[^"]*"|.+)/, `thumbnailText: ""`);
            fs.writeFileSync(filePath, updated, "utf8");
            continue;
          }

          const videoPath = vidMatch[1].trim();
          const newThumbText = thumbTextMatch ? (thumbTextMatch[1] || thumbTextMatch[2] || "").trim() : "";

          console.log(
            `[Scheduler] Thumbnail regeneration requested for ${path.basename(filePath)}. Text: "${newThumbText || "(empty)"}"`,
          );

          try {
            // Load metadata from the video file or generate from existing data
            const ThumbnailGenerator = require(
              path.resolve(
                __dirname,
                "../video-publisher/thumbnail-generator.js",
              ),
            );
            const thumbGen = new ThumbnailGenerator({
              ...this.config,
              OUTPUT_PATH: VIDEO_OUTPUT_DIR,
            });

            // Build a minimal metadata object from the suggestion file
            const reciterMatch = content.match(/reciterId:\s*(\d+)/);
            const reciterNameMatch = content.match(/\[ YOUTUBE TITLE \]\n(.+)/);
            const reciterId = reciterMatch ? reciterMatch[1] : "0";

            // Use the video's existing background (scan for background path)
            const bgCandidates = fs
              .readdirSync(
                path.join(__dirname, "../video-publisher/backgrounds"),
              )
              .filter((f) => f.match(/\.(jpg|jpeg|png)$/i));
            // Check if there's a portrait for this reciter
            const portraitDir = path.resolve(
              __dirname,
              "../video-publisher/assets/portraits",
            );
            let bgPath = null;
            const portraitPath = path.join(portraitDir, `${reciterId}.jpg`);
            if (fs.existsSync(portraitPath)) {
              bgPath = portraitPath;
            } else if (bgCandidates.length > 0) {
              bgPath = path.join(
                __dirname,
                "../video-publisher/backgrounds",
                bgCandidates[Math.floor(Math.random() * bgCandidates.length)],
              );
            }

            // Extract metadata from file content
            const title = reciterNameMatch
              ? reciterNameMatch[1].trim()
              : "Reciter";

            // Parse YouTube title format: "ياسر الدوسري | سورة البقرة | الآيات 222-228"
            const titleParts = title.split("|").map((s) => s.trim());
            // Part 1: reciter name
            const reciterName = titleParts[0] || title;
            // Part 2: surah name (e.g. "سورة البقرة")
            let surahNameArabic = "سورة";
            let surahName = "";
            if (titleParts.length >= 2) {
              const surahPart = titleParts[1].trim();
              surahNameArabic = surahPart;
              surahName = surahPart.replace(/^سورة\s+/, "");
            }

            // Extract range from the title's last part or from الآيات/الآية pattern
            const rangeMatch = content.match(/(الآيات|الآية)\s*[\d\-]+/);
            let range = rangeMatch
              ? rangeMatch[0].replace(/(الآيات|الآية)\s+/, "")
              : "1-5";
            // Or try the last part of the title (e.g. "الآيات 222-228" or "الآية 5")
            if (titleParts.length >= 3) {
              range = titleParts[titleParts.length - 1].replace(
                /^(الآيات|الآية)\s+/,
                "",
              );
            }

            // Use the same background as the original video (stored in the suggestion file)
            const bgUsedMatch = content.match(/backgroundUsed:\s*(.+)/);
            let thumbBg = bgPath; // default to fallback
            if (bgUsedMatch) {
              const storedBg = bgUsedMatch[1].trim();
              if (storedBg && fs.existsSync(storedBg)) {
                // Check if it's an image (not a video)
                const bgExt = path.extname(storedBg).toLowerCase();
                if (![".mp4", ".mov", ".webm", ".gif"].includes(bgExt)) {
                  thumbBg = storedBg;
                }
              }
            }

            // Build metadata - use the snippet from thumbnailText field
            const metadata = {
              reciterName,
              surahNameArabic,
              surahName,
              range,
              thumbSnippet: newThumbText || null,
            };

            // Parse the old thumbnail path so we can delete it
            const oldThumbMatch = content.match(/\[ THUMBNAIL FILE \]\n(.+)/);
            const oldThumbPath = oldThumbMatch ? oldThumbMatch[1].trim() : null;

            const thumbResult = await thumbGen.generate(metadata, thumbBg);

            // Delete the old thumbnail file (replace it with the new one)
            if (oldThumbPath && fs.existsSync(oldThumbPath)) {
              fs.unlinkSync(oldThumbPath);
              console.log(
                `[Scheduler] Deleted old thumbnail: ${path.basename(oldThumbPath)}`,
              );
            }

            // Update the suggestion file with the new thumbnail path
            let updated = content
              .replace(
                /regenerateThumbnail:\s*true/i,
                "regenerateThumbnail: false",
              )
              .replace(/thumbnailText:\s*(?:"[^"]*"|.+)/, `thumbnailText: ""`)
              .replace(
                /\[ THUMBNAIL FILE \]\n.+/,
                `[ THUMBNAIL FILE ]\n${path.resolve(thumbResult.thumbnailPath)}`,
              );
            fs.writeFileSync(filePath, updated, "utf8");
            console.log(
              `[Scheduler] Thumbnail regenerated: ${path.basename(thumbResult.thumbnailPath)}`,
            );
          } catch (thumbErr) {
            console.error(
              "[Scheduler] Thumbnail regeneration failed:",
              thumbErr.message,
            );
            // Reset flags to avoid continuous retries
            let updated = content
              .replace(
                /regenerateThumbnail:\s*true/i,
                "regenerateThumbnail: false",
              )
              .replace(/thumbnailText:\s*(?:"[^"]*"|.+)/, `thumbnailText: ""`);
            fs.writeFileSync(filePath, updated, "utf8");
          }
          continue;
        }

        // --- Handle full video regeneration ---
        if (!/regenerate:\s*true/i.test(content)) continue;

        const idMatch = content.match(/reciterId:\s*(\d+)/);
        if (!idMatch) {
          console.warn(
            `[Scheduler] regenerate:true found in ${filePath} but no reciterId — skipping.`,
          );
          continue;
        }

        const reciterId = idMatch[1];
        console.log(
          `[Scheduler] Regeneration requested for reciter ${reciterId}. Generating new video...`,
        );

        // Reset the regenerate flag IMMEDIATELY to prevent race condition
        // (scanner runs every 5 seconds, generation may take longer)
        let updated = content.replace(
          /regenerate:\s*true/i,
          "regenerate: false",
        );
        fs.writeFileSync(filePath, updated, "utf8");
        console.log(
          `[Scheduler] Reset regenerate flag in ${path.basename(filePath)} to prevent duplicate regeneration.`,
        );

        try {
          // Generate new video (random content, same reciter, does NOT update daily pool)
          const regenGenerator = new VideoGenerator(this.configPath, {
            reciterId: Number(reciterId),
            isRandom: true,
            _isRegeneration: true,
          });
          await regenGenerator.generate();

          // Only delete old file after successful generation
          fs.unlinkSync(filePath);
          this.fileModCache.delete(filePath); // Clean up cache
          console.log(
            `[Scheduler] Regeneration complete. Old suggestion file deleted.`,
          );
        } catch (genError) {
          console.error(
            `[Scheduler] Regeneration failed for reciter ${reciterId}:`,
            genError.message,
          );
          // Flag is already reset, so no retry loop will occur
        }
      }
    } catch (err) {
      console.error("[Scheduler] scanForRegenerate error:", err);
    }
  }

  /**
   * Attempt to generate a video
   */
  async attemptGeneration() {
    try {
      if (this.shouldTrigger()) {
        console.log("[Scheduler] Triggering video generation...\n");
        const result = await this.generator.generate();
        this.lastGeneration = new Date();
        console.log(
          `[Scheduler] Generation successful at ${this.lastGeneration.toLocaleString("en-US", { timeZone: "Africa/Cairo" })}`,
        );
        return result;
      } else {
        console.log("[Scheduler] Skipping this interval.\n");
      }
    } catch (error) {
      console.error("[Scheduler] Generation failed:", error);
    }
  }

  /**
   * Start the scheduler
   */
  start() {
    const intervalMinutes = this.config.trigger.checkIntervalMinutes || 30;

    // Create cron pattern: run every N minutes
    const cronPattern = `*/${intervalMinutes} * * * *`;

    console.log("========================================");
    console.log("Background Video Generator Scheduler");
    console.log("========================================");
    console.log(`Check interval: Every ${intervalMinutes} minutes`);
    console.log(
      `Trigger probability: ${(this.config.trigger.probability * 100).toFixed(1)}%`,
    );
    console.log(`Enabled: ${this.config.trigger.enabled ? "YES" : "NO"}`);
    console.log(`Cron pattern: ${cronPattern}`);
    console.log("========================================\n");

    if (!this.config.trigger.enabled) {
      console.log("[Scheduler] Service is DISABLED in config. Exiting.");
      return;
    }

    // Schedule the job
    cron.schedule(cronPattern, async () => {
      console.log(
        `\n[${new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" })}] Scheduler check triggered`,
      );
      await this.attemptGeneration();
    });

    // Setup fast-polling for regeneration requests (every 5 seconds)
    // This allows instant regeneration when the user saves the text file.
    setInterval(async () => {
      try {
        await this.scanForRegenerate();
      } catch (scanErr) {
        console.error("[Scheduler] scanForRegenerate error:", scanErr);
      }
    }, 5000);

    console.log("[Scheduler] Service started and waiting for schedule...");
    console.log("[Scheduler] Press Ctrl+C to stop\n");

    // Run once immediately for testing (optional - comment out if not desired)
    // this.attemptGeneration();
  }
}

// Run if executed directly
if (require.main === module) {
  const configPath = path.join(__dirname, "config.json");
  const scheduler = new Scheduler(configPath);
  scheduler.start();
}

module.exports = Scheduler;
