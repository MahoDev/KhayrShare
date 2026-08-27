const { createCanvas, registerFont, loadImage } = require("canvas");
const path = require("path");
const fs = require("fs");
const { mergeLoneVerseMarkers } = require("../shared/text-utils");

/**
 * QuranicTextRenderer
 *
 * Renders Quranic verse text with proper OpenType text shaping using node-canvas
 * (which uses Pango/HarfBuzz under the hood). This solves the mark-to-mark (mkmk)
 * stacking issue that occurs when librsvg (sharp's SVG renderer) fails to correctly
 * position diacritics like Dagger Alif (U+0670) + Maddah Above (U+0653).
 *
 * The renderer handles:
 *   - Multi-line wrapping for any line count
 *   - Text stroke (outline) for visibility on any background
 *   - Drop shadow effect matching the existing SVG style
 *   - OpenType font features (liga, clig, ccmp, calt, mark, mkmk)
 *   - Transparent background for compositing
 */
class QuranicTextRenderer {
  constructor(config = {}) {
    this.fontFamily = config.fontFamily || "KFGQPC HAFS Uthmanic Script";
    this.strokeWidth = config.strokeWidth || 2;
    this.shadowOpacity = config.shadowOpacity ?? 0.95;
    this.shadowBlur = config.shadowBlur || 4;
    this.shadowOffsetX = config.shadowOffsetX || 4;
    this.shadowOffsetY = config.shadowOffsetY || 4;
  }

  /**
   * Register a font for use in canvas rendering
   * @param {string} fontPath - Absolute path to the font file
   */
  registerDisplayFont(fontPath) {
    if (!fontPath || !fs.existsSync(fontPath)) {
      console.warn(`[QuranicTextRenderer] Font not found: ${fontPath}`);
      return false;
    }
    try {
      registerFont(fontPath, { family: this.fontFamily });
      console.log(`[QuranicTextRenderer] Registered font: ${fontPath}`);
      return true;
    } catch (err) {
      console.error(
        `[QuranicTextRenderer] Failed to register font: ${err.message}`,
      );
      return false;
    }
  }

  /**
   * Wrap Arabic text into lines that fit within maxCharsPerLine.
   * Splits on whitespace preserving word boundaries.
   * @param {string} text
   * @param {number} maxCharsPerLine - approximate character limit per line
   * @returns {string[]} array of lines
   */
  wrapArabicText(text, maxCharsPerLine) {
    const words = text.trim().split(/\s+/);
    const lines = [];
    let currentLine = "";
    for (const word of words) {
      if ((currentLine + " " + word).trim().length > maxCharsPerLine) {
        if (currentLine) lines.push(currentLine.trim());
        currentLine = word;
      } else {
        currentLine = currentLine ? currentLine + " " + word : word;
      }
    }
    if (currentLine) lines.push(currentLine.trim());
    return mergeLoneVerseMarkers(lines);
  }

  /**
   * Render Quranic text lines to a Buffer (PNG) with proper OpenType shaping.
   *
   * @param {string[]} lines - Array of text lines (already wrapped)
   * @param {object} options
   * @param {number} options.fontSize - Font size in pixels
   * @param {number} options.lineHeight - Vertical space between baselines (px)
   * @param {number} options.canvasWidth - Width of output canvas (px)
   * @param {number} options.canvasHeight - Height of output canvas (px)
   * @param {number} options.startY - Y coordinate to start rendering first line baseline
   * @param {number} [options.strokeWidth] - Override stroke width
   * @param {number} [options.shadowOpacity] - Override shadow opacity
   * @param {string} [options.fillColor] - Text fill color (default: 'white')
   * @param {string} [options.strokeColor] - Text stroke color (default: 'black')
   * @returns {Buffer} PNG image buffer
   */
  renderLines(lines, options = {}) {
    const {
      fontSize,
      lineHeight,
      canvasWidth,
      canvasHeight,
      startY,
      strokeWidth = this.strokeWidth,
      shadowOpacity = this.shadowOpacity,
      fillColor = "white",
      strokeColor = "black",
    } = options;

    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    // Clear with full transparency
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // Build font string
    // Use font-variant-ligatures and font-feature-settings via CSS-like font string
    // node-canvas v3 supports OpenType feature settings via font property extensions
    const fontStyle = `normal ${fontSize}px "${this.fontFamily}"`;
    ctx.font = fontStyle;

    // Enable OpenType features for proper Arabic shaping
    // This is critical for mark-to-mark (mkmk) positioning
    ctx.fontVariantLigatures = "common-ligatures contextual";

    try {
      // node-canvas 3.x supports OpenType feature setting
      ctx.fontKerning = "normal";
    } catch (_) {
      // ignore on older versions
    }

    // Set text direction to RTL for proper Arabic rendering
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Render each line with drop shadow then stroke then fill
    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * lineHeight;
      const x = canvasWidth / 2;
      const text = lines[i];

      // --- Drop Shadow ---
      ctx.save();
      ctx.shadowColor = `rgba(0, 0, 0, ${shadowOpacity})`;
      ctx.shadowBlur = this.shadowBlur;
      ctx.shadowOffsetX = this.shadowOffsetX;
      ctx.shadowOffsetY = this.shadowOffsetY;
      ctx.fillStyle = fillColor;
      ctx.fillText(text, x, y);
      ctx.restore();

      // --- Stroke (outline) ---
      if (strokeWidth > 0) {
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth * 2; // Canvas stroke is centered, so double for equivalent effect
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.strokeText(text, x, y);
        ctx.restore();
      }

      // --- Fill ---
      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    return canvas.toBuffer("image/png");
  }

  /**
   * Convenience method: render text with auto line-wrapping for verse-display.
   *
   * @param {string} text - The raw verse text
   * @param {object} opts
   * @param {number} opts.fontSize - Font size
   * @param {number} opts.maxCharsPerLine - Max characters per line for wrapping
   * @param {number} opts.lineHeight - Line height in px
   * @param {number} opts.canvasWidth - Output canvas width
   * @param {number} opts.canvasHeight - Output canvas height
   * @param {number} opts.textStartY - Y position of first line baseline
   * @returns {Buffer} PNG buffer
   */
  renderVerseText(text, opts) {
    const lines = this.wrapArabicText(text, opts.maxCharsPerLine);
    return this.renderLines(lines, opts);
  }
}

module.exports = QuranicTextRenderer;
