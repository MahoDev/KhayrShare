# Tasks: Smart Suggestion Fairness

**Input**: Design documents from `specs/005-smart-suggestion-fairness/`  
**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) · [data-model.md](./data-model.md) · [quickstart.md](./quickstart.md)

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each increment. No external test framework is required — each story includes manual verification steps using the existing CLI.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel with other [P]-marked tasks in the same phase (different files, no shared dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Exact file paths are included in every description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the shared JSON read/write helper pattern used by both services. No new npm dependencies — uses only built-in `fs` and existing `luxon`.

- [x] T001 Verify `luxon` is available in `src/services/content-suggester/` by checking `package.json` and confirm `DateTime` import works in `manual-assistant.js`
- [x] T002 Verify `VIDEO_OUTPUT_DIR` constant is correctly resolved in `src/services/media-generator/generator.js` and confirm the directory exists at runtime (already exists; confirm no path issue)

**Checkpoint**: Shared infrastructure confirmed — no new dependencies needed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Add the two shared JSON helper functions (`readJson` / `writeJson` pattern) that both US1 and US2 will use. Also add the `sameDayDampeningFactor` config field.

- [x] T003 [P] Add `sameDayDampeningFactor: 0.1` to `settings` object in `src/services/content-suggester/config.json` with a descriptive comment
- [x] T004 [P] Confirm that `readJson` and `writeJson` helpers already exist in `src/services/content-suggester/manual-assistant.js` (they do — lines 37–48). Document their exact signatures in a code comment for reuse

**Checkpoint**: Foundational tasks complete — user story implementation can begin.

---

## Phase 3: User Story 1 — Within-Day Group Dampening (Priority: P1) 🎯 MVP

**Goal**: Groups already suggested today get a drastically reduced selection weight (×`sameDayDampeningFactor`, default `0.1`), giving neglected groups a fair chance without completely blocking recently-suggested ones.

**Independent Test**:

1. Delete `{OUTPUT_PATH}/daily_group_suggestions.json` if it exists.
2. Run `node src/services/content-suggester/manual-assistant.js tick` several times.
3. After each run inspect `daily_group_suggestions.json` — confirm the suggested group URL is appended.
4. Observe the debug weight logs: the second time the same group appears, its weight should be ~10% of its original value.

### Implementation for User Story 1

- [x] T005 [US1] Add `DAILY_GROUP_SUGGESTIONS_FILE` constant in `src/services/content-suggester/manual-assistant.js` — set to `path.join(OUTPUT_PATH, "daily_group_suggestions.json")` alongside the existing file constants (lines 10–16)

- [x] T006 [US1] Implement `loadDailyGroupSuggestions()` function in `src/services/content-suggester/manual-assistant.js`:
  - Read `DAILY_GROUP_SUGGESTIONS_FILE` using existing `readJson()` helper (fallback `null`)
  - Get today's date using `DateTime.now().setZone("local").toISODate()`
  - If file is missing, corrupt, or `data.date !== today` → return `{ date: today, suggestedUrls: [] }`
  - Otherwise return the parsed object

- [x] T007 [US1] Implement `appendDailyGroupSuggestion(groupUrl)` function in `src/services/content-suggester/manual-assistant.js`:
  - Call `loadDailyGroupSuggestions()` to get current state
  - Push `groupUrl` into `state.suggestedUrls`
  - Write back using existing `writeJson()` helper

- [x] T008 [US1] Modify `selectSuggestion()` in `src/services/content-suggester/manual-assistant.js` to apply within-day dampening:
  - After the existing `weight = Math.pow(daysSince + 1, 2)` calculation (around line 298)
  - Load daily suggestions once before the while-loop: `const dailySuggestions = loadDailyGroupSuggestions()`
  - Inside `weightedGroups` map, after QURAN category reduction, add:
    ```js
    const dampeningFactor = config.settings?.sameDayDampeningFactor ?? 0.1;
    if (dailySuggestions.suggestedUrls.includes(group.url)) {
      weight *= dampeningFactor;
    }
    ```
  - Add a debug log line: `[DEBUG] Group <name> dampened (suggested today): weight now <weight>`

- [x] T009 [US1] Modify `createPendingSuggestion()` in `src/services/content-suggester/manual-assistant.js` to record each suggestion:
  - After `fs.writeFileSync(PENDING_TXT_FILE, formatSuggestionText(suggestion), "utf8")` (around line 503)
  - Add: `appendDailyGroupSuggestion(suggestion.group.url)`
  - Add log: `[manual-assist] Recorded group suggestion for within-day dampening: <url>`

**Checkpoint**: US1 fully functional. Run the manual test steps above to validate. ✅

---

## Phase 4: User Story 2 — Daily Reciter Round-Robin (Priority: P1)

**Goal**: Each reciter appears exactly once in video generation before any reciter repeats on the same day. When all reciters are used, the pool auto-resets for a new round.

**Independent Test**:

1. Delete `{OUTPUT_PATH}/video-service-outputs/daily_reciter_pool.json` if it exists.
2. Run `node src/services/media-generator/generator.js` (or trigger via scheduler) multiple times.
3. After each run inspect `daily_reciter_pool.json` — confirm `usedIds` grows by exactly one per run with no repeats.
4. When all eligible reciters are used, confirm `usedIds` resets to `[]` automatically and generation succeeds.

### Implementation for User Story 2

- [x] T010 [US2] Add `DAILY_RECITER_POOL_FILE` constant in `src/services/media-generator/generator.js`:
  - `const DAILY_RECITER_POOL_FILE = path.join(VIDEO_OUTPUT_DIR, "daily_reciter_pool.json");`
  - Place alongside the existing `VIDEO_OUTPUT_DIR` constant (lines 5–10)

- [x] T011 [US2] Add `readJson(filePath, fallback)` and `writeJson(filePath, value)` helper functions in `src/services/media-generator/generator.js` (mirroring the pattern already in `manual-assistant.js`):

  ```js
  function readJson(filePath, fallback) {
    try {
      if (!fs.existsSync(filePath)) return fallback;
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return fallback;
    }
  }
  function writeJson(filePath, value) {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
  }
  ```

- [x] T012 [US2] Implement `VideoGenerator.pickDailyReciter()` method in `src/services/media-generator/generator.js`:
  - Get today's date: `new Date().toISOString().slice(0, 10)`
  - Load `DAILY_RECITER_POOL_FILE` using `readJson()` with fallback `{ date: null, usedIds: [] }`
  - If `pool.date !== today` → reset: `pool = { date: today, usedIds: [] }`
  - Build `excludedIds` from `this.config.settings?.excludedReciters || []` as a `Set` of strings
  - Build `allIds = Object.keys(this.contentFetcher.reciters).filter(id => !excludedIds.has(id))`
  - Compute `eligibleIds = allIds.filter(id => !pool.usedIds.includes(id))`
  - If `eligibleIds.length === 0` → log pool exhaustion, reset `pool.usedIds = []`, rebuild `eligibleIds = allIds`
  - Pick `chosen = eligibleIds[Math.floor(Math.random() * eligibleIds.length)]`
  - Push `chosen` to `pool.usedIds`, write pool back with `writeJson()`
  - Log: `[VideoGen] Picked reciter: ${chosen} (${pool.usedIds.length}/${allIds.length} used today)`
  - Return `chosen` (string ID)
  - Add a `skipPoolUpdate` parameter (boolean): if `true`, skip the `pool.usedIds.push()` and `writeJson()` steps (used by regeneration flow)

- [x] T013 [US2] Modify `VideoGenerator.getFetchOptions()` in `src/services/media-generator/generator.js` to call `pickDailyReciter()` when no manual `reciterId` is set:
  - In the section after manual param handling (after line ~103), if `options.reciterId` is not yet set AND `this.cliConfig?._skipPoolUpdate` is not set to `"regenerate_bypass"`:
    ```js
    if (!options.reciterId) {
      options.reciterId = this.pickDailyReciter();
    }
    ```
  - Ensure this is only called when `getFetchOptions()` is being used for a scheduled (non-manual) generation (i.e., no `manualConfig` with explicit `reciterId`)

**Checkpoint**: US2 fully functional. Run the manual test steps above to validate. ✅

---

## Phase 5: User Story 3 — Regenerate Flag (Priority: P2)

**Goal**: The user can set `regenerate: true` in a video suggestion `.txt` file. On the next scheduler tick, the system detects this, generates a fresh video for the same reciter with a new random surah/verse, creates a new `.txt` file, and deletes the old one. The reciter's position in the daily round-robin pool is unaffected.

**Independent Test**:

1. Generate a video normally — a `.txt` file appears in `VIDEO_OUTPUT_DIR`.
2. Open the file, change `regenerate: false` to `regenerate: true`, save.
3. Trigger another scheduler tick (or run `node scheduler.js` and wait for the next interval).
4. Verify: a new `.txt` file is created for the same reciter with different verse range; the old file is deleted; `daily_reciter_pool.json` is unchanged.

### Implementation for User Story 3

- [x] T014 [US3] Modify `VideoGenerator.createSuggestionFile()` in `src/services/media-generator/generator.js` to append the `[REGENERATE]` block:
  - After the `[ FACEBOOK GROUPS TO POST IN (...) ]` section in the `fileContent` array (around line 513–514), append:
    ```js
    ``,
    sep,
    `[ REGENERATE ]`,
    `regenerate: false`,
    `reciterId: ${metadata.reciterId}`,
    ```
  - This means every newly generated suggestion file includes the regeneration control block

- [x] T015 [US3] Implement `Scheduler.scanForRegenerate()` method in `src/services/media-generator/scheduler.js`:
  - Read all `.txt` files from `VIDEO_OUTPUT_DIR` using `fs.readdirSync()`
  - For each file, read its content and test `/regenerate:\s*true/i`
  - If matched: parse `reciterId` with `/reciterId:\s*(\d+)/`
  - If no `reciterId` found: log warning `[Scheduler] regenerate:true found in <file> but no reciterId — skipping` and continue
  - If `reciterId` found:
    - Log: `[Scheduler] Regeneration requested for reciter <id>. Deleting old file and generating...`
    - Delete the old file with `fs.unlinkSync(filePath)`
    - Create a new `VideoGenerator` instance using `this.configPath` and a `cliConfig` of `{ reciterId: Number(reciterId), isRandom: true, _isRegeneration: true }`
    - Call `await newGenerator.generate()`
  - Wrap entire method body in try/catch; log errors without rethrowing (graceful degradation)

- [x] T016 [US3] Modify `VideoGenerator.getFetchOptions()` in `src/services/media-generator/generator.js` to skip round-robin pool update during regeneration:
  - Detect `this.cliConfig?._isRegeneration === true`
  - When true and `options.reciterId` is already set from `cliConfig.reciterId`, skip the `pickDailyReciter()` call entirely
  - Log: `[VideoGen] Regeneration mode — using reciter ${options.reciterId}, skipping pool update`

- [x] T017 [US3] Modify `Scheduler.start()` in `src/services/media-generator/scheduler.js` to run `scanForRegenerate()` frequently:
  - Setup a `setInterval` loop to call `await this.scanForRegenerate()` every 5 seconds (5000ms)
  - Ensure `scanForRegenerate()` failures do not crash the scheduler (wrap in try/catch at call site)

**Checkpoint**: US3 fully functional. Run the manual test steps above to validate. ✅

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Final logging consistency, edge case hardening, and documentation updates.

- [x] T018 [P] Add log entry to `src/services/media-generator/generator.js` in `pickDailyReciter()` when pool auto-resets: `[VideoGen] Daily reciter pool exhausted — starting new round (all ${allIds.length} reciters used today)`

- [x] T019 [P] Add graceful fallback in `src/services/content-suggester/manual-assistant.js` `loadDailyGroupSuggestions()` — if `suggestedUrls` is present but not an array, reset to `[]` before returning, with a warning log

- [x] T020 [P] Update `src/services/media-generator/README.md` to document the new `daily_reciter_pool.json` runtime file, the `[REGENERATE]` block format in suggestion files, and the `regenerate: true` workflow

- [x] T021 Validate full end-to-end flow per `quickstart.md` test scenarios:
  - US1: Run suggestor multiple times, confirm dampening weights in debug output
  - US2: Run generator multiple times, confirm round-robin in `daily_reciter_pool.json`
  - US3: Set `regenerate: true`, confirm new file generated and old file deleted

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — MUST complete before user stories
- **Phase 3 (US1)**: Depends on Phase 2. Modifies only `manual-assistant.js` and `config.json` (content-suggester)
- **Phase 4 (US2)**: Depends on Phase 2. Modifies only `generator.js` (media-generator) — **independent of Phase 3**
- **Phase 5 (US3)**: Depends on Phase 4 (needs `pickDailyReciter()` and `createSuggestionFile()` changes from US2). Also requires `createSuggestionFile()` changes from T014.
- **Phase 6 (Polish)**: Depends on Phases 3, 4, and 5

### User Story Dependencies

- **US1 (Phase 3)**: Fully independent — touches only the content-suggester service
- **US2 (Phase 4)**: Fully independent — touches only the media-generator service
- **US3 (Phase 5)**: Depends on US2 (needs `createSuggestionFile()` to write the `regenerate` block, and needs `pickDailyReciter()` to exist for the bypass logic)

### Within Each Phase

- T005 → T006 → T007 (US1: constant → loader → appender, sequential)
- T008 depends on T006 (needs `loadDailyGroupSuggestions`)
- T009 depends on T007 (needs `appendDailyGroupSuggestion`)
- T010 → T011 → T012 → T013 (US2: constant → helpers → method → integration, sequential)
- T014 → T015 → T016 → T017 (US3: file format → scanner → bypass → scheduler wiring, sequential)

### Parallel Opportunities

- **T003 and T004** (Phase 2): Can run in parallel — different files
- **Phase 3 and Phase 4** (US1 and US2): Can run in parallel — completely different service directories
- **T018, T019, T020** (Phase 6): Can run in parallel — different files

---

## Parallel Example: US1 + US2 Simultaneously

```text
# After completing Phase 1 + Phase 2:

Stream A (content-suggester):        Stream B (media-generator):
T005 → T006 → T007                   T010 → T011 → T012 → T013
         ↓                                        ↓
T008 → T009                               [US2 checkpoint]
         ↓
[US1 checkpoint]

# Then converge for US3:
T014 → T015 → T016 → T017
              ↓
[US3 checkpoint]
```

---

## Implementation Strategy

### MVP First (US1 Only — Group Fairness)

1. Complete **Phase 1** (Setup verification)
2. Complete **Phase 2** (Config update)
3. Complete **Phase 3** (US1 — within-day group dampening)
4. **STOP and VALIDATE**: Run suggestor multiple times, confirm dampening in logs and `daily_group_suggestions.json`
5. US1 is complete and independently valuable

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. **US1** → Within-day group dampening live ✅
3. **US2** → Reciter round-robin live ✅
4. **US3** → On-demand regeneration live ✅
5. **Polish** → Logging, docs, edge cases

---

## Notes

- No new npm packages required — uses only existing `fs`, `path`, `luxon`, and `node-cron`
- All new runtime files (`daily_group_suggestions.json`, `daily_reciter_pool.json`) are auto-created; add them to `.gitignore` if not already covered by output path exclusions
- The `[REGENERATE]` block must appear **after** the groups section in every new `.txt` file; existing `.txt` files from before this feature won't have it (that's fine — `scanForRegenerate()` simply won't match them)
- Commit after each Phase checkpoint for clean rollback points
