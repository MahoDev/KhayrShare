# Feature Specification: Expand CLI

**Feature Branch**: `003-expand-cli`  
**Created**: 2026-05-31  
**Status**: Draft  
**Input**: User description: "Massively expand the CLI capabilities of the media generator to support customizable reciters, surahs, verse ranges, video sizes, platform presets, page-based verse selection, and more."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate a Video with Full Customization (Priority: P1)

As a content creator, I want to run the media generator from the command line and specify exactly which reciter, surah, and verse range to use, so I can produce a specific video on demand without relying on randomization.

**Why this priority**: This is the core value proposition — giving the operator precise control over every parameter of the generated video, replacing the current "random-only" default behavior while preserving it as a fallback.

**Independent Test**: Can be fully tested by running the CLI with explicit `--reciter`, `--surah`, and `--range` flags and verifying the output video matches the requested content.

**Acceptance Scenarios**:

1. **Given** a valid reciter name/ID, surah number, and verse range, **When** the user runs the generator with `--reciter "مشاري العفاسي" --surah 36 --range 1-12`, **Then** the system produces a video with those exact parameters and exits successfully.
2. **Given** no flags are provided, **When** the user runs the generator with no arguments, **Then** the system falls back to fully random selection (random reciter, random surah/ruku, random background) — identical to today's behavior.
3. **Given** only a reciter is specified, **When** the user runs `--reciter 7`, **Then** the system uses that reciter with a random surah/verse selection.
4. **Given** only a surah is specified without a range, **When** the user runs `--surah 112`, **Then** the system generates a video for a random verse range (or the full surah if short enough) from that surah.

---

### User Story 2 - Use Platform Presets for Video Dimensions (Priority: P1)

As a content creator expanding to multiple social media platforms, I want to select a target platform (e.g., TikTok, Instagram Reels, YouTube, X/Twitter) and have the video automatically generated at the correct resolution and aspect ratio, so I don't have to remember platform-specific dimensions.

**Why this priority**: Platform-optimized video sizes are essential for multi-platform distribution and directly enable the project's expansion goals.

**Independent Test**: Can be tested by running the generator with `--platform tiktok` and verifying the output video has 1080×1920 resolution.

**Acceptance Scenarios**:

1. **Given** the user specifies `--platform tiktok`, **When** the video is generated, **Then** the output is a vertical video at 1080×1920 pixels (9:16 aspect ratio).
2. **Given** the user specifies `--platform youtube`, **When** the video is generated, **Then** the output is a landscape video at 1920×1080 pixels (16:9 aspect ratio).
3. **Given** the user specifies `--platform instagram-reels`, **When** the video is generated, **Then** the output is a vertical video at 1080×1920 pixels.
4. **Given** the user specifies `--platform instagram-post`, **When** the video is generated, **Then** the output is a square video at 1080×1080 pixels.
5. **Given** the user specifies `--platform x`, **When** the video is generated, **Then** the output uses the square (1080×1080) format.
6. **Given** no platform is specified, **When** the video is generated, **Then** the system uses the current default (youtube/landscape 1920×1080).

---

### User Story 3 - Specify a Quran Page Instead of Verse Range (Priority: P2)

As a content creator, I want to specify a page number from the Quran (Mushaf) instead of manually looking up surah and verse ranges, so I can quickly generate content for a specific page I'm looking at.

**Why this priority**: This is a significant convenience feature that saves time and reduces errors — a Quran page maps to specific surah(s) and verse ranges, and looking this up manually is tedious.

**Independent Test**: Can be tested by running `--page 283` and verifying the output video contains the correct surah and verse range corresponding to that page in the standard Madani Mushaf.

**Acceptance Scenarios**:

1. **Given** a valid Quran page number (1–604), **When** the user runs `--page 283`, **Then** the system resolves the page to the correct surah and verse range and generates the video.
2. **Given** a page that spans two surahs, **When** the user runs `--page N` for such a page, **Then** the system generates the video using the verses from the primary surah on that page (the surah with the most verses on the page).
3. **Given** an invalid page number (e.g., 0, 605, or non-numeric), **When** the user runs `--page 700`, **Then** the system displays a clear error message and exits.

---

### User Story 4 - Choose or Randomize Background (Priority: P2)

As a content creator, I want to pick a specific background image or let it be randomized from the available backgrounds, so I can control the visual aesthetics of the video.

**Why this priority**: Backgrounds are a key visual component; providing control improves content variety and brand consistency.

**Independent Test**: Can be tested by running `--background bg1.jpg` and verifying the output video uses that specific background.

**Acceptance Scenarios**:

