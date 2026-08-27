/**
 * Shared text utilities for Quranic text rendering.
 *
 * Provides helpers used by text-renderer, quranic-text-renderer, and
 * video-generator to prevent lone verse-number markers from appearing
 * on their own line after word-wrapping.
 */

/**
 * Returns true if a whitespace-delimited token is a verse-number marker glyph.
 *
 * In the KFGQPC dataset each ayah ends with a private-use / presentation-form
 * glyph (e.g. U+FC00 "ﰀ") that arrives as its own space-separated token.
 * Normal Quranic words (and combining diacritics) stay in the standard Arabic
 * block (U+0600–U+06FF, U+0750–U+077F, U+08A0–U+08FF) plus combining marks
 * (U+0300–U+036F, U+FE20–U+FE2F), so checking whether *every* codepoint is
 * ≥ U+FB50 reliably identifies marker-only tokens.
 *
 * @param {string} word
 * @returns {boolean}
 */
function isVerseMarkerToken(word) {
  if (!word || word.length === 0) return false;
  for (const ch of word) {
    const cp = ch.codePointAt(0);
    if (cp < 0xfb50) return false;
  }
  return true;
}

/**
 * Post-process wrapped lines so that a line consisting solely of verse-number
 * marker tokens is merged into the previous line.  This prevents the verse
 * number ornament from sitting alone on its own line, which looks ugly.
 *
 * Non-marker lines are never modified, so tuned font sizes / characters-per-
 * line behaviour is preserved.
 *
 * @param {string[]} lines - Array of wrapped text lines.
 * @returns {string[]} Cleaned array with lone-marker lines merged.
 */
function mergeLoneVerseMarkers(lines) {
  const cleaned = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/).filter((w) => w.length > 0);
    const isLoneMarker =
      tokens.length > 0 && tokens.every((t) => isVerseMarkerToken(t));
    if (isLoneMarker && cleaned.length > 0) {
      // Append the marker to the end of the previous line.
      cleaned[cleaned.length - 1] =
        cleaned[cleaned.length - 1].replace(/\s+$/, "") + " " + line.trim();
    } else {
      cleaned.push(line);
    }
  }
  return cleaned;
}

module.exports = { isVerseMarkerToken, mergeLoneVerseMarkers };
