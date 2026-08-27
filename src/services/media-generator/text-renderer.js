const { createCanvas, loadImage, registerFont } = require("canvas");
const fs = require("fs");
const path = require("path");

class TextRenderer {
  constructor() {
    const configPath = path.join(__dirname, "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    this.width = config.video?.width || 1080;
    this.height = config.video?.height || 1080;
    this.tempDir = path.join(__dirname, "temp");
    // Point to the global assets folder
    this.assetsDir = path.resolve(__dirname, "../../../global_assets");

    this.fontFamily = "Arial"; // Default fallback
    this.registerFonts();
  }

  registerFonts() {
    const fontsDir = path.join(this.assetsDir, "fonts");
    if (fs.existsSync(fontsDir)) {
      const fontFiles = fs.readdirSync(fontsDir);

      // Register Quran Text Font (Hafs)
      let hafsFont = fontFiles.find((f) => f === "UthmanicHafs_V22.ttf");
      if (!hafsFont)
        hafsFont = fontFiles.find((f) => f === "uthmanic_hafs_v22.ttf");

      if (hafsFont) {
        const fontPath = path.join(fontsDir, hafsFont);
        console.log(`[TextRenderer] Registering Haaf font: ${hafsFont}`);
        try {
          registerFont(fontPath, { family: "QuranFont" });
          this.fontFamily = "QuranFont";
        } catch (e) {
          console.error(
            "[TextRenderer] Hafs font registration failed:",
            e.message,
          );
        }
      }

      // Register Title Font (Scheherazade)
      const titleFont = fontFiles.find((f) => f.startsWith("Scheherazade"));
      if (titleFont) {
        const fontPath = path.join(fontsDir, titleFont);
        console.log(`[TextRenderer] Registering Header font: ${titleFont}`);
        try {
          registerFont(fontPath, { family: "Scheherazade" });
          this.titleFontFamily = "Scheherazade";
        } catch (e) {
          console.error(
            "[TextRenderer] Header font registration failed:",
            e.message,
          );
        }
      } else {
        this.titleFontFamily = "Arial"; // Fallback
      }
    }
  }

  getRandomBackground() {
    const bgDir = path.join(this.assetsDir, "images");
    if (!fs.existsSync(bgDir)) {
      throw new Error("Assets/images directory missing!");
    }
    const images = fs
      .readdirSync(bgDir)
      .filter((f) => f.match(/\.(jpg|jpeg|png)$/i));
    if (images.length === 0) {
      throw new Error("No images found in assets/images!");
    }
    return path.join(bgDir, images[Math.floor(Math.random() * images.length)]);
  }

  /**
   * True if a whitespace-delimited token is a lone verse-number marker glyph.
   * In the KFGQPC dataset each ayah ends with a private-use glyph (U+FC00…
   * U+FDxx = "Arabic Presentation Forms") that arrives as its own token, e.g. "ﰀ".
   */
  isVerseMarkerToken(word) {
    if (!word || word.length === 0) return false;
    for (const ch of word) {
      const cp = ch.codePointAt(0);
      // Arabic Presentation Forms A/B + Private Use Area. Normal Quranic words
      // (and combining marks) stay in U+0600..U+0700, so this only catches markers.
      if (cp < 0xfb50) return false;
    }
    return true;
  }

  /**
   * Make sure a wrapping pass never leaves a lone verse-number marker on its own
   * line — merge such a line into the adjacent one so every verse number always
   * has a real word next to it. Ordinary lines are untouched, so the tuned font
   * sizes / characters-per-line behavior is preserved.
   */
  mergeLoneVerseMarkers(lines) {
    const cleaned = [];
    for (const line of lines) {
      const tokens = line.split(/\s+/).filter((w) => w.length > 0);
      const isLoneMarker =
        tokens.length > 0 && tokens.every((t) => this.isVerseMarkerToken(t));
      if (isLoneMarker && cleaned.length > 0) {
        cleaned[cleaned.length - 1] =
          cleaned[cleaned.length - 1].replace(/\s+$/, "") + " " + line.trim();
      } else {
        cleaned.push(line);
      }
    }
    return cleaned;
  }

  /**
   * Calculate wrapped lines for given text and width
   */
  getWrappedLines(ctx, text, maxWidth) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    let line = "";
    const lines = [];

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + " ";
      const metrics = ctx.measureText(testLine);

      if (metrics.width > maxWidth && n > 0) {
        lines.push(line.trim());
        line = words[n] + " ";
      } else {
        line = testLine;
      }
    }
    lines.push(line.trim());
    return this.mergeLoneVerseMarkers(lines);
  }

  /**
   * Find the optimal font size that fits text within bounds
   */
  findOptimalFontSize(
    ctx,
    text,
    maxWidth,
    maxHeight,
    startSize = 60,
    minSize = 20,
  ) {
    for (let fontSize = startSize; fontSize >= minSize; fontSize -= 2) {
      ctx.font = `${fontSize}px "${this.fontFamily}", Arial`;
      const lineHeight = fontSize * 1.6;
      const lines = this.getWrappedLines(ctx, text, maxWidth);
      const totalHeight = lines.length * lineHeight;

      if (totalHeight <= maxHeight) {
        return { fontSize, lineHeight, lines };
      }
    }
    // Return minimum size if nothing fits
    ctx.font = `${minSize}px "${this.fontFamily}", Arial`;
    const lineHeight = minSize * 1.6;
    const lines = this.getWrappedLines(ctx, text, maxWidth);
    return { fontSize: minSize, lineHeight, lines };
  }

  /**
   * Draw wrapped text centered in a bounding box, with justification
   */
  drawJustifiedTextArea(ctx, lines, centerX, centerY, lineHeight, maxWidth) {
    const totalHeight = lines.length * lineHeight;
    let startY = centerY - totalHeight / 2 + lineHeight / 2;

    ctx.textBaseline = "middle";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const currentY = startY + i * lineHeight;

      if (isLastLine) {
        // Last line centered
        ctx.textAlign = "center";
        ctx.fillText(line, centerX, currentY);
      } else {
        // Professional justification
        this.fillTextJustified(ctx, line, centerX, currentY, maxWidth);
      }
    }
  }

  /**
   * Helper to draw a single line of text justified within maxWidth
   */
  fillTextJustified(ctx, text, centerX, y, maxWidth) {
    // Use regex to split by all types of whitespace (including \u00A0)
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= 1) {
      ctx.textAlign = "center";
      ctx.fillText(text, centerX, y);
      return;
    }

    // Measure width of words without intermediate spaces
    let totalWordsWidth = 0;
    const wordWidths = [];
    for (const word of words) {
      const w = ctx.measureText(word).width;
      wordWidths.push(w);
      totalWordsWidth += w;
    }

    const totalSpaceWidth = maxWidth - totalWordsWidth;
    const spaceBetweenWords = totalSpaceWidth / (words.length - 1);

    // Start from the right for Arabic (RTL)
    let currentX = centerX + maxWidth / 2;
    ctx.textAlign = "right";

    for (let i = 0; i < words.length; i++) {
      ctx.fillText(words[i], currentX, y);
      if (i < words.length - 1) {
        currentX -= wordWidths[i] + spaceBetweenWords;
      }
    }
  }

  /**
   * Draw text with glow effect for better readability
   */
  drawTextWithGlow(
    ctx,
    text,
    x,
    y,
    glowColor = "rgba(0, 0, 0, 0.8)",
    glowBlur = 8,
    maxWidth = null,
  ) {
    const originalShadowBlur = ctx.shadowBlur;
    const originalShadowColor = ctx.shadowColor;

    // Draw glow layer
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = glowBlur;
    if (maxWidth) {
      ctx.fillText(text, x, y, maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }

    // Draw main text (crisp)
    ctx.shadowBlur = 0;
    if (maxWidth) {
      ctx.fillText(text, x, y, maxWidth);
    } else {
      ctx.fillText(text, x, y);
    }

    // Restore original shadow settings
    ctx.shadowBlur = originalShadowBlur;
    ctx.shadowColor = originalShadowColor;
  }

  /**
   * Draw decorative border around content area
   */
  drawDecorativeBorder(ctx) {
    const margin = 30;
    const borderRadius = 15;
    const x = margin;
    const y = margin;
    const width = this.width - margin * 2;
    const height = this.height - margin * 2;

    // Outer glow
    ctx.strokeStyle = "rgba(255, 215, 0, 0.3)";
    ctx.lineWidth = 3;
    ctx.shadowColor = "rgba(255, 215, 0, 0.5)";
    ctx.shadowBlur = 20;
    this.roundRect(ctx, x, y, width, height, borderRadius);
    ctx.stroke();

    // Main border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    this.roundRect(ctx, x + 5, y + 5, width - 10, height - 10, borderRadius);
    ctx.stroke();

    // Inner accent
    ctx.strokeStyle = "rgba(255, 215, 0, 0.2)";
    ctx.lineWidth = 1;
    this.roundRect(ctx, x + 8, y + 8, width - 16, height - 16, borderRadius);
    ctx.stroke();
  }

  /**
   * Helper to draw rounded rectangle
   */
  roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Draw Islamic geometric corner ornaments
   */
  drawCornerOrnaments(ctx) {
    const size = 60;
    const margin = 45;
    const color = "rgba(255, 215, 0, 0.4)";

    // Top-left
    this.drawOrnament(ctx, margin, margin, size, color, 0);
    // Top-right
    this.drawOrnament(ctx, this.width - margin, margin, size, color, 90);
    // Bottom-right
    this.drawOrnament(
      ctx,
      this.width - margin,
      this.height - margin,
      size,
      color,
      180,
    );
    // Bottom-left
    this.drawOrnament(ctx, margin, this.height - margin, size, color, 270);
  }

  /**
   * Draw a single ornamental pattern
   */
  drawOrnament(ctx, cx, cy, size, color, rotationDeg) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rotationDeg * Math.PI) / 180);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;

    // Draw Islamic star pattern
    const points = 8;
    const outerRadius = size / 2;
    const innerRadius = outerRadius * 0.4;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (i * Math.PI) / points;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Add center circle
    ctx.beginPath();
    ctx.arc(0, 0, innerRadius * 0.5, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
    ctx.fill();

    ctx.restore();
  }

  /**
   * Draw center divider between header and verse
   */
  drawCenterDivider(ctx, y) {
    const centerX = this.width / 2;
    const lineWidth = this.width - 240; // Widened to cover most of the frame
    const lineStart = centerX - lineWidth / 2;
    const lineEnd = centerX + lineWidth / 2;

    // Gradient line with smooth fade-out
    const gradient = ctx.createLinearGradient(lineStart, y, lineEnd, y);
    gradient.addColorStop(0, "rgba(255, 215, 0, 0)");
    gradient.addColorStop(0.15, "rgba(255, 215, 0, 0.4)");
    gradient.addColorStop(0.5, "rgba(255, 215, 0, 0.6)");
    gradient.addColorStop(0.85, "rgba(255, 215, 0, 0.4)");
    gradient.addColorStop(1, "rgba(255, 215, 0, 0)");

    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(lineStart, y);
    ctx.lineTo(lineEnd, y);
    ctx.stroke();

    // Center ornament
    ctx.fillStyle = "rgba(255, 215, 0, 0.7)";
    ctx.beginPath();
    ctx.arc(centerX, y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Decorative points near ends
    ctx.beginPath();
    ctx.arc(lineStart + 20, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(lineEnd - 20, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Draw the text overlay
   */
  async renderFrame(rukuData) {
    const canvas = createCanvas(this.width, this.height);
    const ctx = canvas.getContext("2d");

    // CRITICAL: Set direction to RTL for correct BiDi layout
    ctx.direction = "rtl";

    // 1. Draw Background
    const bgPath = this.getRandomBackground();
    const image = await loadImage(bgPath);

    const scale = Math.max(
      this.width / image.width,
      this.height / image.height,
    );
    const x = this.width / 2 - (image.width / 2) * scale;
    const y = this.height / 2 - (image.height / 2) * scale;
    ctx.drawImage(image, x, y, image.width * scale, image.height * scale);

    // 2. Lighter gradient overlay for better visibility
    const gradient1 = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient1.addColorStop(0, "rgba(0, 0, 0, 0.35)");
    gradient1.addColorStop(0.4, "rgba(0, 0, 0, 0.25)");
    gradient1.addColorStop(0.7, "rgba(0, 0, 0, 0.25)");
    gradient1.addColorStop(1, "rgba(0, 0, 0, 0.4)");
    ctx.fillStyle = gradient1;
    ctx.fillRect(0, 0, this.width, this.height);

    // Lighter radial vignette
    const gradient2 = ctx.createRadialGradient(
      this.width / 2,
      this.height / 2,
      this.height * 0.2,
      this.width / 2,
      this.height / 2,
      this.height * 0.8,
    );
    gradient2.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient2.addColorStop(1, "rgba(0, 0, 0, 0.15)");
    ctx.fillStyle = gradient2;
    ctx.fillRect(0, 0, this.width, this.height);

    // 3. Draw Decorative Border
    this.drawDecorativeBorder(ctx);

    // 4. Draw Corner Ornaments (REMOVED per user request)
    // this.drawCornerOrnaments(ctx);

    // ------------ TEXT RENDERING ------------

    // 5. Header Text with Golden Color and Glow
    ctx.fillStyle = "#FFD700"; // Gold color
    ctx.font = `bold 38px "${this.titleFontFamily || "Arial"}"`;

    // Max width for header items to prevent horizontal overlap if they get too close
    const maxHeaderWidth = 400;

    // Reciter Name (Top Left)
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    this.drawTextWithGlow(
      ctx,
      rukuData.reciterName,
      70,
      70,
      "rgba(139, 69, 19, 0.8)", // Brownish glow
      10,
      maxHeaderWidth,
    );

    // Surah Name (Top Right)
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    this.drawTextWithGlow(
      ctx,
      rukuData.surahNameArabic || rukuData.surahName,
      this.width - 70,
      70,
      "rgba(139, 69, 19, 0.8)", // Brownish glow
      10,
      maxHeaderWidth,
    );

    // 6. Center Divider - Widened and Vertical Spacing Increased
    const dividerY = 170; // Increased padding from top header
    this.drawCenterDivider(ctx, dividerY);

    // 7. Quran Text (Center) - with dynamic sizing and white glow
    const paddingX = 120;
    const paddingTop = 230; // Increased vertical padding below divider
    const paddingBottom = 110;

    const maxWidth = this.width - paddingX * 2;
    const maxHeight = this.height - paddingTop - paddingBottom;
    const centerY = paddingTop + maxHeight / 2;

    ctx.fillStyle = "#FFFFFF";

    // Find optimal font size
    const { fontSize, lineHeight, lines } = this.findOptimalFontSize(
      ctx,
      rukuData.fullArabicText,
      maxWidth,
      maxHeight,
      55, // Start size
      20, // Minimum size
    );

    console.log(
      `[TextRenderer] Using font size: ${fontSize}px for ${lines.length} lines`,
    );

    // Set final font
    ctx.font = `${fontSize}px "${this.fontFamily}", Arial`;

    // Draw verse text with glow effect
    ctx.fillStyle = "#FFFFFF";
    const totalHeight = lines.length * lineHeight;
    let startY = centerY - totalHeight / 2 + lineHeight / 2;
    ctx.textBaseline = "middle";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const isLastLine = i === lines.length - 1;
      const currentY = startY + i * lineHeight;

      // Add subtle glow to verse text
      ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
      ctx.shadowBlur = 6;

      if (isLastLine) {
        // Last line centered
        ctx.textAlign = "center";
        ctx.fillText(line, this.width / 2, currentY);
        // Draw again for crispness
        ctx.shadowBlur = 0;
        ctx.fillText(line, this.width / 2, currentY);
      } else {
        // Professional justification with glow
        this.fillTextJustifiedWithGlow(
          ctx,
          line,
          this.width / 2,
          currentY,
          maxWidth,
        );
      }
    }

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // 8. Save
    const fileName = `frame_${Date.now()}.png`;
    const filePath = path.join(this.tempDir, fileName);
    const out = fs.createWriteStream(filePath);
    const stream = canvas.createPNGStream();

    return new Promise((resolve, reject) => {
      stream.pipe(out);
      out.on("finish", () => resolve(filePath));
      out.on("error", reject);
    });
  }

  /**
   * Helper to draw justified text with glow effect
   */
  fillTextJustifiedWithGlow(ctx, text, centerX, y, maxWidth) {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length <= 1) {
      ctx.textAlign = "center";
      ctx.fillText(text, centerX, y);
      ctx.shadowBlur = 0;
      ctx.fillText(text, centerX, y);
      return;
    }

    // Measure width of words
    let totalWordsWidth = 0;
    const wordWidths = [];
    for (const word of words) {
      const w = ctx.measureText(word).width;
      wordWidths.push(w);
      totalWordsWidth += w;
    }

    const totalSpaceWidth = maxWidth - totalWordsWidth;
    const spaceBetweenWords = totalSpaceWidth / (words.length - 1);

    // Start from the right for Arabic (RTL)
    let currentX = centerX + maxWidth / 2;
    ctx.textAlign = "right";

    for (let i = 0; i < words.length; i++) {
      // Draw with shadow
      ctx.fillText(words[i], currentX, y);
      // Draw crisp overlay
      ctx.shadowBlur = 0;
      ctx.fillText(words[i], currentX, y);
      // Restore shadow for next word
      ctx.shadowBlur = 6;

      if (i < words.length - 1) {
        currentX -= wordWidths[i] + spaceBetweenWords;
      }
    }
  }
}

module.exports = TextRenderer;
