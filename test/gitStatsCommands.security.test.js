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

const { GitStatsCommands } = withVscodeMock(() =>
  require('../dist/gitStatsCommands')
);

function createCommandHarness() {
  const cmd = Object.create(GitStatsCommands.prototype);
  cmd.allowedCustomQueryCommands = new Set([
    'log',
    'shortlog',
    'show',
    'rev-list',
    'diff',
    'branch',
    'tag',
    'ls-files',
    'blame',
    'for-each-ref',
    'status',
  ]);
  return cmd;
}

test('sanitizeDateValue only accepts YYYY-MM-DD', () => {
  const cmd = createCommandHarness();

  assert.equal(cmd.sanitizeDateValue('2026-04-06'), '2026-04-06');
  assert.equal(cmd.sanitizeDateValue('2026/04/06'), undefined);
  assert.equal(cmd.sanitizeDateValue('2026-4-6'), undefined);
  assert.equal(cmd.sanitizeDateValue('2026-04-06\n--all'), undefined);
});

test('sanitizeAuthorValue strips control chars and caps length', () => {
  const cmd = createCommandHarness();

  assert.equal(cmd.sanitizeAuthorValue('Alice\nBob'), 'Alice Bob');
  assert.equal(cmd.sanitizeAuthorValue(''), undefined);

  const longName = 'a'.repeat(150);
  assert.equal(cmd.sanitizeAuthorValue(longName).length, 120);
});

test('tokenizeCustomQuery handles quoted sections', () => {
  const cmd = createCommandHarness();

  const tokens = cmd.tokenizeCustomQuery('log --format="%h %s" --all');
  assert.deepEqual(tokens, ['log', '--format=%h %s', '--all']);
});

test('isSafeCustomQuery allows read-only queries and blocks dangerous args', () => {
  const cmd = createCommandHarness();

  assert.equal(cmd.isSafeCustomQuery(['log', '--all']), true);
  assert.equal(cmd.isSafeCustomQuery(['status']), true);
  assert.equal(cmd.isSafeCustomQuery(['fetch']), false);
  assert.equal(cmd.isSafeCustomQuery(['log', '-c', 'core.editor=sh']), false);
  assert.equal(cmd.isSafeCustomQuery(['log', '--config', 'core.editor=sh']), false);
  assert.equal(cmd.isSafeCustomQuery(['log', 'ok\nrm']), false);
});
