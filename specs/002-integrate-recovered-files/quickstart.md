# Quickstart: Integrated Media Pipeline

## Prerequisites
- Node.js v18+
- FFmpeg (for video generation)
- Internet connection (for audio fetching)

## Installation
The system uses the root `package.json`. New dependencies will be added automatically during implementation.

```powershell
npm install
```

## Running Services
Both services are managed via PM2 for background execution.

### Start All Services
```powershell
./start-all.bat
```

### Manual Service Control
```powershell
# Content Suggester (Scheduler)
npm run start:content-suggester

# Media Generator (Scheduler)
npm run start:media-generator
```

## Verification
- **Logs**: Check PM2 logs with `pm2 logs`.
- **Output**: 
  - Suggestions -> `OUTPUT_PATH/next_post.txt`
  - Videos -> `OUTPUT_PATH/*.mp4`
