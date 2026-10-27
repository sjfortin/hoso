# Next working session

Checkpoint: 2026-10-27 — real Codex file editing, interruption/redirection, and revocation/re-pairing verified through the Hoso HTTP protocol.

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

## Verified on 2026-10-27

- Added `npm run acceptance`: opt-in real Codex integration using an isolated Hoso service and generated project under ignored `.relay/acceptance/`.
- Found that starting Codex with its shared daemon can expose the command center and unrelated sessions. Hoso now starts `codex --no-alt-screen --no-daemon` without overriding sandbox or approval settings.
- Explicit folder trust was needed before the first task. The test accepts trust only for the fixture it generated, using the paired client's Enter action; production Hoso never auto-accepts trust or command approvals.
- The paired HTTP client instructed Codex to create a file with the expected content, interrupted an active 45-second shell task, and redirected Codex to update the file in the same running session.
- Revocation rejected both read and input requests from the old credential. A new pairing recovered the same session and successfully requested another file edit.
- The interrupted command did not produce its completion marker after its original deadline.
- Regression suite: 13 passing tests. TypeScript and JavaScript syntax checks passed.
- Small interface improvements: Confirm / Enter and Interrupt remain visible, extra keys/end are grouped under More controls, Latest output scrolls back to recent output, and input acknowledgements distinguish delivery from an agent response.
- Completed a [shadcn/ui assessment](ui-components-assessment.md): a candidate for a planned composer/drawer/dialog UI pass, requiring React/Tailwind/build tooling; no frontend migration or dependencies added.
- Installed two pinned, reviewed project-local skills from Matt Pocock: codebase-design and writing-for-agents. See [skills](skills.md). They are development instructions, not Hoso runtime plugins.

## Start here next time

1. Repeat the project task and interrupt/redirection loop from a real phone. Today's new tests used Hoso's HTTP protocol, not a mobile browser.
2. Answer a real command approval prompt using Confirm / Enter, arrows, and Esc. Folder trust was exercised in the automated integration check; command approval UI remains manual.
3. Lock/reopen the phone and check ongoing Codex work/output. Test computer-offline and screen-lock behavior. Re-pairing to a real running Codex process now passes the local integration check; phone/VPN/browser behavior still needs acceptance.
4. Decide the next interface pass using the [shadcn/ui component assessment](ui-components-assessment.md). Preserve terminal output for setup/approval prompts and keep the composer prominent. Do not infer authoritative busy/approval state from terminal text.
5. Consider whether to add session restart recovery or notifications only after this interaction is comfortable.

Use observations from the phone tests to drive the next code changes. No full terminal emulator, structured approval protocol, or frontend framework migration has been added.

## Important implementation details

- `npm start` loads optional `.env`; shell environment variables win. `.env` and `.env.*` are ignored except the placeholder `.env.example`.
- The computer uses the localhost desktop setup link printed at startup. The phone uses a fresh QR code pointing to `HOSO_PUBLIC_ORIGIN`, set to the exact Tailscale Serve HTTPS origin.
- QR scanner navigation may be marked cross-site. Public static GETs are allowed; API requests retain cross-site, Host, Origin, and authorization checks.
- New-session UI defaults to Codex; Plain terminal starts a shell without an agent. Codex must already be installed, authenticated, and on Hoso's PATH.
- Codex runs with `--no-alt-screen --no-daemon` and its existing approval/sandbox settings. No bypass flags are added.
- Send to Codex inserts literal text, waits 300 ms for paste detection to settle, then presses Enter under the same serialized operation. Without the pause, Enter became a newline and messages stayed in the input box. A regression test emulates that behavior.
- Plain terminal retains separate Insert text and Enter controls. Nothing is queued or automatically resent after uncertain delivery.
- Output is a bounded plain-text snapshot polled once per second, with a fixed 100-by-32 terminal viewport. It is not full terminal emulation or structured chat.
- Normal Hoso shutdown ends its managed session. Phone disconnect/reconnect is supported; companion restart/reboot recovery is not.
- Keep credentials and device state out of Git. Do not commit `.env`, `.relay`, or desktop/pairing secrets.

## Deferred

Native mobile packaging, consumer installation, automatic dependency/network setup, push notifications, multiple sessions/computers, durable restart recovery, full terminal rendering, and agent-specific action cards.
