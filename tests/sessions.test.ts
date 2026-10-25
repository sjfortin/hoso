import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { Sessions } from '../src/sessions.ts';

async function until(check: () => Promise<boolean>) {
  for (let n = 0; n < 60; n++) { if (await check()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  assert.fail('Expected terminal output did not arrive');
}
test('owned terminal accepts literal input, reconnects, deduplicates, interrupts, and ends', async t => {
  const sessions = new Sessions(); t.after(() => sessions.close());
  assert.deepEqual(await sessions.snapshot(), { session: null });
  await assert.rejects(sessions.create('relative'), /absolute/);
  const created = await sessions.exclusive(() => sessions.create('/tmp'));
  const id = created.session!.id;
  await assert.rejects(sessions.create('/tmp'), /End the current/);
  let n = 0;
  const action = (action: string, text?: string, requestId = `test-request-${String(++n).padStart(8, '0')}`) => sessions.exclusive(() => sessions.action({ sessionId: id, requestId, action, text }));
  await until(async () => !!(await sessions.snapshot()).session?.output.trim());
  await action('text', "printf 'hoso-%s\\n' 'roundtrip'");
  await action('enter');
  await until(async () => (await sessions.snapshot()).session!.output.includes('hoso-roundtrip'));
  assert.equal((await sessions.snapshot()).session!.id, id);
  await action('text', 'printf hoso-deduplicated', 'test-deduplicate-0001');
  assert.deepEqual(await action('text', 'printf hoso-deduplicated', 'test-deduplicate-0001'), { ok: true, duplicate: true });
  await assert.rejects(action('text', 'different', 'test-deduplicate-0001'), /already been used/);
  await action('enter');
  await action('text', ';'); // A literal semicolon must not become a tmux command separator.
  await action('interrupt');
  await action('text', 'sleep 30'); await action('enter');
  await action('interrupt');
  await action('text', "printf 'after-%s\\n' 'interrupt'"); await action('enter');
  await until(async () => (await sessions.snapshot()).session!.output.includes('after-interrupt'));
  await assert.rejects(action('text', 'line\ncommand'), /one line/);
  await assert.rejects(sessions.action({ sessionId: 'stale', requestId: 'test-stale-00000000', action: 'enter' }), /session changed/);
  await action('end');
  assert.deepEqual(await sessions.snapshot(), { session: null });
});


test('Codex launcher starts the agent directly and submits text once with Enter', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'hoso-agent-test-'));
  const previousPath = process.env.PATH;
  const sessions = new Sessions();
  t.after(async () => { await sessions.close(); process.env.PATH = previousPath; await rm(directory, { recursive: true, force: true }); });
  // Deterministic agent stand-in: no model request, account usage, or file changes.
  await writeFile(join(directory, 'codex'), `#!/usr/bin/env node
process.stdin.setRawMode(true);
process.stdout.write('agent-ready flags:' + process.argv.slice(2).join(' ') + '\\r\\n');
let input = '', lastTextAt = 0;
process.stdin.on('data', chunk => {
  for (const character of chunk.toString()) {
    if (character === '\\r') {
      // Emulate a TUI: Enter during a fast paste inserts a newline instead of submitting.
      if (Date.now() - lastTextAt < 200) input += '\\n';
      else { process.stdout.write('agent-received:' + input + '\\r\\n'); input = ''; }
    } else { input += character; lastTextAt = Date.now(); }
  }
});
`, { mode: 0o700 });
  process.env.PATH = directory + delimiter + previousPath;
  await assert.rejects(sessions.create('/tmp', 'arbitrary-command'), /Choose Codex/);
  const { session } = await sessions.exclusive(() => sessions.create('/tmp', 'codex'));
  assert.equal(session!.launcher, 'codex');
  await until(async () => (await sessions.snapshot()).session!.output.includes('agent-ready flags:--no-alt-screen'));
  const body = { sessionId: session!.id, requestId: 'agent-message-00000001', action: 'submit', text: 'hello agent' };
  await sessions.exclusive(() => sessions.action(body));
  await sessions.exclusive(() => sessions.action(body));
  await until(async () => (await sessions.snapshot()).session!.output.includes('agent-received:hello agent'));
  assert.equal((await sessions.snapshot()).session!.output.split('agent-received:hello agent').length - 1, 1);
});
