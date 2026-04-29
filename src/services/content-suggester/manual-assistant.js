const fs = require("fs");
const http = require("http");
const path = require("path");
const { DateTime } = require("luxon");
const { execFile, exec } = require("child_process");
const notifier = require("node-notifier");

const { CONTENT_LIBRARY_PATH, OUTPUT_PATH } = require("../../config");

const HISTORY_FILE = path.join(OUTPUT_PATH, "history.json");
const CONFIG_FILE = path.resolve(__dirname, "config.json");
const CONTENT_FILE = path.join(OUTPUT_PATH, "content.json");
const GROUP_USAGE_FILE = path.join(OUTPUT_PATH, "group_usage.json");

const SUGGESTIONS_DIR = OUTPUT_PATH;
const PENDING_TXT_FILE = path.join(SUGGESTIONS_DIR, "next_post.txt");

function ensureSuggestionsDir() {
  if (!fs.existsSync(SUGGESTIONS_DIR)) {
    fs.mkdirSync(SUGGESTIONS_DIR, { recursive: true });
  }
}

let serverStarted = false;
let serverStarting = false;

function isVerbose(config) {
  return !!(config && config.settings && config.settings.manualAssistVerbose);
}

function logVerbose(config, ...args) {
  if (isVerbose(config)) {
    console.log("[manual-assist]", ...args);
  }
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function safeUnlink(filePath) {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {}
}

function ensureTodayHistory(config) {
  const now = DateTime.now().setZone("local");
  const todayDate = now.toISODate();

  let history = readJson(HISTORY_FILE, null);

  if (!history || history.date !== todayDate) {
    const skipDayProbability = config.settings?.skipDayProbability ?? 0.2;
    const skipToday = Math.random() < skipDayProbability;

    history = {
      date: todayDate,
      dailyTotal: 0,
      priorityTotal: 0,
      postedGroups: [],
      postedContent: [],
      skipToday,
    };

    writeJson(HISTORY_FILE, history);
  }

  return history;
}

function hasPendingSuggestion() {
  return fs.existsSync(PENDING_TXT_FILE);
}

function escapeXml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getManualAssistPort(config) {
  const port = config?.settings?.manualAssistPort;
  const parsed = Number(port);
  if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) return parsed;
  return 38211;
}

