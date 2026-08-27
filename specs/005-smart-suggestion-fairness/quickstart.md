# Quickstart: Smart Suggestion Fairness

**Feature**: `005-smart-suggestion-fairness`  
**Date**: 2026-07-08

This guide describes the design and key integration points for implementing this feature. Read `research.md` first for the rationale behind every decision.

---

## How the Pieces Fit Together

```
┌──────────────────────────────────────────────────────────────────┐
│  khayr-suggestor (content-suggester)                             │
│                                                                  │
│  scheduler.js → tickManualAssist() → createPendingSuggestion()   │
│                                         │                        │
│                                   selectSuggestion()             │
│                                         │                        │
│                           ┌─────────────▼─────────────────┐     │
│                           │ EXISTING: group_usage.json     │     │
│                           │  daysSince weight (squared)    │     │
│                           │                                │     │
│                           │ NEW: daily_group_suggestions   │     │
│                           │  same-day dampening (×0.1)     │     │
│                           └───────────────────────────────┘     │
│                                                                  │
│  After suggestion written → append groupUrl to suggestedUrls     │
└──────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  khayr-media-gen (media-generator)                               │
│                                                                  │
│  scheduler.js                                                    │
│    │                                                             │
│    ├── scanForRegenerate()  ← NEW: scans VIDEO_OUTPUT_DIR/*.txt  │
│    │     if regenerate: true found → generateForReciter(id)      │
│    │                                                             │
│    └── attemptGeneration()  ← EXISTING: probability check        │
│          │                                                       │
│         generator.generate()                                     │
│          │                                                       │
│    pickDailyReciter()  ← NEW: consults daily_reciter_pool.json   │
│          │                                                       │
│    contentFetcher.fetchContent({ reciterId })                    │
│          │                                                       │
│    createSuggestionFile()  ← MODIFIED: adds [REGENERATE] block   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Key Implementation Points

### 1. `manual-assistant.js` — Within-Day Group Dampening

**New constant** (alongside existing ones):
```js
const DAILY_GROUP_SUGGESTIONS_FILE = path.join(OUTPUT_PATH, "daily_group_suggestions.json");
```

**New helper** `loadDailyGroupSuggestions()`:
- Reads `DAILY_GROUP_SUGGESTIONS_FILE`
- If missing, corrupt, or `date` ≠ today → returns `{ date: today, suggestedUrls: [] }`
- Otherwise returns the parsed object

**New helper** `appendDailyGroupSuggestion(groupUrl)`:
- Calls `loadDailyGroupSuggestions()`
- Pushes `groupUrl` into `suggestedUrls`
- Writes back to disk

**Modified** `selectSuggestion()` — after computing base weight from `daysSince`:
```js
// NEW: within-day dampening
const dampeningFactor = config.settings?.sameDayDampeningFactor ?? 0.1;
const dailySuggestions = loadDailyGroupSuggestions();
if (dailySuggestions.suggestedUrls.includes(group.url)) {
  weight *= dampeningFactor;
}
```

**Modified** `createPendingSuggestion()` — after writing the `.txt` file:
```js
// NEW: track this suggestion in the within-day dampening tracker
appendDailyGroupSuggestion(suggestion.group.url);
```

---

### 2. `generator.js` — Daily Reciter Round-Robin

**New constant**:
```js
const DAILY_RECITER_POOL_FILE = path.join(VIDEO_OUTPUT_DIR, "daily_reciter_pool.json");
```

**New method** `VideoGenerator.pickDailyReciter()`:
```js
pickDailyReciter() {
  const today = new Date().toISOString().slice(0, 10);
  let pool = readJson(DAILY_RECITER_POOL_FILE, { date: null, usedIds: [] });

  if (pool.date !== today) {
    pool = { date: today, usedIds: [] };
  }

  const excludedIds = new Set(
    (this.config.settings?.excludedReciters || []).map(String)
  );
  const allIds = Object.keys(this.contentFetcher.reciters)
    .filter(id => !excludedIds.has(id));

  let eligibleIds = allIds.filter(id => !pool.usedIds.includes(id));

  if (eligibleIds.length === 0) {
    // Pool exhausted → reset and start new round
    pool.usedIds = [];
    eligibleIds = allIds;
    console.log("[VideoGen] Daily reciter pool exhausted. Resetting for new round.");
  }

  const chosen = eligibleIds[Math.floor(Math.random() * eligibleIds.length)];
  pool.usedIds.push(chosen);
  writeJson(DAILY_RECITER_POOL_FILE, pool);

  console.log(`[VideoGen] Picked reciter: ${chosen} (pool: ${pool.usedIds.length}/${allIds.length} used today)`);
  return chosen;
}
```

**Integration point**: Call `this.pickDailyReciter()` inside `getFetchOptions()` when no manual `reciterId` is specified, and set `options.reciterId = chosenId`.

**Modified** `createSuggestionFile()` — append to `fileContent` array:
```js
sep,
`[ REGENERATE ]`,
`regenerate: false`,
`reciterId: ${metadata.reciterId}`,
```

---

### 3. `scheduler.js` (media-gen) — Regeneration Scanner

**New method** `Scheduler.scanForRegenerate()`:
```js
async scanForRegenerate() {
  const txtFiles = fs.readdirSync(VIDEO_OUTPUT_DIR)
    .filter(f => f.endsWith(".txt"))
    .map(f => path.join(VIDEO_OUTPUT_DIR, f));

  for (const filePath of txtFiles) {
    const content = fs.readFileSync(filePath, "utf8");
    if (!/regenerate:\s*true/i.test(content)) continue;

    const idMatch = content.match(/reciterId:\s*(\d+)/);
    if (!idMatch) {
      console.warn(`[Scheduler] regenerate:true found in ${filePath} but no reciterId — skipping.`);
      continue;
    }

    const reciterId = idMatch[1];
    console.log(`[Scheduler] Regeneration requested for reciter ${reciterId}. Generating...`);

    // Delete old file first to avoid detecting it again
    fs.unlinkSync(filePath);

    // Generate new video (random content, same reciter, does NOT update daily pool)
    const regenGenerator = new VideoGenerator(this.configPath, {
      reciterId: Number(reciterId),
      isRandom: true,
      _skipPoolUpdate: true,  // signal to pickDailyReciter to skip pool write
    });
    await regenGenerator.generate();
  }
}
```

**Modified** `Scheduler.start()` — Setup a `setInterval` loop to call `scanForRegenerate()` every 5 seconds, providing instant regeneration feedback.

---

## Runtime File Locations

| File | Path |
|------|------|
| Within-day group dampening | `{OUTPUT_PATH}/daily_group_suggestions.json` |
| Daily reciter pool | `{OUTPUT_PATH}/video-service-outputs/daily_reciter_pool.json` |
| Video suggestion files | `{OUTPUT_PATH}/video-service-outputs/{Reciter}_{Surah}_{Range}_{ts}.txt` |

All paths are derived from existing constants — no new path configuration required.

---

## Testing Approach

1. **Within-day dampening**: Run `node manual-assistant.js tick` multiple times in the same day. Inspect the `daily_group_suggestions.json` file. Verify the same group URL appears with increasing dampening in subsequent debug logs.

2. **Reciter round-robin**: Manually delete `daily_reciter_pool.json`, then trigger `generator.generate()` several times. Verify `usedIds` grows by one per call and no reciter repeats until the pool resets.

3. **Regenerate flag**: After a video is generated, open the `.txt` file, change `regenerate: false` to `regenerate: true`, save. Wait a few seconds, verify a new file is generated for the same reciter and the old file is gone.
