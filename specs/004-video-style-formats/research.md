# Phase 0: Technical Research & Design Decisions

## 1. FFmpeg Seamless Looping (Backgrounds)
- **Decision**: Use `ffmpeg -stream_loop -1 -i background.mp4` for stock videos.
- **Rationale**: This is the standard FFmpeg way to loop an input file infinitely. We will place it *before* the `-i` flag for the background input. We combine this with `-shortest` (already present in the FFmpeg command) so the video stops exactly when the stitched audio ends.
- **Alternatives considered**: Using a filter complex with `loop` filter. `-stream_loop -1` at the demuxer level is much faster and uses less memory than the `loop` video filter.

## 2. Verse Text Synchronization (Verse Display Mode)
- **Decision**: Update `ContentFetcher.processAudio` to calculate and return timing metadata (start time and duration of each verse). Pass this to `VideoGenerator`. Use FFmpeg `drawtext` filter with the `enable='between(t,start,end)'` option for each verse, or generate multiple SVG overlays and chain them with `overlay=enable=...`.
- **Rationale**: Since we stitch the audio ourselves, we know exactly how long each verse's audio file is. We can accumulate these durations to get the start/end timestamps. Using a single `ffmpeg` command with chained `overlay` or `drawtext` filters keeps the generation process to a single pass without needing a separate subtitle (SRT) file, fitting the current architecture.
- **Alternatives considered**: Generating an `.srt` subtitle file and burning it in with the `subtitles` filter. This would require dealing with libass compilation in FFmpeg and complex font loading. Creating a dynamic SVG with animations or generating a video frame-by-frame. Generating SVG overlays per verse and compositing them is closest to the current `sharp` + `overlay` strategy.

## 3. Interactive Thumbnail Text CLI
- **Decision**: Use Node.js `readline` module in `generator.js` to prompt the user synchronously during the generation flow, but only if `--thumb-text` is not provided and we are running interactively.
- **Rationale**: `readline` is built-in and perfect for blocking CLI input. We will display `rukuData.verses[0].text_uthmani` and ask for the snippet.
- **Alternatives considered**: Using a third-party library like `inquirer`. Avoided to minimize new dependencies. 

## 4. Asset Management Structure
- **Decision**: Create directories `src/services/video-publisher/assets/portraits/` and `src/services/video-publisher/assets/stock-videos/` with simple README files.
- **Rationale**: Keeps new assets separate from the legacy `backgrounds` folder. 
- **Alternatives considered**: Storing portraits alongside reciter JSON metadata. Centralizing under `assets/` is cleaner for the video publisher service which consumes them.
