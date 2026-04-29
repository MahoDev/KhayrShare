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
