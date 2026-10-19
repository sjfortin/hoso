# Hoso

The proposed Android-first voice-to-computer MVP is captured in [MVP direction](docs/mvp-direction.md). The features below describe the current implementation.

Phase 1: connect a phone to your computer, send **Hello**, and receive **Home Computer received your message.**

A small TypeScript/Node desktop service serves the mobile PWA and desktop setup screen. No AI provider, filesystem tools, or Hoso cloud backend is involved yet.

## Requirements

- Node.js 24 or later.
- For a real phone: Tailscale installed and signed in on both devices, on the same private network. Your computer must stay awake.
- Tailscale HTTPS enabled. This developer prototype does not automate Tailscale installation or sign-in.

## Local development

```sh
npm install
npm start
```

Open the **desktop setup link printed in the terminal**. Create a connection code. The default code points to localhost, so it can only be used on this computer. For a local smoke test, decode the QR with a camera/QR tool and open its URL in a second browser context on the computer. Keep the setup link private: it authorizes pairing and revocation.

## Connect a real phone

1. Install/sign in to Tailscale on the computer and phone. Connect both to the same private network.
2. On the computer, forward the private HTTPS address to Hoso:

   ```sh
   tailscale serve --bg http://127.0.0.1:4312
   ```

   Follow any Tailscale prompt to enable HTTPS. Record the `https://…ts.net` address printed by the command. Use **Serve**, which is private to your network.
3. Start Hoso using that exact address, without a path:

   ```sh
   HOSO_PUBLIC_ORIGIN=https://your-computer.your-network.ts.net npm start
   ```

4. Open the desktop setup link from the terminal. Click **Create a connection code**.
5. Scan the QR code with the phone camera. Enter a phone name and tap **Connect my phone** before the code expires.
6. The phone shows **Home Computer · Online**. Send **Hello**. The reply is **Home Computer received your message.**
7. Optionally add Hoso to the phone's home screen using the browser's install/share menu. Install support varies by browser.

Hoso stays bound to `127.0.0.1`; do not expose the Node port directly. Stop the service with Ctrl+C. Remove the private proxy when no longer needed using `tailscale serve --https=443 off` (check your existing Serve configuration first).

## Settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOSO_PORT` | `4312` | Loopback service port; update Serve's target if changed |
| `HOSO_PUBLIC_ORIGIN` | `http://localhost:4312` | Phone-facing HTTPS origin, or localhost for development |
| `HOSO_COMPUTER_NAME` | `Home Computer` | Name shown on the phone and in replies |
| `HOSO_STATE_DIR` | `.relay` | Private credential-hash storage directory |

Legacy `ENDERLOOM_*`, `FARLOOM_*` and `RELAY_*` settings remain supported (in that order); `HOSO_*` takes precedence. The internal `.relay` directory and `relay_device` / `relay_admin` browser keys retain their original names to preserve existing pairings and setup sessions.

The device credential persists in an HttpOnly cookie for up to a year; the computer stores only its hash in `.relay/devices.json`, with directory mode 0700 and file mode 0600 on Linux. Deleting site data on the phone loses its credential; remove the old phone's access on the desktop before pairing again. Only one phone is supported. **Remove access** revokes its credential. Pending codes and desktop administration credentials are discarded on service restart, while paired phone access persists.

## Verification

```sh
npm run check
npm test
```

Tests exercise the real HTTP service: hello round trip, persisted credentials, expiring/single-use/superseded codes, concurrent pairing, revocation, rate limits, origin/host/authentication boundaries, secure cookie attributes, validation, and PWA assets.

For the manual phone acceptance test, pair, send Hello, stop Hoso, and observe Offline within approximately 5–11 seconds. Restart with the same origin/state directory and verify recovery. Revoke access from desktop and confirm the phone returns to the pairing instructions. A sleeping computer cannot be distinguished reliably from other connectivity failures, so Phase 1 reports Offline.

## Prototype boundaries

HTTPS/Tailscale provide transport encryption; there is no additional application-level end-to-end encryption. Pairing requires possession of the QR secret and access to the private network. An intercepted code can be used before expiry: display it only to the phone owner. This is a prototype security design, with production review still required.

The PWA does not cache messages or files. Conversations are in-memory and disappear on reload. Pairing secrets are URL fragments, removed immediately on load; they are not transmitted in the initial page URL. The desktop administration secret is also a fragment and kept only in that browser tab's session storage. No credentials go to a model or external QR service.

Linux is the first development target. Consumer installation, automatic startup/updates, keychain-backed storage, unattended network setup, and mobile cross-network acceptance are future work. See [architecture decisions](docs/architecture.md) for choices and unresolved questions.
