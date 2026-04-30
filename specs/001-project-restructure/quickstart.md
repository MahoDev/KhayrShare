# Quickstart

1. **Clone the repository**:
   ```bash
   git clone <new-repo-url> KhayrShare
   cd KhayrShare
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Configure the environment**:
   Copy the example JSON configuration file and specify your external data paths.
   ```bash
   cp src/config/config.example.json src/config/config.json
   ```
   Edit `src/config/config.json` to define paths outside the project folder:
   ```json
   {
     "CONTENT_LIBRARY_PATH": "/path/to/your/content_library",
     "OUTPUT_PATH": "/path/to/your/outputs",
     "LOG_LEVEL": "info"
   }
   ```

4. **Run tests**:
   Ensure everything is working correctly according to the constitution.
   ```bash
   npm test
   ```

5. **Run a service**:
   Start a specific service, e.g., the content suggester.
   ```bash
   npm run start:content-suggester
   ```
