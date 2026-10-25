# Hoso MVP direction

Updated 2026-10-25. This is the agreed product direction, not a description of shipped features. The implementation now includes a developer session prototype: Hoso-managed tmux, shared desktop/phone controls, polled plain-text output, explicit text/key input, optional browser dictation, and direct Codex launch with a submit button. Basic phone pairing, dictation, reconnection, and a Codex reply have been manually verified. Consumer onboarding, complete agent-task/interrupt/approval acceptance, and agent-aware controls remain unfinished. See [next session](next-session.md). This brief supersedes the earlier file-assistant and existing-session remote-control directions.

## Product

Hoso is an easy terminal: start work on your computer and interact with it from your phone using text, voice, and simple controls. Hoso owns the session experience, including creating sessions, launching programs, displaying output, and reconnecting to ongoing work.

Users should not need to open another terminal application or manage tmux sessions. Hoso may use tmux internally, but that is a replaceable implementation detail rather than a user prerequisite. The product is not limited to controlling a session started in another app.

## First experience

1. Start the Hoso companion on one computer and pair one Android phone by QR code.
2. Open Hoso on the phone and create a session in a chosen working folder.
3. Launch a supported terminal agent from Hoso. Codex CLI is the first supported launch option; a plain shell remains available.
4. Type an instruction, or explicitly dictate, review the transcript, and send it.
5. See live output and respond to the program's questions. Keep the composer and common controls easy to reach on a small screen.
6. Disconnect or lock the phone while the computer keeps working. Reopen Hoso and resume the same session without restarting the program or resending input.
7. Interrupt work or explicitly end the session from Hoso.

## MVP scope

One computer, one paired phone, and one active Hoso-managed session. Begin with the existing mobile PWA and desktop service. Use Linux as the first development target; native Android packaging can follow after the core interaction works.

Text input, live output, explicit voice dictation, reconnection, and interrupt/end controls define the useful first version. Voice is input to the same composer, not a separate assistant or always-listening mode. Keep typed input available when voice is unavailable. Select and validate the dictation implementation before promising browser coverage or local-only audio processing.

The default experience should feel approachable and conversational. Preserve a terminal view and essential key controls for interactive programs. Arbitrary terminal output is not reliably structured chat: do not infer successful execution, agent state, or an approval request merely from a matching output string.

## Session architecture direction

The authenticated desktop service owns the session lifecycle and streams its output to the paired phone. A session backend boundary should support create, list/status, attach/reconnect, input, resize, interrupt, and end operations.

The initial spike uses a private Hoso-managed tmux server. Real terminal tests cover literal input, duplicate suppression, interrupt, shared access, and reconnect snapshots. Users currently install tmux as a developer dependency; bundled or automated setup remains required for consumer onboarding. Full-screen agent behavior still needs real-device acceptance. Keep the backend replaceable by a directly managed pseudo-terminal if needed.

For the first version, work must survive phone disconnection while the desktop companion remains running. Surviving a companion restart, computer reboot, or computer sleep is a separate capability and must not be implied by that promise. Bound retained output, explain when earlier output is unavailable, and avoid replaying uncertain input automatically after reconnecting.

Retain existing pairing and device revocation. Continue using the project's Tailscale connection for the prototype while keeping networking separate from session behavior. Consumer setup without networking commands remains an onboarding goal, not a shipped capability.

A terminal session has the permissions of the process running it; selecting a working folder does not sandbox it. Keep credentials on the computer and require explicit user intent to send input or end a session. Agent-specific permission handling must preserve the agent's own authorization boundaries.

## Simple buttons for agents

Start with generic controls such as Send, Interrupt, Enter, and End session. Clearly distinguish interrupting a foreground program from ending the session.

Later add agent-aware controls for steering work, responding to approval requests, and changing supported settings. These need a supported agent integration with authoritative state; do not turn guessed terminal text into actionable approval buttons. A structured integration complements the terminal backend without defining the whole product around one agent provider.

## Build order

1. Prove a Hoso-owned local session: create, launch an interactive program, send input, observe output, interrupt, reconnect, and end. Compare backend choices and record the result.
2. Connect that session to the paired phone with live output, text input, essential key controls, and visible connection status.
3. Add reviewed voice dictation to the composer and test it on a real Android phone.
4. Polish the default agent experience and validate the full disconnected/reconnected workflow.
5. Add richer agent-specific buttons once the first supported agent and integration are selected.

## Acceptance

From the phone, create a session through Hoso, launch the selected agent, send a typed instruction, see output, and answer a prompt. Dictate and review a follow-up before sending. Lock or disconnect the phone, then reconnect to the same running process and retained output without duplicate input. Interrupt work, continue using the session, and explicitly end it. Revoking the phone must prevent further output access and input. Computer unavailability must be visible rather than shown as successful delivery.

## Open implementation decisions

- Validate Codex startup prompts, approvals, and busy-input behavior on a real phone.
- Hoso-managed tmux versus a directly managed pseudo-terminal.
- Voice implementation, supported Android browsers, and audio processing location.
- Output retention and behavior after companion restarts.
- Consumer installation and connection setup beyond the existing developer prototype.

## Deferred

Multiple simultaneous sessions, multiple computers, always-listening voice, wake words, spoken replies, arbitrary desktop GUI control, polished native mobile packaging, and synchronization with unrelated existing chats.
