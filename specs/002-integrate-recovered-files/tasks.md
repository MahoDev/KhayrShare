---
description: "Task list template for feature implementation"
---

# Tasks: Integrate & Refactor Recovered Media Pipeline Files

**Input**: Design documents from `/specs/002-integrate-recovered-files/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, quickstart.md

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 [P] Move `recovered-files/reciters.json` to `global_assets/reciters.json`
- [X] T002 [P] Move `recovered-files/content-fetcher.js` to `src/services/media-generator/content-fetcher.js`
- [X] T003 [P] Move `recovered-files/text-renderer.js` to `src/services/media-generator/text-renderer.js`
- [X] T004 Install `axios` as a dependency and `canvas` as an `optionalDependency` in `package.json`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 Validate successful installation of packages and relocation of files from Phase 1

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Restore Media Generator Functionality (Priority: P1) 🎯 MVP

**Goal**: Restore end-to-end video generation by placing files and updating paths.

**Independent Test**: Run `npm run test:media-generator` and confirm it completes a full cycle without crashing.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T006 [P] [US1] Create an integration test script `src/services/media-generator/test.js` to verify generator executes without crashing, and add `"test:media-generator": "node src/services/media-generator/test.js"` to `package.json`

### Implementation for User Story 1

- [ ] T007 [P] [US1] Update `paths.recitersJson` value to `"../../global_assets/reciters.json"` in `src/services/media-generator/config.json`
- [ ] T008 [P] [US1] Update font and image loading paths in `src/services/media-generator/text-renderer.js` to point to `../../global_assets/` (e.g. `../../global_assets/fonts/`, `../../global_assets/images/`)
- [ ] T009 [US1] Update `src/services/media-generator/generator.js` to import `content-fetcher.js` from `./content-fetcher.js` instead of the old path
- [ ] T010 [US1] Update `src/services/media-generator/generator.js` to import `text-renderer.js` from `./text-renderer.js` instead of the old path

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently

---

## Phase 4: User Story 2 & 4 - Restore Content Suggester Group Matching and Preserve Data (Priority: P1)

**Goal**: Restore real group data as the authoritative source for the content-suggester, preserving all ~200 real URLs verbatim.

**Independent Test**: Run `npm run test:content-suggester` and inspect generated `next_post.txt` to confirm it contains a real group URL.

### Tests for User Story 2 ⚠️

- [ ] T011 [P] [US2] Create an integration test script `src/services/content-suggester/test.js` to verify suggester produces a valid real URL, and add `"test:content-suggester": "node src/services/content-suggester/test.js"` to `package.json`

### Implementation for User Story 2

- [ ] T012 [US2] Merge `groups` object from `recovered-files/config.json` into `src/services/content-suggester/config.json`, replacing the placeholder `groups` array but keeping existing `settings` and `taxonomy` intact. Ensure structure compatibility.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Refactor for Extensibility (Priority: P2)

**Goal**: Clean up integration points and remove tangled legacy paths.

**Independent Test**: Review codebase to ensure zero references to deleted directories exist.

### Implementation for User Story 3

- [ ] T013 [P] [US3] Remove all hardcoded `../youtube_poster/` and `../x_poster/` path references in `src/services/media-generator/generator.js` (specifically lines 167, 185, 225, 237, 242) and update to correct new paths (`../video-publisher/` or `../../global_assets/`)
- [ ] T014 [P] [US3] Delete stale file `src/services/media-generator/ecosystem.config.js`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Cleanup and Validation of Success Criteria

- [ ] T015 Validate SC-006: Temporarily add a dummy reciter to `global_assets/reciters.json` and run `npm run test:media-generator` to ensure it's picked up.
- [ ] T016 Validate SC-007: Run `pm2 start ecosystem.config.js` and verify both services start cleanly in the background.
- [ ] T017 Delete `recovered-files/` directory entirely from the file system.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories

### Within Each User Story

- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch path updates in parallel:
Task: "Update paths.recitersJson value..."
Task: "Update font and image loading paths in text-renderer.js..."
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Deploy/Demo (MVP!)
3. Add User Story 2 → Test independently → Deploy/Demo
4. Add User Story 3 → Test independently → Deploy/Demo
5. Each story adds value without breaking previous stories
