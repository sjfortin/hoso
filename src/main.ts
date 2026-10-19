import { resolve } from 'node:path';
import { createEnderloom } from './server.ts';
const port = Number(process.env.ENDERLOOM_PORT ?? process.env.FARLOOM_PORT ?? process.env.RELAY_PORT ?? 4312);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('ENDERLOOM_PORT must be a valid port.');
const publicOrigin = process.env.ENDERLOOM_PUBLIC_ORIGIN ?? process.env.FARLOOM_PUBLIC_ORIGIN ?? process.env.RELAY_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const { server, adminToken } = await createEnderloom({ connection: { publicOrigin }, stateDir: resolve(process.env.ENDERLOOM_STATE_DIR ?? process.env.FARLOOM_STATE_DIR ?? process.env.RELAY_STATE_DIR ?? '.relay'), computerName: process.env.ENDERLOOM_COMPUTER_NAME ?? process.env.FARLOOM_COMPUTER_NAME ?? process.env.RELAY_COMPUTER_NAME });
server.listen(port, '127.0.0.1', () => {
  console.log(`Open desktop setup: http://localhost:${port}/desktop#admin=${adminToken}`);
  console.log(`Phone connection: ${publicOrigin}`);
  if (publicOrigin.startsWith('http:')) console.log('Local development mode. Set ENDERLOOM_PUBLIC_ORIGIN to your private HTTPS address to connect a phone.');
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => server.close(() => process.exit(0)));
