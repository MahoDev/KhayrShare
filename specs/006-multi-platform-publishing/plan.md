# Implementation Plan: Multi-Platform Publishing

**Branch**: `[006-multi-platform-publishing]` | **Date**: 2026-07-20 | **Spec**: [spec.md](file:///G:/Mahmoud%20Folder/Programming%20Projects/KhayrShare/specs/006-multi-platform-publishing/spec.md)
**Input**: Feature specification from `/specs/006-multi-platform-publishing/spec.md`

## Summary

Add configuration and generation capabilities to support multi-platform publishing (TikTok, Pinterest, YouTube Shorts, alongside existing Facebook/YouTube). The system will read target platforms from config, avoid formatting conversions (user provides right aspect ratios), and track weekly uploads per reciter in a local JSON file to warn about duplicates.

## Technical Context

**Language/Version**: JavaScript / Node.js
**Primary Dependencies**: None new required
**Storage**: Local JSON file for weekly tracking
**Testing**: Jest (assuming existing test framework)
**Target Platform**: Node.js backend environment
**Project Type**: Background services / cli scripts
**Performance Goals**: Minimal overhead for tracking logic
**Constraints**: Must maintain 100% backward compatibility for legacy workflows
**Scale/Scope**: ~10 platforms, tracking per week per reciter

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Modular Architecture**: PASS. The tracking and configuration will be handled as part of the media generator / publisher services without adding circular dependencies.
- **II. Configuration Externalization**: PASS. Platform links and toggles will be stored in an external configuration file, not hardcoded.
- **III. Test-First Development**: PASS. Tests should be added for the tracking logic and duplicate warning logic before modifying the main routines.
- **IV. Observability & Logging**: PASS. Duplicate warnings and tracking updates will be logged properly with context.
- **V. Graceful Degradation**: PASS. If tracking file is missing/corrupted, system should handle it (create new or fallback gracefully).

## Project Structure

### Documentation (this feature)

```text
specs/006-multi-platform-publishing/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── services/
│   ├── video-publisher/
│   │   ├── config.json        # Updates for platform toggles
│   │   └── publisher.js       # Logic to read tracking data and warn
│   └── media-generator/
│       ├── generator.js       # Logic to append channel links based on toggles
│       └── tracking.js        # NEW: Module for handling JSON tracking reads/writes
```

**Structure Decision**: Extending the existing service structure under `src/services/`. Created a dedicated `tracking.js` to manage the JSON tracker file, ensuring separation of concerns (Constitution Principle I).
