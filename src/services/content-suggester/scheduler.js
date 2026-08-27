const path = require("path");
const fs = require("fs");
const { tickManualAssist } = require("./manual-assistant");

/**
 * Background Content Suggester Scheduler
 * Periodically triggers the manual assistant to check for new suggestions
 */
class ContentSuggesterScheduler {
  constructor(configPath) {
    this.configPath = configPath;
    this.loadConfig();
  }

  loadConfig() {
    if (fs.existsSync(this.configPath)) {
      this.config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));
    } else {
      this.config = {
        settings: {
          checkIntervalMinutes: 5,
          enabled: true,
        },
      };
    }
  }

  async runTick() {
    console.log(
      `[${new Date().toLocaleString()}] Running content suggestion tick...`,
    );
    try {
      await tickManualAssist();
    } catch (error) {
      console.error("[Scheduler] Tick failed:", error);
    }
  }

  start() {
    const intervalMinutes = this.config.settings?.checkIntervalMinutes || 60;
    const intervalMs = intervalMinutes * 60 * 1000;

    console.log("========================================");
    console.log("Background Content Suggester Scheduler");
    console.log("========================================");
    console.log(
      `Check interval: Every ${intervalMinutes} minutes (${intervalMs}ms)`,
    );
    console.log("========================================\n");

    // Run once immediately
    this.runTick();

    // Schedule subsequent checks using setInterval (not cron!)
    // This ensures a true N-minute gap between runs, unlike cron's */N
    // which resets at each hour boundary and causes uneven spacing.
    setInterval(() => {
      this.runTick();
    }, intervalMs);

    console.log("[Scheduler] Service started. Waiting for schedule...");
  }
}

if (require.main === module) {
  const configPath = path.join(__dirname, "config.json");
  const scheduler = new ContentSuggesterScheduler(configPath);
  scheduler.start();
}

module.exports = ContentSuggesterScheduler;
