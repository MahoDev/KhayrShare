# Feature Specification: Integrate & Refactor Recovered Media Pipeline Files

**Feature Branch**: `002-integrate-recovered-files`
**Created**: 2026-04-30
**Status**: Draft
**Input**: User description: "The recovered-files that I have temporarily retrieved from the old git repo and added here were in the project before the refactor. They were important. However, like the project, they likely need a lot of refactoring and improvement (without wiping data like links). It's very important that things are built in a way that is easy to build upon and add new features."

## Clarifications

### Session 2026-04-30
- Q: Cleanup of `recovered-files/` directory → A: Delete the directory entirely from the file system.
- Q: Handling the `canvas` dependency → A: Add `canvas` as an `optionalDependency` to prevent installation failure on Windows.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Restore Media Generator Functionality (Priority: P1) 🎯 MVP

The operator wants to run the media-generator service and have it successfully produce a Quran video. Right now, the service crashes on startup because the files it depends on (`content-fetcher.js`, `text-renderer.js`, `reciters.json`) were lost during the refactor. This user story restores end-to-end video generation by placing the recovered files into their correct locations within the `src/services/` structure and updating all path references to reflect the new layout.

**Why this priority**: Without this, the media-generator is completely non-functional. Everything else depends on it running.

**Independent Test**: Run `npm run start:media-generator` and confirm it completes a full cycle — fetching Quran content, downloading audio, rendering a frame, and producing a video file at the configured `OUTPUT_PATH` — without crashing.

**Acceptance Scenarios**:

1. **Given** the service dependencies are in place, **When** `npm run start:media-generator` is executed, **Then** the scheduler starts, attempts a generation tick, and a `.mp4` file appears in `OUTPUT_PATH`.
2. **Given** a network outage occurs during audio download, **When** the fetcher retries the download, **Then** it retries up to 3 times with exponential backoff before failing gracefully with a logged error (no crash).
3. **Given** `content-fetcher.js` is configured with `reciters.json`, **When** the service selects a reciter, **Then** it always picks one not in the `excludedReciters` list.
4. **Given** the `media-generator/config.json` paths section, **When** the generator loads dependencies, **Then** it resolves all paths relative to the new `src/services/` structure (no references to deleted `x_poster/` or `youtube_poster/` directories).

---

### User Story 2 - Restore Content Suggester Group Matching (Priority: P1)

The operator wants the content-suggester service to correctly suggest content for the right Facebook group. The real group database (previously in `facebook_poster/config.json`) has been recovered. This user story restores that data as the authoritative source for the content-suggester, replacing the placeholder config that was created during the previous model's recovery attempt.

**Why this priority**: The content-suggester is the other core service. Without the real group data, every suggestion will silently point to placeholder dummy URLs.

**Independent Test**: Run `npm run start:content-suggester` and inspect the generated `next_post.txt` in `OUTPUT_PATH`. Confirm it contains a real group URL from the recovered data (not `example1` or `example2`).

**Acceptance Scenarios**:

1. **Given** the real group data is in place, **When** the suggester runs a tick, **Then** the suggestion's `group.url` is one of the real Facebook group URLs from the recovered `config.json`.
2. **Given** the suggester selects a `quran` category group, **When** it looks for matching content, **Then** it only suggests images from the `quran` category in `content.json`.
3. **Given** a group was already posted to today, **When** the suggester selects next group, **Then** that group is excluded from selection for the rest of the day.

---

### User Story 3 - Refactor for Extensibility (Priority: P2)

A developer (or future AI agent) wants to understand and extend the media pipeline without getting lost in tangled cross-service paths and legacy naming. This user story cleans up the integration points so each service is self-contained and clear: shared Quran-fetching logic lives under a shared utility path, hardcoded `../youtube_poster/` references inside `generator.js` are updated, and the `reciters.json` data format is documented and consistent.

**Why this priority**: Essential for long-term maintainability and the stated goal of being "easy to build upon." Does not block P1 stories.

**Independent Test**: A developer can add a new reciter to `reciters.json` or a new Facebook group to the content-suggester config and have it immediately picked up on the next run — with no code changes required.

**Acceptance Scenarios**:

