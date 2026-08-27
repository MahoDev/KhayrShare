const fs = require("fs");
const path = require("path");
const { OUTPUT_PATH } = require("../../config");

const VIDEO_OUTPUT_DIR = path.join(OUTPUT_PATH, "video-service-outputs");
const WEEKLY_UPLOADS_FILE = path.join(VIDEO_OUTPUT_DIR, "weekly_uploads.json");
const POST_COUNTS_FILE = path.join(VIDEO_OUTPUT_DIR, "post_counts.json");

/**
 * Get the ISO week key for a given date (e.g., "2026-W30").
 * Week starts on Monday per ISO 8601.
 * @param {Date} [date] - Defaults to now.
 * @returns {string}
 */
function getWeekKey(date = new Date()) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1..Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Get today's date key (e.g. "2026-07-23").
 * @returns {string}
 */
function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Read the weekly uploads tracker from disk.
 * Returns an object keyed by week → reciter → platform → true.
 * Gracefully returns empty object on missing/corrupt file.
 * @returns {Object}
 */
function readTracker() {
  try {
    if (!fs.existsSync(WEEKLY_UPLOADS_FILE)) return {};
    return JSON.parse(fs.readFileSync(WEEKLY_UPLOADS_FILE, "utf8"));
  } catch (err) {
    console.warn(
      `[Tracking] Could not read ${WEEKLY_UPLOADS_FILE}, starting fresh:`,
      err.message,
    );
    return {};
  }
}

/**
 * Persist the tracker object to disk.
 * @param {Object} tracker
 */
function writeTracker(tracker) {
  // Ensure directory exists
  const dir = path.dirname(WEEKLY_UPLOADS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(WEEKLY_UPLOADS_FILE, JSON.stringify(tracker, null, 2));
}

/**
 * Read the daily post counts from disk.
 * Structure: { "2026-07-23": { "tiktok": 2, "youtube_shorts": 1 }, ... }
 * @returns {Object}
 */
function readPostCounts() {
  try {
    if (!fs.existsSync(POST_COUNTS_FILE)) return {};
    return JSON.parse(fs.readFileSync(POST_COUNTS_FILE, "utf8"));
  } catch (err) {
    console.warn(
      `[Tracking] Could not read ${POST_COUNTS_FILE}, starting fresh:`,
      err.message,
    );
    return {};
  }
}

/**
 * Persist the post counts object to disk.
 * @param {Object} counts
 */
function writePostCounts(counts) {
  const dir = path.dirname(POST_COUNTS_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(POST_COUNTS_FILE, JSON.stringify(counts, null, 2));
}

/**
 * Get today's post count for a specific platform.
 * @param {string} platform - e.g. "tiktok", "youtube"
 * @returns {number}
 */
function getDailyPostCount(platform) {
  const counts = readPostCounts();
  const today = getTodayKey();
  return counts[today]?.[platform] || 0;
}

/**
 * Increment today's post count for a specific platform by 1.
 * @param {string} platform
 */
function incrementDailyPostCount(platform) {
  const counts = readPostCounts();
  const today = getTodayKey();

  if (!counts[today]) counts[today] = {};
  if (!counts[today][platform]) counts[today][platform] = 0;
  counts[today][platform]++;

  writePostCounts(counts);
  console.log(
    `[Tracking] Daily post count for ${platform}: ${counts[today][platform]} (${today})`,
  );
}

/**
 * Check if a platform has reached its daily target.
 * @param {string} platform
 * @param {number} target - Daily target (0 or null = unlimited)
 * @returns {boolean} true if target is met (saturated)
 */
function isPlatformSaturated(platform, target) {
  if (!target || target <= 0) return false; // 0/unlimited → never saturated
  const current = getDailyPostCount(platform);
  return current >= target;
}

/**
 * Check whether a reciter has already been uploaded to a specific platform
 * during the current week.
 * @param {string} reciterName - Human-readable reciter name or ID.
 * @param {string} platform   - Platform key (e.g., "tiktok", "youtube").
 * @returns {boolean} true if already uploaded this week.
 */
function isUploadedThisWeek(reciterName, platform) {
  const tracker = readTracker();
  const week = getWeekKey();
  return Boolean(tracker[week]?.[reciterName]?.[platform]);
}

/**
 * Record a successful upload for a reciter on a platform for the current week.
 * @param {string} reciterName
 * @param {string} platform
 */
function recordUpload(reciterName, platform) {
  const tracker = readTracker();
  const week = getWeekKey();

  if (!tracker[week]) tracker[week] = {};
  if (!tracker[week][reciterName]) tracker[week][reciterName] = {};
  tracker[week][reciterName][platform] = true;

  writeTracker(tracker);
  console.log(
    `[Tracking] Recorded upload: ${reciterName} → ${platform} (${week})`,
  );
}

/**
 * Get all uploads for the current week.
 * @returns {Object} reciterName → { platform: true, ... }
 */
function getWeeklyUploads() {
  const tracker = readTracker();
  const week = getWeekKey();
  return tracker[week] || {};
}

module.exports = {
  getWeekKey,
  readTracker,
  writeTracker,
  isUploadedThisWeek,
  recordUpload,
  getWeeklyUploads,
  WEEKLY_UPLOADS_FILE,
  // Daily post counter exports
  getTodayKey,
  getDailyPostCount,
  incrementDailyPostCount,
  isPlatformSaturated,
  POST_COUNTS_FILE,
};
