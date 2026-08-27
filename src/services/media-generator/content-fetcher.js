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

    // Keep the on-disk service config around too. Some callers build a *partial*
    // `config` object (e.g. `{ excludedReciters: [...] }`), so audio settings read
    // from the real config file rather than the partial one.
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
   * Trim long silent gaps out of a single audio file so the final videos don't
   * contain jarring empty waiting periods.
   *
   * Uses FFmpeg's `silenceremove` filter:
   *  - `stop_periods=-1` removes silenced periods throughout the file (edges
   *    and interior), not just leading/trailing silence.
   *  - Each removed gap is clamped down to ~`minSilenceSec` (a natural breath),
   *    so short spoken pauses are preserved while long empty waits disappear.
   *  - `keepEdgeSec` keeps a small amount of silence at the edges of every cut,
   *    so the recitation never sounds abruptly clipped.
   *
   * Returns the path of the trimmed file, or `null` if trimming is disabled or
   * failed (caller falls back to the original file — never breaks generation).
   * @param {string} filePath - Absolute path to the source audio file.
   * @param {object} settings - `{ enabled, minSilenceSec, keepEdgeSec, thresholdDb }`
   * @returns {Promise<string|null>}
   */
  async removeSilence(filePath, settings) {
    // Disabled unless explicitly toggled on, but if `.enabled` is omitted the
    // feature stays ON (the service now removes long silent gaps by default).
    if (!settings || settings.enabled === false) return null;

    const minSilenceSec = Number(settings.minSilenceSec);
    const minSilence = Number.isFinite(minSilenceSec) && minSilenceSec >= 0 ? minSilenceSec : 0.32;
    const keepEdgeSec = Number(settings.keepEdgeSec);
    const keepEdge = Number.isFinite(keepEdgeSec) && keepEdgeSec >= 0 ? keepEdgeSec : 0.05;
    const thresholdDb = Number(settings.thresholdDb);
    const threshold = Number.isFinite(thresholdDb) ? thresholdDb : -45;

    // Guard against near-empty / unusual files being trimmed into nothing.
    const startDur = Math.min(Math.max(keepEdge, 0.05), 0.4);

    const outPath = filePath.replace(/\.mp3$/i, "") + "_trimmed.mp3";
    const af =
      "silenceremove=" +
      `start_periods=1:start_silence=${keepEdge}:start_duration=${startDur}:start_threshold=${threshold}dB` +
      `:stop_periods=-1:stop_duration=${minSilence}:stop_threshold=${threshold}dB:stop_silence=${keepEdge}`;
    const command = `ffmpeg -y -i "${filePath}" -af "${af}" -c:a libmp3lame -q:a 2 "${outPath}"`;

    return new Promise((resolve) => {
      exec(command, { windowsHide: true }, async (error) => {
        if (error) {
          console.warn(
            `[Fetcher] Silence removal failed for ${path.basename(filePath)} (${error.message}). Using original audio.`,
          );
          try {
            fs.unlinkSync(outPath);
          } catch (e) {}
          return resolve(null);
        }
        const dur = await this.getAudioDuration(outPath);
        // If the result is unexpectedly empty/broken, fall back to the original.
        if (Number.isFinite(dur) && dur >= 300) {
          resolve(outPath);
        } else {
          try {
            fs.unlinkSync(outPath);
          } catch (e) {}
          resolve(null);
        }
      });
    });
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

    // Silence-removal settings (long pauses removed from the final audio).
    const silenceSettings = this.fileConfig.audio?.silenceRemoval || {};

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

      // 1a. Strip long silent waiting periods (this verse's own audio), keeping a
      // small edge at every cut. Timing is measured AFTER trimming, so the verse
      // timings stay in sync with the actual (shortened) audio for verse-display.
      let audioPath = filePath;
      if (silenceSettings.enabled !== false) {
        const trimmed = await this.removeSilence(filePath, silenceSettings);
        if (trimmed) audioPath = trimmed;
      }

      // Get duration for this verse (post-trim when applicable)
      const durationMs = await this.getAudioDuration(audioPath);
      verseTimings.push({
        numberInSurah: v.numberInSurah,
        text: v.text,
        durationMs,
        startTimeMs: accumulatedStartMs,
      });
      accumulatedStartMs += durationMs;

      filePaths.push(filePath);
      if (audioPath !== filePath) filePaths.push(audioPath);
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

    // 4. Return object with path and verse timings
    const result = {
      path: outputAudio,
      verseTimings,
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