1. **Given** `generator.js` has hardcoded `../youtube_poster/` paths on lines 167, 185, 225, 237, 242, **When** those paths are updated, **Then** the file contains zero references to any deleted directory (`youtube_poster`, `x_poster`, `facebook_poster`).
2. **Given** a new entry is added to `reciters.json` with a valid `bitrate` mapping, **When** the media-generator runs, **Then** it may select the new reciter (and respects `excludedReciters`).
3. **Given** `content-fetcher.js` and `text-renderer.js` are placed in `src/services/media-generator/`, **When** any other file needs to import them, **Then** the import path is a clean relative path within `src/services/`.
4. **Given** the old `src/services/media-generator/ecosystem.config.js` has a stale `cwd: "./video_generator_service"`, **When** a developer looks at the service, **Then** that file is either removed or corrected to avoid confusion.

---

### User Story 4 - Preserve All Group & Reciter Data Intact (Priority: P1)

The operator's recovered files contain years of curated data: ~200 real Facebook group URLs organized by category (hadith, religious_mix, quran_only, dua, englishGroups, muallim, video), and 43 reciters with bitrate folders, hashtags, and category metadata. This story ensures none of that data is lost or altered during integration — only the structure around it improves.

**Why this priority**: This is explicitly called out as a hard constraint: "without wiping data like links."

**Independent Test**: After integration, run a diff or checksum comparison between the group URLs in `recovered-files/config.json` and those in the final `src/services/content-suggester/config.json`. All URLs must be present and unchanged.

**Acceptance Scenarios**:

1. **Given** the recovered `config.json` contains group entries across 7 category keys (hadith, religious_mix, quran_only, dua, englishGroups, muallim, video), **When** the file is migrated into the project, **Then** all 7 categories and every group URL within them are preserved verbatim.
2. **Given** the recovered `reciters.json` contains 43 reciter entries (IDs 1–43, excluding 36), **When** it is placed in its final location, **Then** all 43 entries with their `name`, `hashtag_name`, `bitrate`, `category`, and `includeGeneralGroups` fields are preserved.
3. **Given** the `forReciter` matching strings in `config.json` (e.g., `"عبد الباسط"`, `"ياسر الدوسري"`) are used by `generator.js` for Arabic name matching, **When** the config is migrated, **Then** those strings remain in the same format (Arabic, no normalization applied).

---

### Edge Cases

- What happens when the `reciters.json` path in `media-generator/config.json` points to `english-rectier-names.json` (a simple `{id: name}` map) instead of the full reciters database? The `ContentFetcher` class calls `reciter.bitrate` on the result — it will crash with `TypeError: Cannot read properties of undefined`. The fix must ensure the correct full `reciters.json` is used.
- What happens when a `FULL_RUKU` fetch returns more than `maxVersesPerChunk` (default 10)? The chunking logic in `content-fetcher.js` silently splits it — this must continue to work correctly after the file is moved.
- What happens when `global_assets/quranKFGQPC-data.js` is not found? The `loadQuranData()` method tries two path variants; ensure both still resolve correctly after file relocation.
- What happens when `text-renderer.js` tries to load fonts from `../global_assets/fonts/`? After moving to `src/services/media-generator/`, the relative `..` would resolve to `src/services/` which does not contain `global_assets`. The path must be updated to `../../global_assets/fonts/` or use an absolute resolution.
- What happens when both services are running via PM2 and a generation tick overlaps with a suggestion tick? Each service writes to different output paths, so there should be no conflict — but this should be verified.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `ContentFetcher` class MUST be placed at `src/services/media-generator/content-fetcher.js` and all other files that import it MUST use that path.
- **FR-002**: The `TextRenderer` class MUST be placed at `src/services/media-generator/text-renderer.js` with all relative asset paths corrected for its new location (`../../global_assets/` for fonts and images).
- **FR-003**: The full `reciters.json` database (43 reciters with `bitrate`, `hashtag_name`, `category`, `includeGeneralGroups`) MUST be placed at `global_assets/reciters.json` (as a shared global asset) and referenced from there.
- **FR-004**: The `src/services/media-generator/config.json` `paths.recitersJson` value MUST point to the full reciters database, not the simplified English-name map.
- **FR-005**: All hardcoded `../youtube_poster/` and `../x_poster/` path references inside `generator.js` and `createSuggestionFile()` MUST be replaced with correct paths pointing to `../video-publisher/` or `../../global_assets/`.
- **FR-006**: The real Facebook group data from `recovered-files/config.json` MUST be placed in `src/services/content-suggester/config.json`, replacing the placeholder groups — while preserving the existing `settings`, `taxonomy`, and `checkIntervalMinutes` values from the current file.
- **FR-007**: The `media-generator/config.json` `paths.facebookConfig` MUST point to `../content-suggester/config.json` (already set correctly).
- **FR-008**: The stale `src/services/media-generator/ecosystem.config.js` (with `cwd: "./video_generator_service"`) MUST be removed or replaced by the root-level `ecosystem.config.js`.
- **FR-009**: The `text-renderer.js` background image source MUST be updated to use `global_assets/images/` (which contains `background_1.png` and `background_2.png`) rather than any deleted local path.
- **FR-010**: The `recovered-files/` directory MUST be permanently deleted from the file system after integration is complete so it does not become a permanent part of the codebase.

