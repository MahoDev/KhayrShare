# Feature Specification: Video Style Formats

**Feature Branch**: `004-featurename-video-style-formats`  
**Created**: 2026-06-15  
**Status**: Draft  
**Input**: User description: "Expand the video generation system to support multiple visual formats beyond the current static-background-with-overlay style, including reciter portrait backgrounds, stock video/looping GIF backgrounds, and synchronized verse-text display — all selectable by the user and adaptable to any output resolution."

## Clarifications
### Session 2026-06-15
- Q: Format Composition (verse-display + background type) → A: Separate `--bg-type` flag (e.g. `--format verse-display --bg-type portrait`). This cleanly separates text overlay style (`--format`) from background source (`--bg-type`).
- Q: Layout Redesign → A: Redesign the text layout to align with common Quranic video patterns: large centered Arabic text, smaller verse range/surah name, reciter name at top/bottom, and a semi-transparent dark box behind text for readability across varying backgrounds.
- Q: Thumbnail Preview Text → A: Provide an interactive prompt during generation allowing the user to select/edit an initial part of the first verse to be displayed on the thumbnail.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reciter Portrait Background (Priority: P1)

The user selects a specific reciter and wants the video to use a static image of that reciter as the background, with descriptive text about the surah, verse range, and reciter name overlaid. This mirrors the most common format on popular Quranic YouTube channels where the reciter's face is the visual anchor.

The system should look up a reciter-specific portrait image from a dedicated assets directory. If no portrait exists for that reciter, the system falls back to the current random scenic background behavior and warns the user. Portrait images must look correct regardless of the target output resolution (landscape, square, or vertical) — the system crops/scales intelligently rather than stretching.

**Why this priority**: Reciter portrait backgrounds are the single most popular Quran video format on YouTube and social media. Supporting this immediately elevates the production quality and recognizability of generated content.

**Independent Test**: Run the generator with `--reciter "Mishary" --format reciter-portrait` and verify the output video uses the reciter's portrait as the background with correct text overlay, without distortion, at the default 1920×1080 resolution. Then re-run with `--platform tiktok` and verify the vertical output also looks correct.

**Acceptance Scenarios**:

1. **Given** a reciter with an available portrait image, **When** the user specifies `--format reciter-portrait`, **Then** the generated video uses that reciter's portrait as the full background, properly scaled and cropped to the output resolution.
2. **Given** a reciter with NO available portrait image, **When** the user specifies `--format reciter-portrait`, **Then** the system logs a warning, falls back to a random scenic background, and generates the video normally.
3. **Given** any portrait image, **When** the output resolution is vertical (e.g. 1080×1920), **Then** the portrait is cropped from center without stretching, and the overlay text remains fully visible.

---

### User Story 2 - Stock Video / Looping Background (Priority: P1)

The user wants the video background to be a playing stock video clip (rain, driving, nature, etc.) or a looping GIF instead of a static image. The user can provide their own stock clips by placing them in a designated directory. The system randomly selects one at generation time, or the user can specify one explicitly.

The stock clip loops seamlessly for the duration of the audio. Text overlay with surah/reciter/verse-range info is applied on top exactly as with static backgrounds.

**Why this priority**: Moving backgrounds are the second most popular Quranic video format and significantly increase viewer engagement and retention compared to static images.

**Independent Test**: Place a sample `.mp4` stock clip in the stock videos directory, then run `--format stock-video` and verify the output has a looping video background with correct text overlay and matching audio duration.

**Acceptance Scenarios**:

1. **Given** stock video clips are available in the designated directory, **When** the user specifies `--format stock-video`, **Then** a random clip is selected, looped to match the audio duration, and the text overlay is composited on top.
2. **Given** the user specifies `--format stock-video --background rain.mp4`, **When** that file exists in the stock directory, **Then** that specific clip is used.
3. **Given** no stock video clips are available, **When** the user specifies `--format stock-video`, **Then** the system throws an error with a helpful message about where to place stock video files.
4. **Given** a stock clip shorter than the audio, **When** the video is generated, **Then** the clip loops seamlessly without visible jump cuts.

---

### User Story 3 - Live Verse Text Display (Priority: P2)

The user wants the currently playing verse's Arabic text to be displayed on screen in sync with the audio, changing as each verse plays. This is the "karaoke-style" format common on Quran channels. The background can be any of the supported types (static, portrait, stock video, or GIF).

The verse text appears centered, large, and clearly readable against any background. Each verse transitions smoothly (fade or cut) as the audio progresses to the next verse.

**Why this priority**: This is a more complex format requiring per-verse timing, but it dramatically increases viewer engagement and accessibility. It builds on the background formats from US1/US2.

**Independent Test**: Generate a video with `--format verse-display` for a known surah/range and verify each verse appears on screen timed to its audio segment.

