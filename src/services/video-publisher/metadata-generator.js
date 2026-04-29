const path = require("path");
const fs = require("fs");

/**
 * YouTube Metadata Generator
 */
class MetadataGenerator {
  constructor(configPath = null) {
    this.configPath = configPath || path.join(__dirname, "config.json");
    this.config = JSON.parse(fs.readFileSync(this.configPath, "utf8"));

    // Load Surah Info (Non-tashkeel names)
    const surahInfoPath = path.resolve(
      __dirname,
      "..",
      "global_assets",
      "surah_info.json",
    );
    this.surahInfo = fs.existsSync(surahInfoPath)
      ? JSON.parse(fs.readFileSync(surahInfoPath, "utf8"))
      : {};

    // Load Reciters Info
    const recitersPath = path.resolve(
      __dirname,
      "..",
      "x_poster",
      "reciters.json",
    );
    // Load English Reciter Names
    const englishNamesPath = path.resolve(
      __dirname,
      "..",
      "global_assets",
      "english-rectier-names.json",
    );
    this.englishReciterNames = fs.existsSync(englishNamesPath)
      ? JSON.parse(fs.readFileSync(englishNamesPath, "utf8"))
      : {};
  }

  toArabicDigits(num) {
    const arabicDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
    return num.toString().replace(/\d/g, (d) => arabicDigits[d]);
  }

  getReciterEnglishName(reciterId) {
    let cleanName = "";
    const idStr = String(reciterId);

    // 0. Try to get from english-rectier-names.json
    if (this.englishReciterNames[idStr]) {
      return this.englishReciterNames[idStr];
    }

    // 1. Try to extract from reciters (folder names)
    const reciter = this.reciters[idStr];
    if (reciter && reciter.bitrate) {
      const folderName = Object.values(reciter.bitrate)[0];
      if (folderName) {
        cleanName = folderName
          .replace(/_\d+kbps.*/i, "")
          .replace(/_/g, " ")
          .replace(/-/g, " ")
          .trim();
      }
    }

    // 2. Fallback to config.json recitersMetadata (First part of keywords)
    if (!cleanName && this.config.recitersMetadata?.[idStr]) {
      const meta = this.config.recitersMetadata[idStr];
      if (meta.keywords) {
        // Take first part before comma
        cleanName = meta.keywords.split(",")[0].trim();
      }
    }

    return cleanName;
  }

  /**
   * Generate YouTube metadata for a video
   * @param {Object} videoInfo - { surahNumber, surahName, surahNameArabic, reciterName, range, reciterId, fullArabicText, fullArabicTextEmlaey, verses }
   * @returns {Object} { title, description, tags, playlistName }
   */
  generate(videoInfo) {
    const {
      surahNumber,
      surahName,
      surahNameArabic,
      reciterName,
      range,
      reciterId,
    } = videoInfo;

    const surahData = this.surahInfo[surahNumber] || {};
    const surahRawName = surahData.name_arabic || surahNameArabic || surahName;
    const surahDisplay = surahRawName.startsWith("سورة")
      ? surahRawName
      : `سورة ${surahRawName}`;

    // Title Template
    let titleTemplate =
      this.config.metadata?.titleTemplate ||
      "{reciter} | {surah} | الآيات {range}";
    let title = titleTemplate
      .split("{surah}")
      .join(surahDisplay)
      .split("{reciter}")
      .join(reciterName)
      .split("{range}")
      .join(range);

    if (title.length > 100) {
      title = title.substring(0, 97) + "...";
    }

    const reciterEnglishName = this.getReciterEnglishName(reciterId);
    const description = this.generateDescription(
      videoInfo,
      surahDisplay,
      reciterEnglishName,
    );
    const tags = this.generateTags(videoInfo, surahDisplay);
    const playlistName = this.config.playlists?.[reciterId] || reciterName;

    return {
      title,
      description: description.text,
      hashtags: description.hashtags,
      tags,
      playlistName,
    };
  }

  cleanReciterName(name) {
    if (!name) return "";
    return name
      .replace(/\s*\(.*?\)\s*/g, "") // Remove anything in parentheses
      .replace(/\s*-\s*.*$/g, "") // Remove anything after hyphen if needed (optional based on user request)
      .trim();
  }

