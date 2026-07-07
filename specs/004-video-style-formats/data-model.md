# Data Model & State Transitions: Video Style Formats

## 1. Augmented Metadata Entities

The core data passing through the system is the `rukuData` (metadata). It will be expanded to support verse timings and the custom thumbnail text.

### `VerseSegment` (New structure implicitly added to `rukuData.verses`)
- `id`: number (Verse ID)
- `verse_key`: string (e.g., "1:1")
- `text_uthmani`: string (Arabic text)
- `audio_url`: string (URL to download)
- `duration_ms`: number (Calculated duration of the audio segment)
- `start_time_ms`: number (Calculated start time in the stitched audio)

### `RukuData` (Updated)
- `reciterName`, `surahName`, `range`, `verses` (Existing)
- **`thumbSnippet`** (New): `string` - The user-approved snippet of the first verse to overlay on the thumbnail.
- **`format`** (New): `string` - The selected text presentation format (`classic`, `reciter-portrait`, `stock-video`, `verse-display`).
- **`bgType`** (New): `string` - The background source type (`classic`, `portrait`, `stock`).

## 2. CLI Arguments State
The resolved CLI arguments in `generator.js` (`resolveCliConfig`) will include new fields:
- `format`: `string`
- `bgType`: `string`
- `thumbText`: `string`
- `listPortraits`: `boolean`
- `listStockVideos`: `boolean`

## 3. Directory Structures (Assets)
- `src/services/video-publisher/assets/portraits/`
  - Mapping: `{reciterId}.jpg` (e.g., `1.jpg` for AbdulBaset)
- `src/services/video-publisher/assets/stock-videos/`
  - Flat folder of `.mp4`, `.mov`, `.webm` files.

## 4. State Transitions (Generation Flow)
1. **Initialize**: CLI parsed -> format, bgType, and thumbText determined.
2. **Interactive Prompt**: If thumbnail is needed and `--thumb-text` not provided -> pause generation -> prompt user -> store in `rukuData.thumbSnippet`.
3. **Audio Processing**: `ContentFetcher` downloads verses -> calculates duration using `ffprobe` or file size heuristics -> stitches audio -> returns `audioPath` and populates `verseTimings` in `rukuData`.
4. **Video Rendering**: `VideoGenerator` reads `format` and `bgType` -> selects appropriate FFmpeg filters (looping for stock, verse-display dynamic SVG/drawtext) -> exports `.mp4`.
