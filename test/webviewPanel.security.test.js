const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

function withVscodeMock(loader) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return {
        window: {},
        workspace: {},
        commands: {},
        Uri: {
          joinPath: (...parts) => parts.join('/'),
          file: (value) => ({ fsPath: value }),
        },
      };
    }
    return originalLoad.apply(this, [request, parent, isMain]);
  };

  try {
    return loader();
  } finally {
    Module._load = originalLoad;
  }
}

const { GitStatsWebView } = withVscodeMock(() => require('../dist/webviewPanel'));

function createWebviewHarness() {
  return Object.create(GitStatsWebView.prototype);
}

test('escapeHtml escapes dangerous characters', () => {
  const panel = createWebviewHarness();
  const input = '<img src=x onerror="alert(1)"> & \" \' ';

  const escaped = panel.escapeHtml(input);

  assert.ok(!escaped.includes('<img'));
  assert.ok(escaped.includes('&lt;img'));
  assert.ok(escaped.includes('&amp;'));
  assert.ok(escaped.includes('&quot;'));
  assert.ok(escaped.includes('&#39;'));
});

test('safeJson neutralizes script-breaking characters', () => {
  const panel = createWebviewHarness();
  const payload = { text: '</script><script>alert(1)</script>' };

  const out = panel.safeJson(payload);

  assert.ok(!out.includes('</script>'));
  assert.ok(out.includes('\\u003c/script\\u003e'));
});

test('renderTabularContent escapes table cells', () => {
  const panel = createWebviewHarness();
  const content = 'Name|Value\n---|---\n<img>|1';

  const html = panel.renderTabularContent(content);

  assert.ok(html.includes('<table'));
  assert.ok(html.includes('&lt;img&gt;'));
  assert.ok(!html.includes('<img>'));
});
