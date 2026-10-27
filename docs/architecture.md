# Phase 1 architecture decisions

Date: 2026-10-07. Source: `/home/sam/Downloads/relay-mvp-spec.md`, Phase 1 and first-session questions.

## 001 — Same-origin desktop service and mobile PWA

Use Node.js 24 with TypeScript and a small dependency for QR rendering. Serve a plain responsive web client from the desktop. A desktop shell, React, agent orchestration, database, and cloud backend are unnecessary for a message round trip. Node's built-in TypeScript stripping avoids a server build step. Linux is the first target; a background service with local setup UI is the initial packaging shape, not a consumer installer.

The phone calls `/api/pair`, `/api/status`, and `/api/message` over the same origin. Five-second polling provides online/offline state. Every request has a timeout. No message queue or fake success while offline. Phase 1 deterministically acknowledges a message and does not interpret it as an instruction.

## 002 — Tailscale Serve as initial connection provider

The app listens on loopback. Tailscale Serve terminates HTTPS and proxies the same-origin UI/API. Both phone and computer must already be joined to the private network. This is the smallest prototype with no persistent Hoso cloud backend. It does not achieve the brief's consumer onboarding goal yet.

The `ConnectionProvider` interface currently supplies the public origin. The HTTP protocol and agent-independent handler do not depend on Tailscale SDKs or peer identities. Future connection lifecycle/discovery or a relay can extend this boundary without changing message semantics. TLS/proxy configuration is operated outside the app for now.

Official sources:

