# Configuration Contract

All services must accept their operational parameters and data paths from a central JSON configuration file. This ensures strict compliance with the Constitution's "Configuration Externalization" principle.

### JSON Configuration Schema (`src/config/config.json`)

```json
{
  "CONTENT_LIBRARY_PATH": "/absolute/path/to/content",
  "OUTPUT_PATH": "/absolute/path/to/output",
  "LOG_LEVEL": "info"
}
```

- `CONTENT_LIBRARY_PATH` (Required): Absolute path to the user's content (images and videos). No content should be read from the project repository itself.
- `OUTPUT_PATH` (Required): Absolute path to the directory where generated suggestions and generated media will be saved.
- `LOG_LEVEL` (Optional): Logging verbosity for the services (`info`, `warn`, `error`). Defaults to `info`.

### Directory Structure Requirements

The application will expect the external `CONTENT_LIBRARY_PATH` to be readable and the `OUTPUT_PATH` to be writable. It is the responsibility of the configuration module to validate these access rights on startup.
