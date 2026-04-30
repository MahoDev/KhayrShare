# Data Model: Media Pipeline

## Entities

### Reciter
Represents a Quran reciter used for audio generation.
- `id` (string/number): Unique identifier (1-43).
- `name` (string): Arabic display name.
- `hashtag_name` (string): Arabic hashtag name (e.g., `عبد_الباسط_عبد_الصمد`).
- `bitrate` (object): Map of quality levels to EveryAyah folder names.
  - `64kbps`, `128kbps`, `192kbps`, etc.
- `category` (string, optional): e.g., `"muallim"`.
- `includeGeneralGroups` (boolean, optional): Whether to include this reciter in general posting groups.

### Facebook Group
Represents a target group for content suggestions.
- `name` (string): Group display name.
- `url` (string): Permanent Facebook Group URL.
- `categories` (array): List of categories this group accepts (`hadith`, `quran`, `video`, etc.).
- `forReciter` (string/array, optional): Specific reciter name(s) this group is dedicated to.

## Relationships
- **Group <-> Content**: Matched via `categories` intersection.
- **Group <-> Video**: Matched via `forReciter` string match (Arabic) or general category.