### Key Entities *(include if feature involves data)*

- **Reciter**: Represents a Quran reciter. Key attributes: numeric ID, Arabic `name`, `hashtag_name`, `bitrate` map (quality → everyayah.com folder name), optional `category` (e.g., `"muallim"`), optional `includeGeneralGroups` boolean.
- **Facebook Group**: Represents a target posting destination. Key attributes: `name`, `url` (permanent, must not be altered), `categories` array (for content matching), optional `forReciter` (Arabic name string or array) for video group matching.
- **Content Item**: An image in the content library with `image` (relative path), `caption`, `allowedDays`, and `categories` — lives in `content.json` at `OUTPUT_PATH`.
- **Suggestion**: A generated posting recommendation written to `next_post.txt` at `OUTPUT_PATH`, referencing a matched group URL and content item.
- **Video**: A generated `.mp4` file produced by the media-generator, written to `OUTPUT_PATH`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running `npm run start:media-generator` completes a generation cycle without any unhandled exceptions or missing-file errors.
- **SC-002**: Running `npm run start:content-suggester` produces a `next_post.txt` in `OUTPUT_PATH` containing a real group URL (not a placeholder), within the first run.
- **SC-003**: Zero references to `x_poster/`, `youtube_poster/`, or `facebook_poster/` remain anywhere in `.js` or `.json` source files under `src/`.
- **SC-004**: All 7 group category buckets from the recovered config are present in the integrated `content-suggester/config.json`, with every URL intact.
- **SC-005**: The `recovered-files/` directory is no longer present in the repository root after integration.
- **SC-006**: A developer can add a new reciter entry to `global_assets/reciters.json` and it is picked up on the next media-generator run without any code changes.
- **SC-007**: Both services (`khayr-suggester` and `khayr-media-gen`) start cleanly via `pm2 start ecosystem.config.js` from the project root.

## Assumptions

- The `axios` dependency used by `content-fetcher.js` is not in the root `package.json` and will need to be added.
- The `canvas` package used by `text-renderer.js` MUST be added to the root `package.json` as an `optionalDependency` to ensure `npm install` doesn't fail if the environment lacks build tools for native bindings.
- The `text-renderer.js` (square format) is only used when `videoMode.useXPosterStyle` is `true` in `media-generator/config.json`. Currently that is set to `false`, so `text-renderer.js` is not on the critical path for basic operation — but it must still be correctly placed for when it is eventually enabled.
- The `global_assets/video_backgrounds/` directory (confirmed to have images) is the correct background source for the YouTube-style landscape video generator, which is what `generator.js` passes to `video-publisher/video-generator.js`.
- The content-suggester's `config.json` has both `groups` (for the manual assistant) and `settings`/`taxonomy` (for the scheduler). The merged file should keep the `settings` and `taxonomy` from the current file and replace only the `groups` section with the real data.
- The `special-verses.json` file referenced in `content-fetcher.js` is not required for basic functionality (the code gracefully falls back to random Ruku if it's missing). Its creation is out of scope for this feature.
- The `recovered-files/config.json` uses a nested `groups` object keyed by category (e.g., `groups.hadith`, `groups.video`), while the content-suggester's `manual-assistant.js` reads `config.groups` and flattens it with `Object.values(config.groups).flat()`. This format is compatible and should be preserved as-is.
