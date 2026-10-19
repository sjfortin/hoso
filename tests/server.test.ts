import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createEnderloom } from '../src/server.ts';

async function fixture(t: TestContext, options: Record<string, unknown> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'enderloom-test-'));
  const enderloom = await createEnderloom({ connection: { publicOrigin: 'http://localhost:4312' }, stateDir: dir, ...options });
  await new Promise<void>(resolve => enderloom.server.listen(0, '127.0.0.1', resolve));
  const port = (enderloom.server.address() as import('node:net').AddressInfo).port;
  const base = `http://127.0.0.1:${port}`;
  t.after(async () => { await new Promise<void>(resolve => enderloom.server.close(() => resolve())); await rm(dir, { recursive: true, force: true }); });
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const init = { method: body === undefined ? 'GET' : 'POST', headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) };
    // Node fetch rewrites Host. Raw HTTP is required to test hostile/public Host headers.
    if (headers.Host) return new Promise<Response>((resolve, reject) => {
      const req = httpRequest(base + path, { method: init.method, headers: init.headers }, res => {
        const chunks: Buffer[] = []; res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode!, headers: res.headers as Record<string, string> })));
      });
      req.on('error', reject); req.end(init.body);
    });
    return fetch(base + path, init);
  };
  const admin = { Authorization: `Bearer ${enderloom.adminToken}` };
  const code = async () => { const response = await request('/api/admin/pair', {}, admin); assert.equal(response.status, 200); const result = await response.json(); assert.match(result.qr, /^data:image\/png;base64,/); return new URLSearchParams(new URL(result.url).hash.slice(1)).get('pair'); };
  const pair = async () => { const token = await code(); const response = await request('/api/pair', { token, name: 'Test Phone' }); assert.equal(response.status, 200); return { token, cookie: response.headers.get('set-cookie')!.split(';')[0] }; };
  return { ...enderloom, dir, base, request, admin, code, pair };
}

test('hello round trip, persistence, single-use pairing, one phone, and revocation', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/message', { message: 'Hello' })).status, 401);
  const { token, cookie } = await f.pair();
  const status = await f.request('/api/status', undefined, { Cookie: cookie });
  assert.deepEqual(await status.json(), { name: 'Home Computer', online: true });
  const response = await f.request('/api/message', { message: 'Hello' }, { Cookie: cookie });
  assert.equal(response.status, 200); assert.equal((await response.json()).message, 'Home Computer received your message.');
  assert.equal((await f.request('/api/pair', { token, name: 'Replay' })).status, 401);
  assert.equal((await f.request('/api/admin/pair', {}, f.admin)).status, 409);
  const stored = await readFile(join(f.dir, 'devices.json'), 'utf8');
  assert.ok(!stored.includes(cookie.split('=')[1])); assert.equal((await stat(join(f.dir, 'devices.json'))).mode & 0o777, 0o600);
  const restarted = await createEnderloom({ connection: { publicOrigin: 'http://localhost:4312' }, stateDir: f.dir });
  await new Promise<void>(resolve => restarted.server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>(resolve => restarted.server.close(() => resolve())));
  const restartPort = (restarted.server.address() as import('node:net').AddressInfo).port;
  assert.equal((await fetch(`http://127.0.0.1:${restartPort}/api/status`, { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await f.request('/api/admin/revoke', {}, f.admin)).status, 200);
  assert.equal((await f.request('/api/status', undefined, { Cookie: cookie })).status, 401);
  assert.equal((await f.request('/api/message', { message: 'Hello' }, { Cookie: cookie })).status, 401);
  await f.pair();
});

test('expired and superseded pairing codes are rejected', async t => {
  let now = Date.now(); const f = await fixture(t, { now: () => now, pairingLifetimeMs: 100 });
  const old = await f.code(); const current = await f.code();
  assert.equal((await f.request('/api/pair', { token: old, name: 'Phone' })).status, 401);
  now += 101;
  assert.equal((await f.request('/api/pair', { token: current, name: 'Phone' })).status, 401);
});

test('only one concurrent pairing request succeeds', async t => {
  const f = await fixture(t); const token = await f.code();
  const responses = await Promise.all([f.request('/api/pair', { token, name: 'A' }), f.request('/api/pair', { token, name: 'B' })]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 401]);
});

