# Implementation Plan: Integrate & Refactor Recovered Media Pipeline Files

**Branch**: `002-integrate-recovered-files` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)

## Summary
This feature restores the core media generation and content suggestion capabilities by integrating recovered legacy files into the new `src/services/` structure. The technical approach involves refactoring hardcoded legacy paths, moving shared assets (like `reciters.json`) to a global location, and establishing proper service boundaries to ensure long-term maintainability without data loss.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: Node.js v18+ (LTS)  
**Primary Dependencies**: `node-cron`, `pm2`, `axios` (new), `canvas` (optional, new)  
**Storage**: JSON flat-file storage (`config.json`, `reciters.json`, `content.json`)  
**Testing**: `node:test` (built-in Node.js runner) - NEEDS CLARIFICATION for project-wide setup  
**Target Platform**: Windows (user local environment)
**Project Type**: Automation Background Services  
**Performance Goals**: N/A (scheduled intervals)  
**Constraints**: Zero data loss for group URLs; zero references to legacy directories.  
**Scale/Scope**: ~200 Facebook groups, 43 reciters.

### Principles Audit

- **Principle I (Modular Architecture)**: ✅ PASS. Recovered logic is being moved into service-specific folders.
- **Principle II (Configuration Externalization)**: ✅ PASS. All paths and group data are moved into JSON config files.
- **Principle III (Test-First Development)**: ⚠️ VIOLATION. Project currently lacks a test runner. Research task 0.1 added.
- **Principle IV (Observability & Logging)**: ✅ PASS. Logic uses existing console logging compatible with PM2.
- **Principle V (Graceful Degradation)**: ✅ PASS. Fetcher includes retry logic with backoff.

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
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
global_assets/
├── reciters.json        # Shared reciter database (moved from recovered-files)
├── fonts/               # Shared fonts for rendering
├── images/              # Shared backgrounds
└── quranKFGQPC-data.js  # Shared Quran text data

src/
├── services/
│   ├── media-generator/
│   │   ├── config.json       # Paths updated to global_assets
│   │   ├── generator.js      # Refactored for new paths
│   │   ├── content-fetcher.js # Moved from recovered-files
│   │   └── text-renderer.js   # Moved from recovered-files
│   └── content-suggester/
│       └── config.json       # Merged with real group data
└── lib/
    └── shared-utils.js       # (Future) Shared logic
```

**Structure Decision**: Option 1 (Single project) - The services share `global_assets` but remain logically separated in the `src/services` directory.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle III | Project lacks testing infrastructure. | Implementing tests now would require setting up the infrastructure from scratch. | Research task will define a minimal setup. |
