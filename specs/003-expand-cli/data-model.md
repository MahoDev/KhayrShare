# Data Model: Expand CLI

## Core Entities

### 1. CLI Configuration

Represents the parsed and resolved user intent from command-line arguments.

**Fields**:
- `reciterId` (Number | null): The specific reciter ID requested.
- `surahId` (Number | null): The specific surah number requested.
- `startVerse` (Number | null): The start verse number.
- `endVerse` (Number | null): The end verse number.
- `page` (Number | null): The specific Quran page requested.
- `platform` (String | null): Target platform preset (e.g., "tiktok", "youtube").
- `style` (String | null): Visual layout style (e.g., "youtube", "x").
- `width` (Number | null): Custom video width.
- `height` (Number | null): Custom video height.
- `background` (String | null): Specific background filename.
- `dryRun` (Boolean): If true, skip video generation.
- `isRandom` (Boolean): Whether the content generation relies on fully random selection.

### 2. Platform Preset

Maps a platform identifier to its optimal resolution and layout style.

**Fields**:
- `platformId` (String): e.g., "tiktok", "youtube", "instagram-reels", "instagram-post", "x", "facebook"
- `width` (Number): Resolution width in pixels.
- `height` (Number): Resolution height in pixels.
- `defaultStyle` (String): The fallback style (e.g., "youtube" or "x") to use if not explicitly provided.

### 3. Quran Page Mapping

Maps a page number to the surah and verse bounds for that page in the Madani Mushaf.

**Fields**:
- `pageNumber` (Number): 1 through 604
- `surahId` (Number): Primary surah number on this page
- `startVerse` (Number): Starting verse on this page
- `endVerse` (Number): Ending verse on this page

*(Note: Some pages span multiple surahs; the primary mapping simplifies this to the dominant surah on the page, or the first one, for video generation purposes).*

## Relationships and Data Flow

1. The user runs `node generator.js [options]`.
2. `parseCliArgs` parses raw args into the **CLI Configuration** object.
3. If `--page` is provided, a lookup is made into the **Quran Page Mapping** to populate `surahId`, `startVerse`, and `endVerse`, overriding any manual values.
4. If `--platform` is provided, a lookup into **Platform Preset** sets `width`, `height`, and a default `style`.
5. Explicit `--width`, `--height`, and `--style` flags override the values from the platform preset.
6. The resolved configuration is passed down to `VideoGenerator` and `ContentFetcher` to constrain selection and set final video dimensions/layout.
