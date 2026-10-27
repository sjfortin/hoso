# Hoso

Hoso is an easy terminal: create a session on your computer and continue from your phone through text, optional dictation, and simple controls. See the agreed [MVP direction](docs/mvp-direction.md), [checkpoint / next session](docs/next-session.md), [project development skills](docs/skills.md), and [UI component assessment](docs/ui-components-assessment.md).

The current developer prototype includes QR pairing, a shared desktop/phone terminal session, live plain-text output refreshed every second, and explicit input controls. A TypeScript/Node desktop service serves both interfaces. A private Hoso-managed tmux server runs the session; your existing tmux sessions are separate. There is no Hoso cloud backend or bundled AI provider.

## Use a session

1. Start Hoso and open the desktop setup link printed in the terminal.
2. Choose **Codex agent** (the default) or **Plain terminal**, enter an absolute working folder or leave it empty for home, then choose **Start session**.
3. Codex launches directly using the installed CLI and its existing sign-in/settings. Complete any startup or permission prompts in the output using the key controls. Codex must already be installed and authenticated on the computer. Plain terminal starts only a shell.
4. Pair your phone using the instructions below. It opens the same session; you can return to it from either device.
5. In a Codex session, **Send to Codex** types and submits the message. In a plain terminal, **Insert text** and **Enter** remain separate. Use **Interrupt** to send Ctrl+C. Input goes directly to the foreground program; Hoso does not infer whether an agent is busy, queue messages, or automatically resend uncertain input.
6. On supported browsers, **Dictate** adds a transcript to the composer for review. Browser speech recognition may send audio to its speech provider; Hoso requests confirmation before starting it. Keyboard dictation remains an alternative.
7. **End session** stops its programs after confirmation. Disconnecting the phone leaves work running while Hoso and the computer remain running. Stopping Hoso ends the managed session; restart/reboot recovery is not implemented.

Output is a plain-text snapshot at 100 columns, with up to the most recent 1,000 history lines plus the current screen. Color, cursor interaction, full terminal emulation, notifications, and agent-specific approval buttons are not implemented. Use **Confirm / Enter** to answer the highlighted setup or approval choice. **More controls** contains Escape, Tab, arrows, and End session; **Latest output** returns to the bottom after reading earlier output. Terminal programs run with your computer account's permissions; the selected folder is not a sandbox.

## Requirements

- Node.js 24 or later.
- tmux installed on the Linux computer for terminal sessions. Hoso manages its private instance; automatic dependency installation is not implemented.
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
6. The phone shows **Home Computer · Online** and the shared session. Start a Codex session if needed, answer any startup prompts, and send a task using **Send to Codex**.
7. Optionally add Hoso to the phone's home screen using the browser's install/share menu. Install support varies by browser.

Hoso stays bound to `127.0.0.1`; do not expose the Node port directly. Stop the service with Ctrl+C. Remove the private proxy when no longer needed using `tailscale serve --https=443 off` (check your existing Serve configuration first).

## Settings

`npm start` automatically loads an optional `.env` in the project directory. Copy `.env.example` to `.env` for local settings. For phone access, set `HOSO_PUBLIC_ORIGIN` to the exact private HTTPS address printed by Tailscale Serve. Existing shell environment variables take precedence over `.env` values. No AI API key is required by Hoso itself; your terminal agent manages its own authentication.

`.env` and `.env.*` are ignored by Git; only the placeholder `.env.example` is intended to be committed.

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

Tests exercise real tmux session input, reconnection snapshots, duplicate suppression, interrupt/end controls, shared desktop/phone access, and the HTTP service: hello round trip, persisted credentials, expiring/single-use/superseded codes, concurrent pairing, revocation, rate limits, origin/host/authentication boundaries, secure cookie attributes, validation, and PWA assets.

An opt-in integration check uses your installed, signed-in Codex and makes real model requests:

```sh
npm run acceptance
```

It starts an isolated Hoso service, pairs a test client, launches standalone Codex, accepts folder trust only for its own generated fixture, and verifies actual file creation, interrupt/redirection, revoked-client rejection, and re-pairing to the same Codex session. It waits beyond the interrupted command's original deadline to check that the command did not finish in the background. It never automatically accepts command-permission prompts. Generated projects and diagnostics stay in ignored `.relay/acceptance/`; Codex may save a normal trust entry for each fixture folder. This is a local HTTP client test, not a browser, phone, VPN, or microphone test.

For manual phone acceptance, use a disposable project folder and complete a small file edit through Codex. Interrupt an active task and send a follow-up. Answer a real command approval prompt using the key controls. Lock/reopen the phone and check the same session; revoke/re-pair and repeat. Disconnect the computer and confirm Offline is shown and input is disabled. Normal companion shutdown ends the session, while phone authorization persists across restart. A sleeping computer cannot be distinguished reliably from other connectivity failures, so Hoso reports Offline.

## Prototype boundaries

HTTPS/Tailscale provide transport encryption; there is no additional application-level end-to-end encryption. Pairing requires possession of the QR secret and access to the private network. An intercepted code can be used before expiry: display it only to the phone owner. This is a prototype security design, with production review still required.

The PWA does not cache terminal output or files. Terminal output is retained by the running session and fetched again after a page reload. Pairing secrets are URL fragments, removed immediately on load; they are not transmitted in the initial page URL. The desktop administration secret is also a fragment and kept only in that browser tab's session storage. No credentials go to a model or external QR service.

Linux is the first development target. Consumer installation, automatic startup/updates, keychain-backed storage, unattended network setup, and mobile cross-network acceptance are future work. See [architecture decisions](docs/architecture.md) for choices and unresolved questions.

The Codex launcher uses `codex --no-alt-screen --no-daemon` to preserve scrollback and isolate the session from Codex’s shared command center, with no permission-bypass flags. See the [official CLI reference](https://learn.chatgpt.com/docs/cli/reference). A Codex session ends when Codex exits; it does not fall back to a shell that could execute later messages as commands.
