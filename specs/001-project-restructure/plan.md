# Implementation Plan: Project Restructure for Human-Assister Model

**Branch**: `001-project-restructure` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-project-restructure/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Restructure the project to support a human-assister model by removing all desktop UI (Electron) and browser automation code. Relocate content storage and outputs to external, configurable directories. Rename services based on function rather than platform (renaming 3 services to fulfill success criteria), and implement rigorous test-first TDD with JSON configuration to fully align with the constitution.

## Technical Context

**Language/Version**: Node.js (JavaScript)
**Primary Dependencies**: Core Node.js modules, Jest (for testing)
**Storage**: File system (externalized directories for user content and output via `config.json`)
**Testing**: Jest
**Target Platform**: Node.js environment (Headless)
**Project Type**: Automation utilities / Content suggestion services
**Performance Goals**: High reliability for automated processing steps, graceful degradation
**Constraints**: No UI, no automated posting via browser, full separation of code and user data, strictly JSON config.
**Scale/Scope**: Refactoring existing monorepo structure (removing desktop-app/, facebook_poster/, x_poster/, restructuring youtube_poster/)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Modular Architecture**: Pass. Services will be restructured based on functionality rather than platform.
- **Configuration Externalization**: Pass. Strictly adhering to JSON config (`config.json`) instead of `.env` files.
- **Test-First Development**: Pass. Adding explicit Jest setup and unit tests tasks to ensure new modules are fully tested.
- **Observability & Logging**: Pass. Existing logging will be preserved and routed correctly.
- **Graceful Degradation**: Pass. Services must fail gracefully without UI to show errors.

## Project Structure

### Documentation (this feature)

```text
specs/001-project-restructure/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Human-Assister Project Structure
src/
├── config/
│   ├── config.example.json
│   └── index.js
├── services/
│   ├── content-suggester/
│   ├── media-generator/
│   └── video-publisher/
├── utils/
│   └── common/
└── scripts/
    └── migrate-data.js

tests/
├── integration/
└── unit/
```

**Structure Decision**: The source code will be reorganized under `src/` with clear service separations based on functionality (`content-suggester`, `media-generator`, `video-publisher`) rather than platform-specific names. User content and output folders will be completely removed from the project tree and mapped via a JSON configuration file.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