**Acceptance Scenarios**:

1. **Given** a surah and verse range with individual verse audio segments, **When** the user specifies `--format verse-display`, **Then** the video displays each verse's Arabic text in large, centered font, transitioning between verses in sync with the audio.
2. **Given** a verse-display format with a stock video background, **When** combined as `--format verse-display --background rain.mp4`, **Then** both the moving background and verse text appear correctly.
3. **Given** a verse with very long Arabic text, **When** displayed on screen, **Then** the text wraps or scales down to fit within the safe area without being cut off.

---

### User Story 4 - Format Selection via CLI (Priority: P1)

The user selects the desired video format via a `--format` CLI flag. If no format is specified, the system defaults to the current behavior (static scenic background with info overlay). Available format values include `classic` (current behavior), `reciter-portrait`, `stock-video`, and `verse-display`.

The `--format` flag composes cleanly with all existing flags (`--platform`, `--style`, `--background`, `--reciter`, `--surah`, `--range`, `--page`, etc.).

**Why this priority**: This is the integration glue that connects all new formats to the existing CLI infrastructure. Without it, no new format is usable.

**Independent Test**: Run `--help` and verify the new `--format` flag and its options are documented. Run with `--format classic` and verify identical behavior to running without a format flag.

**Acceptance Scenarios**:

1. **Given** no `--format` flag is provided, **When** the generator runs, **Then** behavior is identical to the current system (backward compatible).
2. **Given** `--format classic`, **When** the generator runs, **Then** it produces the same output as no format flag.
3. **Given** `--format reciter-portrait --platform tiktok`, **When** the generator runs, **Then** both format and platform preset are applied together correctly.
4. **Given** an invalid `--format` value, **When** the generator runs, **Then** a clear error message lists all valid format options.

---

### User Story 5 - Asset Management for New Formats (Priority: P2)

The user needs clear, organized directory structures for the new asset types: reciter portraits, stock video clips, and looping GIFs. Each asset type has its own directory with a README explaining naming conventions and recommended specifications.

Reciter portraits are mapped by reciter ID or name. Stock video clips are placed in a flat directory. The system provides `--listPortraits` and `--listStockVideos` commands to discover available assets.

**Why this priority**: Without a clear asset organization scheme, the user cannot supply the media needed for the new formats.

**Independent Test**: Run `--listPortraits` and `--listStockVideos` to see available assets and verify the output is clear and accurate.

**Acceptance Scenarios**:

1. **Given** the asset directories exist with READMEs, **When** the user checks the directory structure, **Then** naming conventions and recommended specs are clearly documented.
2. **Given** reciter portraits exist in the portraits directory, **When** the user runs `--listPortraits`, **Then** all available portraits are listed with their associated reciter names.
3. **Given** stock video clips exist in the stock directory, **When** the user runs `--listStockVideos`, **Then** all available clips are listed.

---

### User Story 6 - Text Layout Redesign & Improved Readability (Priority: P1)

The user notices that current thumbnail and video descriptive texts are poorly designed, small, and hard to read on complex backgrounds. The system redesigns the layout to match popular Quranic videos: large, centered Arabic verse text (most prominent), smaller surah/range info, and reciter name at the top or bottom. A semi-transparent dark box (or strong drop shadow/blur) is applied behind the text to ensure high contrast and readability on *any* background.

**Why this priority**: Aesthetics and readability are critical for viewer retention. If the text cannot be read, the video format is ineffective.

**Independent Test**: Generate a video with a bright or busy background and visually confirm the text is highly legible due to the new layout and dark semi-transparent backing.

**Acceptance Scenarios**:
1. **Given** any background image or video, **When** text is overlaid, **Then** a semi-transparent dark box or heavy shadow ensures the text is easily readable.
2. **Given** the standard info layout, **When** rendered, **Then** the Arabic verse text (or range) is the most prominent element, centrally aligned.

---

### User Story 7 - Interactive Thumbnail Preview Text (Priority: P2)

The user wants the thumbnail to include a short, specific snippet of the first playing verse (e.g., "إذا وقعت الواقعة..."). Because cutting off a verse arbitrarily can alter its meaning, the CLI prompts the user interactively during generation. It displays the full first verse and asks the user to either accept a default extracted snippet or paste their own custom snippet for the thumbnail.

**Why this priority**: Customizing the thumbnail text snippet is a key engagement driver for YouTube videos, but requires careful handling to respect the religious text.

**Independent Test**: Run a generation command interactively. Verify the CLI pauses, shows the first verse, and waits for input. Provide a custom snippet and verify it appears on the final thumbnail.

**Acceptance Scenarios**:
1. **Given** an interactive CLI session, **When** generating the thumbnail, **Then** the user is prompted with the full first verse and asked for the snippet to display.
2. **Given** the user provides a custom snippet, **When** the thumbnail is rendered, **Then** that exact snippet is displayed prominently.

