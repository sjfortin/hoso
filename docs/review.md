# Reviewing Hoso

## Current review: command composer and output polish

Start locally with `npm start`, then open the desktop setup link printed in the terminal. Startup rebuilds the interface. Restarting a running companion ends its session, so finish active work before restarting. Use your existing Tailscale address on the paired phone when you want to review mobile layout.

Focus this review on:

- **Command entry:** visible composer labels, plain-terminal Insert text / Confirm / Enter guidance, clear-draft action, and warnings for pasted multiline text.
- **Reuse:** Recent recalls one of the last eight acknowledged inputs into the composer for editing. Recall never sends. History is memory-only and clears on reload or session change.
- **Reading output:** Wrap toggles long-line wrapping; Latest returns to the live bottom. Output remains plain text.
- **Layout:** spacing, type sizes, touch controls, and the composer with the phone keyboard visible.

Record feedback as “mode + screen/action + expected behavior,” for example: “Plain terminal on phone: the Insert text step should be easier to distinguish from executing.” A screenshot is useful for layout feedback. Manual review can be deferred; no new mobile acceptance is claimed.

## Repeatable checks

GitHub Actions runs `npm ci`, `npm run check`, and `npm test` on pushes and pull requests with Node 24 and tmux. The test command also builds production assets. These checks use protocol stand-ins and local tmux; they do not use a real Codex account or phone. Check the commit's Actions result before calling its automated verification complete.

Run the same checks locally with `npm run check && npm test`. Real Codex integration remains opt-in through `npm run acceptance` and makes model requests using local sign-in.

## Path to a first production release

The intended first deployment is one Linux computer and one phone over private Tailscale HTTPS. Broader consumer distribution is a later scope.

1. **Finish the UI review.** Resolve concrete command-entry, keyboard, and output-reading issues. Automated interaction checks support this review; they do not establish visual acceptance.
2. **Validate the agent preview.** Real command/file approvals, steering, interruption, pending-approval reconnect, and revoked access still need the checks in [agent-controls.md](agent-controls.md). Keep the preview optional until accepted.
3. **Prepare operations.** Choose installation/update and service-start procedures; document shutdown, sleep/offline behavior, logs, and rollback. Sessions currently end when the companion stops; durable restart recovery is not shipped.
4. **Review security and dependencies.** Review pairing/revocation, local credential storage, private proxy configuration, agent permissions, and dependencies against the exact release revision. Historical checks are recorded in [frontend-release-check.md](frontend-release-check.md), not a current security sign-off.
5. **Cut a reviewed release.** Pin the revision, rerun automated and prebuilt-artifact checks, record supported devices and known limitations, then tag the release. A Git push is not a production deployment.

Manual acceptance and release decisions remain pending. See [next-session.md](next-session.md) for implementation history.
