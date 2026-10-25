# Next working session

Checkpoint: 2026-10-25 — first phone-to-Codex round trip works.

## Product direction

Hoso is the easy terminal. It owns sessions on the computer, with a simple desktop and phone interface for text, reviewed dictation, output, and controls. Users should not manage tmux themselves. The current private tmux backend is an implementation detail; consumer dependency/network setup remains unfinished.

## Verified this session

- Real phone pairs through the private Tailscale HTTPS address.
- Phone text reaches a Hoso-owned terminal session.
- Closing the phone tab, revoking access on desktop, and pairing again restored the existing session output and allowed more input. This was tested before the explicit Codex launcher was added.
- Dictation works on the user's phone.
- Codex launches directly from Hoso. After fixing submission timing, the user confirmed messages submit and receive replies.
- Automated checks: TypeScript check and 13 passing tests, including real tmux lifecycle/input, shared HTTP access, revocation, QR navigation, deduplication, and paste-sensitive agent submission.
- An isolated real Codex smoke prompt requested a fixed reply, prohibited tools/file changes, and received a response.

## Start here next time

1. Use a small disposable project folder and launch Codex through Hoso.
2. Give it a small concrete file-editing task from the phone and inspect the result on the computer.
3. While Codex is busy, test Interrupt, then redirect it with a new instruction. Observe whether it stops, exits, or needs another prompt; do not infer that behavior from the generic shell test.
4. Test an actual approval prompt from the phone using the existing key controls, preserving Codex's permission settings.
5. Repeat phone close/reopen and revocation/re-pairing with Codex itself running. Confirm ongoing work and output survive phone disconnection without duplicate input. Check screen lock and computer-offline behavior.
6. Once that loop is reliable, simplify the interface: give the conversation and composer priority, make session/connection state clear, and move secondary key controls out of the main flow while keeping a terminal view available.

Use observations from these tests to decide the next code change. Add authoritative agent state before introducing agent-aware approval/steering buttons; arbitrary terminal text is not a reliable state protocol.

## Important implementation details

- `npm start` loads optional `.env`; shell environment variables win. `.env` and `.env.*` are ignored except the placeholder `.env.example`.
- The computer uses the localhost desktop setup link printed at startup. The phone uses a fresh QR code pointing to `HOSO_PUBLIC_ORIGIN`, set to the exact Tailscale Serve HTTPS origin.
- QR scanner navigation may be marked cross-site. Public static GETs are allowed; API requests retain cross-site, Host, Origin, and authorization checks.
- New-session UI defaults to Codex; Plain terminal starts a shell without an agent. Codex must already be installed, authenticated, and on Hoso's PATH.
- Codex runs with `--no-alt-screen` and its existing approval/sandbox settings. No bypass flags are added.
- Send to Codex inserts literal text, waits 300 ms for paste detection to settle, then presses Enter under the same serialized operation. Without the pause, Enter became a newline and messages stayed in the input box. A regression test emulates that behavior.
- Plain terminal retains separate Insert text and Enter controls. Nothing is queued or automatically resent after uncertain delivery.
- Output is a bounded plain-text snapshot polled once per second, with a fixed 100-by-32 terminal viewport. It is not full terminal emulation or structured chat.
- Normal Hoso shutdown ends its managed session. Phone disconnect/reconnect is supported; companion restart/reboot recovery is not.
- Keep credentials and device state out of Git. Do not commit `.env`, `.relay`, or desktop/pairing secrets.

## Deferred

Native mobile packaging, consumer installation, automatic dependency/network setup, push notifications, multiple sessions/computers, durable restart recovery, full terminal rendering, and agent-specific action cards.