---

### Edge Cases

- What happens when the reciter portrait image is very low resolution and the output target is 1920×1080? → System should upscale with blur/quality warning rather than produce a pixelated video.
- What happens when a stock video clip has a different aspect ratio than the target output? → System should crop from center and scale, same as static backgrounds. The user only needs to provide one high-resolution asset per reciter or stock video.
- What happens when verse-display mode is used but verse audio segments cannot be individually timed? → System falls back to distributing time evenly across verses based on total audio duration.
- What happens when `--format verse-display` is used with a specific background type? → The system uses a separate `--bg-type` flag (e.g., `--bg-type portrait` or `--bg-type stock`) to control the background source independently of the text format.
- What happens when a stock video has audio? → The stock video's audio is stripped/muted; only the Quran recitation audio is used.
- What happens if the CLI is run in a non-interactive environment (CI/CD) regarding the thumbnail prompt? → The system provides a `--thumb-text` flag to pass the snippet directly, bypassing the interactive prompt.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support a `--format` CLI flag accepting values: `classic`, `reciter-portrait`, `stock-video`, `verse-display`
- **FR-002**: System MUST default to `classic` format when no `--format` flag is provided (backward compatible)
- **FR-003**: System MUST look up reciter portrait images by reciter ID from a dedicated portraits directory
- **FR-004**: System MUST gracefully fall back to random scenic backgrounds when a reciter portrait is unavailable
- **FR-005**: System MUST scale and crop all background media (static images, portraits, videos) to match the target output resolution without distortion
- **FR-006**: System MUST loop stock video clips to match the audio duration using seamless loop techniques
- **FR-007**: System MUST strip/mute any audio from stock video clips, using only the Quran recitation audio
- **FR-008**: System MUST display each verse's Arabic text on screen synchronized with its audio segment in `verse-display` format
- **FR-009**: System MUST handle verse text wrapping or scaling for long verses to keep text within the visible safe area
- **FR-010**: System MUST provide `--listPortraits` and `--listStockVideos` discovery commands
- **FR-011**: System MUST create organized asset directories with README documentation for each new asset type
- **FR-012**: System MUST compose the `--format` flag cleanly with all existing CLI flags (`--platform`, `--style`, `--reciter`, `--surah`, `--range`, `--page`, `--background`, `--width`, `--height`)
- **FR-013**: System MUST support a `--bg-type` flag to select the background source type (e.g., `portrait`, `stock`, `classic`).
- **FR-014**: System MUST redesign the video and thumbnail text layouts to center the Arabic verse text prominently, with a semi-transparent dark backing for universal readability.
- **FR-015**: System MUST prompt the user interactively during thumbnail generation to select or provide a custom snippet of the first verse.
- **FR-016**: System MUST support a `--thumb-text` flag to bypass the interactive thumbnail prompt.

### Key Entities

- **Format**: The visual presentation style of the video (classic, reciter-portrait, stock-video, verse-display). Determines which background source and text overlay strategy are used.
- **Reciter Portrait**: A static image associated with a specific reciter, stored by reciter ID. Used as the video background in the reciter-portrait format.
- **Stock Media**: Video clips or looping GIFs provided by the user. Used as animated video backgrounds in the stock-video format.
- **Verse Segment**: An individual verse's Arabic text paired with its audio file. Used for timed display in the verse-display format.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate videos in all 4 formats (classic, reciter-portrait, stock-video, verse-display) using a single CLI flag
- **SC-002**: Generated videos look correct at all supported resolutions (landscape 1920×1080, vertical 1080×1920, square 1080×1080) without distortion or cropping artifacts
- **SC-003**: Stock video backgrounds loop seamlessly with no visible jump or flash at loop points
- **SC-004**: Verse text in verse-display mode is synchronized within 500ms accuracy of each verse's audio start
- **SC-005**: Backward compatibility is maintained — running without `--format` produces identical results to the current system
- **SC-006**: All new CLI flags are documented in `--help` output
- **SC-007**: Asset directories include README files that clearly describe naming conventions, supported file formats, and recommended specifications

## Assumptions

- The user will provide their own reciter portrait images and stock video clips — the system does not download or generate these assets automatically
- Reciter portraits only need one image per reciter — the system handles cropping for different aspect ratios from a single source image
- FFmpeg is available on the system (already a dependency for the current video generation)
- Stock video clips are provided in common formats (MP4, MOV, WebM) that FFmpeg can process
- Verse audio timing is derived from individual verse audio files that are already downloaded separately per verse (existing architecture)
- The `verse-display` format uses the individual verse audio file durations to determine timing, rather than requiring a separate timing/subtitle file
