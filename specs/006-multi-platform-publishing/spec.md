# Feature Specification: Multi-Platform Publishing

**Feature Branch**: `[006-multi-platform-publishing]`  
**Created**: 2026-07-20  
**Status**: Draft  
**Input**: User description: "the videos generated right now by the media generator can be techincally posted anywhere but i only post them to facebook groups and my youtube channel if i want and that works fine I want to start posting them elsewhere like creating a tiktok and pinterest account and posting there also maybe posting in youtube shorts instead of just normal videos that i do now it should be simple to include the channel links in the next_post generated text file but i am not sure how to make the workflow of posting like how to keep track if what reciter i uploaded this week and i don't think the default video resolution would fit the youtube shrots and tiktok i would like the changes to not cause a lot of differences in my workflow unless it's needed but things should be configurable and toggelable to avoid old ways not working anymore"

## Clarifications

### Session 2026-07-20
- Q: How should the system handle converting horizontal source media to vertical formats? → A: No automatic conversion is needed; the user will provide appropriately formatted source media for the target platforms.
- Q: Where should the weekly upload tracking data be stored? → A: Store tracking data in a local JSON file.
- Q: Should the system strictly prevent duplicate uploads, or allow them with a warning? → A: Issue a warning but allow generation to proceed if confirmed.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Configure target platforms (Priority: P1)

As a creator, I want to configure which platforms (TikTok, Pinterest, YouTube Shorts, Facebook, YouTube Normal) a video is generated for, so that the correct video formats and text links are produced.

**Why this priority**: Essential foundation for multi-platform support without breaking the existing workflow.

**Independent Test**: Can be fully tested by generating a post with old defaults versus generating with new platforms enabled, verifying that the generated files differ accordingly.

**Acceptance Scenarios**:

1. **Given** legacy settings are enabled, **When** generating a video, **Then** it produces the default horizontal video format without new platform links in the text file.
2. **Given** TikTok and YouTube Shorts are enabled in configuration, **When** generating a video, **Then** it produces the appropriate vertical format (e.g., 9:16) and includes respective channel links in the `next_post` text file.

---

### User Story 2 - Track weekly reciter uploads (Priority: P2)

As a creator, I want the system to keep track of which reciter I uploaded this week per platform, so that I don't accidentally repeat or mismanage the upload schedule across multiple channels.

**Why this priority**: Crucial for managing the complexity of posting across many new accounts without manual tracking overhead.

**Independent Test**: Can be tested by executing a generation/posting step and verifying that the system updates a persistent tracking log for the specified week and platform.

**Acceptance Scenarios**:

1. **Given** no uploads this week, **When** a video for a specific reciter is generated/marked as posted for TikTok, **Then** the system logs this reciter for the current week under TikTok.
2. **Given** a reciter was already uploaded to YouTube Shorts this week, **When** attempting to generate/post the same reciter for Shorts, **Then** the system issues a warning about the duplicate but allows the user to proceed if confirmed.

---

### Edge Cases

- How does the system handle tracking if an upload spans across the weekend/week boundary?
- What happens when a user attempts to generate for both horizontal (YouTube) and vertical (TikTok) platforms simultaneously?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support configuration toggles for new target platforms (TikTok, Pinterest, YouTube Shorts) alongside existing ones (Facebook, YouTube).
- **FR-002**: System MUST generate appropriate video resolutions (e.g., 9:16 vertical) when TikTok or YouTube Shorts are selected.
- **FR-003**: System MUST append the appropriate target platform channel links in the generated `next_post` text file.
- **FR-004**: System MUST maintain a historical log or tracking mechanism of which reciter was uploaded for each week.
- **FR-005**: System MUST preserve the legacy workflow as the default behavior to prevent disruption to existing habits.
- **FR-006**: System MUST generate both video files (horizontal and vertical) simultaneously when both formats are required for the selected target platforms.

### Key Entities

- **Platform Configuration**: Settings that define active platforms, their required video resolutions, and associated channel links.
- **Upload Tracker**: A persistent record tracking `(Week, Reciter, Platform)` stored in a local JSON file to prevent duplicates.
- **Next Post Data**: The text file payload containing the descriptions and platform-specific links.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Old workflow operates with 100% backward compatibility when new platform toggles are off.
- **SC-002**: Video generation correctly outputs 9:16 vertical video formats when TikTok or YouTube Shorts are selected.
- **SC-003**: The `next_post` text file successfully includes links for all selected platforms in 100% of generations where they are enabled.
- **SC-004**: User can query or view the weekly reciter tracking history without manual spreadsheet management.

## Assumptions

- User will provide source media in the correct orientation (horizontal or vertical) as required by the chosen target platforms; no automatic format conversion (cropping/padding) is performed.
- A "week" is defined by a standard calendar week (e.g., starting on Monday).
- Channel links are static and can be provided once in the configuration.
