# Phase 0: Outline & Research

## Decision: Tracker Data Format
**Decision**: Store tracking data in a local JSON file (e.g., `data/weekly_uploads.json`).
**Rationale**: Simple to read/write in Node.js, easy to manually inspect, meets requirements for tracking `(Week, Reciter, Platform)` without overhead of a database.
**Alternatives considered**: SQLite (rejected: overkill for this volume).

## Decision: Duplicate Handling UX
**Decision**: System will log a bold warning before generation but will allow proceeding if user confirms or if running in a forced mode.
**Rationale**: User specifically requested a warning but allowing to proceed.
