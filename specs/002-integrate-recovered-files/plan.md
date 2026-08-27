# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Integrate the recovered legacy files (`content-fetcher.js`, `text-renderer.js`, `reciters.json`, and group configs) into the new KhayrShare service architecture. Restore background functionality for the media-generator and content-suggester services while preserving all existing data and ensuring the architecture remains modular and extensible without deprecated path references.

## Technical Context

**Language/Version**: Node.js (JavaScript)
**Primary Dependencies**: axios, canvas (optionalDependency)
**Storage**: Filesystem (`config.json`, `reciters.json`)
**Testing**: Automated integration test scripts via npm test
**Target Platform**: Node.js / PM2
**Project Type**: Background automation services
**Performance Goals**: Reliable periodic execution without memory leaks or unhandled crashes
**Constraints**: Zero data loss for recovered group URLs; must handle network failures gracefully
**Scale/Scope**: ~200 Facebook groups, 43 reciters, low-frequency execution (e.g., 1 video/12h)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **Modular Architecture**: Files correctly assigned to service vs. shared directories.
- [x] **Configuration Externalization**: Hardcoded paths removed; config files merged correctly.
- [x] **Test-First Development**: Integration test scripts included in tasks before implementation.
- [x] **Observability & Logging**: Services maintain PM2 logging compatibility.
- [x] **Graceful Degradation**: External dependencies (like `canvas`) made optional; `content-fetcher.js` uses retry loops.

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
global_assets/
└── reciters.json

src/
├── services/
│   ├── content-suggester/
│   │   └── config.json
│   └── media-generator/
│       ├── config.json
│       ├── content-fetcher.js
│       ├── generator.js
│       └── text-renderer.js
```

**Structure Decision**: A single monorepo structure where shared data (`reciters.json`) lives in `global_assets/` and service-specific logic (`content-fetcher.js`, `text-renderer.js`) lives inside the isolated `src/services/media-generator/` boundary.

> **Fill ONLY if Constitution Check has violations that must be justified**

*(No violations detected)*
