# Research: Expand CLI

## 1. CLI Parsing Strategy

- **Decision**: Keep using manual parsing via a robust `parseCliArgs` function instead of introducing an external dependency like `yargs` or `commander`.
- **Rationale**: The project has historically avoided unnecessary external dependencies. The current `generator.js` implements a custom argument parser `parseCliArgs` that works well. Extending it to support the new flags is straightforward and maintains consistency with the existing codebase. It also keeps the payload small and avoids introducing new vulnerability vectors.
- **Alternatives considered**: Using `yargs` or `commander` would provide automatic help generation and validation, but introduces a new dependency across the project which violates the spirit of "Minimize external dependencies". 

## 2. Platform Presets Configuration

- **Decision**: Define platform presets in the existing `video_style_presets.json` file.
- **Rationale**: `video_style_presets.json` already contains layout and typography configuration. Adding a "platforms" root key (or expanding the preset structure) allows for mapping a platform name (e.g., "tiktok") to a target resolution (e.g., width 1080, height 1920) and a default layout style (e.g., "youtube" or "x"). This fulfills the Constitution's "Configuration Externalization" principle.
- **Alternatives considered**: Hardcoding resolutions in `generator.js`. Rejected because it violates the configuration externalization principle and makes it harder to add new platforms later without code changes.

## 3. Quran Page-to-Verse Mapping

- **Decision**: Create a new `global_assets/quran_page_mapping.json` file mapping page numbers (1-604) to surah and verse ranges. 
- **Rationale**: The standard Madani Mushaf layout is static and universally recognized. Generating or sourcing a static JSON file allows `content-fetcher.js` to look up the exact surah and verse bounds for any given page in O(1) time. This logic can be easily implemented in a new `resolvePageToVerses(pageNumber)` function.
- **Alternatives considered**: Calculating pages algorithmically or making API calls to `alquran.cloud`. Rejected because an algorithmic approach is prone to errors (the Madani Mushaf layout doesn't follow a simple mathematical formula) and relying on external APIs for static data adds unnecessary network overhead and potential failure points.

## 4. Background Selection

- **Decision**: Scan the `backgrounds` directory dynamically when `--listBackgrounds` is called, and allow exact matching when `--background <filename>` is provided.
- **Rationale**: The video publisher backgrounds directory is the source of truth. Using `fs.readdirSync` and filtering for images is already implemented for the random case. Reusing this logic for explicit listing and selection guarantees synchronization without requiring a new configuration file.
- **Alternatives considered**: Maintaining a hardcoded list of backgrounds in a config file. Rejected because it would require manual updates every time an image is added or removed.

## 5. Dry-Run Mode

- **Decision**: Inject a `dryRun: true` flag into the config or options passed to the `VideoGenerator` instance. 
- **Rationale**: This allows the generator to resolve all parameters, load the configuration, select the reciter, surah, and background, and then `console.log` a summary of what *would* happen, before early exiting prior to the heavy `contentFetcher.processAudio` and FFmpeg encoding steps.
- **Alternatives considered**: Refactoring the entire generation pipeline to return promises of intended actions. Rejected as overly complex and risky for the current architecture.

## 6. Help Message Generation

- **Decision**: Implement a custom `printHelp()` function in `generator.js`.
- **Rationale**: Since we are using manual argument parsing, we also need manual help generation. This function will print a nicely formatted string explaining all flags, styles, platforms, and usage examples.
- **Alternatives considered**: None, this is a direct consequence of the CLI parsing strategy decision.
