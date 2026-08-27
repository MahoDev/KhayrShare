# Data Model

## Platform Configuration
JSON configuration containing:
- `platforms`: Object mapping platform name (e.g., "tiktok", "youtube") to:
  - `enabled`: Boolean
  - `channel_link`: String (URL to append)

## Upload Tracker (`weekly_uploads.json`)
Structure to track reciters per week:
```json
{
  "2026-W30": {
    "reciter_name": {
      "tiktok": true,
      "youtube": true
    }
  }
}
```

**State transitions**:
- On attempt to post: Check if `[current_week][reciter][platform]` exists. If true, warn.
- On successful post/generation: Set `[current_week][reciter][platform]` to `true` and save file.
