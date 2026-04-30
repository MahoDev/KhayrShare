const { tickManualAssist } = require("./manual-assistant");
const fs = require("fs");
const path = require("path");

async function test() {
    console.log("Running Content Suggester Integration Test...");
    
    // Paths
    const { OUTPUT_PATH } = require("../../config");
    const outputDir = path.resolve(OUTPUT_PATH);
    const pendingPath = path.join(outputDir, "next_post.txt");
    const contentPath = path.join(outputDir, "content.json");
    const historyPath = path.join(outputDir, "history.json");

    // Ensure output dir exists
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    // Clear pending and history to ensure fresh selection
    if (fs.existsSync(pendingPath)) fs.unlinkSync(pendingPath);
    if (fs.existsSync(historyPath)) fs.unlinkSync(historyPath);
    
    // Ensure content.json has at least one matching item for the test
    if (!fs.existsSync(contentPath) || JSON.parse(fs.readFileSync(contentPath, "utf8")).length === 0) {
        console.log("Creating dummy content.json for test...");
        fs.writeFileSync(contentPath, JSON.stringify([{
            image: "dummy.jpg",
            caption: "Test Suggestion",
            allowedDays: "any",
            categories: ["general", "quran", "hadith", "dua"] // Match anything
        }]));
    }

    try {
        // Run the assistant
        // Note: This might attempt to show a toast or start a server, 
        // but we mainly care about the file generation.
        await tickManualAssist();
        
        if (fs.existsSync(pendingPath)) {
            const content = fs.readFileSync(pendingPath, "utf8");
            console.log("\n--- Generated next_post.txt ---");
            console.log(content);
            console.log("-------------------------------\n");
            
            const json = JSON.parse(content.replace(/\\/g, "\\\\"));
            const groupUrl = json.group?.url;
            
            if (groupUrl && groupUrl.startsWith("https://www.facebook.com/groups/")) {
                console.log(`SUCCESS: Found group URL: ${groupUrl}`);
                process.exit(0);
            } else {
                console.log("FAIL: Invalid or missing group URL in suggestion.");
                process.exit(1);
            }
        } else {
            console.log("FAIL: next_post.txt was not generated. Check if today was skipped by probability.");
            process.exit(1);
        }
    } catch (e) {
        console.error("Test execution error:", e);
        process.exit(1);
    }
}

test();
