// Opt-in real Codex acceptance: uses your signed-in account and a disposable project.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { createHoso } from '../src/server.ts';

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const root = resolve('.relay/acceptance');
await mkdir(root, { recursive: true, mode: 0o700 });
const workspace = await mkdtemp(join(root, 'project-'));
await promisify(execFile)('git', ['init', '--quiet', workspace]);
await writeFile(join(workspace, 'AGENTS.md'), 'This is a disposable Hoso acceptance project. Work only in this directory. Do not access personal files, use external services, or spawn subagents. Follow the exact task and leave unrelated files unchanged.\n');
const hoso = await createHoso({ connection: { publicOrigin: 'http://localhost:4312' }, stateDir: join(workspace, '.hoso-state') });
await new Promise<void>(resolve => hoso.server.listen(0, '127.0.0.1', resolve));
const port = (hoso.server.address() as import('node:net').AddressInfo).port;
const base = `http://127.0.0.1:${port}`;
const admin = { Authorization: `Bearer ${hoso.adminToken}` };
let phone: Record<string, string> = {};
let sessionId = '';
let trustedFixture = false;
async function request(path: string, body?: unknown, headers: Record<string, string> = phone) {
  return fetch(base + path, { method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
}
async function api(path: string, body?: unknown, headers = phone) {
  const response = await request(path, body, headers);
  const data = await response.json();
  if (!response.ok) throw Error(`${path}: ${response.status} ${data.error}`);
  return data;
}
async function pair() {
  const code = await api('/api/admin/pair', {}, admin);
  const token = new URLSearchParams(new URL(code.url).hash.slice(1)).get('pair');
  const response = await request('/api/pair', { token, name: 'Acceptance phone' }, {});
  assert.equal(response.status, 200);
  phone = { Cookie: response.headers.get('set-cookie')!.split(';')[0] };
}
async function snapshot() { return (await api('/api/session')).session; }
async function input(action: string, text?: string) {
  await api('/api/session', { sessionId, requestId: randomUUID(), action, ...(text ? { text } : {}) });
}
async function waitFile(name: string, expected: string, timeout = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await readFile(join(workspace, name), 'utf8')).trim() === expected) return; } catch { /* Await the agent's edit. */ }
    const state = await snapshot();
    await writeFile(join(workspace, 'terminal-output.txt'), state.output, { mode: 0o600 });
    if (!trustedFixture && state.output.includes('Trust this folder?') && state.output.includes(workspace)) {
      await input('enter'); trustedFixture = true;
      console.log('PASS: fixture folder-trust prompt answered through the paired client Enter control.');
    }
    if (state.state === 'exited') throw Error(`Codex exited while waiting for ${name}`);
    await pause(1000);
  }
  throw Error(`Timed out waiting for ${name}. Check startup, trust, or approval prompts in the retained output.`);
}
async function recordOutput() {
  try { await writeFile(join(workspace, 'terminal-output.txt'), (await snapshot()).output, { mode: 0o600 }); } catch { /* Keep the original failure. */ }
}
try {
  await pair();
  const created = await api('/api/admin/session', { action: 'create', folder: workspace, launcher: 'codex' }, admin);
  sessionId = created.session.id;
  console.log(`Disposable project: ${workspace}`);
  // Only this generated fixture is eligible for automated folder-trust acceptance.
  // This does not interpret or accept command permission prompts.
  let startupSeen = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    const current = await snapshot();
    await writeFile(join(workspace, 'terminal-output.txt'), current.output, { mode: 0o600 });
    if (current.output.includes('Trust this folder?') && current.output.includes(workspace)) {
      await input('enter'); trustedFixture = true;
      console.log('PASS: fixture folder-trust prompt answered through the paired client Enter control.');
      await pause(2000); startupSeen = true; break;
    }
    if (attempt >= 8 && /How can I help|Ask Codex|context left|for shortcuts/i.test(current.output) && !current.output.includes('Trust this folder?')) { startupSeen = true; break; }
    await pause(500);
  }
  assert.ok(startupSeen, 'Codex startup did not reach a recognized prompt; inspect retained output.');
  await input('submit', 'Create hello.txt containing exactly hello from Hoso followed by a newline. Do not change any other files or ask follow-up questions.');
  await waitFile('hello.txt', 'hello from Hoso');
  console.log('PASS: a paired client instructed real Codex to create the expected file.');
  // Wait for the turn to finish before requesting the next task.
  await pause(2500);
  await input('submit', 'Run this single shell command in this project: printf started > busy.txt; sleep 45; printf finished > late.txt. Do not do anything else until it completes.');
  await waitFile('busy.txt', 'started');
  const busyStartedAt = Date.now();
  await pause(1000);
  await input('interrupt');
  await pause(1200);
  assert.equal((await snapshot()).state, 'running', 'Interrupt must leave the Codex session running.');
  await input('submit', 'Stop the previous task and do not resume it. Replace hello.txt with exactly redirected from phone followed by a newline. Do not change any other files.');
  await waitFile('hello.txt', 'redirected from phone');
  console.log('PASS: interrupted busy Codex and redirected it in the same session.');
  const oldPhone = phone;
  await api('/api/admin/revoke', {}, admin);
  assert.equal((await request('/api/session', undefined, oldPhone)).status, 401);
  assert.equal((await request('/api/session', { sessionId, requestId: randomUUID(), action: 'enter' }, oldPhone)).status, 401);
  await pair();
  assert.equal((await snapshot()).id, sessionId);
  await pause(2000);
  await input('submit', 'Create reconnected.txt containing exactly same session followed by a newline. Leave every other file unchanged.');
  await waitFile('reconnected.txt', 'same session');
  console.log('PASS: revoked client cannot read or send; newly paired client resumes the same Codex process and can give it another task.');
  // Ensure the interrupted command did not later finish in the background.
  console.log('Checking cancellation through the original 45-second command deadline…');
  while (Date.now() - busyStartedAt < 48_000) await pause(1000);
  const late = await readFile(join(workspace, 'late.txt'), 'utf8').catch(() => null);
  assert.equal(late, null, 'Interrupted sleep task must not reach its final write.');
  await recordOutput();
  console.log('PASS: no completion marker from the interrupted command.');
  console.log('Real-device browser, microphone, screen lock, and approval UI checks remain manual.');
} catch (error) {
  await recordOutput();
  console.error((error as Error).message);
  console.error(`Diagnostics retained locally in ${workspace}`);
  process.exitCode = 1;
} finally {
  await new Promise<void>(resolve => hoso.server.close(() => resolve()));
  await hoso.closeSessions();
}
