const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

/**
 * Fetches Quran content by Ruku (Section) to ensure context & duration.
 * There are 556 Rukus in the Quran.
 */
class ContentFetcher {
  /**
   * Helper for axios gets with retry logic
   */
  async getWithRetry(url, retries = 3, backoff = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await axios.get(url, { timeout: 30000 });
      } catch (err) {
        const isFinal = i === retries - 1;
        const isNetworkError =
          !err.response ||
          err.code === "EAI_AGAIN" ||
          err.code === "ECONNRESET";

        if (isFinal) throw err;

        console.warn(
          `[Fetcher] API call failed (${err.code || err.message}). Retrying ${i + 1}/${retries} in ${backoff}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        backoff *= 2; // Exponential backoff
      }
    }
  }

  constructor(recitersPath, config = null) {
    this.reciters = JSON.parse(fs.readFileSync(recitersPath, "utf8"));
    // Use a unique subdirectory per instance to avoid race conditions
    // when multiple generator instances run concurrently (e.g. scheduler + regeneration)
    this.tempDir = path.join(
      __dirname,
      "temp",
      `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    // Load Surah Info for fallbacks
    const surahInfoPath = path.resolve(
      __dirname,
      "..",
      "..",
      "..",
      "global_assets",
      "surah_info.json",
    );
    this.surahInfo = fs.existsSync(surahInfoPath)
      ? JSON.parse(fs.readFileSync(surahInfoPath, "utf8"))
      : {};

    // Use provided config or load from default path
    if (config) {
      this.config = config;
    } else {
      const configPath = path.join(__dirname, "config.json");
      if (fs.existsSync(configPath)) {
        this.config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      } else {
        this.config = {};
      }
    }

    // Keep the on-disk service config around too. Some callers build a
    // *partial* `config` object (e.g. `{ excludedReciters: [...] }`), so
    // audio settings are read from the real config file rather than the
    // partial one.
    const fileConfigPath = path.join(__dirname, "config.json");
    this.fileConfig = fs.existsSync(fileConfigPath)
      ? JSON.parse(fs.readFileSync(fileConfigPath, "utf8"))
      : {};
  }

  /**
   * Get specific or random reciter
   * @param {string|null} reciterId - Optional specific reciter ID
   */
  getReciter(reciterId = null) {
    if (reciterId && this.reciters[reciterId]) {
      const reciter = this.reciters[reciterId];
      const bitrates = Object.keys(reciter.bitrate);
      const bestBitrate = bitrates.sort((a, b) => parseInt(b) - parseInt(a))[0];

      return {
        id: reciterId,
        name: reciter.name,
        hashtag: reciter.hashtag_name,
        category: reciter.category || null,
        includeGeneralGroups: reciter.includeGeneralGroups || false,
        folder: reciter.bitrate[bestBitrate],
      };
    }

    // Apply exclusion logic from settings
    const exclusions = new Set(
      (this.config.settings?.excludedReciters || []).map((id) => String(id)),
    );

    const keys = Object.keys(this.reciters).filter(
      (id) => !exclusions.has(String(id)),
    );

    // Fallback: if somehow all are excluded, just use all keys
    const pool = keys.length > 0 ? keys : Object.keys(this.reciters);

    const randomKey = pool[Math.floor(Math.random() * pool.length)];
    const reciter = this.reciters[randomKey];

    // Pick highest available bitrate
    const bitrates = Object.keys(reciter.bitrate);
    const bestBitrate = bitrates.sort((a, b) => parseInt(b) - parseInt(a))[0];

    return {
      id: randomKey,
      name: reciter.name,
      hashtag: reciter.hashtag_name,
      category: reciter.category || null,
      includeGeneralGroups: reciter.includeGeneralGroups || false,
      folder: reciter.bitrate[bestBitrate],
    };
  }

  /**
   * Load Quran Data from local asset
   */
  async loadQuranData() {
    if (this.quranMap) return;

    try {
      // Corrected relative path from project root
      const assetPath = path.resolve("global_assets/quranKFGQPC-data.mjs");
      // Check if file exists to avoid silent failures
      if (!fs.existsSync(assetPath)) {
        // Try alternate path based on __dirname for robustness
        const altPath = path.resolve(
          path.join(__dirname, "../../../global_assets/quranKFGQPC-data.mjs"),
        );
        if (fs.existsSync(altPath)) {
          const quranModule = await import("file://" + altPath);
          this.quranMap = quranModule.quranText;
          console.log("Local Quran Text loaded successfully (alternate path).");
          return;
        }
        throw new Error(
          `Quran data file not found at ${assetPath} or ${altPath}`,
        );
      }
      const quranModule = await import("file://" + assetPath);
      this.quranMap = quranModule.quranText;
      console.log("Local Quran Text loaded successfully.");
    } catch (e) {
      console.error("Failed to load local Quran text:", e);
      throw e;
    }
  }

  /**
   * Fetch a random full Ruku (Section)
   */
  async fetchRandomRuku(
    excludedRukus = [],
    enableChunking = true,
    preferredReciterId = null,
  ) {
    try {
      await this.loadQuranData();

      // 556 total Rukus in Quran
      const totalRukus = 556;
      const excluded = new Set(
        Array.isArray(excludedRukus)
          ? excludedRukus
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n) && n >= 1 && n <= totalRukus)
          : [],
      );

      let rukuNumber = null;

      if (excluded.size < totalRukus) {
        // Try a bunch of random attempts first (fast path)
        for (let i = 0; i < 50; i++) {
          const candidate = Math.floor(Math.random() * totalRukus) + 1;
          if (!excluded.has(candidate)) {
            rukuNumber = candidate;
            break;
          }
        }

        // Fallback: build remaining list
        if (rukuNumber == null) {
          const remaining = [];
          for (let i = 1; i <= totalRukus; i++) {
            if (!excluded.has(i)) remaining.push(i);
          }
          rukuNumber = remaining[Math.floor(Math.random() * remaining.length)];
        }
      } else {
        // Everything excluded already, allow repeats
        rukuNumber = Math.floor(Math.random() * totalRukus) + 1;
      }

      console.log(`Fetching Ruku #${rukuNumber}...`);

      // Fetch Meta from API
      const arabicRes = await this.getWithRetry(
        `https://api.alquran.cloud/v1/ruku/${rukuNumber}/quran-uthmani`,
      );
      const arabicVerses = arabicRes.data.data.ayahs;

      // Fetch English Translation
      const transRes = await this.getWithRetry(
        `https://api.alquran.cloud/v1/ruku/${rukuNumber}/en.sahih`,
      );
      const transVerses = transRes.data.data.ayahs;

      const surahName = arabicVerses[0].surah.englishName;
      const surahNameArabic = arabicVerses[0].surah.name;
      const surahNumber = arabicVerses[0].surah.number;
      const startAyah = arabicVerses[0].numberInSurah;
      const endAyah = arabicVerses[arabicVerses.length - 1].numberInSurah;

      const reciter = this.getReciter(preferredReciterId);

      // Get Surah verses from local map
      const localSurahVerses = this.quranMap.get(surahNumber);

      if (!localSurahVerses) {
        console.warn(
          `Could not find Surah ${surahNumber} in local Quran data. Using API text.`,
        );
      }

      // Collect all verse data
      let allVerses = arabicVerses.map((v, i) => {
        const surahNum = v.surah.number;
        const ayahNum = v.numberInSurah;

        let verseText = v.text;
        let emlaeyText = v.text; // Fallback
        if (localSurahVerses) {
          const found = localSurahVerses[ayahNum - 1];
          if (found && found.aya_no === ayahNum) {
            verseText = found.aya_text;
            emlaeyText = found.aya_text_emlaey || found.aya_text;
          } else {
            const scanFound = localSurahVerses.find(
              (x) => x.aya_no === ayahNum,
            );
            if (scanFound) {
              verseText = scanFound.aya_text;
              emlaeyText = scanFound.aya_text_emlaey || scanFound.aya_text;
            }
          }
        }

        return {
          text: verseText,
          emlaeyText: emlaeyText,
          translation: transVerses[i].text,
          numberInSurah: ayahNum,
          audioUrl: `https://everyayah.com/data/${reciter.folder}/${surahNum.toString().padStart(3, "0")}${ayahNum.toString().padStart(3, "0")}.mp3`,
        };
      });

      // Chunking Logic (only if enabled)
      const qConfig = this.config.quran || {};
      const maxVerses = qConfig.maxVersesPerChunk || 10;
      const minVerses = qConfig.minVersesPerChunk || 4;

      let verses = allVerses;
      let chunkRange = `${startAyah}-${endAyah}`;

      if (enableChunking && allVerses.length > maxVerses) {
        console.log(
          `Ruku #${rukuNumber} is long (${allVerses.length} verses). Chunking...`,
        );

        // Calculate balanced number of chunks
        const numChunks = Math.ceil(allVerses.length / maxVerses);
        const baseChunkSize = Math.floor(allVerses.length / numChunks);
        const remainder = allVerses.length % numChunks;

        const chunks = [];
        let currentIndex = 0;
        for (let i = 0; i < numChunks; i++) {
          const size = baseChunkSize + (i < remainder ? 1 : 0);
          chunks.push(allVerses.slice(currentIndex, currentIndex + size));
          currentIndex += size;
        }

        // Randomly pick one chunk
        const randomChunkIndex = Math.floor(Math.random() * chunks.length);
        verses = chunks[randomChunkIndex];
        const chunkStart = verses[0].numberInSurah;
        const chunkEnd = verses[verses.length - 1].numberInSurah;
        chunkRange = `${chunkStart}-${chunkEnd}`;
        console.log(`Selected chunk: ${chunkRange} (${verses.length} verses)`);
      }

      // Flatten text for display
      // Local text already includes verse numbers/markers.
      let fullArabicText = verses.map((v) => v.text).join(" ");
      fullArabicText = fullArabicText.trim();

      let fullArabicTextEmlaey = verses.map((v) => v.emlaeyText).join(" ");
      fullArabicTextEmlaey = fullArabicTextEmlaey.trim();

      return {
        rukuNumber,
        surahNumber,
        surahName,
        surahNameArabic,
        range: chunkRange,
        fullArabicText,
        fullArabicTextEmlaey,
        verses,
        reciterName: reciter.name,
        reciterHashtag: reciter.hashtag,
        reciterId: reciter.id,
        reciterCategory: reciter.category,
        includeGeneralGroups: reciter.includeGeneralGroups || false,
      };
    } catch (error) {
      console.error("Error fetching Ruku:", error.message);
      throw error;
    }
  }

  /**
   * Fetch a curated verse segment from special-verses.json
   */
  async fetchCuratedVerse() {
    try {
      await this.loadQuranData();
      const curatedPath = path.join(__dirname, "special-verses.json");
      if (!fs.existsSync(curatedPath)) {
        console.warn(
          "special-verses.json not found. Falling back to random Ruku.",
        );
        return this.fetchRandomRuku();
      }

      const curatedList = JSON.parse(fs.readFileSync(curatedPath, "utf8"));
      if (!curatedList || curatedList.length === 0) {
        console.warn(
          "special-verses.json is empty. Falling back to random Ruku.",
        );
        return this.fetchRandomRuku();
      }

      const entry = curatedList[Math.floor(Math.random() * curatedList.length)];
      const { surah, verses: verseRange } = entry;

      console.log(
        `Fetching curated verses: Surah ${surah}, Range ${verseRange}...`,
      );

      // Find English Translation Edition
      const edition = this.config.quran?.translationEdition || "en.sahih";

      // Instead of fetching two full surahs, let's fetch only what we need if possible,
      // OR use the combined editions endpoint which is faster.
      let arabicVersesData = [];
      let transVersesData = [];
      let surahName = "";
      let surahNameArabic = "";

      try {
        const combinedRes = await this.getWithRetry(
          `https://api.alquran.cloud/v1/surah/${surah}/editions/quran-uthmani,${edition}`,
        );
        arabicVersesData = combinedRes.data.data[0].ayahs;
        transVersesData = combinedRes.data.data[1].ayahs;
        surahName = combinedRes.data.data[0].englishName;
        surahNameArabic = combinedRes.data.data[0].name;
      } catch (e) {
        console.warn(
          `[Fetcher] API failed for curated verse. Attempting partial offline fallback...`,
        );
        // If API fails, we can at least get Arabic text from local data
        if (this.quranMap && this.quranMap.has(surah)) {
          arabicVersesData = this.quranMap.get(surah).map((v) => ({
            numberInSurah: v.aya_no,
            text: v.aya_text,
          }));
          // Fill translation with placeholder
          transVersesData = arabicVersesData.map((v) => ({
            text: "[Translation Unavailable]",
          }));
          const surahMeta = this.surahInfo[surah];
          surahName = surahMeta ? surahMeta.name_english : "Surah " + surah;
          surahNameArabic = surahMeta ? surahMeta.name_arabic : "سورة " + surah;
        } else {
          throw e; // Hard fail if no local fallback possible
        }
      }

      const allArabic = arabicVersesData;
      const allTrans = transVersesData;

      // Optional reciter override
      let reciter;
      let targetReciterId = null;

      const exclusions = new Set(
        (this.config.settings?.excludedReciters || []).map((id) => String(id)),
      );

      if (
        entry.reciterIds &&
        Array.isArray(entry.reciterIds) &&
        entry.reciterIds.length > 0
      ) {
        // Filter out excluded ones
        const allowedIds = entry.reciterIds
          .map((id) => String(id))
          .filter((id) => !exclusions.has(id));
        if (allowedIds.length > 0) {
          targetReciterId =
            allowedIds[Math.floor(Math.random() * allowedIds.length)];
        }
      } else if (entry.reciterId) {
        const id = String(entry.reciterId);
        if (!exclusions.has(id)) {
          targetReciterId = id;
        }
      }

      if (targetReciterId && this.reciters[targetReciterId]) {
        const r = this.reciters[targetReciterId];

        // Pick highest available bitrate
        const bitrates = Object.keys(r.bitrate);
        const bestBitrate = bitrates.sort(
          (a, b) => parseInt(b) - parseInt(a),
        )[0];

        reciter = {
          name: r.name,
          hashtag: r.hashtag_name,
          folder: r.bitrate[bestBitrate],
        };
      } else {
        reciter = this.getReciter();
      }

      // Parse range (e.g., "1-5" or "255")
      let start, end;
      if (verseRange.toString().includes("-")) {
        [start, end] = verseRange.split("-").map(Number);
      } else {
        start = end = Number(verseRange);
      }

      const localSurahVerses = this.quranMap.get(surah);
      const selectedVerses = [];

      for (let i = start - 1; i < end; i++) {
        const v = allArabic[i];
        if (!v) continue;

        let verseText = v.text;
        let emlaeyText = v.text;
        if (localSurahVerses) {
          const found = localSurahVerses.find(
            (x) => x.aya_no === v.numberInSurah,
          );
          if (found) {
            verseText = found.aya_text;
            emlaeyText = found.aya_text_emlaey || found.aya_text;
          }
        }

        selectedVerses.push({
          text: verseText,
          emlaeyText: emlaeyText,
          translation: allTrans[i].text,
          numberInSurah: v.numberInSurah,
          audioUrl: `https://everyayah.com/data/${reciter.folder}/${surah.toString().padStart(3, "0")}${v.numberInSurah.toString().padStart(3, "0")}.mp3`,
        });
      }

      let fullArabicText = selectedVerses.map((v) => v.text).join(" ");
      fullArabicText = fullArabicText.trim();

      let fullArabicTextEmlaey = selectedVerses
        .map((v) => v.emlaeyText)
        .join(" ");
      fullArabicTextEmlaey = fullArabicTextEmlaey.trim();

      return {
        rukuNumber: null, // Not a Ruku-based fetch
        surahNumber: surah,
        surahName,
        surahNameArabic,
        range: verseRange,
        fullArabicText,
        fullArabicTextEmlaey,
        verses: selectedVerses,
        reciterName: reciter.name,
        reciterHashtag: reciter.hashtag,
        reciterId: reciter.id,
        reciterCategory: reciter.category,
        includeGeneralGroups: reciter.includeGeneralGroups || false,
      };
    } catch (error) {
      console.error("Error fetching curated verse:", error.message);
      throw error;
    }
  }

  async fetchManualVerse(surah, verseRange, targetReciterId) {
    try {
      await this.loadQuranData();

      console.log(
        `Fetching manual verses: Surah ${surah}, Range ${verseRange}...`,
      );

      const edition = this.config.quran?.translationEdition || "en.sahih";
      let arabicVersesData = [];
      let transVersesData = [];
      let surahName = "";
      let surahNameArabic = "";

      try {
        const combinedRes = await this.getWithRetry(
          `https://api.alquran.cloud/v1/surah/${surah}/editions/quran-uthmani,${edition}`,
        );
        arabicVersesData = combinedRes.data.data[0].ayahs;
        transVersesData = combinedRes.data.data[1].ayahs;
        surahName = combinedRes.data.data[0].englishName;
        surahNameArabic = combinedRes.data.data[0].name;
      } catch (e) {
        if (this.quranMap && this.quranMap.has(Number(surah))) {
          arabicVersesData = this.quranMap.get(Number(surah)).map((v) => ({
            numberInSurah: v.aya_no,
            text: v.aya_text,
          }));
          transVersesData = arabicVersesData.map((v) => ({
            text: "[Translation Unavailable]",
          }));
          const surahMeta = this.surahInfo[surah];
          surahName = surahMeta ? surahMeta.name_english : "Surah " + surah;
          surahNameArabic = surahMeta ? surahMeta.name_arabic : "سورة " + surah;
        } else {
          throw e;
        }
      }

      let reciter;
      if (targetReciterId && this.reciters[targetReciterId]) {
        const r = this.reciters[targetReciterId];
        const bitrates = Object.keys(r.bitrate);
        const bestBitrate = bitrates.sort(
          (a, b) => parseInt(b) - parseInt(a),
        )[0];
        reciter = {
          name: r.name,
          hashtag: r.hashtag_name,
          folder: r.bitrate[bestBitrate],
          id: targetReciterId,
          category: r.category,
        };
      } else {
        reciter = this.getReciter();
      }

      let start, end;
      if (verseRange.toString().includes("-")) {
        [start, end] = verseRange.split("-").map(Number);
      } else {
        start = end = Number(verseRange);
      }

      const localSurahVerses = this.quranMap.get(Number(surah));
      const selectedVerses = [];

      for (let i = start - 1; i < end; i++) {
        if (i >= arabicVersesData.length) break;
        const v = arabicVersesData[i];
        if (!v) continue;

        let verseText = v.text;
        let emlaeyText = v.text;
        if (localSurahVerses) {
          const found = localSurahVerses.find(
            (x) => x.aya_no === v.numberInSurah,
          );
          if (found) {
            verseText = found.aya_text;
            emlaeyText = found.aya_text_emlaey || found.aya_text;
          }
        }

        selectedVerses.push({
          text: verseText,
          emlaeyText: emlaeyText,
          translation: transVersesData[i].text,
          numberInSurah: v.numberInSurah,
          audioUrl: `https://everyayah.com/data/${reciter.folder}/${surah.toString().padStart(3, "0")}${v.numberInSurah.toString().padStart(3, "0")}.mp3`,
        });
      }

      let fullArabicText = selectedVerses
        .map((v) => v.text)
        .join(" ")
        .trim();
      let fullArabicTextEmlaey = selectedVerses
        .map((v) => v.emlaeyText)
        .join(" ")
        .trim();

      return {
        rukuNumber: null,
        surahNumber: surah,
        surahName,
        surahNameArabic,
        range: verseRange,
        fullArabicText,
        fullArabicTextEmlaey,
        verses: selectedVerses,
        reciterName: reciter.name,
        reciterHashtag: reciter.hashtag,
        reciterId: reciter.id,
        reciterCategory: reciter.category || null,
        includeGeneralGroups: reciter.includeGeneralGroups || false,
      };
    } catch (error) {
      console.error("Error fetching manual verse:", error.message);
      throw error;
    }
  }

  /**
   * Unified interface to fetch content based on mode
   */
  async fetchContent(options = {}) {
    const {
      mode = "SHORT_RUKU",
      excludedRukus = [],
      reciterId = null,
      disableChunking = false,
      surah = null,
      verseRange = null,
    } = options;
    console.log(`Fetch Mode: ${mode}`);

    switch (mode) {
      case "MANUAL":
        return this.fetchManualVerse(surah, verseRange, reciterId);
      case "FULL_RUKU":
        return this.fetchRandomRuku(excludedRukus, false, reciterId);
      case "SHORT_RUKU":
        return this.fetchRandomRuku(excludedRukus, !disableChunking, reciterId);
      case "CURATED":
        return this.fetchCuratedVerse();
      default:
        return this.fetchRandomRuku(excludedRukus, !disableChunking, reciterId);
    }
  }

  /**
   * Get audio duration in milliseconds using ffprobe
   */
  async getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
      exec(command, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          // Fallback: estimate duration from file size (rough heuristic)
          try {
            const stats = fs.statSync(filePath);
            const estimatedMs = Math.round((stats.size / 16000) * 1000); // ~16KB/s for mp3
            resolve(estimatedMs);
          } catch (e) {
            resolve(5000); // Default 5 seconds fallback
          }
          return;
        }
        const durationSec = parseFloat(stdout.trim());
        if (Number.isFinite(durationSec) && durationSec > 0) {
          resolve(Math.round(durationSec * 1000));
        } else {
          resolve(5000); // Default fallback
        }
      });
    });
  }

  /**
   * Detect and shorten long silent gaps in a merged audio file.
   *
   * 1. Runs ffmpeg `silencedetect` to find all silence regions.
   * 2. For any silence region longer than `minSilenceSec`, trims it down
   *    to `keepEdgeSec * 2` (a small pad on each side of the cut).
   * 3. Builds a new audio file from the non-silent + shortened-silent
   *    segments via ffmpeg `atrim` + `concat`.
   * 4. Adjusts the supplied `verseTimings` by mapping each old timestamp
   *    through the cumulative time-removed offsets.
   *
   * Falls back to the original file on any error — never breaks generation.
   *
   * @param {string} mergedPath - Path to the merged audio file.
   * @param {Array} verseTimings - Array of { startTimeMs, durationMs, … }.
   * @param {object} settings - `{ minSilenceSec, keepEdgeSec, thresholdDb }`.
   * @returns {Promise<{ path: string, verseTimings: Array } | null>}
   */
  async removeLongSilences(mergedPath, verseTimings, settings) {
    const minSilence =
      Number.isFinite(Number(settings.minSilenceSec)) && Number(settings.minSilenceSec) > 0
        ? Number(settings.minSilenceSec)
        : 0.5;
    const keepEdge =
      Number.isFinite(Number(settings.keepEdgeSec)) && Number(settings.keepEdgeSec) >= 0
        ? Number(settings.keepEdgeSec)
        : 0.15;
    const threshold =
      Number.isFinite(Number(settings.thresholdDb))
        ? Number(settings.thresholdDb)
        : -40;

    // Step 1: Detect silence regions.
    const detectCmd =
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${mergedPath}"`;
    let totalDuration;
    try {
      totalDuration = await new Promise((resolve, reject) => {
        exec(detectCmd, { windowsHide: true }, (err, stdout) => {
          if (err) return reject(err);
          const dur = parseFloat(stdout.trim());
          if (Number.isFinite(dur) && dur > 0) resolve(dur);
          else reject(new Error("Could not read merged audio duration"));
        });
      });
    } catch (e) {
      console.warn(`[Fetcher] Could not read merged audio duration: ${e.message}. Skipping silence removal.`);
      return null;
    }

    const silenceCmd =
      `ffmpeg -i "${mergedPath}" -af silencedetect=noise=${threshold}dB:d=0.1 -f null -`;

    let silenceRegions;
    try {
      silenceRegions = await new Promise((resolve, reject) => {
        exec(silenceCmd, { windowsHide: true }, (err, stdout, stderr) => {
          // silencedetect writes to stderr; ffmpeg returns non-zero only
          // on real failures, but we'll parse stderr regardless.
          const output = (stderr || "") + (stdout || "");
          const regions = [];
          const startRe = /silence_start:\s*([\d.]+)/g;
          const endRe = /silence_end:\s*([\d.]+)/g;
          const starts = [];
          const ends = [];
          let m;
          while ((m = startRe.exec(output))) starts.push(parseFloat(m[1]));
          while ((m = endRe.exec(output))) ends.push(parseFloat(m[1]));

          for (let i = 0; i < starts.length; i++) {
            const s = starts[i];
            const e = i < ends.length ? ends[i] : totalDuration;
            if (Number.isFinite(s) && Number.isFinite(e) && e > s) {
              regions.push({ start: s, end: e });
            }
          }
          resolve(regions);
        });
      });
    } catch (e) {
      console.warn(`[Fetcher] silencedetect failed: ${e.message}. Skipping silence removal.`);
      return null;
    }

    if (!silenceRegions || silenceRegions.length === 0) {
      console.log("[Fetcher] No long silences detected — using original audio.");
      return null;
    }

    // Step 2: Build a list of keep-segments and the time removed at each gap.
    // For each silence region longer than minSilence, we keep keepEdge on each
    // side and discard the middle.
    const keeps = []; // { start, end } in original-time seconds
    const removals = []; // { originalStart, removedSec } for timing adjustment
    let cursor = 0; // current position in original timeline

    for (const region of silenceRegions) {
      const isAtEnd = Math.abs(region.end - totalDuration) < 0.1;
      const silenceDur = region.end - region.start;
      
      if (!isAtEnd && silenceDur <= minSilence) {
        // Not long enough to trim (and not at the end) — will be included as-is.
        continue;
      }

      // Keep audio from cursor to (silence start + keepEdge).
      const keepEnd = Math.min(region.start + keepEdge, region.end);
      if (keepEnd > cursor) {
        keeps.push({ start: cursor, end: keepEnd });
      }

      // The gap we're removing.
      const trimStart = keepEnd;
      // If it's the very end of the file, we don't keep a second padding edge
      // extending backwards from the end of the file.
      const rightPadding = isAtEnd ? 0 : keepEdge;
      const trimEnd = Math.max(region.end - rightPadding, trimStart);
      const removedSec = trimEnd - trimStart;
      if (removedSec > 0) {
        removals.push({ originalStart: trimStart, removedSec });
      }

      cursor = trimEnd;
    }

    // Keep the remainder of the audio after the last silence.
    if (cursor < totalDuration) {
      keeps.push({ start: cursor, end: totalDuration });
    }

    if (keeps.length === 0 || removals.length === 0) {
      // Nothing to actually trim.
      return null;
    }

    const totalRemoved = removals.reduce((sum, r) => sum + r.removedSec, 0);
    console.log(
      `[Fetcher] Trimming ${removals.length} long silence(s) totalling ${totalRemoved.toFixed(2)}s.`,
    );

    // Step 3: Build ffmpeg filter to reconstruct audio from kept segments.
    const outPath = mergedPath.replace(/\.mp3$/i, "") + "_trimmed.mp3";
    const filterParts = [];
    const concatInputs = [];
    for (let i = 0; i < keeps.length; i++) {
      const k = keeps[i];
      filterParts.push(
        `[0:a]atrim=start=${k.start.toFixed(4)}:end=${k.end.toFixed(4)},asetpts=PTS-STARTPTS[s${i}]`,
      );
      concatInputs.push(`[s${i}]`);
    }
    const filterGraph =
      filterParts.join("; ") +
      `; ${concatInputs.join("")}concat=n=${keeps.length}:v=0:a=1[outa]`;
    const buildCmd =
      `ffmpeg -y -i "${mergedPath}" -filter_complex "${filterGraph}" -map "[outa]" -c:a libmp3lame -q:a 2 "${outPath}"`;

    try {
      await new Promise((resolve, reject) => {
        exec(buildCmd, { windowsHide: true }, (err, stdout, stderr) => {
          if (err) return reject(err);
          resolve();
        });
      });
    } catch (e) {
      console.warn(
        `[Fetcher] Silence-trimmed audio build failed: ${e.message}. Using original.`,
      );
      try { fs.unlinkSync(outPath); } catch (_) {}
      return null;
    }

    // Validate the output isn't broken.
    const trimmedDur = await this.getAudioDuration(outPath);
    if (!Number.isFinite(trimmedDur) || trimmedDur < 300) {
      console.warn("[Fetcher] Trimmed audio too short or invalid. Using original.");
      try { fs.unlinkSync(outPath); } catch (_) {}
      return null;
    }

    // Step 4: Adjust verse timings.
    // For each verse, subtract the cumulative time removed before its
    // original start time.
    const adjustedTimings = verseTimings.map((vt) => {
      const origStartSec = vt.startTimeMs / 1000;
      let cumulativeRemoved = 0;
      for (const r of removals) {
        if (r.originalStart < origStartSec) {
          // This removal happened before the verse start.
          cumulativeRemoved += r.removedSec;
        }
      }
      return {
        ...vt,
        startTimeMs: Math.max(0, Math.round(vt.startTimeMs - cumulativeRemoved * 1000)),
      };
    });

    // Recompute durationMs so each verse's image disappears exactly when the next verse starts.
    for (let i = 0; i < adjustedTimings.length; i++) {
      if (i < adjustedTimings.length - 1) {
        adjustedTimings[i].durationMs = adjustedTimings[i + 1].startTimeMs - adjustedTimings[i].startTimeMs;
      } else {
        adjustedTimings[i].durationMs = Math.max(0, trimmedDur - adjustedTimings[i].startTimeMs);
      }
    }

    return { path: outPath, verseTimings: adjustedTimings };
  }

  /**
   * Download all audio files for the Ruku and merge them
   * Returns the merged audio path and verse timing metadata
   */
  async processAudio(verses) {
    const filePaths = [];
    const verseTimings = [];

    // 1. Download all files
    console.log(`Downloading ${verses.length} audio segments...`);
    let accumulatedStartMs = 0;
    for (const v of verses) {
      const fileName = `part_${Date.now()}_${v.numberInSurah}.mp3`;
      const filePath = path.join(this.tempDir, fileName);

      // Simple retry logic
      let attempts = 0;
      while (attempts < 3) {
        try {
          const response = await axios({
            url: v.audioUrl,
            method: "GET",
            responseType: "stream",
          });

          await new Promise((resolve, reject) => {
            const writer = fs.createWriteStream(filePath);
            response.data.pipe(writer);
            writer.on("finish", () => resolve());
            writer.on("error", reject);
          });
          break; // Success
        } catch (e) {
          attempts++;
          if (attempts === 3) throw e;
          console.log(`Retrying download for verse ${v.numberInSurah}...`);
        }
      }

      // Get duration for this verse
      const durationMs = await this.getAudioDuration(filePath);
      verseTimings.push({
        numberInSurah: v.numberInSurah,
        text: v.text,
        durationMs,
        startTimeMs: accumulatedStartMs,
      });
      accumulatedStartMs += durationMs;

      filePaths.push(filePath);
    }

    // 2. Create concat list
    const concatListPath = path.join(this.tempDir, `concat_${Date.now()}.txt`);
    const fileContent = filePaths
      .map((p) => `file '${p.replace(/\\/g, "/")}'`)
      .join("\n");
    fs.writeFileSync(concatListPath, fileContent);

    // 3. Merge using FFmpeg
    const outputAudio = path.join(this.tempDir, `merged_${Date.now()}.mp3`);
    // Added -safe 0 to allow absolute paths in Windows
    const command = `ffmpeg -f concat -safe 0 -i "${concatListPath}" -c copy "${outputAudio}"`;

    console.log("Merging audio...");
    await new Promise((resolve, reject) => {
      exec(command, { windowsHide: true }, (error, stdout, stderr) => {
        if (error) {
          console.error("FFmpeg Merge Error:", stderr);
          return reject(error);
        }
        resolve();
      });
    });

    // 4. Silence removal: shorten long pauses in the merged audio.
    let finalPath = outputAudio;
    let finalTimings = verseTimings;
    const silenceSettings = this.fileConfig.audio?.silenceRemoval || {};
    if (silenceSettings.enabled !== false) {
      try {
        const trimmed = await this.removeLongSilences(
          outputAudio,
          verseTimings,
          silenceSettings,
        );
        if (trimmed) {
          finalPath = trimmed.path;
          finalTimings = trimmed.verseTimings;
        }
      } catch (e) {
        console.warn(
          `[Fetcher] Silence removal error: ${e.message}. Using original audio.`,
        );
      }
    }

    const result = {
      path: finalPath,
      verseTimings: finalTimings,
    };

    // 5. Cleanup parts
    filePaths.forEach((p) => {
      try {
        fs.unlinkSync(p);
      } catch (e) {}
    });
    try {
      fs.unlinkSync(concatListPath);
    } catch (e) {}
    // Clean up the original merged file if we're using the trimmed version.
    if (finalPath !== outputAudio) {
      try {
        fs.unlinkSync(outputAudio);
      } catch (e) {}
    }

    return result;
  }

  cleanup() {
    const files = fs.readdirSync(this.tempDir);
    for (const file of files) {
      try {
        fs.unlinkSync(path.join(this.tempDir, file));
      } catch (e) {}
    }
  }
}

module.exports = ContentFetcher;
