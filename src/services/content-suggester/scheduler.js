const cron = require("node-cron");
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
          enabled: true
        }
      };
    }
  }

  async runTick() {
    console.log(`[${new Date().toLocaleString()}] Running content suggestion tick...`);
    try {
      await tickManualAssist();
    } catch (error) {
      console.error("[Scheduler] Tick failed:", error);
    }
  }

  start() {
    const intervalMinutes = this.config.settings?.checkIntervalMinutes || 60;
    const cronPattern = `0 */${Math.max(1, Math.floor(intervalMinutes / 60))} * * *`; // Every N hours for simplicity or adjust as needed

    // For more granular control, we can use:
    const granularPattern = `*/${intervalMinutes} * * * *`;

    console.log("========================================");
    console.log("Background Content Suggester Scheduler");
    console.log("========================================");
    console.log(`Check interval: Every ${intervalMinutes} minutes`);
    console.log(`Cron pattern: ${granularPattern}`);
    console.log("========================================\n");

    cron.schedule(granularPattern, () => {
      this.runTick();
    });

    console.log("[Scheduler] Service started. Waiting for schedule...");
    
    // Run once immediately
    this.runTick();
  }
}

if (require.main === module) {
  const configPath = path.join(__dirname, "config.json");
  const scheduler = new ContentSuggesterScheduler(configPath);
  scheduler.start();
}

module.exports = ContentSuggesterScheduler;
