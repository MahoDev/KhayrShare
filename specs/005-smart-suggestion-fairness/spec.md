# Feature Specification: Smart Suggestion Fairness

**Feature Branch**: `005-smart-suggestion-fairness`  
**Created**: 2026-07-08  
**Status**: Draft  
**Input**: User description: "Improve background khayr-suggestor group suggestion fairness (reduce same-day repeats), and improve khayr-media-gen reciter fairness (round-robin per day with auto-reset), plus add a regenerate flag to suggestion text files so a specific reciter's video can be re-generated on demand."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Groups Suggested Today Have Lower Chance of Reappearing (Priority: P1)

The user runs the background khayr-suggestor throughout the day. Currently, the same Facebook groups keep being picked over and over, causing over-posting to some groups and neglect of others. After this feature, groups that were already suggested on the current calendar day should have a significantly reduced — but not zero — probability of being selected again compared to groups that have not yet appeared today.

**Why this priority**: This is the most painful daily friction point. Fairness across Facebook groups is essential to balanced reach, and it directly impacts how useful the tool is each day.

**Independent Test**: Run the suggestor many times in the same day. Verify that the groups suggested on that day appear significantly less often in subsequent suggestions, while never being completely blocked. Compare the distribution of group appearances with and without the feature.

**Acceptance Scenarios**:

