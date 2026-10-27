# UI component assessment

Reviewed 2026-10-27 against Hoso's current plain HTML/CSS/JavaScript PWA and official shadcn/ui documentation. This is a recommendation, not an installed dependency or an approved frontend migration.

## Recommendation

Use shadcn/ui for a deliberate frontend pass once the current real-agent interaction checks are stable. It is a good fit for Hoso's composer, secondary controls, setup forms, and consequential-action dialogs. Do not migrate the frontend solely to restyle buttons during the session reliability work.

Hoso currently has no React, Tailwind, bundler, or client build step; the Node service serves an explicit asset map. The documented Vite path introduces React + TypeScript, Tailwind, aliases, component configuration, and a build pipeline. This is a frontend architecture change, although it does not require replacing the Node service, pairing protocol, tmux backend, or same-origin API. [Official Vite setup](https://ui.shadcn.com/docs/installation/vite).

shadcn distributes component source that Hoso can own and adapt. That fits a custom mobile terminal product, but Hoso must also review and maintain its copied components and their dependencies. [Component model](https://ui.shadcn.com/docs).

## Where it would help

| Hoso interaction | Candidate | Benefit and boundary |
| --- | --- | --- |
| Type/dictate, review, send | Input Group + textarea + buttons | One coherent composer with microphone/listening state and a primary Send button. Keep the existing SpeechRecognition adapter; components do not add speech support. Add only controls Hoso supports. |
| Extra terminal keys and session options | Responsive Drawer/Dialog or Sheet | Extra keys become a touch-friendly panel on phone and a dialog/panel on desktop. Keep Interrupt, Confirm / Enter, and output reachable. |
| End session / revoke phone | Alert Dialog | Explicit action description, Cancel and a named action, with consistent focus behavior; retains the existing explicit confirmation. |
| Agent and working folder setup | Field, Native Select, Input | Consistent labels, help text and validation. Keep a simple native agent selector. A saved-folder selector needs a desktop-side data source; a phone browser directory picker cannot select the computer's folder. |
| Delivery and connection feedback | Badge, Alert, short status region | Clear distinctions between connected, input sent, disconnected and program exited. Do not label an agent "working" or "needs approval" based on guessed terminal text. |

Relevant official components: [Input Group](https://ui.shadcn.com/docs/components/base/input-group), [Drawer](https://ui.shadcn.com/docs/components/base/drawer), [Sheet](https://ui.shadcn.com/docs/components/base/sheet), [Alert Dialog](https://ui.shadcn.com/docs/components/base/alert-dialog).

Current documentation offers Base UI, React Aria and Radix variants. Choose one primitive family for the initial set. The current Base Drawer uses Base UI and has a migration guide from Vaul; older Vaul recipes should not be copied blindly. Drawer supports a responsive Dialog-on-desktop/Drawer-on-mobile composition. [Drawer documentation](https://ui.shadcn.com/docs/components/base/drawer).

## What components will not solve

The AI Elements Prompt Input is a useful composition example, not a replacement for Hoso's request, deduplication, dictation or delivery behavior. Its sample multiline and attachment behaviors must not be enabled until Hoso's backend supports them. There is no need to introduce a model SDK or a cloud backend just to use the composer pieces. [Prompt Input](https://ui.shadcn.com/docs/ai-elements/base/prompt-input).

The AI Elements Terminal displays individual agent commands and their streamed output using Trace and Code Block. It is not the terminal-emulation layer needed to operate arbitrary interactive programs. Hoso currently has screen/history snapshots, not structured command events; keep that output as an honest terminal/activity view. A real chat transcript or approval card needs authoritative agent messages, request identifiers and permission state from an integration. UI styling cannot create those guarantees. [Terminal](https://ui.shadcn.com/docs/ai-elements/base/terminal).

## Cost and integration considerations

- A React runtime, Vite build tooling, Tailwind, selected primitive dependencies and copied component files add maintenance and browser payload. Measure the resulting bundle rather than predicting a size from the catalog. Install only the components used.
- Give the frontend its own compiler/build configuration; preserve the server's Node TypeScript execution. A small multipage Vite app can keep `/` and `/desktop` without adding a client router or a full application framework.
- Serve production assets from the same local Node origin. Update the explicit asset handling and asset/security tests for built filenames. Preserve phone cookies, local-only admin access, secret-fragment removal, no-store behavior and the existing PWA manifest/service worker intent.
- Check compatibility with Hoso's strict Content Security Policy. Base UI documents inline-tag behavior and a CSPProvider/nonce or external-styles approach. Do not solve a component issue by broadly weakening Hoso's policy. [Base UI CSP guidance](https://base-ui.com/react/utils/csp-provider).

## Staged adoption

1. Finish the current file-task, interrupt, approval and reconnect checks. Record the actual mobile friction.
2. Prototype only the composer, extra-controls drawer and End-session dialog in an isolated frontend preview using fixed session fixtures. Keep Hoso's green palette and typography rather than accepting a generic dashboard layout.
3. Compare that preview with the native controls below on a real Android phone, with the keyboard open and closed. Adopt React/shadcn only if the interactions materially improve.
4. If adopted, replace the shared session UI first on both desktop and phone using the same API adapter. Keep polling, input serialization, uncertain-delivery handling and terminal output semantics unchanged during this migration. Migrate pairing/setup afterward.
5. Add conversation or approval-specific components only alongside an authoritative agent integration. Do not manufacture chat bubbles or action cards from screen-scraping heuristics.

## Lower-cost path for the current stack

Hoso can gain most immediate improvements using its existing semantic buttons/forms, native `<select>`, `<details>` for less-used keys, and a styled native `<dialog>` for confirmations. `showModal()` supplies browser modal behavior and background inertness; labeling, initial focus, a visible Cancel/Close button and focus restoration still need care. This preserves the current zero-build frontend. [Native dialog behavior](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog).

For now, improve the composer hierarchy, readable short status messages, touch spacing, and the “latest output” affordance before adding a frontend runtime. This is the recommended immediate path; shadcn is the preferred candidate for the next coordinated UI pass.

## Phone and accessibility acceptance

Base UI handles many keyboard, pointer, ARIA and focus mechanics, but Hoso still owns accessible labels, visible focus, contrast and testing. [Base UI accessibility](https://base-ui.com/react/overview/accessibility).

Validate these interactions with the Android browser and installed PWA:

- Composer and Send remain visible with the virtual keyboard; dictation transcript is preserved across focus changes and reconnects.
- Drawer has a visible close control and no swipe-only action. Opening or closing it never sends a terminal key or a message.
- Confirmation starts at a safe focus target, can be cancelled, and returns focus to its trigger. A browser dialog's Enter must not also send Hoso's terminal Enter.
- Main touch controls aim for at least 44 CSS pixels as a product target. WCAG's AA minimum is 24 by 24 CSS pixels with specified exceptions, not a promise that every small default component is comfortable on a phone. [Target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Short status changes are announced; repeated full-screen terminal snapshots do not flood a live region. Errors remain visible until acted on or resolved.
- Output scrolling does not jump while reading earlier content; Latest output deliberately resumes the current view. Reduced motion, 200% zoom, narrow landscape and disconnected/revoked states remain usable.

No frontend packages were installed and no application files were changed for this assessment.
