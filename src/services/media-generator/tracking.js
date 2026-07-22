const fs = require("fs");
const path = require("path");
const { OUTPUT_PATH } = require("../../config");

const VIDEO_OUTPUT_DIR = path.join(OUTPUT_PATH, "video-service-outputs");
const WEEKLY_UPLOADS_FILE = path.join(VIDEO_OUTPUT_DIR, "weekly_uploads.json");

/**
 * Get the ISO week key for a given date (e.g., "2026-W30").
 * Week starts on Monday per ISO 8601.
 * @param {Date} [date] - Defaults to now.
 * @returns {string}
 */
function getWeekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1..Sun=7)
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
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
};
