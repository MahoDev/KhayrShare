# Background Video Generator Service

Automatically generates Quran videos periodically using bothX-Poster and YouTube-Poster styles without interfering with their normal operation.

## Features

- **Periodic Generation**: Runs on a schedule with configurable probability
- **Dual Styles**: Generates videos in both X-Poster (1080x1080) and YouTube (1920x1080) styles
- **Smart Matching**: Automatically matches videos to appropriate Facebook groups
- **Suggestion Files**: Creates detailed suggestion files with caption, video path, and matched groups
- **Auto-Open**: Automatically opens suggestion files in Notepad++ when generated
- **Independent**: Runs separately from x_poster and youtube_poster without affecting them

## Configuration

Edit `config.json` to customize:

```json
{
  "trigger": {
    "probability": 0.15, // 15% chance per check
    "checkIntervalMinutes": 30, // Check every 30 minutes
    "enabled": true
  },
  "videoMode": {
    "useXPosterStyle": true, // Enable X-Poster style (1080x1080)
    "useYouTubeStyle": true, // Enable YouTube style (1920x1080)
    "randomSelection": true // Random selection when both enabled
  }
}
```

## Usage

### Start the Service

**Option 1: Using Batch File**

```bash
start-service.bat
```

**Option 2: Using Node**

```bash
cd video_generator_service
npm install
npm start
```

### How It Works

1. Service runs continuously, checking every N minutes (default: 30)
2. On each check, it evaluates the probability (default: 15%)
3. If triggered, it generates a video using either X-Poster or YouTube style
4. Creates a suggestion file with:
   - Caption (Arabic Surah name + Reciter)
   - Video path
   - Matched Facebook groups (specific or general)
5. Opens the suggestion file in Notepad++ automatically

### Output

- **Videos**: Stored in respective poster output directories
- **Suggestions**: `video_generator_service/suggestions/suggestion_YYYY-MM-DD-HHMMSS.txt`

## Dependencies

- `node-cron`: For scheduling

Install with:

```bash
cd video_generator_service
npm install
```

## Troubleshooting

**Service not generating videos?**

- Check `config.json` - ensure `trigger.enabled` is `true`
- Verify probability is reasonable (e.g., 0.15 = 15% chance)
- Check console output for error messages

**Notepad++ not opening?**

- Verify Notepad++ is installed at `C:\Program Files\Notepad++\notepad++.exe`
- Check file permissions

**Videos not matching groups?**

- Ensure `../facebook_poster/config.json` exists and has video groups configured
- Check reciter names match between `reciters.json` and Facebook config

## File Structure

```
video_generator_service/
├── config.json          # Configuration
├── generator.js         # Video generation logic
├── scheduler.js         # Scheduler with cron
├── start-service.bat    # Windows launcher
├── package.json         # Dependencies
├── README.md            # This file
└── suggestions/         # Output suggestion files
```

## Notes

- Service is completely independent of x_poster and youtube_poster schedulers
- Uses shared modules (ContentFetcher, VideoGenerator, TextRenderer)
- Does not post videos automatically - generates them for manual review
- Respects `excludedReciters` setting from config
