const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..');

test('webview uses bundled chart asset and not remote CDN', () => {
  const webviewFile = path.join(projectRoot, 'src', 'webviewPanel.ts');
  const source = fs.readFileSync(webviewFile, 'utf8');

  assert.ok(source.includes('chart.umd.js'));
  assert.ok(source.includes('node_modules", "chart.js", "dist"'));
  assert.ok(!source.includes('cdn.jsdelivr.net/npm/chart.js'));
});

test('local chart bundle exists in node_modules', () => {
  const chartFile = path.join(
    projectRoot,
    'node_modules',
    'chart.js',
    'dist',
    'chart.umd.js'
  );

  assert.equal(fs.existsSync(chartFile), true);
});
