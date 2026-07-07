# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Massively expand the CLI capabilities of the media generator to support customizable reciters, surahs, verse ranges, video sizes, platform presets, and page-based verse selection, replacing the current "random-only" default while preserving it as a fallback.

## Technical Context

**Language/Version**: Node.js (JavaScript)
**Primary Dependencies**: yargs (or custom arg parser), arabic-reshaper, fluent-ffmpeg, axios, sharp
**Storage**: Filesystem (JSON configs/assets, reciters.json, surah_info.json)
**Testing**: Automated test scripts (`npm test` or equivalent)
**Target Platform**: Node.js CLI / Background service via PM2
**Project Type**: Video Generation Service / CLI Tool
**Performance Goals**: < 3 minutes for an average-length video generation
**Constraints**: Fully backward compatible with no-arg execution; must gracefully handle network failures during audio fetch
**Scale/Scope**: Local background generation, ~114 surahs, 43 reciters, 604 pages

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Modular Architecture**: The CLI parsing should be cleanly separated from the `VideoGenerator` logic. New capabilities will leverage existing `ContentFetcher` without tight coupling.
- [x] **Configuration Externalization**: Platform presets and page mapping data will be externalized in JSON configuration files (e.g., `video_style_presets.json`, new `quran_page_mapping.json`) rather than hardcoded.
- [x] **Test-First Development**: Testing scenarios (random, specific surah, platform presets) must be verifiable independently.
- [x] **Observability & Logging**: The dry-run mode and detailed error logging for invalid flags meet this requirement.
- [x] **Graceful Degradation**: Fallback to random reciter if audio is missing; clear errors when FFmpeg or backgrounds are missing.

## Project Structure

### Documentation (this feature)

```text
specs/003-expand-cli/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output (to be generated)
```

### Source Code (repository root)

```text
global_assets/
├── reciters.json
├── surah_info.json
├── quran_page_mapping.json      # NEW: Page to Surah/Verse mapping
└── video_style_presets.json     # MODIFIED: Add platform presets

src/
└── services/
    └── media-generator/
        ├── generator.js         # MODIFIED: Advanced CLI parsing
        └── content-fetcher.js   # MODIFIED: Page-based fetch support
```

**Structure Decision**: The project is a set of Node.js background services. Modifications are limited to the `media-generator` service and global JSON assets, maintaining the established modular architecture.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

*(No violations)*
