const fs = require('fs');
const path = require('path');

// Try to load the new config
const configPath = path.resolve(__dirname, '../src/config/config.json');
if (!fs.existsSync(configPath)) {
  console.error('ERROR: src/config/config.json not found. Please create it first (see config.example.json).');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const { CONTENT_LIBRARY_PATH, OUTPUT_PATH } = config;

if (!CONTENT_LIBRARY_PATH || !OUTPUT_PATH) {
  console.error('ERROR: CONTENT_LIBRARY_PATH or OUTPUT_PATH missing in config.json');
  process.exit(1);
}

const legacyBase = path.resolve(__dirname, '../facebook_poster');

const migrations = [
  { from: 'images', to: CONTENT_LIBRARY_PATH, isDir: true },
  { from: 'suggestions', to: OUTPUT_PATH, isDir: true },
  { from: 'content.json', to: path.join(OUTPUT_PATH, 'content.json'), isDir: false },
  { from: 'history.json', to: path.join(OUTPUT_PATH, 'history.json'), isDir: false },
  { from: 'group_usage.json', to: path.join(OUTPUT_PATH, 'group_usage.json'), isDir: false }
];

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

console.log('Starting data migration...');

migrations.forEach(m => {
  const srcPath = path.join(legacyBase, m.from);
  if (fs.existsSync(srcPath)) {
    console.log(`Migrating ${m.from} to ${m.to}...`);
    if (m.isDir) {
      copyRecursiveSync(srcPath, m.to);
    } else {
      const destDir = path.dirname(m.to);
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      fs.copyFileSync(srcPath, m.to);
    }
  } else {
    console.warn(`Warning: Source path ${srcPath} does not exist, skipping.`);
  }
});

console.log('Migration complete!');
