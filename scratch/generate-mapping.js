const fs = require('fs');
const path = require('path');

async function buildMapping() {
  const mjsPath = path.resolve(__dirname, '../global_assets/quranKFGQPC-data.mjs');
  const outPath = path.resolve(__dirname, '../global_assets/quran_page_mapping.json');
  
  const m = await import('file:///' + mjsPath.replace(/\\/g, '/'));
  const quranMap = m.quranText;
  
  const pageMap = {};

  for (const [surahNum, verses] of quranMap.entries()) {
    for (const verse of verses) {
      const page = verse.page;
      if (!pageMap[page]) {
        pageMap[page] = [];
      }
      pageMap[page].push(verse);
    }
  }

  const finalMap = {};
  for (let p = 1; p <= 604; p++) {
    const verses = pageMap[p];
    if (!verses) continue;
    
    // Find the primary surah for this page (the one with the most verses, or just the first one)
    // We'll group by surah
    const bySurah = {};
    for (const v of verses) {
      bySurah[v.sura_no] = bySurah[v.sura_no] || [];
      bySurah[v.sura_no].push(v);
    }
    
    // Pick the surah that appears first on the page
    const firstSurah = verses[0].sura_no;
    const surahVerses = bySurah[firstSurah];
    
    finalMap[p] = {
      surahId: firstSurah,
      startVerse: surahVerses[0].aya_no,
      endVerse: surahVerses[surahVerses.length - 1].aya_no
    };
  }

  fs.writeFileSync(outPath, JSON.stringify(finalMap, null, 2));
  console.log(`Wrote mapping for ${Object.keys(finalMap).length} pages to ${outPath}`);
}

buildMapping().catch(console.error);