function ensureServerStarted(config) {
  if (serverStarted || serverStarting) return;
  serverStarting = true;

  const port = getManualAssistPort(config);

  console.log(
    `[manual-assist] Starting local callback server on 127.0.0.1:${port} ...`,
  );

  const server = http.createServer((req, res) => {
    const url = req.url || "/";

    if (url.startsWith("/health")) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("OK");
      return;
    }

    if (url.startsWith("/done")) {
      console.log(
        "[manual-assist] Received DONE click. Updating history and clearing pending suggestion...",
      );
      const ok = markDone();
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(
        ok
          ? "Marked done. You can close this tab/window."
          : "No pending suggestion found.",
      );
      return;
    }

    if (url.startsWith("/show")) {
      console.log(
        "[manual-assist] Received VIEW DETAILS click. Serving pending suggestion...",
      );
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      if (fs.existsSync(PENDING_TXT_FILE)) {
        res.end(fs.readFileSync(PENDING_TXT_FILE, "utf8"));
      } else {
        res.end("No pending suggestion found.");
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });

  server.listen(port, "127.0.0.1", () => {
    serverStarted = true;
    serverStarting = false;
    console.log(
      `[manual-assist] Local callback server is listening on http://127.0.0.1:${port}`,
    );
  });

  server.on("error", (err) => {
    // If another instance is already listening, that's fine.
    if (err && err.code === "EADDRINUSE") {
      serverStarted = true;
      console.log(
        `[manual-assist] Port ${port} already in use; assuming another instance is handling callbacks.`,
      );
    } else {
      console.log(
        "[manual-assist] Callback server error:",
        err && err.message ? err.message : err,
      );
    }
    serverStarting = false;
  });
}

function formatSuggestionText(suggestion) {
  const cleanSuggestion = { ...suggestion };

  // 1. Ensure the internal string uses single backslashes
  if (cleanSuggestion.content && cleanSuggestion.content.imagePath) {
    cleanSuggestion.content.imagePath =
      cleanSuggestion.content.imagePath.replace(/\//g, "\\");
  }

  // 2. Stringify the object
  let jsonString = JSON.stringify(cleanSuggestion, null, 2);

  // 3. Post-process the string to convert double backslashes back to single
  // This looks for "\\" in the string and turns them into "\"
  return jsonString.replace(/\\\\/g, "\\");
}

function showToast(config, title, message, groupUrl) {
  return new Promise((resolve) => {
    const txtPath = path.resolve(PENDING_TXT_FILE);

    console.log("[manual-assist] Showing toast notification.");
    logVerbose(config, "Toast will open:", txtPath);

    notifier.notify(
      {
        title: title,
        message: message,
        appID: "content-suggester",
        wait: true,
        timeout: 15,
      },
      (err, response) => {
        if (err) {
          console.log(
            "[manual-assist] Toast error:",
            err && err.message ? err.message : err,
          );
        } else {
          logVerbose(config, "Toast response:", response);
        }

        if (!err) {
          logVerbose(config, `Debug: groupUrl is '${groupUrl}'`);

          // Open PENDING_TXT_FILE with default opener
          if (fs.existsSync(txtPath)) {
            const openFileCmd =
              process.platform === "win32"
                ? `start "" "${txtPath}"`
                : process.platform === "darwin"
                  ? `open "${txtPath}"`
                  : `xdg-open "${txtPath}"`;

            logVerbose(config, `Executing file open command: ${openFileCmd}`);
            exec(openFileCmd, { windowsHide: true });
          }

          // Open Group URL if available
          if (groupUrl) {
            const openBrowserCmd =
              process.platform === "win32"
                ? `start "" "${groupUrl}"`
                : process.platform === "darwin"
                  ? `open "${groupUrl}"`
                  : `xdg-open "${groupUrl}"`;

            logVerbose(config, `Executing browser command: ${openBrowserCmd}`);

            exec(openBrowserCmd, { windowsHide: true }, (browserErr) => {
              if (browserErr) {
                console.log(
                  "[manual-assist] Open browser error:",
                  browserErr && browserErr.message
                    ? browserErr.message
                    : browserErr,
                );
              } else {
                logVerbose(config, "Opened browser:", groupUrl);
              }
            });
          }
        }

        resolve();
      },
    );
  });
}

function selectSuggestion(config, history, currentDay) {
  const allContent = readJson(CONTENT_FILE, []);
  if (!Array.isArray(allContent) || allContent.length === 0) {
    console.log("[DEBUG] allContent is empty or not an array");
    return null;
  }

  const groups = Array.isArray(config.groups)
    ? config.groups
    : Object.values(config.groups || {}).flat();
  let pool = groups.filter(
    (g) => g && g.url && !history.postedGroups.includes(g.url),
  );
  if (pool.length === 0) {
    console.log("[DEBUG] No unposted groups left");
    return null;
  }

  const usageData = readJson(GROUP_USAGE_FILE, {});

  while (pool.length > 0) {
    // --- WEIGHTED RANDOM SELECTION START ---
    // Calculate weights for each group in the CURRENT pool
    const weightedGroups = pool.map((group) => {
      const lastPostedIso = usageData[group.url];
      let daysSince = 365; // Default for never posted

      if (lastPostedIso) {
        const lastDate = DateTime.fromISO(lastPostedIso);
        if (lastDate.isValid) {
          const diff = DateTime.now().diff(lastDate, "days").days;
          daysSince = Math.max(0, diff); // Ensure no negative days
        }
      }

      // Weight formula: preference for older interactions
      let weight = Math.pow(daysSince + 1, 2);

      // REDUCE FREQUENCY FOR QURAN GROUPS
      if (group.categories && group.categories.includes("quran")) {
        weight = weight * 0.3;
      }

      return { group, weight };
    });

    // Select based on weight
    const totalWeight = weightedGroups.reduce(
      (sum, item) => sum + item.weight,
      0,
    );
    let randomVal = Math.random() * totalWeight;
    let targetGroup = null;

    for (const item of weightedGroups) {
      randomVal -= item.weight;
      if (randomVal <= 0) {
        targetGroup = item.group;
        break;
      }
    }

    if (!targetGroup) {
      targetGroup = pool[Math.floor(Math.random() * pool.length)];
    }

    // Log selection for debugging
    const selectedWeight = weightedGroups.find(
      (x) => x.group === targetGroup,
    )?.weight;
    console.log(
      `[DEBUG] Trying Group: ${targetGroup.name} (Weight: ${selectedWeight?.toFixed(2)}, Total Pool Weight: ${totalWeight.toFixed(2)})`,
    );
    // --- WEIGHTED RANDOM SELECTION END ---

    const groupCategories = targetGroup.categories || [];
    let categoryFilteredContent = allContent;
    if (groupCategories.length > 0) {
      const lowerGroupCats = groupCategories.map((c) => c.toLowerCase());
      categoryFilteredContent = allContent.filter((item) => {
        const itemCategories = (item.categories || []).map((c) =>
          c.toLowerCase(),
        );
        return itemCategories.some((cat) => lowerGroupCats.includes(cat));
      });
    }

    if (categoryFilteredContent.length === 0) {
      console.log(
        `[DEBUG] No content matches categories: ${JSON.stringify(groupCategories)} for group ${targetGroup.name}. Retrying with another group...`,
      );
      pool = pool.filter((g) => g.url !== targetGroup.url);
      continue;
    }

    const priorityContent = categoryFilteredContent
      .filter((item) => {
        if (Array.isArray(item.allowedDays))
          return item.allowedDays.includes(currentDay);
        return item.allowedDays === currentDay;
      })
      .map((item) => ({ ...item, isPriority: true }));

    const generalContent = categoryFilteredContent
      .filter((item) => !item.allowedDays || item.allowedDays === "any")
      .map((item) => ({ ...item, isPriority: false }));

    if (priorityContent.length === 0 && generalContent.length === 0) {
      console.log(
        `[DEBUG] No daily/priority content for currentDay: ${currentDay} in group ${targetGroup.name}. Retrying with another group...`,
      );
      pool = pool.filter((g) => g.url !== targetGroup.url);
      continue;
    }

    // If we found eligible content, we can proceed with this group
    console.log(
      `[DEBUG] Confirmed target group: ${targetGroup.url} with categories: ${JSON.stringify(groupCategories)}`,
    );

    const postedContent = history.postedContent || [];
    const maxSuggestions =
      config.settings?.maxSuggestionsPerDay ??
      config.settings?.maxPostsPerDay ??
      2;
    const ratio = config.settings?.priorityContentRatio ?? 0.5;
    const priorityQuota = Math.ceil(maxSuggestions * ratio);
    const priorityTotal = history.priorityTotal || 0;

    let selectedContent = null;
    let selectionReason = "";

    if (priorityTotal < priorityQuota && priorityContent.length > 0) {
      const unpostedPriority = priorityContent.filter(
        (item) => !postedContent.includes(item.image),
      );

      if (unpostedPriority.length > 0) {
        selectedContent =
          unpostedPriority[Math.floor(Math.random() * unpostedPriority.length)];
        selectionReason = "Priority Quota + Unposted Item";
      } else {
        selectedContent =
          priorityContent[Math.floor(Math.random() * priorityContent.length)];
        selectionReason = "Priority Quota + Refill";
      }
    } else {
      const mixedPool = [...priorityContent, ...generalContent];
      selectedContent = mixedPool[Math.floor(Math.random() * mixedPool.length)];
      selectionReason = "General Mix (Quota Met or Unavailable)";
    }

    const imagePath = selectedContent.image
      ? path
          .resolve(CONTENT_LIBRARY_PATH, selectedContent.image)
          .replace(/\//g, "\\")
      : "";

    console.log(imagePath);

    return {
      createdAt: DateTime.now().setZone("local").toISO(),
      day: currentDay,
      reason: selectionReason,
      group: {
        name: targetGroup.name || "",
        url: targetGroup.url,
        categories: groupCategories,
      },
      content: {
        image: selectedContent.image || "",
        imagePath,
        caption: selectedContent.caption || "",
        allowedDays: selectedContent.allowedDays,
        categories: selectedContent.categories || [],
        isPriority: !!selectedContent.isPriority,
      },
    };
  }

  console.log(
    "[DEBUG] Exhausted all unposted groups, none had matching content for today.",
  );
  return null;
}

async function createPendingSuggestion(config) {
  const now = DateTime.now().setZone("local");
  const currentDay = now.toFormat("EEEE");

  const history = ensureTodayHistory(config);

  if (history.skipToday) {
    logVerbose(
      config,
      `Skipping today due to skipDayProbability. (${history.date})`,
    );
    return null;
  }

  const maxSuggestions =
    config.settings?.maxSuggestionsPerDay ??
    config.settings?.maxPostsPerDay ??
    2;
  if (history.dailyTotal >= maxSuggestions) {
    logVerbose(
      config,
      `Daily limit reached (${history.dailyTotal}/${maxSuggestions}).`,
    );
    return null;
  }

  // Check if there's a pending suggestion that is NOT finishedPosting
  if (hasPendingSuggestion()) {
    const txtContent = fs.readFileSync(PENDING_TXT_FILE, "utf8");
    try {
      const pending = JSON.parse(txtContent.replace(/\\/g, "\\\\"));
      if (pending && pending.finishedPosting !== true) {
        logVerbose(
          config,
          "Pending suggestion exists and not finishedPosting; not creating another.",
        );
        return null;
      }
    } catch {
      // If JSON is malformed, treat as no pending suggestion
    }
  }

  const suggestion = selectSuggestion(config, history, currentDay);
  if (!suggestion) {
    logVerbose(
      config,
      "No eligible suggestion found (groups/content filtering resulted in empty).",
    );
    return null;
  }

  ensureServerStarted(config);
  ensureSuggestionsDir();

  // Add finishedPosting flag
  suggestion.finishedPosting = false;

  fs.writeFileSync(PENDING_TXT_FILE, formatSuggestionText(suggestion), "utf8");

  console.log("[manual-assist] Created new pending suggestion:", {
    group: suggestion.group.name || suggestion.group.url,
    image: suggestion.content.image,
    createdAt: suggestion.createdAt,
  });

  const toastTitle = "Facebook Manual Post";
  const groupName = suggestion.group.name || suggestion.group.url;
  const imagePath =
    suggestion.content.imagePath || suggestion.content.image || "";
  const caption = suggestion.content.caption || "";
  const captionPreview =
    caption.length > 100 ? caption.slice(0, 97) + "..." : caption;
  const toastMessage = `Group: ${groupName}\nImage: ${suggestion.content.image}\nPath: ${imagePath}\nCaption: ${captionPreview}\n\nClick to open details and edit finishedPosting when done.`;

  // Output Library (Option A): emit a structured result line
  console.log(
    "ASSIST_RESULT: " +
      JSON.stringify({
        id: `facebook_${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: "content-suggester",
        title: groupName,
        files: [
          { label: "suggestion", path: path.resolve(PENDING_TXT_FILE) },
          ...(imagePath ? [{ label: "image", path: imagePath }] : []),
        ],
        meta: {
          groupName: suggestion.group?.name,
          groupUrl: suggestion.group?.url,
          image: suggestion.content?.image,
        },
      }),
  );

  await showToast(config, toastTitle, toastMessage, suggestion.group.url);

  return suggestion;
}

function markDone() {
  const config = readJson(CONFIG_FILE, {});
  const history = ensureTodayHistory(config);

  if (!fs.existsSync(PENDING_TXT_FILE)) {
    console.log("No pending suggestion found (next_post.txt missing).");
    return false;
  }

  const txtContent = fs.readFileSync(PENDING_TXT_FILE, "utf8");
  let pending;
  try {
    pending = JSON.parse(txtContent);
  } catch {
    console.log("Pending suggestion file is not valid JSON.");
    return false;
  }

  // If finishedPosting is true, clear the pending suggestion and update history
  if (pending.finishedPosting === true) {
    const groupUrl = pending.group?.url;
    const contentImage = pending.content?.image;

    let updated = false;

    if (groupUrl && !history.postedGroups.includes(groupUrl)) {
      history.postedGroups.push(groupUrl);
      history.dailyTotal = (history.dailyTotal || 0) + 1;
      updated = true;
    }

    if (contentImage) {
      if (!history.postedContent) history.postedContent = [];
      history.postedContent.push(contentImage);
      updated = true;
    }

    if (pending.content?.isPriority) {
      history.priorityTotal = (history.priorityTotal || 0) + 1;
      updated = true;
    }

    if (updated) {
      writeJson(HISTORY_FILE, history);

      // --- UPDATE GLOBAL USAGE ---
      if (groupUrl) {
        const usageData = readJson(GROUP_USAGE_FILE, {});
        usageData[groupUrl] = DateTime.now().setZone("local").toISO();
        writeJson(GROUP_USAGE_FILE, usageData);
        console.log(
          "[manual-assist] Updated global group usage for:",
          groupUrl,
        );
      }
    }

    safeUnlink(PENDING_TXT_FILE);

    console.log(
      "[manual-assist] Marked as done and cleared pending suggestion.",
    );
    return true;
  } else {
    console.log(
      "[manual-assist] Pending suggestion exists but finishedPosting is not true. Not clearing.",
    );
    return false;
  }
}

async function tickManualAssist() {
  const config = readJson(CONFIG_FILE, {});
  const suggestion = await createPendingSuggestion(config);
  return suggestion;
}

if (require.main === module) {
  const cmd = (process.argv[2] || "tick").toLowerCase();

  if (cmd === "done") {
    markDone();
  } else if (cmd === "show") {
    if (fs.existsSync(PENDING_TXT_FILE)) {
      console.log(fs.readFileSync(PENDING_TXT_FILE, "utf8"));
    } else {
      console.log("No pending suggestion found (next_post.txt missing).");
    }
  } else {
    tickManualAssist().catch((err) => {
      console.error("Manual assist tick error:", err);
    });
  }
}

module.exports = {
  tickManualAssist,
  markDone,
};
