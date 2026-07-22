# Reciter Portraits

Place reciter portrait images here for use with `--bg-type portrait`.

## Naming Convention

- Files must be named `{reciterId}.jpg` (e.g., `1.jpg` for AbdulBaset).
- Supported formats: `.jpg`, `.jpeg`, `.png`
- Recommended resolution: 1920x1080 or higher (16:9 aspect ratio)
- The reciter ID corresponds to the ID used in the reciters JSON configuration.

## Usage

```bash
node src/services/media-generator/generator.js --reciter 1 --surah 1 --range 1-3 --bg-type portrait
```
