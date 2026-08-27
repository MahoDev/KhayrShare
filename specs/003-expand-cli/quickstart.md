# Quickstart: Expand CLI

This feature will be implemented natively within the existing Node.js application, so no new external infrastructure or setup scripts are required. 

Once the implementation is complete, the CLI will support advanced usage patterns natively.

## Example Usage Scenarios

**1. Generate a vertical video for TikTok from a specific surah and reciter:**
```bash
node src/services/media-generator/generator.js --platform tiktok --surah 36 --range 1-10 --reciter "Mishary"
```

**2. Generate a square video for an entire specific page of the Quran:**
```bash
node src/services/media-generator/generator.js --platform instagram-post --page 283
```

**3. Preview what would be generated without rendering:**
```bash
node src/services/media-generator/generator.js --dry-run
```

**4. Generate exactly as before (random everything):**
```bash
node src/services/media-generator/generator.js
```

**5. See all available options and examples:**
```bash
node src/services/media-generator/generator.js --help
```

## Running Tests

You can verify the CLI flag parsing logic using the standard testing command once tests are added:
```bash
npm test
```