test('admin, origin, host and input boundaries', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/api/admin/status')).status, 401);
  assert.equal((await f.request('/api/admin/revoke', {})).status, 401);
  assert.equal((await f.request('/api/admin/pair', {}, { ...f.admin, Origin: 'https://evil.example' })).status, 403);
  assert.equal((await f.request('/api/admin/status', undefined, { ...f.admin, Host: 'evil.example' })).status, 403);
  assert.equal((await f.request('/api/admin/status', undefined, { ...f.admin, 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  const { cookie } = await f.pair();
  for (const message of ['', ' ', 123, 'a'.repeat(2001)]) assert.equal((await f.request('/api/message', { message }, { Cookie: cookie })).status, 400);
  assert.equal((await f.request('/api/message', { message: 'a'.repeat(9000) }, { Cookie: cookie })).status, 413);
  const badJson = await fetch(f.base + '/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(badJson.status, 400);
  assert.equal((await fetch(f.base + '/api/pair', { method: 'POST', body: '{}' })).status, 415);
  assert.equal((await f.request('/api/status', undefined, { Cookie: 'relay_device=bad' })).status, 401);
  assert.equal((await f.request('/api/execute', { command: 'ls' }, { Cookie: cookie })).status, 404);
});

test('pairing attempts are rate limited and recover', async t => {
  let now = Date.now(); const f = await fixture(t, { now: () => now });
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/api/pair', { token: 'wrong', name: 'Phone' })).status, 401);
  assert.equal((await f.request('/api/pair', { token: 'wrong', name: 'Phone' })).status, 429);
  now += 60_001; await f.pair();
});

test('HTTPS credentials are secure and admin cannot be used on public host', async t => {
  const f = await fixture(t, { connection: { publicOrigin: 'https://computer.example' } });
  const token = await f.code();
  const response = await f.request('/api/pair', { token, name: 'Phone' }, { Host: 'computer.example', Origin: 'https://computer.example' });
  assert.equal(response.status, 200); const cookie = response.headers.get('set-cookie')!;
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/); assert.match(cookie, /; Secure/);
  assert.equal((await f.request('/api/admin/status', undefined, { ...f.admin, Host: 'computer.example' })).status, 401);
  assert.equal((await f.request('/api/status', undefined, { Host: 'computer.example', Origin: 'http://computer.example', Cookie: cookie })).status, 403);
});

test('PWA assets and security headers are served without secrets', async t => {
  const f = await fixture(t);
  for (const path of ['/', '/desktop', '/app.js', '/desktop.js', '/style.css', '/sw.js', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png']) {
    const response = await f.request(path); assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(response.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    const content = await response.text();
    assert.ok(!content.includes(f.adminToken));
    if (['/', '/desktop', '/manifest.webmanifest'].includes(path)) {
      assert.match(content, /Enderloom/);
      assert.doesNotMatch(content, /Relay|Farloom/);
    }
  }
});

test('Unicode messages remain valid across HTTP chunk boundaries', async t => {
  const f = await fixture(t); const { cookie } = await f.pair();
  const bytes = Buffer.from(JSON.stringify({ message: 'こんにちは 🌺' }));
  const split = bytes.indexOf(Buffer.from('🌺')) + 1;
  const result = await new Promise<number>((resolve, reject) => {
    const req = httpRequest(f.base + '/api/message', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie } }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode!));
    });
    req.on('error', reject); req.write(bytes.subarray(0, split));
    setTimeout(() => req.end(bytes.subarray(split)), 10);
  });
  assert.equal(result, 200);
});
