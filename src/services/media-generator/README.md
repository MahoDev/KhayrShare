# Background Video Generator Service

Automatically generates Quran videos periodically using bothX-Poster and YouTube-Poster styles without interfering with their normal operation.

## Features

- **Periodic Generation**: Runs on a schedule with configurable probability
- **Dual Styles**: Generates videos in both X-Poster (1080x1080) and YouTube (1920x1080) styles
- **Smart Matching**: Automatically matches videos to appropriate Facebook groups
- **Suggestion Files**: Creates detailed suggestion files with caption, video path, and matched groups
- **Auto-Open**: Automatically opens suggestion files in your default text editor when generated
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
  },
  "platforms": {
    "tiktok": {
      "enabled": false,
      "channel_link": "https://www.tiktok.com/@your_channel"
    },
    "youtube": {
      "enabled": true,
      "channel_link": "https://www.youtube.com/@your_channel"
    }
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

5. Opens the suggestion file in the system's default text editor automatically

### Manual Generation via CLI

You can trigger a video generation manually from the command line with specific parameters:

```bash
# Generate a random video for a specific reciter (by ID or name)
node generator.js --id 7
node generator.js --reciter "Mishary Alafasy"
node generator.js -r 10

# Generate a specific surah/verse range for a specific reciter
node generator.js --id 15 --surah 1 --range 1-7
node generator.js --reciter "AbdulBaset" --surah 18 --startVerse 1 --endVerse 10

# List all available reciters and their IDs
node generator.js --listReciters
```

#### CLI Arguments:
- `--id N` or `--reciterId N`: Specify reciter by ID number
- `--reciter "Name"` or `-r "Name"`: Specify reciter by name (or ID)
- `--surah N`: Specify Surah number (1-114)
- `--range N-M`: Specify verse range
- `--startVerse N` / `--endVerse M`: Alternative to --range
- `--listReciters`: Display a list of all reciters and their numeric IDs

### How It Works

1. Service runs continuously, checking every N minutes (default: 30)
2. On each check, it evaluates the probability (default: 15%)
3. If triggered, it generates a video using either X-Poster or YouTube style
4. Creates a suggestion file with:
   - Caption (Arabic Surah name + Reciter)
   - Video path
   - Matched Facebook groups (specific or general)
5. Opens the suggestion file in the default text editor automatically

### Smart Suggestion Fairness & Regeneration

This service automatically ensures fair rotation of reciters:
- **Round-Robin**: Each reciter is selected exactly once per day before any repeats occur. This is tracked in `video-service-outputs/daily_reciter_pool.json`.
- **Regeneration Workflow**: If you want a different video for the same reciter, you don't need to use the CLI. Every generated suggestion text file includes a `[ REGENERATE ]` block at the bottom.
  - Simply open the text file and change `regenerate: false` to `regenerate: true` and save it.
  - The system will detect this flag almost instantly (within 5 seconds), automatically generate a new video for the same reciter with a new random verse range, create a new suggestion file, and delete the old one. This regeneration bypasses the daily round-robin tracker so the reciter is not penalized twice.

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

**Default editor not opening?**

- Check your system file associations for `.txt` files
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
