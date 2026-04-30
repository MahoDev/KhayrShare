const path = require("path");
const fs = require("fs");
const { exec } = require("child_process");
const VideoGenerator = require("../video-publisher/video-generator");

// 1. Load Config
const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  console.error("Config file not found!");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// 2. Initialize Video Generator
const videoGen = new VideoGenerator(config);

// 3. Dummy Metadata (Representative of a typical video)
const metadata = {
  surahName: "Al-Kahf",
  surahNameArabic: "الكهف",
  surahNumber: 18,
  reciterName: "مشاري راشد العفاسي",
  range: "10-20",
};

// 4. Create Verification Frame
async function run() {
  try {
    console.log("Generating visual verification frame...");
    console.log(
      "Using visual settings:",
      JSON.stringify(config.settings.visuals, null, 2),
    );

    const timestamp = Date.now();

    // Generate the transparent text overlay using the actual generator logic
    const overlayPath = await videoGen.createTextOverlayImage(
      metadata,
      timestamp,
    );

    // 5. Composite on dark background using sharp
    // We use a dark background (RGB 50,50,50) to simulate a video and verify text contrast
    const sharp = require("sharp");
    const outputPath = path.join(
      __dirname,
      "output",
      `visual_test_${timestamp}.jpg`,
    );

    // Ensure output dir exists
    if (!fs.existsSync(path.dirname(outputPath))) {
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    }

    await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 50, g: 50, b: 50 }, // Dark gray background
      },
    })
      .composite([{ input: overlayPath }])
      .toFile(outputPath);

    console.log(`Verification frame created: ${outputPath}`);

    // Cleanup the temporary transparent overlay
    if (fs.existsSync(overlayPath)) {
      fs.unlinkSync(overlayPath);
    }

    // 6. Open Image Automatically
    // console.log("Opening image...");
    // const startCommand = process.platform === "win32" ? "start" : "open";
    // exec(`${startCommand} "${outputPath}"`);
  } catch (error) {
    console.error("Error generating visual verification:", error);
  }
}

run();