1. **Given** the user specifies `--background bg1.jpg`, **When** the video is generated, **Then** the system uses that specific background file.
2. **Given** the user specifies `--listBackgrounds`, **When** the command runs, **Then** the system lists all available background image filenames and exits.
3. **Given** no background is specified, **When** the video is generated, **Then** the system randomly selects a background from the available pool (current behavior).
4. **Given** an invalid background filename, **When** the user runs `--background nonexistent.jpg`, **Then** the system displays a clear error and exits.

---

### User Story 5 - Select Video Style (Priority: P2)

As a content creator, I want to explicitly choose between the available video styles (e.g., landscape/YouTube style vs. square/X style), so I can control the visual layout beyond just resolution.

**Why this priority**: The system already has two distinct styles with different text rendering and layouts. Exposing this as a CLI option unlocks deliberate style selection.

**Independent Test**: Can be tested by running `--style youtube` or `--style x` and verifying the output uses the corresponding layout and typography.

**Acceptance Scenarios**:

1. **Given** the user specifies `--style youtube`, **When** the video is generated, **Then** the system uses the YouTube/landscape video layout with its typography settings.
2. **Given** the user specifies `--style x`, **When** the video is generated, **Then** the system uses the square X-poster layout with its typography settings.
3. **Given** no style is specified, **When** the video is generated, **Then** the system uses the default from config (currently YouTube style).
4. **Given** `--platform` and `--style` are both specified, **When** the video is generated, **Then** `--platform` determines the resolution and `--style` determines the layout/typography. If they conflict (e.g., `--platform tiktok --style youtube`), the platform's resolution takes priority.

---

### User Story 6 - Custom Resolution Override (Priority: P3)

As a power user, I want to specify an exact custom resolution (e.g., `--width 1440 --height 2560`), so I can produce videos at non-standard sizes when no platform preset fits.

**Why this priority**: This is a power-user escape hatch for edge cases, while platform presets cover 95% of use cases.

**Independent Test**: Can be tested by running `--width 1440 --height 2560` and verifying the output video dimensions.

**Acceptance Scenarios**:

1. **Given** the user specifies `--width 1440 --height 2560`, **When** the video is generated, **Then** the output is at that exact resolution.
2. **Given** `--platform` and `--width`/`--height` are both specified, **When** the video is generated, **Then** the explicit width/height overrides the platform preset's resolution.
3. **Given** only width or only height is provided, **When** the user runs `--width 1440` alone, **Then** the system displays an error stating both dimensions are required.

---

### User Story 7 - Comprehensive Help and Discovery (Priority: P3)

As a user, I want to see a complete help message that documents all available flags, platform presets, styles, and examples, so I can discover and use the CLI without reading source code.

**Why this priority**: Discoverability is essential for usability — the current CLI has almost no help output.

**Independent Test**: Can be tested by running `--help` and verifying the output includes all flags, preset descriptions, and usage examples.

**Acceptance Scenarios**:

1. **Given** the user runs `--help`, **When** the help output is displayed, **Then** it includes every available flag with a short description, supported platform names, supported styles, and at least 3 usage examples.
2. **Given** the user runs with an unknown flag (e.g., `--foo`), **When** the CLI parses arguments, **Then** it displays an error for the unrecognized flag and suggests using `--help`.

---

### User Story 8 - Dry Run / Preview Mode (Priority: P3)

As a content creator, I want to preview what content would be selected without actually generating the video, so I can verify the parameters before committing to a full render.

**Why this priority**: Video generation is time-consuming (encoding + rendering); a dry-run mode saves time when experimenting with parameters.

**Independent Test**: Can be tested by running `--dry-run --surah 2 --range 255-256 --reciter 7` and verifying the output shows the resolved parameters without generating any files.

**Acceptance Scenarios**:

1. **Given** the user runs with `--dry-run`, **When** the system resolves all parameters, **Then** it prints the selected reciter, surah, verse range, style, resolution, and background — but does not download audio, render frames, or produce any video output.
2. **Given** a random generation with `--dry-run`, **When** the system runs, **Then** it shows what random selections would have been made.

---

### Edge Cases

