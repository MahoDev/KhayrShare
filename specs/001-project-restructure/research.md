# Phase 0: Research & Clarifications

## Testing Framework
- **Decision**: Standardize on `Jest` for the new functional structure.
- **Rationale**: Aligns with the "Test-First" principle. Jest provides an all-in-one testing framework suitable for Node.js projects, allowing easy mocking for headless tests.
- **Alternatives considered**: Mocha/Chai, native Node.js runner.

## Service Functional Naming
- **Decision**: Rename existing services to reflect their function:
  - `facebook_poster` -> `content-suggester`
  - `video_generator_service` -> `media-generator`
  - `youtube_poster` -> `video-publisher` (keeping upload utility, minus browser automation if any).
  - `x_poster` -> Remove entirely.
- **Rationale**: FR-006 and SC-004 mandate functional names for at least 3 services.
- **Alternatives considered**: Deleting all publishers.

## Configuration Externalization Strategy
- **Decision**: Create a central `config.json` mechanism to point to external directories:
  - `CONTENT_LIBRARY_PATH`
  - `OUTPUT_SUGGESTIONS_PATH`
  - `GENERATED_MEDIA_PATH`
- **Rationale**: Satisfies FR-004, FR-005, FR-007, FR-008, AND complies strictly with the constitution's "JSON configuration files" mandate.
- **Alternatives considered**: `.env` variables (rejected due to constitution conflict).
