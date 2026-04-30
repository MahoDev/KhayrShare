# Research & Decisions: Integrate Recovered Files

## Technical Context Unknowns Resolved

- **Canvas Dependency on Windows**:
  - *Decision*: Add `canvas` as an `optionalDependency` in `package.json`.
  - *Rationale*: Canvas often fails to compile on Windows without Visual Studio build tools. Since `useXPosterStyle` is false by default, it is not on the critical path, and optional installation prevents `npm install` from failing.
  - *Alternatives considered*: Normal dependency (rejected due to high likelihood of failure), mocking (rejected as it disables the feature entirely).

- **Path Resolution for Recovered Files**:
  - *Decision*: Place `reciters.json` in `global_assets/` and `content-fetcher.js` / `text-renderer.js` in `src/services/media-generator/`. Update paths to use `../../global_assets/` relative mapping.
  - *Rationale*: Centralizes shared static data while keeping service-specific logic inside the service boundary.
  - *Alternatives considered*: Placing all files in `global_assets/` (rejected, logic shouldn't be in assets).

- **Configuration Merging**:
  - *Decision*: Merge recovered `config.json` group data into `src/services/content-suggester/config.json`, replacing dummy groups while keeping existing settings and taxonomy.
  - *Rationale*: Preserves the actual posting targets without losing the scheduler configurations added during refactoring.

## Best Practices & Patterns

- **Graceful Degradation**: `content-fetcher.js` must handle network errors using exponential backoff to adhere to Constitution Principle V.
- **Externalization**: No hardcoded paths to deprecated directories (`youtube_poster`, `x_poster`) should remain in the code (Constitution Principle II).
