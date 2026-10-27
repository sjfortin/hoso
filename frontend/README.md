# Hoso frontend

The phone (`/`) and desktop (`/desktop`) use one React interface. Vite emits two HTML entrypoints and shared JS/CSS in ignored `dist/`. Node serves the build from the same origin as Hoso's authenticated HTTP interface. There is no client router, cloud backend, CDN, or browser model credential.

## Working here

- `npm start`: build and start the local companion.
- `npm run build`: production frontend build.
- `npm run start:production`: serve a prebuilt artifact without running Vite; usable after `npm ci --omit=dev --ignore-scripts`.
- `npm run watch:frontend`: rebuild on edits. Restart Hoso after a rebuild to refresh its asset allowlist. A restart ends its active session; this is not hot reload.
- `npm run check`: check server and frontend TypeScript.
- `npm test`: build, then run the HTTP/tmux and React interaction suites.

`src/app.tsx` shares the workspace, pairing, and desktop phone setup. `src/lib/api.ts` consumes secret fragments once before rendering and owns same-origin requests. `use-session.ts` owns polling, explicit input delivery, and stale-response guards. `use-dictation.ts` owns optional browser recognition; transcripts stay in the composer for review. Browser/account semantics remain the desktop service and installed agent's responsibility.

## shadcn source and maintenance

Copied from the official shadcn/ui **base-nova** registry on 2026-10-27:

- [Button](https://ui.shadcn.com/r/styles/base-nova/button.json)
- [Input](https://ui.shadcn.com/r/styles/base-nova/input.json)
- [Textarea](https://ui.shadcn.com/r/styles/base-nova/textarea.json)
- [Sheet](https://ui.shadcn.com/r/styles/base-nova/sheet.json)
- [Alert Dialog](https://ui.shadcn.com/r/styles/base-nova/alert-dialog.json)

They live in `src/components/ui` under the upstream [MIT license](SHADCN-LICENSE.txt). Hoso adapts imports to its `@/` alias, replaces registry icon placeholders with Lucide, and increases main button/touch target sizes. Local source and `package-lock.json` record the shipped version; upstream registry URLs can change. Review diffs when updating instead of overwriting local interaction changes blindly. `components.json` records the aliases and style for future component additions.

The controls Sheet uses the same Base UI dialog primitive as the shadcn Sheet: bottom on narrow screens, right side on desktop. It has a visible close button and explicit terminal-key buttons. Opening or dismissing it does not send keys to the terminal. Alert Dialog initially focuses Cancel; a dialog Enter never goes through the composer's key handler. Confirm / Enter is available in the sheet so approval navigation remains usable while the background is inert.

Hoso retains its green palette through Tailwind CSS variables and app styles. Base UI is wrapped in `CSPProvider` with the per-response nonce from the HTML metadata. Keep scripts/styles same-origin and preserve the server CSP; do not enable `unsafe-inline` or `unsafe-eval` to accommodate a component. See [Base UI CSP guidance](https://base-ui.com/react/utils/csp-provider).

## Behavior to preserve

No POSTs from React effects, no guessed busy/approval states, and no replay of uncertain input. Dictation is opt-in; the browser may use a speech provider. Normal polling/reconnect does not reset a draft; changing the actual session does. Revocation removes output and pending old reads cannot restore it. Output stays a text-only bounded terminal view, not fabricated chat messages or approval cards.

Validate the finished UI on a real Android phone: virtual keyboard open/closed, long output scrolling, Confirm / Enter and arrows on an actual approval prompt, Cancel/focus return in dialogs, microphone permission failure, offline recovery, and phone lock/unlock. Synthetic DOM tests cover interactions, not visual layout or mobile platform behavior.