- What happens when the user specifies a verse range that exceeds the surah's total verses? → The system clamps to the maximum verse in that surah and warns the user.
- What happens when `--page` and `--surah`/`--range` are both specified? → `--page` takes precedence and overrides surah/range. A warning is displayed.
- What happens when the specified reciter does not have audio for the requested surah? → The system falls back to a random reciter that does, with a warning message.
- What happens when no backgrounds are found in the backgrounds directory? → The system exits with a clear error (current behavior preserved).
- What happens when required video processing tools are not installed? → The system detects this early and provides a clear error with installation guidance.
- What happens with very long verse ranges that would produce extremely long videos? → The system warns if the estimated duration exceeds a configurable threshold (e.g., 10 minutes) and asks for confirmation, or proceeds if `--force` is used.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST accept `--reciter` (or `-r`) with a reciter name or ID to select a specific reciter. If omitted, a random reciter is selected.
- **FR-002**: System MUST accept `--surah` (or `-s`) with a surah number (1–114) to select a specific surah. If omitted, a random surah/ruku is selected.
- **FR-003**: System MUST accept `--range` with a verse range (e.g., `1-10` or `5`) to specify which verses to include. If omitted with a surah, a random chunk is selected.
- **FR-004**: System MUST accept `--page` (or `-p`) with a Quran page number (1–604) and resolve it to the corresponding surah and verse range using the standard Madani Mushaf page mapping.
- **FR-005**: System MUST accept `--platform` with a platform name (youtube, tiktok, instagram-reels, instagram-post, x, facebook) and apply the correct video dimensions automatically.
- **FR-006**: System MUST accept `--style` with a style name (youtube, x) to select the video visual layout independently of resolution.
- **FR-007**: System MUST accept `--background` (or `-b`) with a filename to select a specific background image.
- **FR-008**: System MUST accept `--width` and `--height` together for custom resolution overrides.
- **FR-009**: System MUST accept `--dry-run` to preview resolved parameters without generating video.
- **FR-010**: System MUST accept `--help` (or `-h`) to display comprehensive usage documentation.
- **FR-011**: System MUST accept `--listReciters` to display all available reciters (preserving existing behavior).
- **FR-012**: System MUST accept `--listBackgrounds` to display all available background images.
- **FR-013**: System MUST maintain full backward compatibility — running with no arguments produces the same random behavior as today.
- **FR-014**: System MUST validate all inputs and provide clear, actionable error messages for invalid values (invalid surah numbers, unknown reciters, out-of-range pages, etc.).
- **FR-015**: System MUST support combining flags freely (e.g., `--reciter 7 --platform tiktok --surah 36 --range 1-12`), with sensible precedence rules documented in `--help`.
- **FR-016**: System MUST warn users when the selected verse range exceeds a configurable maximum duration threshold.
- **FR-017**: System MUST accept `--force` to bypass interactive confirmations (e.g., long duration warnings).

### Key Entities

- **Platform Preset**: Represents a target distribution platform with its associated video dimensions (width, height), aspect ratio label, and any platform-specific optimal parameters (e.g., recommended max duration).
- **Video Style**: Represents a visual layout template (typography, text positioning, overlay configuration) independent of resolution. Currently two styles exist: "youtube" (landscape text layout) and "x" (square text layout).
- **Quran Page Mapping**: A data structure that maps each Mushaf page (1–604) to its corresponding surah number(s) and verse range(s) based on the standard Madani Mushaf.
- **CLI Configuration**: The set of all resolved parameters (reciter, surah, range, style, resolution, background) after parsing flags, applying defaults, and resolving presets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate a fully customized video (specific reciter, surah, verse range, platform, style, and background) with a single command, completing in under 3 minutes for an average-length passage.
- **SC-002**: All previously supported CLI functionality (no-argument random generation, `--listReciters`, `--reciter`/`-r`) continues to work identically.
- **SC-003**: The `--help` output fully documents every flag, every supported platform preset, every supported style, and provides at least 3 example commands.
- **SC-004**: Page-to-verse resolution is accurate for all 604 pages of the standard Madani Mushaf.
- **SC-005**: Invalid inputs (bad surah number, unknown reciter, invalid page, incomplete custom resolution) produce clear error messages that include the valid range or suggestions.
- **SC-006**: Videos generated with `--platform tiktok` or `--platform instagram-reels` are correctly sized at 1080×1920 pixels; `--platform youtube` at 1920×1080; `--platform instagram-post` or `--platform x` at 1080×1080.
- **SC-007**: Dry-run mode completes in under 5 seconds without producing any output files or downloading any audio.

## Assumptions

- The standard Madani Mushaf page mapping (604 pages) is the correct reference for the `--page` feature. A page-to-verse mapping data source will be sourced or created.
- The existing two video styles ("youtube" and "x") are sufficient for initial release; additional styles can be added later.
- Required media processing tools are already installed on the host system (the current system already depends on them).
- The existing reciter catalog and background image library remain the authoritative source for available reciters and backgrounds.
- The current content-fetching capabilities are sufficient to support all new input combinations without requiring major rework.
- Platform presets are a convenience layer on top of resolution — they do not change the video encoding quality or format.
