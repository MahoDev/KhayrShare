# Tasks: Expand CLI

**Input**: Design documents from `/specs/003-expand-cli/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure updates

- [x] T001 [P] Create empty or populated `quran_page_mapping.json` in `global_assets/quran_page_mapping.json`
- [x] T002 [P] Update `global_assets/video_style_presets.json` to define platform preset schemas

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Refactor `src/services/media-generator/generator.js` to extract manual CLI parsing into a distinct `parseCliArgs` structure
- [x] T004 Implement configuration merging (CLI args overriding environment defaults) in `src/services/media-generator/generator.js`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Full Customization (Priority: P1) 🎯 MVP

**Goal**: Specify exactly which reciter, surah, and verse range to use.

**Independent Test**: Generate a specific video using explicit reciter, surah, and range flags without randomization.

### Implementation for User Story 1

- [x] T005 [US1] Add `--reciter`, `--surah`, `--range` flag parsing to `src/services/media-generator/generator.js`
- [x] T006 [US1] Modify `src/services/media-generator/content-fetcher.js` to support fetching explicitly passed parameters instead of random logic
- [x] T007 [US1] Pass resolved customization configuration from generator to fetcher in `src/services/media-generator/generator.js`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Platform Presets (Priority: P1)

**Goal**: Specify target platform to automatically apply dimensions.

**Independent Test**: Generate a video using `--platform tiktok` and verify vertical output dimensions.

### Implementation for User Story 2

- [x] T008 [US2] Add `--platform` flag parsing in `src/services/media-generator/generator.js`
- [x] T009 [US2] Implement platform preset lookup from config and apply resolution to generator initialization in `src/services/media-generator/generator.js`

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Page Selection (Priority: P2)

**Goal**: Specify a Quran page to automatically resolve surah and verse bounds.

**Independent Test**: Run `--page 283` and verify correct surah and verses are chosen.

### Implementation for User Story 3

- [x] T010 [US3] Populate `global_assets/quran_page_mapping.json` with actual page-to-verse mappings
- [x] T011 [US3] Add `--page` flag parsing in `src/services/media-generator/generator.js`
- [x] T012 [US3] Implement page-to-verse resolution logic using mapping in `src/services/media-generator/generator.js`

---

## Phase 6: User Story 4 - Background Customization (Priority: P2)

**Goal**: Specify a specific background or list all available backgrounds.

**Independent Test**: Run `--listBackgrounds` and `--background name.jpg`

### Implementation for User Story 4

- [x] T013 [US4] Add `--background` and `--listBackgrounds` flag parsing in `src/services/media-generator/generator.js`
- [x] T014 [US4] Implement explicit background selection logic and directory listing logic in `src/services/media-generator/generator.js`

---

## Phase 7: User Story 5 - Video Style Selection (Priority: P2)

**Goal**: Explicitly choose layout styles (e.g. youtube or x)

**Independent Test**: Generate videos with `--style youtube` and `--style x`

### Implementation for User Story 5

- [x] T015 [US5] Add `--style` flag parsing and pass style override to VideoGenerator in `src/services/media-generator/generator.js`

---

## Phase 8: User Story 6 - Custom Resolution (Priority: P3)

**Goal**: Explicitly override width and height

**Independent Test**: Generate video with custom `--width` and `--height`

### Implementation for User Story 6

- [x] T016 [US6] Add `--width` and `--height` flag parsing with paired validation in `src/services/media-generator/generator.js`

---

## Phase 9: User Story 7 - Help Command (Priority: P3)

**Goal**: Provide a `--help` output documenting all features.

**Independent Test**: Run `--help` and verify output.

### Implementation for User Story 7

- [x] T017 [US7] Implement `printHelp()` function displaying all flags, presets, and examples in `src/services/media-generator/generator.js`

---

## Phase 10: User Story 8 - Dry Run (Priority: P3)

**Goal**: Allow parameter resolution preview without video generation.

**Independent Test**: Run `--dry-run` and verify output logs without generation.

### Implementation for User Story 8

- [x] T018 [US8] Add `--dry-run` flag parsing in `src/services/media-generator/generator.js`
- [x] T019 [US8] Implement early exit after parameter resolution in `src/services/media-generator/generator.js`

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T020 Test all edge cases defined in spec (invalid page, out-of-bounds surah, conflicting flags) via test script
- [x] T021 Code cleanup and error message normalization across CLI parser

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-10)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 11)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational
- **User Story 2 (P1)**: Can start after Foundational
- **User Story 3 (P2)**: Best started after User Story 1 (relies on explicit surah/verse parameters)
- All other stories have independent flag behaviors.

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- Once Foundational is done, tasks for US1, US2, US4, US5, US6, US7, US8 can run independently in `generator.js` (assuming clean branch merges)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently
3. Add User Story 2 → Test independently
4. Continue iteratively down the priority phases.
