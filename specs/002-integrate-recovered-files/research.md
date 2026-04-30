# Research: Recovered Files Integration

## R0.1: Testing Infrastructure
**Decision**: Use Node.js built-in `node:test` runner.
**Rationale**: Aligns with Principle VII (Minimize external dependencies). Zero setup required other than creating `.test.js` files.
**Alternatives considered**: Vitest (too much overhead for this stage), Jest (complex configuration).

## R0.2: Canvas Dependency on Windows
**Decision**: Keep as `optionalDependency`.
**Rationale**: `canvas` requires native build tools (Python, Visual Studio) on Windows. If installation fails, the service can still run in YouTube-landscape mode (which doesn't use `text-renderer.js` yet).
**Implementation**: Use dynamic `import()` or `require()` within a try-catch block in `text-renderer.js` to prevent runtime crashes if the module is missing.

## R0.3: Path Resolution Strategy
**Decision**: Use absolute paths resolved from the project root in configuration, but keep `path.resolve(__dirname, ...)` for internal service dependencies.
**Rationale**: Ensures services can be run from any CWD (like via PM2) while maintaining the modularity requested in Principle I.
**Implementation**: 
- Shared assets -> `global_assets/`
- Service configs -> `src/services/<service>/config.json`
- Service-to-Service references -> Relative paths in `config.json`.

## R0.4: Merging Config Data
**Decision**: Replace only the `groups` key in `content-suggester/config.json`.
**Rationale**: Preserves the user's specific `checkIntervalMinutes` and `taxonomy` settings which were correctly initialized in the new structure.
