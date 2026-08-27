const path = require("path");
const VideoGenerator = require("./generator");

async function runTest() {
  console.log("Starting Media Generator Integration Test...");
  try {
    const configPath = path.join(__dirname, "config.json");
    const generator = new VideoGenerator(configPath);
    
    // We don't necessarily want to run a full generation (which takes time and downloads files)
    // but we want to ensure the constructor and basic loading logic work.
    // If it can list reciters, it means reciters.json and config.json are loaded.
    
    console.log("Checking reciters loading...");
    const recitersCount = Object.keys(generator.contentFetcher.reciters).length;
    console.log(`Successfully loaded ${recitersCount} reciters.`);
    
    if (recitersCount === 0) {
      throw new Error("No reciters loaded!");
    }

    console.log("Test Passed: Basic loading logic works.");
    process.exit(0);
  } catch (error) {
    console.error("Test Failed:", error.message);
    process.exit(1);
  }
}

runTest();
