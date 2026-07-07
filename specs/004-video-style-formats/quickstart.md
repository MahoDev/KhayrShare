# Quickstart: Testing Video Style Formats

## Directory Setup
Before testing, ensure the asset directories exist:
```bash
mkdir -p src/services/video-publisher/assets/portraits
mkdir -p src/services/video-publisher/assets/stock-videos
```

## Adding Test Assets
1. Place a `.jpg` or `.png` file named `1.jpg` (AbdulBaset reciter ID) in the `portraits` folder.
2. Place a small `.mp4` file (e.g., `rain.mp4`) in the `stock-videos` folder.

## CLI Usage Examples

**1. Classic Background (Default)**
```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3
```

**2. Reciter Portrait Background**
```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --bg-type portrait
```

**3. Stock Video Background**
```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --bg-type stock --background rain.mp4
```

**4. Live Verse Display with Stock Video**
```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --format verse-display --bg-type stock --background rain.mp4
```

**5. Non-Interactive Thumbnail Snippet**
```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --thumb-text "بسم الله"
```

**6. Asset Discovery**
```bash
node src/services/media-generator/generator.js --listPortraits
node src/services/media-generator/generator.js --listStockVideos
```
