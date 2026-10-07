import { resolve } from 'node:path';
import { createRelay } from './server.ts';
const port = Number(process.env.RELAY_PORT ?? 4312);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('RELAY_PORT must be a valid port.');
const publicOrigin = process.env.RELAY_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const { server, adminToken } = await createRelay({ connection: { publicOrigin }, stateDir: resolve(process.env.RELAY_STATE_DIR ?? '.relay'), computerName: process.env.RELAY_COMPUTER_NAME });
server.listen(port, '127.0.0.1', () => {
  console.log(`Open desktop setup: http://localhost:${port}/desktop#admin=${adminToken}`);
  console.log(`Phone connection: ${publicOrigin}`);
  if (publicOrigin.startsWith('http:')) console.log('Local development mode. Set RELAY_PUBLIC_ORIGIN to your private HTTPS address to connect a phone.');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
