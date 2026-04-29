const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');

let config = {};

try {
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(rawData);
  } else {
    // If config.json doesn't exist, we might be in a fresh setup.
    // We'll proceed but validation will catch missing required fields.
  }
} catch (error) {
  console.error('Error reading or parsing config.json:', error.message);
  process.exit(1);
}

const requiredFields = ['CONTENT_LIBRARY_PATH', 'OUTPUT_PATH'];
const missingFields = requiredFields.filter(field => !config[field]);

if (missingFields.length > 0) {
  console.error(`FATAL: Missing required configuration fields in config.json: ${missingFields.join(', ')}`);
  console.error('Please refer to src/config/config.example.json for the required structure.');
  process.exit(1);
}

module.exports = {
  CONTENT_LIBRARY_PATH: config.CONTENT_LIBRARY_PATH,
  OUTPUT_PATH: config.OUTPUT_PATH,
  LOG_LEVEL: config.LOG_LEVEL || 'info',
  config // Export full config for flexibility
};
