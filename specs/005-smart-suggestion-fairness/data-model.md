# Data Model: Smart Suggestion Fairness

**Feature**: `005-smart-suggestion-fairness`  
**Date**: 2026-07-08

---

## Entities

### 1. `DailyGroupSuggestions` — Within-Day Group Dampening Tracker

**File**: `OUTPUT_PATH/daily_group_suggestions.json`  
**Owner**: khayr-suggestor (`manual-assistant.js`)

```json
{
  "date": "2026-07-08",
  "suggestedUrls": [
    "https://www.facebook.com/groups/example1",
    "https://www.facebook.com/groups/example2"
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` (ISO date `YYYY-MM-DD`) | The calendar day this tracker is valid for. If this does not match today's date, the tracker resets. |
| `suggestedUrls` | `string[]` | Ordered list of group URLs suggested during the current calendar day. Duplicates are allowed (a group re-suggested after dampening). |

**State Transitions**:
1. **Init / Day Roll**: `date` ≠ today → reset to `{ date: today, suggestedUrls: [] }`
2. **After Suggestion Created**: Append the suggested group URL to `suggestedUrls` and persist.
3. **No removal**: Items are never removed from `suggestedUrls` within the same day.

**Validation Rules**:
- `date` must be a valid `YYYY-MM-DD` string.
- `suggestedUrls` must be an array (may be empty).
- File missing or corrupt → treat as empty/reset state (graceful degradation).

---

### 2. `DailyReciterPool` — Daily Round-Robin Reciter Pool

**File**: `VIDEO_OUTPUT_DIR/daily_reciter_pool.json`  
**Owner**: khayr-media-gen (`generator.js`)

```json
{
  "date": "2026-07-08",
  "usedIds": ["7", "23", "1"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `date` | `string` (ISO date `YYYY-MM-DD`) | The calendar day this pool is valid for. If this does not match today's date, the pool resets. |
| `usedIds` | `string[]` | Ordered list of reciter IDs that have already had a video generated today. |

**State Transitions**:
1. **Init / Day Roll**: `date` ≠ today → reset to `{ date: today, usedIds: [] }`
2. **After Video Generated**: Append the chosen reciter ID to `usedIds` and persist.
3. **Pool Exhausted**: `eligiblePool = allIds - excludedIds - usedIds = []` → reset `usedIds = []`, rebuild pool from full eligible set, pick again.
4. **Regeneration**: A `regenerate: true` event does NOT append to `usedIds` (reciter already counted from original generation).

**Validation Rules**:
- `date` must be a valid `YYYY-MM-DD` string.
- `usedIds` must be an array of string IDs.
- File missing or corrupt → treat as empty/reset state.
- Excluded reciters (from `settings.excludedReciters`) are never part of `eligiblePool` regardless of `usedIds`.

---

### 3. `VideoSuggestionFile` — Text File Produced per Video Generation

**File**: `VIDEO_OUTPUT_DIR/{Reciter}_{Surah}_{Range}_{Timestamp}.txt`  
**Owner**: khayr-media-gen (`generator.js` → `createSuggestionFile()`)

Extended format (new fields shown with `+`):

```
[ KhayrShare Video Suggestion ]
Generated: 7/8/2026, 10:30:00 AM
────────────────────────────────────────────────────────────

[ VIDEO FILE ]
/absolute/path/to/video.mp4

[ THUMBNAIL FILE ]
/absolute/path/to/thumbnail.jpg

────────────────────────────────────────────────────────────
[ YOUTUBE TITLE ]
...

[ YOUTUBE DESCRIPTION / CAPTION ]
...

[ YOUTUBE TAGS ]
...

────────────────────────────────────────────────────────────
[ FACEBOOK GROUPS TO POST IN (Specific) ]
Group Name - https://www.facebook.com/groups/...

────────────────────────────────────────────────────────────
+ [ REGENERATE ]
+ regenerate: false
+ reciterId: 7
```

| Field | Type | Description |
|-------|------|-------------|
| `regenerate` | `boolean` (plain text `true`/`false`) | User edits this to `true` to request re-generation for this reciter with new random verses. |
| `reciterId` | `string` | The numeric ID of the reciter used. Stored so the scheduler can identify the reciter without name parsing. |

**State Transitions**:
1. **Created**: `regenerate: false`, `reciterId: <id>` written by `createSuggestionFile()`.
2. **User Edits**: User manually changes `regenerate: false` → `regenerate: true` in the text editor.
3. **Scheduler Detects**: Next tick, scheduler finds `regenerate: true`, triggers regeneration for `reciterId`, then deletes this file.

---

## Configuration Extensions

### khayr-suggestor `config.json`

New optional field under `settings`:

```json
{
  "settings": {
    "sameDayDampeningFactor": 0.1
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sameDayDampeningFactor` | `number` (0.0–1.0) | `0.1` | Multiplier applied to a group's selection weight if it was already suggested today. `0.1` = 90% weight reduction. |

---

## Relationships

```
DailyGroupSuggestions
  └── suggestedUrls[] ──────── references ──── FacebookGroup.url (in config.json)

DailyReciterPool
  └── usedIds[] ────────────── references ──── Reciter.id (in reciters.json)

VideoSuggestionFile
  └── reciterId ────────────── references ──── Reciter.id (in reciters.json)
  └── regenerate ────────────── triggers ────── Scheduler regeneration flow
```
