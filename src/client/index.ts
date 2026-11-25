/**
 * Browser half of `@argszero/dsh-composer-speed-window`.
 *
 * One contribution, into a seat that already exists: `ui-conversation` declares
 * `conversation.composer.dock` as a `list`, session-scoped slot, and `ui-chat`
 * fills it with two entries — `activity` (order 0) and `usage` (order 1). The
 * project's written rule (ui-chat/README.md: "A new id adds a control") is what
 * this plugin uses: a third entry under its own id, at order 2, so both shipped
 * pills keep their place and their lifetime figure.
 *
 * Two rules the wiring keeps:
 *
 * - **Registration waits for the declaration.** `slots.register` throws into an
 *   undeclared seat, so the entry is minted inside `slots.inject`, which re-runs
 *   when the declaring entry collapses and returns — load order stops mattering.
 * - **Nothing is shadowed.** A new id at a distinct `order` cannot clash with
 *   another registrant's cell, so mounting this plugin never changes what the
 *   shipped pills show.
 *
 * @module @argszero/dsh-composer-speed-window/client
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the SlotRegistry service merge (ctx.slots) and the locale merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SpeedWindowKey } from './locales'
import { RecentSpeedPill, STAT_ID } from './RecentSpeedPill'
import { NS, en, zh } from './locales'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Composer window-speed copy. */
    'composer-speed-window': SpeedWindowKey
  }
}

/** The list seat this plugin contributes to. */
const DOCK = 'conversation.composer.dock'

/** Services this browser half needs: the Slot registry and the locale seat. */
export const inject = ['slots', 'locale']

/**
 * Client plugin body: register the dictionaries, then the dock entry.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'composer-speed-window: dictionaries')
  // The registration shape the shipped pills use (ui-chat apply.ts): the entry
  // is minted inside `inject`, so this plugin may load before or after the entry
  // that declares the slot, and the generator yields the handle for disposal.
  ctx.slots.inject(DOCK, function* () {
    // `priority` is passed explicitly because this package is statically
    // composed: ui-chat/README.md says a statically composed plugin passes it
    // rather than relying on the rank a dynamic plugin receives. 0 is the
    // documented default, and the id below is new, so this entry shadows nothing.
    yield ctx.slots.register({
      name: DOCK, id: STAT_ID, order: 2, priority: 0, locale: NS,
    }, RecentSpeedPill)
  })
}

export { RecentSpeedPill, STAT_ID } from './RecentSpeedPill'
export { DEFAULT_WINDOW_STEPS, formatSpeed, lifetimeSpeed, recentSpeed, stepSample } from './window'
export type { StepSample, WindowSpeed } from './window'