- [Tailscale Serve command](https://tailscale.com/docs/reference/tailscale-cli/serve): private service exposure and HTTPS reverse proxying.
- [Serve examples](https://tailscale.com/docs/reference/examples/serve): forwarding to a local web service.

Security assumptions: Tailscale protects transport and network reachability; Hoso still authenticates paired devices independently. HTTPS makes PWA secure-context features and Secure cookies available. Trust includes the desktop, the browser, the TLS terminator, and the private network configuration. This is not application-layer encryption independent of transport. No public exposure is configured by Hoso.

Open questions: managed onboarding without users handling Tailscale accounts, consumer distribution/licensing, phone VPN friction, and relay/WebRTC alternatives. Do not represent these as resolved by Phase 1.

## 003 — Short-lived bearer pairing, persistent hash-only credentials

Desktop startup creates a random 256-bit administration secret, printed in a localhost setup URL fragment. Admin endpoints require that secret and a localhost Host header. The secret is held in tab session storage; restarting invalidates it. Network membership alone does not authorize desktop administration.

Admin creates a random 256-bit pairing secret valid for two minutes. The QR contains an HTTPS URL and the secret in its fragment. Creating a new code invalidates the preceding one. The phone removes the fragment before doing other work, then explicitly exchanges the secret with a phone name. The server serializes state changes, checks expiry/single-use and the one-phone limit, writes a hashed credential atomically, consumes the secret, and sets a fresh random long-term HttpOnly, SameSite=Strict, Secure cookie (Secure omitted only for localhost development).

The computer persists credential hashes, device ID/name, and connection date; secret credentials never enter model context. Revocation clears stored authorization. Origin/Host checks, cross-site fetch rejection, strict JSON validation, small body limits, no CORS, CSP, no-store responses, and pairing rate limits reduce attack surface. An opaque bearer credential is the prototype's “equivalent secure handshake,” not a public-key device identity. QR possession authorizes pairing; there is no secondary desktop approval or proof of physical phone ownership.

Production gaps include OS credential/keychain design, public-key device credentials, broader threat modeling, administrative key storage, expiry/rotation policy, resilient recovery after the cookie response is lost, endpoint-specific abuse controls, and review of transport-independent encryption. State directory must be owned by the user on a trusted local filesystem. Persistence is single-process; multiple Hoso instances sharing a state directory are unsupported.

## 004 — Purpose-built runtime; defer Herder

Phase 1 needs only deterministic message acknowledgment, so no agent/runtime dependency is justified. No shell/file tool is exposed. A future tool boundary must independently validate approved operations and paths as required by the spec.

The name “Herder” is ambiguous. Research found [herdrdev/herdr](https://github.com/herdrdev/herdr), a terminal/workspace runtime for coding agents, and [cleonhp88/herder](https://github.com/cleonhp88/herder), a CLI-agent job supervisor with queues, sandboxing, and scheduling. Those capabilities exceed Phase 1 and do not replace Hoso's pairing, mobile UI, or consumer permission boundary. The intended project should be identified before any later integration evaluation. No claim of an exhaustive Herder suitability review is made here.

## Phase 1 acceptance

- Desktop setup UI displays an expiring QR code.
- Mobile web UI pairs one named phone securely over the configured transport.
- Phone shows computer name and Online/Offline.
- A valid authenticated message returns “Home Computer received your message.”
- Unauthorized, replayed, expired, and revoked credentials fail.
- Phone credentials survive a desktop service restart.
- No Phase 2 filesystem capabilities or Phase 3 model integration.

Real-device Tailscale acceptance requires the operator's configured private HTTPS address and a phone on that network. Automated local tests exercise the protocol and security boundaries; they cannot prove a phone's VPN configuration or camera/PWA installation experience.


## 005 — Hoso-owned session prototype (2026-10-25)

The new MVP direction supersedes the Phase 1-only product scope above. Hoso owns one terminal session in a private tmux server with a randomly created, private temporary socket directory and no user tmux configuration. It does not attach to existing sessions. Node invokes tmux with argument arrays; text is encoded as hexadecimal bytes to keep terminal text out of tmux's command parser. Input control characters and multiline text are rejected; essential keys are separate actions.

Desktop access uses the existing localhost-only admin credential; phone access uses the existing paired-device cookie. Both call the same serialized session backend. Device authorization is rechecked when queued operations execute. Request identifiers prevent repeated input within the running session, and stale session identifiers are rejected. An uncertain delivery is not automatically retried. Revocation prevents further phone access without stopping desktop work.

The client polls bounded plain-text screen/history snapshots once per second while visible. This provides reconnectable output without an open stream or a terminal emulator dependency. It does not preserve terminal colors, expose a reliable agent-busy state, or implement structured approvals. The terminal has a fixed 100-by-32 viewport. The desktop and phone share that viewport; independent device resizing is deferred.

Disconnecting a phone leaves the process running. Normal companion shutdown ends its private tmux server; crash/reboot recovery and durable input receipts are not promised. The private socket is accessible to the same OS user; that user and terminal programs are trusted. A working directory is not a permission boundary.

Browser SpeechRecognition is optional and requires explicit user activation. Audio may be processed by the browser's speech provider; transcripts remain in the composer until the user inserts them. No audio is uploaded by Hoso's service. Actual Android/browser support remains a manual acceptance item.

References: [tmux manual](https://man.openbsd.org/tmux), [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition).


## 006 — Explicit agent launch and submission

New-session UI defaults to Codex, with Plain terminal as an explicit alternative. The service resolves the installed Codex executable from its PATH and launches it directly with `--no-alt-screen`; a missing installation produces a setup error rather than silently falling back to a shell. No sandbox or approval settings are overridden. Startup/sign-in/trust prompts remain visible and require the user's response.

Codex sessions have a Send to Codex action that sends literal input followed by Enter after a 300 ms pause for Codex’s paste detection, in one serialized operation, sharing the existing request deduplication. Plain terminal retains separate Insert text and Enter controls. The chosen mode is stored in session metadata and displayed on both devices. Codex exit retains final output and cannot fall back into a shell. This remains terminal input rather than a structured agent protocol: busy-state inference and agent-aware approvals are not implemented.

Tests use a local deterministic agent stand-in to verify executable launch, startup arguments, message submission, and duplicate suppression without model calls. A separate startup smoke check verified the installed Codex process starts inside a Hoso session. A complete real-agent task still requires phone acceptance.

The submission fix was also checked with a harmless real Codex prompt that requested a fixed reply and prohibited tool use or file changes. The deterministic agent test emulates a TUI that interprets Enter during a paste burst as a newline.


## 007 — Standalone Codex and opt-in acceptance (2026-10-27)

The real task check exposed shared-daemon command-center behavior, so Hoso now adds `--no-daemon` to isolate its Codex process. Sign-in, folder trust, sandbox policy, and command approvals remain Codex responsibilities; Hoso does not bypass them. Folder-trust prompts must be answered with explicit key input before treating the interface as an agent task composer.

The opt-in `npm run acceptance` starts an isolated service and uses the same admin/pair/device HTTP protocol as the clients. It checks real file edits, interrupt/redirection, credential revocation, re-pairing, and lack of a late completion marker after an interrupted command's deadline. It accepts folder trust only for its own generated inert project. It does not automatically answer command-permission prompts. Tests use the installed CLI/account, so they are separate from the deterministic regression suite and keep local diagnostics in ignored state storage.

The interface groups secondary key controls and provides explicit delivery acknowledgements. No busy/completed/approval state is inferred from output. Browser layout, microphone behavior, screen lock, and mobile approval handling remain real-device acceptance items.
