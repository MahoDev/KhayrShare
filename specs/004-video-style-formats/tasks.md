# Tasks: Video Style Formats

**Input**: Design documents from `/specs/004-video-style-formats/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 [P] Create `src/services/video-publisher/assets/portraits/` directory and `README.md`
- [x] T002 [P] Create `src/services/video-publisher/assets/stock-videos/` directory and `README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

- [x] T003 Update `data` entities: Update `rukuData` usage in `src/services/media-generator/generator.js` to prepare for new fields (`format`, `bgType`, `thumbSnippet`)

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 4 - Format Selection via CLI (Priority: P1) 🎯 MVP

**Goal**: Support `--format`, `--bg-type`, `--thumb-text`, `--listPortraits`, and `--listStockVideos` CLI flags.

**Independent Test**: Run `node src/services/media-generator/generator.js --help` and verify new flags. Run with `--listPortraits` and verify it lists assets.

### Implementation for User Story 4

- [x] T004 [US4] Update `parseCliArgs` and `resolveCliConfig` in `src/services/media-generator/generator.js` to parse `--format`, `--bg-type`, `--thumb-text`, `--listPortraits`, `--listStockVideos`
- [x] T005 [US4] Implement logic in `src/services/media-generator/generator.js` to handle `--listPortraits` and `--listStockVideos` execution

**Checkpoint**: CLI parsing handles new inputs correctly.

---

## Phase 4: User Story 6 - Text Layout Redesign & Improved Readability (Priority: P1)

**Goal**: Redesign thumbnail and video text layouts for centered Arabic text with dark background for universal readability.

**Independent Test**: Generate a standard classic video and confirm the text layout has changed to the new centered, dark-backed format.

### Implementation for User Story 6

- [x] T006 [P] [US6] Modify `createTextOverlayImage` SVG layout in `src/services/video-publisher/video-generator.js` (large centered verse, semi-transparent dark box)
- [x] T007 [P] [US6] Modify SVG layout in `src/services/video-publisher/thumbnail-generator.js` to match the new readable design

**Checkpoint**: Video and thumbnails use the new layout.

---

## Phase 5: User Story 1 - Reciter Portrait Background (Priority: P1)

**Goal**: Allow using a reciter's portrait as the video background, scaled properly.

**Independent Test**: Run with `--bg-type portrait` and confirm a portrait background is used.

### Implementation for User Story 1

- [x] T008 [US1] Update `generateYouTubeVideo` in `src/services/media-generator/generator.js` to resolve portrait background path when `--bg-type portrait` is specified
- [x] T009 [US1] Update `createVideo` in `src/services/video-publisher/video-generator.js` to correctly scale/crop image backgrounds without stretching

**Checkpoint**: Portrait backgrounds work correctly.

---

## Phase 6: User Story 2 - Stock Video / Looping Background (Priority: P1)

**Goal**: Allow using a looping stock video/GIF as the video background.

**Independent Test**: Run with `--bg-type stock` and confirm the video loops and audio matches perfectly.

### Implementation for User Story 2

- [x] T010 [US2] Update `generateYouTubeVideo` in `src/services/media-generator/generator.js` to resolve stock video path when `--bg-type stock` is specified
- [x] T011 [US2] Modify `createVideo` FFmpeg command in `src/services/video-publisher/video-generator.js` to apply `-stream_loop -1` and `-shortest` for stock video backgrounds

**Checkpoint**: Looping stock videos work flawlessly.

---

## Phase 7: User Story 3 - Live Verse Text Display (Priority: P2)

**Goal**: Sync verse Arabic text on-screen with the audio in `verse-display` format.

**Independent Test**: Run with `--format verse-display` and verify text updates in sync with verses.

### Implementation for User Story 3

- [x] T012 [P] [US3] Update `processAudio` in `src/services/media-generator/content-fetcher.js` to calculate and return verse timings (duration and start time) within `rukuData`
- [x] T013 [US3] Update `createVideo` in `src/services/video-publisher/video-generator.js` to handle `--format verse-display` by generating dynamic overlays (using FFmpeg `drawtext` or sequential SVG overlays)

**Checkpoint**: Synchronized verse text is functional.

---

## Phase 8: User Story 5 - Asset Management for New Formats (Priority: P2)

**Goal**: Asset directories and READMEs are correctly structured (Setup already covered directories).

**Independent Test**: N/A (Directories created in Setup).

### Implementation for User Story 5

- [x] T014 [US5] Verify `README.md` contents inside `src/services/video-publisher/assets/portraits/` and `src/services/video-publisher/assets/stock-videos/` include specs/naming rules

**Checkpoint**: Assets organized properly.

---

## Phase 9: User Story 7 - Interactive Thumbnail Preview Text (Priority: P2)

**Goal**: Prompt user for thumbnail snippet interactively during generation.

**Independent Test**: Run generator interactively and provide a custom snippet for the thumbnail.

### Implementation for User Story 7

- [x] T015 [US7] Implement interactive `readline` prompt in `src/services/media-generator/generator.js` to capture `rukuData.thumbSnippet` if `--thumb-text` is missing
- [x] T016 [US7] Update `src/services/video-publisher/thumbnail-generator.js` to use `rukuData.thumbSnippet` for the thumbnail text instead of the full range/default string

**Checkpoint**: Interactive thumbnail text prompt functions correctly.

---

## Phase N: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T017 [P] Update CLI tests in `scratch/run_cli_tests.js` to cover `--format` and `--bg-type`
- [x] T018 Code cleanup and refactoring in `generator.js`
- [x] T019 Run quickstart.md validation to ensure all CLI commands work as documented

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-9)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### Parallel Opportunities

- T001 and T002 in Setup can run in parallel.
- User Story 6 (SVG layouts) can run in parallel with User Story 4 (CLI parsing).
- T006 and T007 can be executed independently.
- User Story 3's `content-fetcher.js` timing update (T012) can be done in parallel with other core tasks.

---

## Implementation Strategy

### MVP First (User Story 4 & 6)

1. Complete Phase 1 & 2.
2. Complete Phase 3 (CLI) and Phase 4 (Redesign).
3. **STOP and VALIDATE**: Test basic generation with the new layout before adding new media backgrounds.

### Incremental Delivery

1. Deliver MVP (CLI & Redesign).
2. Add Portrait Support (US1).
3. Add Stock Video Support (US2).
4. Add Live Verse Display (US3) - highest complexity.
5. Add Interactive Prompt (US7).
