# KhayrShare (خير شير)

KhayrShare is a functional assistant designed to help spread goodness (Khayr) by simplifying the process of generating and sharing Islamic content, specifically Quran videos and reminders, across social media platforms like Facebook and YouTube.

## 🌟 Core Purpose
To assist in the creation and curation of Islamic media for the sake of Allah's reward, making it easier for users to maintain a steady stream of beneficial content.

## 🏗️ Architecture
The project is built as a set of modular, headless Node.js services:

- **Content Suggester**: Automatically matches your content library with appropriate social media groups and schedules reminders for manual posting.
- **Media Generator**: Creates beautiful landscape and square format videos from Quranic recitations and translations.
- **Video Publisher**: Handles metadata generation and utility tasks for publishing to video platforms.

## ⚙️ Setup

1. **Configure Storage**: 
   KhayrShare keeps your data completely separate from the code. Copy `src/config/config.example.json` to `src/config/config.json` and specify your external paths:
   - `CONTENT_LIBRARY_PATH`: Where your images and raw videos are stored.
   - `OUTPUT_PATH`: Where generated suggestions and media will be saved.

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Services**:
   - `npm run sync:content`: Sync your external image library with the local content model.
   - `npm run start:content-suggester`: Start the suggestion service.
   - `npm run start:media-generator`: Generate new Quran videos.

## 🛡️ License
Designed for personal and community use in the path of Khayr.