1. **Given** a group was suggested earlier today, **When** the suggestor runs again, **Then** that group's selection probability is measurably lower than groups that have not been suggested today (but still above zero).
2. **Given** all groups have been suggested today, **When** the suggestor runs, **Then** the system gracefully handles this state (either selects from all with reduced weights or resets today's within-day tracking).
3. **Given** it is a new calendar day, **When** the suggestor runs, **Then** today's within-day dampening resets and all groups are treated equally (as governed only by long-term usage history).

---

### User Story 2 - Reciters Are Suggested in a Fair Round-Robin Per Day (Priority: P1)

The user runs the background khayr-media-gen throughout the day. Currently, the same reciters keep appearing because the selection is purely random. After this feature, once a reciter has had a video generated for them on the current day, they should be removed from the selection pool for that day. When all reciters have been used, the pool resets automatically.

**Why this priority**: Equal priority to Story 1 — this is the core pain point for the media-gen service and directly affects content quality and variety for the user.

**Independent Test**: Trigger multiple generations in a single day. Verify that each reciter appears exactly once before any reciter appears a second time. After all reciters have appeared, verify the pool resets and the cycle begins again.

**Acceptance Scenarios**:

1. **Given** a reciter was selected for video generation earlier today, **When** the next generation runs, **Then** that reciter is excluded from the selection pool.
2. **Given** all reciters have had a video generated today, **When** another generation is triggered, **Then** the daily reciter pool resets automatically and a new round-robin begins.
3. **Given** it is a new calendar day, **When** the first generation runs, **Then** the full pool of reciters is available (previous day's tracking is cleared).
4. **Given** the excluded reciters setting in config, **When** the pool is built, **Then** excluded reciters are never part of the eligible pool regardless of the round-robin state.

---

### User Story 3 - Regenerate a Video for a Specific Reciter On Demand (Priority: P2)

After the user receives a video suggestion text file, they may find the content unsuitable — for example, the verses are too short, or the same verse range was posted on a previous day. Rather than waiting for the next scheduled generation, the user wants to signal to the system that a new video should be regenerated for that same reciter, but with a fresh random surah and verse selection. They do this by changing a `regenerate: false` field in the text file to `regenerate: true` and saving it. The system detects this flag almost instantly and automatically generates a replacement.

**Why this priority**: This is a quality-of-life improvement that gives the user control without needing to manually run CLI commands. It is dependent on P1 features being in place first.

**Independent Test**: Open a generated suggestion text file, set `regenerate: true`, save it, and wait a few seconds. Verify that a new suggestion text file is produced for the same reciter with a different surah/verse range, and verify the `regenerate` flag is reset (or the old file is replaced).

**Acceptance Scenarios**:

1. **Given** a suggestion text file has `regenerate: false`, **When** the system checks, **Then** no regeneration occurs and the file is left unchanged.
2. **Given** a suggestion text file has `regenerate: true`, **When** the system checks, **Then** a new video is generated for the same reciter with a random surah/verse range, a new text file is created, and the old file is either deleted or updated.
3. **Given** a regeneration is triggered, **When** the generation completes, **Then** the reciter used does NOT count again toward today's round-robin pool exhaustion (it was already counted when the original video was generated).
4. **Given** the regeneration file is malformed or the reciter ID cannot be parsed, **When** the scheduler checks, **Then** the system logs an error and skips that file without crashing.

---

### Edge Cases

- What happens when all groups are already dampened for today and the system needs to suggest one? It should fall back gracefully, selecting from all groups using only long-term usage weights.
- What happens when the round-robin pool is exhausted mid-day and another generation is triggered? The pool resets and a new round begins from the full set of eligible reciters.
- What happens if the reciter tracker file is deleted or corrupted? The system should treat it as an empty state (all reciters available) and continue normally.
- What happens if the group dampening tracker file is missing or corrupt? System treats all groups as not-yet-suggested today and continues normally.
- What happens if the `regenerate` flag is set to `true` but the reciter ID in the file cannot be matched? The system logs a warning and skips.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The khayr-suggestor MUST track which Facebook groups were suggested on the current calendar day in a persistent, per-day data store.
- **FR-002**: The khayr-suggestor MUST apply a significantly reduced selection weight to groups already suggested today, without completely eliminating them from the pool.
- **FR-003**: The khayr-suggestor's within-day dampening data MUST reset automatically at the start of each new calendar day.
- **FR-004**: The khayr-media-gen MUST maintain a per-day round-robin pool of eligible reciters that shrinks as reciters are used within the same day.
- **FR-005**: The khayr-media-gen's daily reciter pool MUST automatically reset when all eligible reciters have been used, allowing the cycle to continue.
- **FR-006**: The khayr-media-gen's daily reciter pool MUST reset automatically when a new calendar day begins.
- **FR-007**: The khayr-media-gen MUST write a `regenerate: false` field to every new suggestion text file, appended after the `[ FACEBOOK GROUPS TO POST IN (Specific) ]` section.
- **FR-008**: The khayr-media-gen scheduler MUST frequently check existing suggestion text files for `regenerate: true` (e.g. via a fast-polling loop).
- **FR-009**: When `regenerate: true` is detected, the system MUST generate a new video for the same reciter with a randomly selected surah and verse range, produce a new suggestion text file, and remove or update the old file.
- **FR-010**: A regeneration event triggered by `regenerate: true` MUST NOT affect the round-robin pool state (the reciter was already counted when the original video was generated).
- **FR-011**: All new tracking data MUST be stored in the existing output directory structure to avoid introducing new file system paths beyond what is already in use.

### Key Entities *(include if feature involves data)*

- **Daily Group Suggestion Tracker**: A record keyed by calendar date that tracks which Facebook group URLs were suggested on that day. Used by khayr-suggestor to apply within-day dampening.
- **Daily Reciter Pool**: A record keyed by calendar date that tracks which reciter IDs have already had a video generated for them. Used by khayr-media-gen to enforce round-robin selection. Resets when all eligible reciters are exhausted or on a new day.
- **Suggestion Text File**: The `.txt` file produced by khayr-media-gen after each video generation. Contains video metadata, caption, groups, and the new `regenerate` boolean field.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In a simulated multi-suggestion session on a single day, each Facebook group that was suggested earlier in the day appears with at least 50% lower frequency in subsequent suggestions compared to groups that were not yet suggested.
- **SC-002**: In a simulated multi-generation session on a single day, no reciter appears twice in the suggestion outputs until every other eligible reciter has appeared at least once.
- **SC-003**: After all eligible reciters have been used in a day, the next generation successfully selects a reciter and produces a valid output (pool reset works correctly).
- **SC-004**: Setting `regenerate: true` in a suggestion text file causes a new, valid suggestion file to be produced for the same reciter almost instantly, without requiring any manual CLI invocation.
- **SC-005**: On the start of a new calendar day, both the within-day group dampening and the reciter pool tracking reset cleanly, confirmed by observing fresh, unbiased selections from the full pool.

## Assumptions

- The existing `group_usage.json` (long-term usage tracker) in khayr-suggestor is separate from and complementary to the new within-day dampening tracker; both operate in parallel.
- The existing `history.json` (daily posted-groups list) in khayr-suggestor, which already prevents re-posting to the same group within a day, is distinct from the new dampening mechanism which only *reduces* probability rather than eliminates.
- The eligible reciter pool for round-robin is built from the full set of reciters minus those in `settings.excludedReciters` in the media-gen config.
- The `regenerate` field in the suggestion text file follows the same plain-text key-value format already used by `finishedPosting` in the khayr-suggestor text files.
- Day boundaries are determined by the local system clock (consistent with the existing use of `DateTime.now().setZone("local")`).
- The feature does not change the trigger probability or scheduling interval of either background service.
- The reciter ID embedded in the suggestion text file is sufficient to identify the reciter for a regeneration request (the file already includes reciter name; the ID can be derived or stored alongside it).
