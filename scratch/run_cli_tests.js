const { execSync } = require('child_process');

const tests = [
  { name: 'Invalid Page', args: '--page 700 --dry-run', expectError: true },
  { name: 'Out-of-bounds Surah', args: '--surah 115 --dry-run', expectError: true },
  { name: 'Invalid Range', args: '--surah 1 --range 5-1 --dry-run', expectError: true },
  { name: 'Invalid Style', args: '--style asdf --dry-run', expectError: true },
  { name: 'Invalid Platform', args: '--platform asdf --dry-run', expectError: true },
  { name: 'Missing Height with Width', args: '--width 1080 --dry-run', expectError: true },
  { name: 'Valid Dry Run (Platform)', args: '--platform tiktok --dry-run', expectError: false },
  { name: 'Valid Dry Run (Page)', args: '--page 283 --dry-run', expectError: false }
];

let passed = 0;
for (const t of tests) {
  try {
    execSync(`node src/services/media-generator/generator.js ${t.args}`, { stdio: 'pipe' });
    if (t.expectError) {
      console.error(`❌ Test failed: ${t.name} (Expected error, got none)`);
    } else {
      console.log(`✅ Test passed: ${t.name}`);
      passed++;
    }
  } catch (err) {
    if (t.expectError) {
      console.log(`✅ Test passed: ${t.name} (Got expected error: ${err.stderr.toString().split('\\n')[0].trim()})`);
      passed++;
    } else {
      console.error(`❌ Test failed: ${t.name} (Unexpected error: ${err.stderr.toString()})`);
    }
  }
}

console.log(`\nResults: ${passed}/${tests.length} passed.`);
