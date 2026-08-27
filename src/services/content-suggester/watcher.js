const chokidar = require("chokidar");
const path = require("path");
const { sync } = require("./sync-content");
const { CONTENT_LIBRARY_PATH } = require("../../config");

// In the new architecture, we watch the global content library path
const IMAGES_DIR = CONTENT_LIBRARY_PATH;

// Debounce function to limit how often sync runs when multiple files are copied at once
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

const runSync = debounce(() => {
  console.log(`[${new Date().toISOString()}] Change detected in library. Running sync...`);
  try {
    sync();
  } catch (err) {
    console.error("Error during sync:", err);
  }
}, 3000); // Wait 3 seconds after last change

console.log(`Starting file watcher on ${IMAGES_DIR}...`);

const watcher = chokidar.watch(IMAGES_DIR, {
  ignored: /(^|[\/\\])\../, // ignore dotfiles
  persistent: true,
  ignoreInitial: true,
  usePolling: true,
  interval: 2000, // Check every 2 seconds instead of 1
  binaryInterval: 2000,
  awaitWriteFinish: {
    stabilityThreshold: 3000, // Wait 3s for file to be "still"
    pollInterval: 500
  }
});

watcher
  .on("add", (path) => runSync())
  .on("change", (path) => runSync())
  .on("unlink", (path) => runSync());

// Run once on start just to ensure everything is up to date
sync();
