# Agent controls preview — 2026-11-08

The user confirmed the React/shadcn phone acceptance phase passed. This phase adds richer Codex controls through the [official app-server protocol](https://learn.chatgpt.com/docs/app-server), rather than parsing terminal output.

## Implementation

`src/codex-agent.ts` owns one isolated `codex app-server --listen stdio://` process and the initialize/thread/turn lifecycle. It inherits installed authentication and configured model, sandbox, and approval policy. Hoso does not supply permission-bypass options, create another login flow, attach to existing threads, or expose the protocol transport on the network.

The existing authenticated session endpoints and single-session serialization own creation and actions. `codex-agent` selects this adapter; existing `codex` and `shell` use private tmux. Request identifiers prevent replay, steering/interrupt require the active turn identifier, and approvals have opaque Hoso identifiers scoped to the pending request. Responses offer accept once or decline only; policy amendments and session-wide acceptance are not exposed. Revoking the phone uses the same authorization check as all other session actions.

Output retains 150,000 characters. Protocol lines are bounded to 2 MiB; retained proposal items and approval details are bounded to 50,000 characters each and 100 entries. Requests with undisplayable action details cannot be approved. Pending approvals survive phone refresh/disconnection while the companion lives. Turn completion or request resolution clears them. A broken protocol/process or unconfirmed five-second RPC stops the session to avoid accepting further input with uncertain state. End session/shutdown terminates the owned process group.

This is an initial adapter with a bounded plain-text activity view. Structured questions, permission grants, MCP elicitation, and other server requests are rejected with an unsupported-method error and a visible activity message. It does not provide arbitrary keyboard access to the app-server, queue follow-ups, set models, resume across companion restarts, or import a terminal conversation. Start a separate terminal-mode session when an unsupported workflow is needed.

## Verification

- TypeScript and production build.
- Deterministic child-process protocol tests: handshake/config inheritance, streamed output, active-turn steering, stale-turn rejection, pending approval detail/decline, stale approval rejection, interruption and process close.
- Session interface checks: reconnect snapshots preserve pending requests, duplicate request suppression, changed payload/stale session rejection, end cleanup.
- React checks: explicit approval/steer/interrupt payloads, idle-send disabled during a turn, and terminal keys absent in agent mode. Existing phone/desktop, uncertain delivery, offline, dictation, modal, and polling tests remain.
- Real installed Codex initialization and a no-tools prompt returned the expected `HOSO_AGENT_OK` reply and reached Ready. This used the existing local sign-in and made one model request in a disposable folder.

## Next acceptance

1. On the phone, select the new preview in a disposable working folder and request a small file edit. Confirm activity/output and the resulting file.
2. Trigger an actual command approval with a configuration that requests one. Review all displayed details, decline one, then approve a separate request once. Repeat for a file-change approval when supported by the local configuration.
3. Start a long task, steer it explicitly, then interrupt a separate task. Confirm stopped work does not finish in the background.
4. Lock/reopen the phone while working and while awaiting approval. Confirm the same pending request appears. Revoke/re-pair and verify old access is rejected.
5. Exercise unsupported structured questions/permission/MCP requests; confirm the error is visible and terminal mode remains available for those workflows.

The previous terminal-mode phone acceptance does not establish these new preview checks. Do not mark actual command/file execution or mobile preview acceptance passed based on the deterministic stand-in tests.
