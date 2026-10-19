# Hoso MVP direction

Updated 2026-10-20. This captures the new product direction; the implementation remains the Phase 1 pairing and message-acknowledgement prototype.

## User goal

An Android user with no terminal experience can walk around the house, speak requests to their computer, read replies, and continue the same conversation. Start with the OpenAI/ChatGPT ecosystem.

## Proposed first experience (not yet implemented)

1. Install a desktop companion, sign in, choose an allowed working folder, and pair an Android phone by QR code without entering terminal commands.
2. Open Hoso from the home screen. Dictate or type a message, review it, and send.
3. See received, working, needs approval, completed, failed, or disconnected states and streamed replies.
4. Continue the same conversation, including after reopening the phone app. Allow stopping work and answering approval requests from the phone.
5. Keep work running on the computer while the phone disconnects. Reconnect without resubmitting executed requests.

## Proposed scope

One Android phone, one computer, one selected workspace, and one active conversation. Start with explicit dictation and text replies. Evaluate Codex app-server locally behind Hoso's authenticated service; do not expose the agent directly to the network. ChatGPT sign-in does not by itself establish synchronization with an existing ChatGPT conversation.

Keep the existing PWA for the first agent round-trip experiment. A native Android client with a pinned shortcut is the proposed consumer experience; a Quick Settings tile can follow if users need it. Desktop installation, sign-in, connection setup, and approval handling are part of the MVP for nontechnical users.

Preserve pairing authentication and enforce runtime permissions on the computer. Do not treat a selected folder in the UI as sufficient sandboxing. Keep model credentials on the computer. Explain model data transmission and account limits during onboarding.

## Decisions still needed

- First three useful tasks: coding, documents/files, or interaction with desktop applications?
- First desktop OS: macOS, Windows, or Linux? Existing prototype was Linux-first; current development is on macOS.
- Same-home-network scope versus remote internet access; a secure, terminal-free connection setup still needs design.
- Must users continue an existing desktop ChatGPT conversation, or is a Hoso-owned agent conversation acceptable?
- Confirm account eligibility and integration behavior with a real ChatGPT account before promising consumer availability.

## Deferred

Always-listening voice, wake words, simultaneous agents, multiple computers, arbitrary desktop GUI control, and synchronization with unrelated existing chats. These are proposals pending product decisions, not removed capabilities.

## Validation

A first-time user pairs without a terminal, dictates a useful task, approves a requested action, receives a result, follows up with context intact, locks/unlocks the phone, reconnects without duplicate execution, and can stop work. Test computer sleep and account-limit failures explicitly.

Official integration references checked on 2026-10-20:
- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/auth
- https://developer.android.com/develop/ui/compose/system/shortcuts/creating-shortcuts
