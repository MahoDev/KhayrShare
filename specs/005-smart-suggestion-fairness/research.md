# Research: Smart Suggestion Fairness

**Feature**: `005-smart-suggestion-fairness`  
**Date**: 2026-07-08  
**Status**: Complete — all unknowns resolved

---

## 1. Within-Day Group Dampening (khayr-suggestor)

### Current State Analysis

The `manual-assistant.js` already has **two** group-tracking mechanisms:
- `history.json` → `postedGroups[]`: Groups that the user has **confirmed posted** to today. These are **fully excluded** from the pool.
- `group_usage.json`: A global map of `{ url → lastPostedISO }` used to calculate long-term `daysSince` weight. Groups not touched for longer have a higher squared weight.

**The gap**: There is no within-day "dampening" layer. The `postedGroups[]` list only grows when the user clicks "done" (marking `finishedPosting: true`). A group gets into `postedGroups` only after confirmed posting. Between suggestion ticks, the same group can be suggested repeatedly before the user marks it done.

### Decision: Add a `daily_group_suggestions.json` tracker

- **What it stores**: `{ date: "YYYY-MM-DD", suggestedUrls: ["url1", "url2", ...] }`
- **When it updates**: Each time a suggestion is created (not just when done is clicked), the suggested group URL is appended to `suggestedUrls`.
- **How it dampens**: In `selectSuggestion()`, after the per-group weight is computed from `daysSince`, apply an additional multiplier of `0.1` (configurable via `settings.sameDayDampeningFactor`) if the group URL appears in `suggestedUrls` for today.
- **When it resets**: At the start of each new calendar day — the `date` field is checked; if it doesn't match today's date, the tracker resets to `{ date: today, suggestedUrls: [] }`.
- **Rationale**: Using a separate file keeps concerns cleanly separated from `history.json` (which records confirmed posts) and `group_usage.json` (which tracks long-term usage). The dampening factor of `0.1` (90% weight reduction) is aggressive but still non-zero, directly addressing the user's requirement.
- **Alternatives considered**: 
  - Reusing `history.json`: Rejected — that file tracks confirmed postings, not suggestions; conflating the two would break the existing "max posts per day" logic.
  - Reusing `group_usage.json`: Rejected — it tracks long-term history, not same-day events.

---

## 2. Daily Reciter Round-Robin (khayr-media-gen)

### Current State Analysis

In `content-fetcher.js`, `getReciter(reciterId)` does pure random selection from `Object.keys(this.reciters)` filtered by `excludedReciters`. There is no persistence between scheduler ticks. Each call is fully stateless with respect to what was chosen before.

The `scheduler.js` creates a new `VideoGenerator` → `ContentFetcher` on each tick, so no in-memory state survives across ticks.

### Decision: Add a `daily_reciter_pool.json` tracker

- **What it stores**: `{ date: "YYYY-MM-DD", usedIds: ["1", "7", "23", ...] }`
- **Where it lives**: `VIDEO_OUTPUT_DIR` (i.e., `OUTPUT_PATH/video-service-outputs/`) — already used by `generator.js`.
- **How selection works**: 
  1. Load `daily_reciter_pool.json`. If `date` ≠ today or file missing → reset `usedIds = []`.
  2. Build `eligiblePool = allReciterIds - excludedReciters - usedIds`.
  3. If `eligiblePool` is empty → pool is exhausted; reset `usedIds = []` and rebuild from full set.
  4. Pick one random reciter from `eligiblePool`.
  5. Append the chosen reciter ID to `usedIds` and persist.
- **Where to inject**: In `generator.js` `generateXPosterVideo()` and `generateYouTubeVideo()` before calling `contentFetcher.fetchContent()`. The reciter ID selection is promoted from `ContentFetcher.getReciter()` to a new method `VideoGenerator.pickDailyReciter()`, which consults the persistent pool.
- **Alternatives considered**:
  - Modifying `ContentFetcher.getReciter()` directly: Rejected — ContentFetcher is a shared module used by other services, and embedding scheduling state there would violate modular architecture.
  - In-memory state on `Scheduler`: Rejected — process restarts would lose state; persistent JSON file survives restarts cleanly.

---

## 3. Regenerate Flag (khayr-media-gen)

### Current State Analysis

The suggestion text file format currently ends with:
```
[ FACEBOOK GROUPS TO POST IN (MatchType) ]
Group Name - https://...
Group Name - https://...
```

The `finishedPosting` field already uses a `key: value` pattern in the khayr-suggestor text files. We'll follow the same convention.

The scheduler currently does `shouldTrigger()` via probability check, then `generator.generate()`. It has no concept of watching output files.

### Decision: Append `regenerate: false` field + scheduler file watcher

**Text file addition**: After the `[ FACEBOOK GROUPS TO POST IN ]` block, add:
```
────────────────────────────────────────────────────
[ REGENERATE ]
regenerate: false
reciterId: 7
```

The `reciterId` line is included so the scheduler can identify which reciter to use without fuzzy name matching.

**Scheduler change**: On each tick, before or after `attemptGeneration()`, scan `VIDEO_OUTPUT_DIR` for `.txt` files containing `regenerate: true`. For each such file:
1. Parse the `reciterId` from the file.
2. Call `generator.generate()` with that specific `reciterId` + `isRandom: true` (new random surah/verse).
3. Delete the old `.txt` file (a new one is created by `createSuggestionFile()`).
4. Do **not** modify `daily_reciter_pool.json` — the reciter was already counted when the original video was generated.

**Alternatives considered**:
- Using a separate sidecar `.json` file per suggestion: Rejected — the user wants to edit the `.txt` file directly, keeping the workflow simple.
- Using a file system watcher (`fs.watch`): Rejected — the existing scheduler model is tick-based; adding a separate watcher adds complexity. The tick-based scan is simpler and consistent.

---

## Summary of New Files / Modifications

| Item | Type | Purpose |
|------|------|---------|
| `OUTPUT_PATH/daily_group_suggestions.json` | New runtime file | Within-day group dampening tracker for khayr-suggestor |
| `VIDEO_OUTPUT_DIR/daily_reciter_pool.json` | New runtime file | Daily reciter round-robin pool tracker for khayr-media-gen |
| `manual-assistant.js` | Modify | Read/write `daily_group_suggestions.json`; apply dampening in `selectSuggestion()` |
| `generator.js` | Modify | Add `pickDailyReciter()`, write `regenerate`/`reciterId` to text files, scan for `regenerate: true` |
| `scheduler.js` (media-gen) | Modify | On each tick, call regeneration scan before/after `attemptGeneration()` |
| `config.json` (content-suggester) | Modify | Add optional `sameDayDampeningFactor` setting (default: `0.1`) |
