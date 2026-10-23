# ADR 022 — Opening a lesson's slides in the same page

## Status

Proposed

## Context

A lesson with slides (#109) can be shown as slides. The feature is not finished, so how the reader gets from the lesson to the slides and back is still open. The intended experience: the lesson turns into slides *in the same page*, and the reader gets back to the lesson without losing their place. This ADR weighs the ways to do that. It is based on the BSO code (`assets/brightspacosaurus-slides.js`, `src/slides-preview.ts`) and issue #109.

Two principles frame the choice:

- **Parity (Software Guidebook 8.1).** Brightspace is the primary target; the Docusaurus preview exists to show what Brightspace will show. Features should behave the same in both, with shared code and shared tests, so that what is checked in the preview holds after import.
- **Use the platform (Software Guidebook 5.1).** BSO uses the browser's own behaviour (Back button, closing a tab, links) and does not rebuild it in script.

The two targets differ:

- **Brightspace.** The `.imscc` has the slides as a separate topic next to the lesson (`<lesson>-slides.html`). Brightspace shows a topic inside its own content frame (an iframe), and BSO controls neither that frame nor the page around it. The reader opens the topic from the menu and uses the browser's Back button. There is no Alt+P.
- **Preview.** BSO controls the Docusaurus page and can add script and routes, but should not change the standard Docusaurus menu structure.

The slides are one self-contained HTML file from Marp. Marp's own keys (arrows, Space, `f` for full screen) work inside that file.

### Criteria

- The reader stays in one page and returns to the lesson where they left it.
- The exit is a browser feature (Back button, closing the tab), not a button or key handler of our own, and there is no keyboard trap.
- The preview behaves like Brightspace, so a test in the preview says something about Brightspace (parity and testability).
- The standard Docusaurus menu structure stays as it is.
- Full screen for presenting.
- No pop-up blocker or tab clutter.
- Little extra script and little to test.

## Considered options

### Option A — New tab

`window.open` on the button or Alt+P; the deck has a script that closes the tab on Esc.

**Pros:** nothing to restore; the lesson page is untouched.

**Cons:** Brightspace does not work this way, so no parity; tab clutter; the Esc handler imitates a browser action and works only while the tab was opened by script (`Window.open()`; MDN contributors, n.d.). The same deck opened with a middle click, Ctrl+Click or the address bar gets a console warning and stays open.

### Option B — Same tab: the button is a link to the slides page

The button is a plain link without `target`. The exit is the browser's Back button (or Alt+Left); the deck has no exit script.

**Pros:** same page for the reader; the browser restores the scroll position; no script beyond the link; no pop-ups; close to Brightspace, where the slides are a page the reader opens and leaves with Back.

**Cons:** the preview shows the bare slides page, not inside Docusaurus' layout as Brightspace shows it inside its frame; the lesson page is reloaded on return (Docusaurus restores its state, a plain page does not).

### Option C — Overlay with an iframe on the lesson

The slides page is loaded in a full-window `<iframe>` on top of the lesson; Esc removes the overlay.

**Pros:** the lesson stays loaded underneath, with scroll and state exactly as left.

**Cons:** needs an exit of our own (a rebuilt browser feature) and has a focus trap risk, because the iframe keeps the keys; the deck's own keys and full screen need `allow="fullscreen"` and focus handling; Brightspace does not work like this.

### Option D — Fetch the slides on first press and mount them in the page ("AJAX")

On the first press, `fetch` the slides HTML and mount it into a container in the lesson page, with extra slides inserted if needed; later presses only toggle it.

**Pros:** truly the same page; the lesson stays loaded; the content can be adapted; the first load is deferred.

**Cons:** Marp's HTML is a full document with its own script and CSS, so mounting it needs a shadow root or an iframe `srcdoc`, which brings back the problems of option C. A deck is a few hundred KB with embedded images. Brightspace cannot do this (BSO would have to inject script into a frame it does not control, and a cartridge page should stay a static document), so no parity. The most script and the most to test.

### Option E — The preview shows the deck in a frame, like Brightspace does

The Slides button is a link to a Docusaurus page for that lesson's slides (not in the sidebar, so the menu structure stays standard). That page shows the Marp deck in an iframe inside the normal Docusaurus layout, as Brightspace shows the topic in its content frame. The exit is the browser's Back button.

**Pros:** the same situation as in Brightspace (a deck inside a frame inside a page), so full screen, Marp's script and the frame's sizing are tested in the preview as they will run in Brightspace; no exit script; the menu structure is unchanged because the page is only reached from the button.

**Cons:** a route or page per lesson with slides, which a course with its own Docusaurus app has to adopt (like the existing slides integration); the frame needs `allowfullscreen` and sensible sizing; not worked out yet.

## Decision

Not decided yet; the recommendation below is for discussion.

**Recommendation: option B first, then investigate option E.** B is the least that follows both principles: a link and the browser's Back button, nothing rebuilt, and it already matches how a Brightspace topic is opened and left. E would bring the preview closer to Brightspace (the same frame situation, so more of the preview testing holds after import), but it needs a design that does not touch the Docusaurus menu; that is not yet thought through and deserves its own look. Options C and D are not recommended: they need an exit of our own and cannot be reproduced in Brightspace.

## Consequences

**If option B is chosen**

- Positive: one page, no pop-ups, nothing to inject into Brightspace; the exit script disappears; the Playwright tests assert a navigation instead of `window.open`.
- Negative: returning reloads the lesson page; the preview shows the bare deck, not inside the Docusaurus layout.
- The user manual and Software Guidebook sections on slides change ("opens in the same page; use the browser's Back").

**If option E is chosen later**

- Positive: higher parity, so the preview test of full screen and Marp's script in a frame says something about Brightspace.
- Negative: a per-lesson slides page that courses with their own Docusaurus app have to integrate.

**For every option**

- Brightspace is not testable from the preview: check in a sandbox course that the slides topic opens and that Marp's script works inside Brightspace's frame.

## References

Amaju, J. (n.d.). *Self closing browser tab with JavaScript*. DEV Community. <https://dev.to/joshuaamaju/self-closing-browser-tab-with-javascript-1ph9> (read: the sentence "Scripts may close only the windows that were opened by them" is in a reader comment, not in the article itself.)

MDN contributors. (n.d.). *Window: close() method*. MDN Web Docs. <https://developer.mozilla.org/en-US/docs/Web/API/Window/close> (read: a window is script-closable if web content created it, for example with `Window.open()`; windows opened through browser UI actions such as Ctrl+Click or middle-click often are not, unless their history length is 1.)
