import http from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import QRCode from 'qrcode';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
type Device = { id: string; name: string; hash: string; connectedAt: string };
export interface ConnectionProvider { publicOrigin: string }
export interface Options { connection: ConnectionProvider; stateDir: string; computerName?: string; pairingLifetimeMs?: number; now?: () => number }
export async function createEnderloom(options: Options) {
  const origin = new URL(options.connection.publicOrigin);
  if (origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password ||
      !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(origin.hostname)))) {
    throw new Error('Use an HTTPS origin, or localhost for development.');
  }
  const now = options.now ?? Date.now;
  const name = options.computerName ?? 'Home Computer';
  const adminToken = secret();
  await mkdir(options.stateDir, { recursive: true, mode: 0o700 });
  await chmod(options.stateDir, 0o700);
  const statePath = join(options.stateDir, 'devices.json');
  let devices: Device[] = [];
  try {
    devices = JSON.parse(await readFile(statePath, 'utf8'));
    if (!Array.isArray(devices) || devices.length > 1 || devices.some(d => typeof d.id !== 'string' || typeof d.hash !== 'string' || typeof d.name !== 'string' || typeof d.connectedAt !== 'string')) throw new Error('Invalid device state');
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  // Serialize state-changing requests so pairing/revocation cannot race persistence.
  let queue = Promise.resolve();
  const mutate = async (fn: () => Promise<void>) => {
    const result = queue.then(fn); queue = result.catch(() => {}); await result;
  };
  const persist = async (next: Device[]) => {
    await writeFile(statePath + '.tmp', JSON.stringify(next), { mode: 0o600 });
    await rename(statePath + '.tmp', statePath); devices = next;
  };
  let pairing: { hash: string; expiresAt: number } | undefined;
  const attempts = new Map<string, { count: number; until: number }>();
  const assets: Record<string, [string, string]> = {
    '/': ['index.html', 'text/html'], '/desktop': ['desktop.html', 'text/html'],
    '/app.js': ['app.js', 'text/javascript'], '/desktop.js': ['desktop.js', 'text/javascript'],
    '/style.css': ['style.css', 'text/css'], '/manifest.webmanifest': ['manifest.webmanifest', 'application/manifest+json'],
    '/sw.js': ['sw.js', 'text/javascript'], '/icon.svg': ['icon.svg', 'image/svg+xml'],
    '/icon-192.png': ['icon-192.png', 'image/png'], '/icon-512.png': ['icon-512.png', 'image/png']
  };
  const server = http.createServer(async (req, res) => {
    const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const host = req.headers.host ?? '';
      const localHost = /^(localhost|127\.0\.0\.1):\d+$/.test(host);
      if (host !== origin.host && !localHost) return send(403, { error: 'This connection is not allowed.' });
      if (req.headers.origin && req.headers.origin !== origin.origin && !(localHost && req.headers.origin === `http://${host}`)) return send(403, { error: 'This connection is not allowed.' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'This connection is not allowed.' });
      const path = new URL(req.url ?? '/', origin).pathname;
      const admin = equal(String(req.headers.authorization ?? ''), `Bearer ${adminToken}`);
      const cookies = String(req.headers.cookie ?? '').split(';').map(x => x.trim());
      const token = cookies.find(x => x.startsWith('relay_device='))?.slice(13) ?? '';
      const device = devices.find(d => equal(d.hash, digest(token)));
      let body: Record<string, unknown> = {};
      if (req.method === 'POST') {
        if (String(req.headers['content-type']).split(';')[0].trim().toLowerCase() !== 'application/json') return send(415, { error: 'Please send a valid request.' });
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 8192) return send(413, { error: 'Your message is too long.' }); chunks.push(chunk); }
        const raw = Buffer.concat(chunks).toString('utf8');
        try { body = JSON.parse(raw); if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error(); } catch { return send(400, { error: 'Please send a valid request.' }); }
      }
      if (path.startsWith('/api/admin/')) {
        if (!admin || !localHost) return send(401, { error: 'Open Enderloom from the link shown on your computer.' });
        if (path === '/api/admin/status' && req.method === 'GET') return send(200, { name, devices: devices.map(({ hash, ...d }) => d), publicOrigin: origin.origin });
        if (path === '/api/admin/pair' && req.method === 'POST') {
          if (devices.length) return send(409, { error: 'Remove the connected phone before pairing another.' });
          const value = secret(); const expiresAt = now() + (options.pairingLifetimeMs ?? 120_000);
          pairing = { hash: digest(value), expiresAt };
          const url = `${origin.origin}/#pair=${value}`;
          return send(200, { url, expiresAt, qr: await QRCode.toDataURL(url, { width: 280, margin: 2 }) });
        }
        if (path === '/api/admin/revoke' && req.method === 'POST') {
          await mutate(async () => { await persist([]); pairing = undefined; });
          return send(200, { ok: true });
        }
      }
      if (path === '/api/pair' && req.method === 'POST') {
        const key = req.socket.remoteAddress ?? 'unknown';
        // Loopback reverse proxies share a bucket. Keep bounded, expire after a minute.
        for (const [k, v] of attempts) if (v.until <= now()) attempts.delete(k);
        const attempt = attempts.get(key) ?? { count: 0, until: now() + 60_000 };
        attempts.set(key, attempt); if (++attempt.count > 10) return send(429, { error: 'Please wait a minute before trying again.' });
        if (typeof body.token !== 'string' || typeof body.name !== 'string' || !body.name.trim() || body.name.length > 80) return send(400, { error: 'Enter a name for your phone.' });
        let credential = '';
        await mutate(async () => {
          if (devices.length || !pairing || pairing.expiresAt <= now() || !equal(pairing.hash, digest(body.token as string))) return;
          credential = secret();
          await persist([{ id: secret(), name: (body.name as string).trim(), hash: digest(credential), connectedAt: new Date(now()).toISOString() }]);
          pairing = undefined;
        });
        if (!credential) return send(401, { error: 'This code has expired or already been used. Get a new code on your computer.' });
        res.setHeader('Set-Cookie', `relay_device=${credential}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${origin.protocol === 'https:' ? '; Secure' : ''}`);
        return send(200, { name });
      }
      if (path === '/api/status' && req.method === 'GET') {
        if (!device) return send(401, { error: 'Connect your phone using the code on your computer.' });
        return send(200, { name, online: true });
      }
      if (path === '/api/message' && req.method === 'POST') {
        if (!device) return send(401, { error: 'Your phone is no longer connected. Scan a new code on your computer.' });
        if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) return send(400, { error: 'Enter a message of up to 2,000 characters.' });
        return send(200, { message: `${name} received your message.`, receivedAt: new Date(now()).toISOString() });
      }
      if (req.method === 'GET' && assets[path]) {
        const [file, type] = assets[path]; res.writeHead(200, { 'Content-Type': type });
        return res.end(await readFile(new URL(`../public/${file}`, import.meta.url)));
      }
      send(404, { error: 'That request is not available.' });
    } catch (error) {
      console.error('Enderloom request failed:', (error as Error).message);
      if (!res.headersSent) send(500, { error: 'Enderloom could not complete that request. Please try again.' }); else res.end();
    }
  });
  server.requestTimeout = 10_000; server.headersTimeout = 10_000;
  return { server, adminToken };
}
