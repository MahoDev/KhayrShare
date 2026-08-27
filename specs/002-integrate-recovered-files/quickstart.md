# Quickstart: Integrate Recovered Files

## Overview
This feature restores the functionality of the `media-generator` and `content-suggester` services by integrating previously lost critical files and configuration data.

## Integration Steps

1. **Move Files**:
   - Move `recovered-files/reciters.json` to `global_assets/reciters.json`.
   - Move `recovered-files/content-fetcher.js` to `src/services/media-generator/content-fetcher.js`.
   - Move `recovered-files/text-renderer.js` to `src/services/media-generator/text-renderer.js`.

2. **Install Missing Dependencies**:
   ```bash
   npm install axios
   npm install canvas --save-optional
   ```

3. **Update Configuration**:
   - Merge `recovered-files/config.json` into `src/services/content-suggester/config.json`.
   - Update `src/services/media-generator/config.json` path references.

4. **Clean Codebase**:
   - Update `src/services/media-generator/generator.js` to remove deprecated paths.
   - Delete the `recovered-files/` directory permanently.

## Running the Services

Once integration is complete, test the services individually:

```bash
# Test the Media Generator
npm run start:media-generator

# Test the Content Suggester
npm run start:content-suggester
```

Or run all background services via PM2:
```bash
./start-all.bat
```
