# Tasks: Multi-Platform Publishing

**Input**: Design documents from `/specs/006-multi-platform-publishing/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Paths are relative to the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Ensure data directory exists for tracking file storage

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Implement tracking module to read/write the JSON data model in `src/services/media-generator/tracking.js`

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Configure target platforms (Priority: P1) 🎯 MVP

**Goal**: Configure which platforms (TikTok, Pinterest, YouTube Shorts, Facebook, YouTube Normal) a video is generated for, so that the correct text links are produced.

**Independent Test**: Can be fully tested by generating a post with old defaults versus generating with new platforms enabled, verifying that the generated files differ accordingly.

### Implementation for User Story 1

- [x] T003 [P] [US1] Update configuration definition in `src/services/media-generator/config.json` to include per-platform `width`, `height`, `style`, and `maxDuration` settings
- [x] T004 [US1] Update generation logic in `src/services/media-generator/generator.js` to load platform configurations and loop over enabled platforms, generating one video per platform with correct resolution/style
- [x] T005 [US1] Update `src/services/media-generator/generator.js` to append appropriate channel links to the `next_post` output and name output files with platform suffix

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 - Track weekly reciter uploads (Priority: P2)

**Goal**: Keep track of which reciter was uploaded this week per platform to prevent duplicates.

**Independent Test**: Can be tested by executing a generation/posting step and verifying that the system updates a persistent tracking log, and warns on repeat.

### Implementation for User Story 2

- [x] T006 [US2] Update `src/services/video-publisher/publisher.js` to query `tracking.js` before starting generation/publishing
- [x] T007 [US2] Update `src/services/video-publisher/publisher.js` to log a bold warning (and wait for confirmation if interactive) if a duplicate upload is detected for the current week and platform
- [x] T008 [US2] Update `src/services/video-publisher/publisher.js` to record the upload as successful via `tracking.js` after the task completes

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T009 [P] Document new configuration options in README.md or relevant config docs
- [x] T010 Validate backward compatibility for legacy workflows without the new config format

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P2)**: Can start after Foundational (Phase 2)

### Parallel Opportunities

- T003 [P] [US1] can be done in parallel with T002 if the config file is distinct from the tracking logic
- T009 [P] can be started anytime after User Story 1 implementation begins

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready
