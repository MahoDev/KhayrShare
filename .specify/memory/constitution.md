<!-- SPECKIT SYNC IMPACT REPORT
=============================================================================
Version Change: 0.0.0 → 1.0.0 (Initial constitution)
=============================================================================

Modified Principles:
- None (initial creation)

Added Sections:
- Core Principles (5 principles for JavaScript/Node.js best practices)
- Code Quality Standards
- Development Workflow
- Governance

Removed Sections:
- None

Template Updates Required:
- ✅ .specify/templates/plan-template.md (Constitution Check section already present)
- ✅ .specify/templates/spec-template.md (compatible with principles)
- ✅ .specify/templates/tasks-template.md (supports principle-driven tasks)
- ✅ .specify/templates/commands/*.md (no outdated references found)

Follow-up TODOs:
- TODO(GUIDANCE_FILE): Create runtime development guidance file if needed
=============================================================================
-->

# Facebook Auto Poster Constitution

## Core Principles

### I. Modular Architecture

Each service MUST be self-contained with a single responsibility. Services communicate through well-defined interfaces (files, APIs, or message queues). No circular dependencies between services. Each service MUST have its own configuration, dependencies, and entry point.

**Rationale**: The project contains multiple independent services (facebook_poster, video_generator_service, youtube_poster, x_poster) that need to evolve independently.

### II. Configuration Externalization

All environment-specific values (API keys, URLs, schedules, paths) MUST be externalized in JSON configuration files. No hardcoded credentials or environment-specific paths in source code. Configuration files MUST be documented with required fields and examples.

**Rationale**: Enables deployment across environments without code changes and simplifies maintenance.

### III. Test-First Development

All new features MUST include tests before implementation. Tests MUST be written first, fail initially, then pass after implementation. Each service MUST have a test script (`npm test` or equivalent). Critical paths (posting, video generation, scheduling) require integration tests.

**Rationale**: Ensures reliability of automation services that run unattended 24/7.

### IV. Observability & Logging

All services MUST log operations with timestamps and severity levels (info, warn, error). Errors MUST include context (service name, operation, parameters). Logs MUST be written to console (for PM2/process managers) and optionally to files. Long-running services MUST include health checks and status reporting.

**Rationale**: Services run continuously in production; debuggability is critical for diagnosing issues without direct access.

### V. Graceful Degradation

Services MUST handle failures gracefully without crashing. External service failures (Facebook API, file system) MUST be caught and logged. Services MUST implement retry logic with exponential backoff. Critical failures MUST be logged clearly for operator intervention.

**Rationale**: Automation services must be resilient to network issues, API changes, and temporary failures.

## Code Quality Standards

JavaScript/Node.js code MUST follow these conventions:

- **ES Modules**: Use `import/export` syntax (or CommonJS consistently per service)
- **Async/Await**: Prefer async/await over callback patterns for asynchronous code
- **Error Handling**: Use try/catch blocks; never swallow errors silently
- **Type Safety**: Use JSDoc comments for function signatures and complex types
- **Code Organization**: Separate concerns (services, utilities, configuration, tests)
- **Dependencies**: Minimize external dependencies; prefer built-in Node.js modules
- **Memory Management**: Clean up resources (file handles, browser instances) after use

## Development Workflow

All feature development MUST follow this workflow:

1. **Specification**: Create feature spec with user stories and acceptance criteria
2. **Planning**: Define technical approach, file structure, and constitution compliance
3. **Task Breakdown**: Organize tasks by user story with clear dependencies
4. **Implementation**: Follow test-first principle; commit after each task
5. **Validation**: Run tests and verify against acceptance criteria
6. **Documentation**: Update README and configuration docs

Code reviews MUST verify constitution compliance, especially:
- No hardcoded configuration values
- Proper error handling and logging
- Test coverage for critical paths
- Clear separation of concerns

## Governance

This constitution supersedes all other development practices. Amendments require:

1. **Proposal**: Document the proposed change with rationale
2. **Review**: Verify no negative impact on existing services
3. **Migration**: Define migration plan if change affects existing code
4. **Documentation**: Update all affected templates and guidance files

**Versioning Policy**:
- MAJOR: Backward-incompatible principle changes or removals
- MINOR: New principles or material expansions to existing guidance
- PATCH: Clarifications, wording improvements, typo fixes

**Compliance Review**: All PRs MUST be checked against constitution principles. Complexity deviations MUST be justified in the implementation plan.

**Version**: 1.0.0 | **Ratified**: 2026-03-04 | **Last Amended**: 2026-04-29
