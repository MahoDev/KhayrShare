# Data Model

## Content Library
- `id`: String (UUID or hash)
- `type`: Enum (IMAGE, VIDEO)
- `externalPath`: String (absolute path outside project directory)
- `metadata`: Object (dimensions, size, creation date)

## Suggestion
- `id`: String
- `contentId`: String (reference to Content Library)
- `caption`: String
- `matchedGroups`: Array<String>
- `timestamp`: Date
- `outputPath`: String (external path where the suggestion is saved)

## Service Configuration
- `serviceName`: String
- `libraryPath`: String
- `outputPath`: String
- `logLevel`: Enum (info, warn, error)
