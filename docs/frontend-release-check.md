# Frontend release verification — 2026-10-27

Scope: the existing Linux companion and private Tailscale deployment described in the README. The shared React/shadcn frontend is ready for that deployment based on the automated checks below. This is not a completed real-device visual or microphone acceptance report.

## Passed

- Server and frontend TypeScript checks.
- Production Vite build: external shared JS/CSS, two HTML entrypoints, no CDN assets.
- 14 HTTP/tmux tests: pairing, persistence, revocation, Host/Origin boundaries, QR navigation, terminal lifecycle/input, deduplication, published asset restrictions, and matching unique CSP nonces.
- 9 React interaction tests: StrictMode pairing, uncertain-delivery draft preservation, dialog focus/confirmation and key isolation, stale revoked reads, session-specific drafts, mobile controls-sheet behavior, reviewed dictation, offline events during pending input, and non-overlapping slow status polling.
- `npm audit --omit=dev --audit-level=moderate`: zero reported vulnerabilities.
- A disposable artifact containing only `src/`, `dist/`, and the package/lock files installed with `npm ci --omit=dev --ignore-scripts`. With Vite absent, `npm run start:production` started successfully, served both pages and their CSP-protected JS/CSS, rejected an unauthenticated session request, generated a QR code, paired a test client, and accepted its authenticated session read.

## Release fixes

Status polling no longer starts overlapping requests that invalidate a slow response. Open confirmation actions respect the caller's disabled/offline state. An offline event during pending input preserves the draft and warns that delivery may already have happened. Static assets are read before returning HTTP 200. The prebuilt startup command does not invoke frontend build tools.

The agent-workflow checkpoint `d543976` remains separately available before the frontend migration. The real Codex file-task/interrupt/re-pair acceptance passed at that checkpoint; this release keeps its session protocol and launch behavior.

## Remaining real-phone acceptance

There is no connected browser-control surface in the verification environment. Check visual layout with the Android keyboard open/closed, real microphone permission/error behavior, IME composition, actual agent approval prompts, and phone lock/unlock before treating the mobile experience as fully accepted. These checks are distinct from the passing synthetic DOM tests.

Restarting Hoso ends its active session. Normal laptop startup is `npm start`; deployment of a prebuilt artifact uses `npm run start:production`. Pairing authorization persists across a companion restart, but its running terminal process does not. No production service was restarted as part of this release verification.
