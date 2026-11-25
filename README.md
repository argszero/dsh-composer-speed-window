# @argszero/dsh-composer-speed-window

A composer reading of **decode speed over the last eight steps**, beside the lifetime average the shipped pill already shows. Answers [deepseek-harness discussion #14297](https://github.com/deepseek-ai/deepseek-harness/discussions/14297).

## The gap it answers

The composer's `activity` pill divides the session's whole decode time into its whole output tokens (`StatsPills.tsx`, `decodeSpeed`). That is what `sessionStats` states about itself — whole-log figures, independent of how much history a client has paged in (`sessionStats` `types.ts`) — so on a long conversation the reading can only fall: an early slow stretch stays in the numerator forever.

A window is a different question, and it is answerable on the client: every settled assistant node carries `timing.firstTokenTime`, `timing.completedTime` and `usage.outputTokens`, which is exactly what `assistantStepReading` (`ui-chat` `contract/turn-metrics.ts:34-43`) reads.

## What it adds

One new `conversation.composer.dock` entry, id `window-speed`, `order` 2 — so it sits after the shipped `activity` (order 0) and `usage` (order 1) pills. It replaces nothing: `ui-chat/README.md` states the rule this uses ("A new id adds a control"), and a new id at a distinct order cannot collide with another registrant's cell. Disable the row and the dock is exactly as it shipped.

The label is the window rate and the steps it covers; the full reading, in the tooltip, carries both figures so the two can be read against each other:

```
86 tok/s · 8 steps        (label)
Last 8 steps: 86 tok/s — lifetime average 22 tok/s    (tooltip)
```

A session whose steps carry no decode duration yet shows nothing at all rather than a zero.

## Cost

Two properties keep the fold off the transcript — the cost the discussion's author flagged as perceptible on a 2.4M-token session:

- **A first fold reads the tail.** It walks backwards from the end of the node list and stops once it holds eight decode-timed steps.
- **A later fold reads only what arrived.** A snapshot publication preserves the identity of an unchanged node list, so the pill compares the list it is handed with the one it folded last and reads only the nodes added since. A publication that leaves that list unchanged — a stream delta, say — costs nothing.

A list that was re-paged (shorter, or with a different node where the previous fold ended) is folded from the tail again, so a stale cache cannot survive as a wrong number. The shipped `deriveStats` fallback instead folds every loaded node on each render.

`test/window.spec.mjs` asserts both properties by counting *which* nodes the fold read, because comparing totals cannot tell a tail walk from a full fold. Measured against a naive arm — a fold that honours the eight-step limit but reads the whole list first, so it returns the same numbers — every totals assertion passes and both counting assertions fail: 7/9 there against 9/9 here.

## Install

```sh
dsh plugin add @argszero/dsh-composer-speed-window
```

The package mounts a cordis row from its own `cordis.patch.yml`; the browser half is discovered through `dsh.client` (`platform: web`), the same row that mounts the node half. Inside a bundle whose patch already has rows, add the `insert` entry instead of a second document:

```yaml
- insert:
    - id: composer-speed-window
      name: '@argszero/dsh-composer-speed-window'
```

To remove the reading:

```yaml
- set:
    - id: composer-speed-window
      disabled: true
```

## What it does not do

- **The statistics dialog is untouched.** Its speed row is `stats.dialog.speed`, the same whole-log figure the shipped pill shows; this plugin adds a reading beside it rather than changing what that dialog means. A replacement (same id `activity`, same `order` 0, lower `priority`) is a bigger decision, and it belongs to whoever decides the core figure's scope.
- **It does not add fields to `sessionStats`.** That projection states its scope in its own type; a window field there is a core decision.
- **The window size is fixed at eight steps.** No configuration: a plugin config would have to round-trip through the Host's volatile-field channel for a constant that reads fine at eight.

## Compatibility

Browser half against `@deepseek-ai/dsh-client-*@0.2.3-alpha.2`; node half is inert. The peer range is the Cordis line the harness vendors.
