# Data Model: Integrate Recovered Files

## Entities

### Reciter (`global_assets/reciters.json`)
Represents an available Quran reciter for video generation.

**Fields**:
- `id` (String key): Numeric identifier (e.g., "1", "2").
- `name` (String): Arabic name of the reciter.
- `hashtag_name` (String): Normalized name used for generating hashtags.
- `bitrate` (Object): Map of audio qualities (e.g., "64kbps") to their `everyayah.com` directory names.
- `category` (String, optional): E.g., "muallim".
- `includeGeneralGroups` (Boolean, optional): Whether this reciter should be posted to general groups.

**Relationships**:
- Used by `media-generator` to select audio source URLs.

### Facebook Group (`src/services/content-suggester/config.json`)
Represents a target group for posting content.

**Fields**:
- `name` (String): Display name of the group.
- `url` (String): Permanent Facebook URL for the group.
- `categories` (Array of Strings): Categories of content acceptable for this group (e.g., "hadith", "quran").
- `forReciter` (String or Array of Strings, optional): Specific reciter name(s) this group is dedicated to.

**Relationships**:
- Indexed by a category key (e.g., "hadith", "religious_mix") in the configuration structure.

### Video Generation Configuration (`src/services/media-generator/config.json`)
Defines the parameters for the media-generator service.

**Fields (Updated Paths)**:
- `paths.recitersJson`: `"../../global_assets/reciters.json"`
- `paths.facebookConfig`: `"../content-suggester/config.json"`
- `videoMode.useXPosterStyle`: Boolean flag determining whether `text-renderer.js` is utilized.

## State Transitions
- **File Relocation**: Files move from `recovered-files/` temporary state to their permanent locations in `src/` and `global_assets/`.
- **Path Resolution**: Stale relative paths transition to correct relative paths reflecting the new modular architecture.
