# Tasks: Project Restructure for Human-Assister Model

**Input**: Design documents from `/specs/001-project-restructure/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: No explicit tests requested in spec, skipping test creation tasks for this refactor.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/`, `tests/` at repository root
- Paths shown below assume single project as specified in plan.md structure

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [X] T001 Create `src/config/`, `src/services/content-suggester/`, `src/services/media-generator/`, `src/utils/`, and `scripts/` directories in the repository root.
- [X] T002 Create `src/config/config.example.json` in the root with required configuration fields.
- [X] T003 Initialize a new `package.json` at the root with `npm init -y` if not already present.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Create `src/config/index.js` to parse `config.json` and export `CONTENT_LIBRARY_PATH` and `OUTPUT_PATH`. Add error handling to throw if missing.

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Clean Project Structure (Priority: P1) 🎯 MVP

**Goal**: Remove all desktop-app, facebook, and x poster UI/automation code. Keep human-assister utility logic.

**Independent Test**: Verify that the directories `desktop-app/`, `x_poster/`, and `youtube_poster/` are gone and that `facebook_poster/` has no automation scripts remaining.

### Implementation for User Story 1

- [X] T005 [P] [US1] Delete the entire `desktop-app/` directory and its contents.
- [X] T006 [P] [US1] Delete the entire `x_poster/` directory and its contents.
- [X] T007 [P] [US1] Move `metadata-generator.js`, `thumbnail-generator.js`, `video-generator.js`, `backgrounds/`, and `fonts/` from `youtube_poster/` to `src/services/video-publisher/`.
- [X] T008 [P] [US1] Move `manual-assistant.js`, `sync-content.js`, `commented.js` from `facebook_poster/` to `src/services/content-suggester/`.
- [X] T009 [P] [US1] Move all files inside `video_generator_service/` to `src/services/media-generator/`.
- [X] T010 [P] [US1] Delete automation files in `facebook_poster/`: `poster.js`, `scheduler.js`, `human-behavior.js`, `test.js`, `test_selection_logic.js`, `.bat` files.
- [X] T011 [US1] Remove empty `video_generator_service/` directory.
- [X] T011b [US1] Remove empty `youtube_poster/` directory.

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Externalized Data Storage (Priority: P1)

**Goal**: Move user content and output storage entirely out of the project folder to external configured paths.

**Independent Test**: Verify no `images/` or `suggestions/` or `content.json` remain in the project directory structure, and scripts reference the `.env` configuration.

### Implementation for User Story 2

- [X] T012 [P] [US2] Update `src/services/content-suggester/manual-assistant.js` to replace hardcoded `./images` and `./suggestions` paths with imports from `../../config/index.js`.
- [X] T013 [P] [US2] Update `src/services/content-suggester/sync-content.js` to replace references to `content.json` with the `OUTPUT_PATH` defined in `../../config/index.js`.
- [X] T014 [P] [US2] Update `src/services/media-generator/` scripts to write outputs to `OUTPUT_PATH` instead of local folders.
- [X] T015 [P] [US2] Create a script `scripts/migrate-data.js` to copy contents of `facebook_poster/images/`, `facebook_poster/suggestions/`, and `facebook_poster/content.json` to external paths.
- [X] T016 [US2] Delete `facebook_poster/images/`, `facebook_poster/suggestions/`, `facebook_poster/fb_session/`, `facebook_poster/content.json`, and `facebook_poster/history.json`.

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently.

---

## Phase 5: User Story 3 - Logical Service Naming (Priority: P2)

**Goal**: Ensure all code, references, and directories use functional names (e.g., `content-suggester`) rather than platform names (`facebook_poster`).

**Independent Test**: Verify that the project contains no references or files named `facebook_poster` or `video_generator_service`.

### Implementation for User Story 3

- [X] T017 [P] [US3] Rename any internal variables, logs, or comments in `src/services/content-suggester/` that mention `facebook_poster` to `content-suggester`.
- [X] T018 [P] [US3] Rename any internal variables, logs, or comments in `src/services/media-generator/` that mention `video_generator_service` to `media-generator`.
- [X] T019 [US3] Delete the `facebook_poster/` directory entirely (should be empty except maybe config/package.json). Move necessary config logic to root or delete.
- [X] T020 [US3] Update root `package.json` to define `start:content-suggester` and `start:media-generator` scripts. Update `name` to `human-assister`.

**Checkpoint**: All user stories should now be independently functional.

---

## Phase 6: User Story 4 - Repository Fresh Start (Priority: P3)

**Goal**: Create a clean Git repository avoiding the legacy history of "sharing-helpers".

**Independent Test**: Running `git status` should show a new initialized repository with only restructured code, without the old platform-specific commits.

### Implementation for User Story 4

- [ ] T021 [P] [US4] Delete old `.bat` and `.lnk` files in the repository root (`start-all.bat`, etc.).
- [ ] T022 [P] [US4] Update root `README.md` to describe the new `human-assister` architecture, data externalization, and setup steps. Delete `facebook_poster/README.md`.
- [ ] T023 [US4] Remove the existing `.git/` folder to detach from the old repository history.
- [ ] T024 [US4] Run `git init`, `git add .`, and `git commit -m "Initial commit for human-assister restructure"`.

**Checkpoint**: New git repository ready.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T025 [P] Run quickstart.md validation manually to ensure a user can bootstrap the application.
- [ ] T026 Code cleanup: format all JS files with `prettier` or standard configuration.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed sequentially in priority order (US1 → US2 → US3 → US4)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2)
- **User Story 2 (P1)**: Can start after US1 file relocations are complete
- **User Story 3 (P2)**: Can start after US1/US2 (requires empty directories from US1/2 to delete)
- **User Story 4 (P3)**: Can start after all other stories to ensure clean git commit

### Parallel Opportunities

- All deletion tasks in US1 can be run in parallel by an agent.
- All code updating tasks in US2 (T012, T013, T014) can be run in parallel.
- All renaming tasks in US3 can be run in parallel.

---

## Parallel Example: User Story 1

```bash
# Launch deletion tasks together:
Task: "Delete the entire desktop-app/ directory and its contents."
Task: "Delete the entire x_poster/ directory and its contents."
Task: "Delete the entire youtube_poster/ directory and its contents."
```

---

## Implementation Strategy

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently
3. Add User Story 2 → Test independently
4. Add User Story 3 → Test independently
5. Add User Story 4 → Test independently
