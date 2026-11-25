/**
 * The window-speed control: a `conversation.composer.dock` list entry beside the
 * shipped `activity` and `usage` pills, reading the last N decode-timed steps so
 * the figure can rise again on a long conversation, with the lifetime average in
 * its tooltip for contrast.
 *
 * A new id rather than a replacement: the shipped pill's lifetime figure is the
 * one `sessionStats` states, and the two readings answer different questions.
 * Registering this id leaves both shipped pills exactly where they are.
 */

import { memo, useMemo, useRef, type ReactNode } from 'react'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client'
// Type-only: merges the sessionStats key into SessionProjectionMap for useProjection.
import type {} from '@deepseek-ai/dsh-session-stats/types'
import { DEFAULT_WINDOW_STEPS, WindowFold, formatSpeed, lifetimeSpeed } from './window'
import type { SpeedWindowKey } from './locales'

/** The dock entry id this control carries as `data-composer-stat`. */
export const STAT_ID = 'window-speed'

/** Props this entry receives: the dock's locale seat plus the session standard props. */
export interface RecentSpeedPillProps {
  useChat: SnapshotSelectorHook<ChatSnapshot>
  useProjection: UseProjection
  t: (key: SpeedWindowKey, params?: Record<string, string | number>) => string
  /** Window size; the plugin never configures it, so only a test passes one. */
  steps?: number
}

/**
 * Render the window reading.
 * @param props - dock entry props.
 * @returns the reading, or null before any step carried a decode duration.
 */
export const RecentSpeedPill = memo(function RecentSpeedPill({
  useChat, useProjection, t, steps = DEFAULT_WINDOW_STEPS,
}: RecentSpeedPillProps) {
  // The selector reads the stable node list: a publication that leaves it
  // unchanged hands back the same array, so a stream delta does not fire this.
  // The parameter is annotated because the seat's hook type lives in a package
  // this plugin does not install, and arrives here as `any`.
  const nodes = useChat((snapshot: ChatSnapshot) => snapshot.legacy.nodes)
  // One fold per mounted pill. It keeps the tail it has already read, so a
  // publication cost is the nodes that arrived, not the transcript's length —
  // the reading the sessionStats projection cannot give and a per-render fold
  // of every loaded node would make the composer pay for.
  const foldRef = useRef<WindowFold | null>(null)
  const window = useMemo(() => {
    let fold = foldRef.current
    if (fold === null || fold.limit !== steps) {
      fold = new WindowFold(steps)
      foldRef.current = fold
    }
    return fold.update(nodes)
  }, [nodes, steps])
  const stats = useProjection('sessionStats')
  const lifetime = lifetimeSpeed(stats ?? undefined)
  if (window.speed === null) return null
  const speed = formatSpeed(window.speed)
  const text = lifetime === null
    ? t('window.fullNoLifetime', { steps: window.steps, speed })
    : t('window.full', { steps: window.steps, speed, lifetime: formatSpeed(lifetime) })
  const label: ReactNode = t('window.reading', { speed, steps: window.steps })
  return (
    <span data-composer-stat={STAT_ID} title={text}>
      {label}
    </span>
  )
})
