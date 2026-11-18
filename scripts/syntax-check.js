'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(file));
    } else if (file.endsWith('.js')) {
      results.push(file);
    }
  });
  return results;
}

const targetDirs = ['src', 'scripts'];
let allFiles = [];
targetDirs.forEach(d => {
  allFiles = allFiles.concat(getFiles(d));
});

console.log(`🔍 [CI/CD SYNTAX CHECK] Validating syntax for ${allFiles.length} JavaScript files...`);
let errorCount = 0;

allFiles.forEach(file => {
  try {
    execSync(`node --check "${file}"`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`❌ [SYNTAX ERROR] in ${file}:\n`, err.stderr ? err.stderr.toString() : err.message);
    errorCount++;
  }
});

if (errorCount === 0) {
  console.log(`✅ [SYNTAX CHECK PASSED] All ${allFiles.length} files are syntactically valid!`);
  process.exit(0);
} else {
  console.error(`❌ [SYNTAX CHECK FAILED] Found ${errorCount} files with syntax errors.`);
  process.exit(1);
}
