# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Expand the video generation system to support multiple visual formats (reciter portraits, stock videos/looping GIFs, and live verse text synchronization). This will be managed by a unified `--format` flag, with a supporting `--bg-type` flag. In addition, the video text layout will be redesigned for better readability, and interactive CLI prompting will be introduced to allow users to customize thumbnail text.

**Language/Version**: Node.js
**Primary Dependencies**: FFmpeg, sharp
**Storage**: Filesystem (Assets, output videos)
**Testing**: Existing Jest test suite + manual CLI testing
**Target Platform**: Linux/Windows Desktop
**Project Type**: Automation Service / CLI Toolkit
**Performance Goals**: Video rendering should not exceed 2x the audio duration for complex SVG overlays. Stock video rendering should loop with minimal memory overhead.
**Constraints**: Zero visible jump cuts in looped video; audio must be exactly the length of the stitched verses.
**Scale/Scope**: Local usage (1 concurrency). Single video generation per command.

## Constitution Check

*GATE: Passed*
- **Modular Architecture**: The new features will be isolated to `VideoGenerator` and `ContentFetcher` classes without introducing cross-service circular dependencies. Asset directories follow the established structure.
- **Configuration Externalization**: Supported formats and defaults can remain in code if they are part of CLI usage, but we will ensure any static asset paths are derived properly relative to `__dirname`.
- **Test-First Development**: We will augment any existing CLI parameter tests (`run_cli_tests.js`) and unit tests.
- **Observability & Logging**: The new CLI prompts and asset fallbacks (e.g., missing portrait falling back to random background) will log clearly to the console.
- **Graceful Degradation**: If an asset is missing or FFmpeg fails, the system logs the error cleanly. Missing portraits fallback gracefully to standard scenic backgrounds.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── media-generator/
│   │   ├── generator.js            # Entry point; CLI arg parsing, interactive prompts
│   │   └── content-fetcher.js      # Extracts verse audio durations
│   └── video-publisher/
│       ├── video-generator.js      # FFmpeg logic for new formats and background types
│       ├── thumbnail-generator.js  # Redesigned sharp logic with custom text
│       └── assets/                 # NEW: Directory for portraits and stock videos
│           ├── portraits/
│           │   └── README.md
│           └── stock-videos/
│               └── README.md
```

**Structure Decision**: The feature extends the existing `video-publisher` service by adding dedicated asset sub-directories and modifying the core generator/publisher files to support the new CLI flags and media formats. No structural paradigm shifts are required.

## Complexity Tracking

No violations of the Constitution or complex deviations required. The implementation seamlessly builds upon the established architecture.
