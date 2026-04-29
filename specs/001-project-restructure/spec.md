# Feature Specification: Project Restructure for Human-Assister Model

**Feature Branch**: `[main]`  
**Created**: 2026-04-29  
**Status**: Draft  
**Input**: Remove desktop-UI, social media automation code, refactor folder organization, separate inputs/outputs from project folder, prepare for new repository

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clean Project Structure (Priority: P1)

As a developer, I want a clean, modular project structure so that I can maintain and extend the codebase without legacy automation code interfering with the human-assister model.

**Why this priority**: Foundation for all future development; removes technical debt and confusion from abandoned automation approach.

**Independent Test**: Can verify by inspecting directory structure - no desktop-app/, no browser automation code, clear separation of concerns.

**Acceptance Scenarios**:

1. **Given** the current codebase with desktop-app and automation code, **When** restructure completes, **Then** all desktop-UI code is removed
2. **Given** the current facebook_poster and x_poster automation, **When** restructure completes, **Then** browser automation posting code is removed
3. **Given** the restructured project, **When** developer examines structure, **Then** purpose of each directory is immediately clear

---

### User Story 2 - Externalized Data Storage (Priority: P1)

As a user, I want my content inputs (images, videos) and outputs (suggestions, generated media) stored outside the project folder so that project updates don't risk my content and I can organize my data logically.

**Why this priority**: Protects user data, enables clean project updates, follows separation of code vs. data best practices.

**Independent Test**: Can verify by checking that no user content exists in project directories; all paths point to external configurable locations.

**Acceptance Scenarios**:

1. **Given** existing images in facebook_poster/images/, **When** restructure completes, **Then** images are moved to external data directory with configurable path
2. **Given** suggestion files in project folders, **When** restructure completes, **Then** outputs go to external output directory
3. **Given** a fresh install, **When** user configures data location, **Then** all content storage uses that location

---

### User Story 3 - Logical Service Naming (Priority: P2)

As a developer, I want services named by their function rather than platform (facebook_poster, x_poster) so that the codebase remains relevant if platforms change and better reflects the human-assister purpose.

**Why this priority**: Improves maintainability, reduces platform-specific coupling, aligns with human-assister pivot.

**Independent Test**: Can verify by reviewing service names - should describe function (content-suggester, media-generator) not platforms.

**Acceptance Scenarios**:

1. **Given** current platform-named services, **When** restructure completes, **Then** services are renamed by function
2. **Given** the new naming scheme, **When** developer reads service name, **Then** purpose is clear without platform context

---

### User Story 4 - Repository Fresh Start (Priority: P3)

As the project owner, I want to start with a new git repository with a proper name so that the project history reflects the pivoted direction and has a professional name.

**Why this priority**: Clean psychological and practical break from old "sharing-helpers" identity; enables fresh start with proper naming.

**Independent Test**: Can verify by checking git remote - should point to new repository with appropriate name.

**Acceptance Scenarios**:

1. **Given** current repository named "sharing-helpers", **When** fresh start completes, **Then** new repository has professional name reflecting human-assister purpose
2. **Given** the new repository, **When** initial commit is made, **Then** only restructured code is included (no legacy automation code)

---

### Edge Cases

- How to handle user's existing content during migration (images, videos, suggestions)?
- What happens to configuration files that reference old paths?
- How to preserve useful utility code while removing automation-specific logic?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST remove all desktop-app directory and related Electron UI code
- **FR-002**: System MUST remove all browser automation code for Facebook posting (poster.js, test.js, scheduling code)
- **FR-003**: System MUST remove all browser automation code for X/Twitter posting
- **FR-004**: System MUST relocate image storage from project folder to configurable external directory
- **FR-005**: System MUST relocate output files (suggestions, generated videos) to configurable external directory
- **FR-006**: System MUST rename service directories to reflect function rather than platform names
- **FR-007**: System MUST maintain configuration mechanism for data storage paths
- **FR-008**: Users MUST be able to configure input/output locations via configuration files
- **FR-009**: System MUST provide migration path for existing user content
- **FR-010**: System MUST preserve core utility functions (content generation, media processing) that are platform-agnostic

### Key Entities

- **Content Library**: Collection of user's media assets (images, videos) stored externally, managed by the system
- **Suggestion**: Generated content recommendation with metadata (caption, matched groups, timestamp)
- **Service Configuration**: Settings for each service including data paths, operational parameters
- **Generated Media**: Output videos/images created by the system for user review

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of desktop-UI code removed (zero Electron/browser automation files remain)
- **SC-002**: 100% of platform-specific automation code removed (no Facebook/X poster scripts)
- **SC-003**: All user content (images, videos, suggestions) stored outside project directory
- **SC-004**: Service names reflect function over platform (at least 3 services renamed appropriately)
- **SC-005**: Configuration system supports external path specification for all data storage
- **SC-006**: New repository created with professional name unrelated to "sharing-helpers"
- **SC-007**: Documentation updated to reflect new human-assister model and data separation
- **SC-008**: Developer can install project and configure custom data locations in under 5 minutes

## Assumptions

- User wants to preserve core media generation and content suggestion logic
- User will provide new repository name or approve suggested name
- External data storage will use local file system paths (not cloud storage in initial implementation)
- User understands that automation code removal means manual posting workflow
- Configuration files will be migrated/updated to reflect new structure
- Some utility code from automation services may be reusable in human-assister model