  generateDescription(videoInfo, surahDisplayNoTashkeel, reciterEnglishName) {
    const { surahName, reciterName, range, verses, surahNumber } = videoInfo;
    const surahEng = this.surahInfo[surahNumber]?.name_english || surahName;
    const cleanReciter = this.cleanReciterName(reciterName);
    const cleanReciterEng = (reciterEnglishName || "")
      .replace(/\s*\(Murattal\)\s*/i, "")
      .replace(/\s*\(Mujawwad\)\s*/i, "")
      .trim();
    const simpleEng = this.getSimpleName(cleanReciterEng);

    // Placeholder data
    const data = {
      surah: surahDisplayNoTashkeel,
      surahEng: surahEng,
      reciter: reciterName,
      reciterClean: cleanReciter,
      reciterEng: reciterEnglishName,
      reciterSimpleEng: simpleEng,
      range: range,
      verses: verses
        ? verses
            .map(
              (v) =>
                `${v.emlaeyText} (${this.toArabicDigits(v.numberInSurah)})`,
            )
            .join(" ")
        : "",
      first3Words:
        verses && verses.length > 0
          ? verses[0].emlaeyText.split(" ").slice(0, 3).join(" ") + "..."
          : "",
      keywords: this.generateDynamicKeywords(
        videoInfo,
        surahDisplayNoTashkeel,
        reciterEnglishName,
      ),
    };

    // Description Template
    let template = this.config.metadata?.descriptionTemplate;

    // Default template if not set (matches user's requested style)
    if (!template) {
        template =
    "{reciter} | {surah} | الآيات {range} | {first3Words}\n\n" +
    "قال رسول الله ﷺ «دعوة المرء المسلم لأخيه بظهر الغيب مستجابة، عند رأسه ملك موكل كلما دعا لأخيه بخير، قال الملك الموكل به: آمين ولك بمثل» (رواه مسلم)\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "💡 كيف تساهم في نشر المقطع؟ (الدال على الخير كفاعله):\n" +
    "• مشاهدة المقطع كاملاً: يساهم في اقتراح اليوتيوب للفيديو لجمهور أكبر.\n" +
    "• وضع إعجاب (Like): يساعد في تصنيف الفيديو كمحتوى قيم.\n" +
    "• كتابة تعليق: يزيد من تفاعل القناة وظهورها.\n" +
    "• مشاركة المقطع (Share): في أي مكان تحب.\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "تلاوة من {surah}\n" +
    "الآيات: {range}\n" +
    "بصوت القارئ: {reciter}\n\n" +
    "🎧 Quran Recitation\n" +
    "📖 Surah {surahEng} ({range})\n" +
    "🎤 Reciter: {reciterEng}\n\n" +
    "🔔 اشترك في القناة ليصلك كل جديد من تلاوات القرآن الكريم!\n" +
    "🔔 Subscribe for daily Quran recitations!\n\n" +
    "📖 نص الآيات:\n" +
    "{verses}\n\n" +
    ".\n.\n.\n.\n.\n.\n" +
    "{keywords}\n\n" +
    "{hashtags}";
    }

    // Replace placeholders
    let text = template;
    const placeholders = {
      "{surah}": data.surah,
      "{surahEng}": data.surahEng,
      "{reciter}": data.reciter,
      "{reciterClean}": data.reciterClean,
      "{reciterEng}": data.reciterEng,
      "{reciterSimpleEng}": data.reciterSimpleEng,
      "{range}": data.range,
      "{verses}": data.verses,
      "{first3Words}": data.first3Words,
      "{keywords}": data.keywords,
    };

    for (const [key, val] of Object.entries(placeholders)) {
      text = text.split(key).join(val || "");
    }

    // Hashtags (Post-processing)
    const reciterTag = cleanReciter
      .replace(/[\s()]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "");
    let surahTag = surahDisplayNoTashkeel
      .replace(/[\s()]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "");

    if (!surahTag.startsWith("سورة")) {
      surahTag = `سورة_${surahTag}`;
    }

    const hashtagsList = [
      `#${surahTag}`,
      `#${reciterTag}`,
      `#القرآن_الكريم`,
      `#Quran`,
      `#تلاوة_خاشعة`,
      `#Islam`,
      `#القرآن`,
      `#تجويد`,
      `#ترتيل`,
      `#تلاوات`,
    ];
    const hashtagsText = hashtagsList.join(" ");

    text = text.split("{hashtags}").join(hashtagsText);

    return { text: text.trim(), hashtags: hashtagsText };
  }

  generateDynamicKeywords(videoInfo, surahDisplay, reciterEnglishName) {
    let { reciterName, surahName } = videoInfo;

    // Strip suffixes specifically for keywords as requested
    const cleanReciter = this.cleanReciterName(reciterName);
    const cleanReciterEng = (reciterEnglishName || "")
      .replace(/\s*\(Murattal\)\s*/i, "")
      .replace(/\s*\(Mujawwad\)\s*/i, "")
      .trim();
    const simpleEng = this.getSimpleName(cleanReciterEng);

    const templates = [
      `${cleanReciter} تلاوة`,
      `${cleanReciter} قرآن`,
      `${cleanReciter} ${surahDisplay}`,
      `${cleanReciter} آيات خاشعة`,
      `${cleanReciter} ترتيل`,
      `${cleanReciter} تجويد`,
      `${cleanReciter} جودة عالية`,
      `${cleanReciter} quran`,
      `${cleanReciter} ${surahName}`,
      `${cleanReciter} recitation`,
      `قرآن كريم بصوت ${cleanReciter}`,
      `اجمل تلاوات القارئ ${cleanReciter}`,
    ];

    // Add English ones only if we have names to avoid " quran"
    if (simpleEng) {
      templates.push(`${simpleEng} quran`);
      templates.push(`${simpleEng} recitation`);
      templates.push(`${simpleEng} surah ${surahName}`);
    }

    return templates.join("، ");
  }

  getSimpleName(fullName) {
    const parts = fullName.split(" ");
    if (parts.length > 1) {
      // Filter out things like (Murattal) or Al
      const significant = parts.filter(
        (p) =>
          !p.includes("(") &&
          p.toLowerCase() !== "al" &&
          p.toLowerCase() !== "abd",
      );
      return significant[significant.length - 1];
    }
    return fullName;
  }

  generateTags(videoInfo, surahDisplay) {
    const { reciterName, reciterId } = videoInfo;
    const reciterEnglishName = this.getReciterEnglishName(reciterId);
    const simpleEng = this.getSimpleName(reciterEnglishName);
    const cleanReciter = this.cleanReciterName(reciterName);

    // Exactly 10 tags with spaces for names
    const tags = [
      cleanReciter,
      surahDisplay,
      reciterEnglishName,
      simpleEng,
      `القرآن الكريم`,
      `تلاوة خاشعة`,
      `Quran`,
      `Islam`,
      `recitation`,
      `Holy Quran`,
      `تجويد`,
    ].filter(Boolean);

    return tags.slice(0, 10).join(", ");
  }
}

module.exports = MetadataGenerator;
