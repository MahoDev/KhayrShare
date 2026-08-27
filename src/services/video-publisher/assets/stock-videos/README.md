# Stock Videos

Place stock video / looping background files here for use with `--bg-type stock`.

## Naming Convention

- Files can be any descriptive name (e.g., `rain.mp4`, `clouds.webm`).
- Supported formats: `.mp4`, `.mov`, `.webm`, `.gif`
- Recommended resolution: 1920x1080 or higher (16:9 aspect ratio)
- Videos should be loopable (seamless loop preferred).

## Usage

```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --bg-type stock --background rain.mp4
```
