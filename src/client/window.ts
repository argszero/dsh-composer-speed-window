/**
 * The window reading: decode speed over the last N decode-timed steps.
 *
 * `sessionStats` states its own scope — whole-log, independent of how much
 * history a client paged in — so the shipped pill divides the session's whole
 * decode time into its whole output tokens and the figure can only fall as a
 * conversation grows. A window is derivable on the client from the settled
 * assistant nodes the Chat target holds, and that is what this module folds.
 *
 * **The fold costs the tail, never the transcript**, and two properties carry
 * that. A first fold walks backwards from the end and stops once it holds N
 * steps. A later fold compares the transcript it is handed against the one it
 * last folded and reads only the nodes that arrived since — which it can do
 * because a snapshot publication preserves the identity of an unchanged node
 * list. A transcript that was re-paged (shorter, or with a different node where
 * the previous fold ended) is folded from the tail again, so a stale cache can
 * never survive as a wrong number.
 */

/** One settled assistant node's contribution, as far as this reading cares. */
export interface StepSample {
  /** First token delta → final message, in ms; null when the node recorded none. */
  decodeMs: number | null
  /** Provider-reported completion tokens; null when absent or unusable. */
  outputTokens: number | null
}

/** A window reading: the steps that carried both halves, and their rate. */
export interface WindowSpeed {
  /** Decode-timed steps folded into `decodeMs` and `outputTokens`. */
  steps: number
  /** Summed decode wall time over those steps. */
  decodeMs: number
  /** Summed output tokens over those steps. */
  outputTokens: number
  /** Tokens per second over the window; null when no step carried a usable duration. */
  speed: number | null
}

/** The narrow shape this module needs from a settled assistant node. */
export interface AssistantSample {
  kind: string
  timing?: {
    firstTokenTime: number | null
    completedTime: number
  }
  usage?: unknown
}

/** A folded step: both halves present, the duration usable. */
interface TimedSample {
  decodeMs: number
  outputTokens: number
}

/**
 * Read one assistant node's decode duration and completion tokens.
 * @param node - a settled assistant node.
 * @returns the pair with `null` for an unrecorded half.
 */
export function stepSample(node: AssistantSample): StepSample {
  const timing = node.timing
  const decodeMs = timing !== undefined && timing.firstTokenTime !== null
    ? Math.max(0, timing.completedTime - timing.firstTokenTime)
    : null
  const usage = node.usage
  let outputTokens: number | null = null
  if (typeof usage === 'object' && usage !== null) {
    const value = (usage as { outputTokens?: unknown }).outputTokens
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) outputTokens = value
  }
  return { decodeMs, outputTokens }
}

/** Default window: the last eight decode-timed steps. */
export const DEFAULT_WINDOW_STEPS = 8

/**
 * Read one node's contribution to the window, or null when it is not a step.
 *
 * A step counts only when both halves were recorded and the decode duration is
 * positive: a node that reported no first-token delta has no throughput to
 * derive, and a zero duration would divide the window by nothing.
 * @param node - a node from the transcript.
 * @returns the narrowed pair, or null.
 */
function sampleOf(node: AssistantSample): TimedSample | null {
  if (node.kind !== 'assistant') return null
  const sample = stepSample(node)
  if (sample.decodeMs === null || sample.outputTokens === null || sample.decodeMs <= 0) return null
  return { decodeMs: sample.decodeMs, outputTokens: sample.outputTokens }
}

/**
 * Sum a retained tail.
 * @param samples - decode-timed samples, oldest first.
 * @returns the window totals and its tokens per second.
 */
function total(samples: readonly TimedSample[]): WindowSpeed {
  let decodeMs = 0
  let outputTokens = 0
  for (const sample of samples) {
    decodeMs += sample.decodeMs
    outputTokens += sample.outputTokens
  }
  return {
    steps: samples.length,
    decodeMs,
    outputTokens,
    speed: decodeMs > 0 ? outputTokens / (decodeMs / 1_000) : null,
  }
}

/**
 * A reusable window fold: hand it the transcript after each publication and it
 * returns the reading, reading only what is new whenever it can.
 *
 * One instance belongs to one rendered reading (the pill keeps it for its
 * lifetime), because the reuse it performs is defined against the transcript it
 * folded last.
 */
export class WindowFold {
  /** How many decode-timed steps this reading keeps. */
  readonly limit: number

  /** The retained tail, oldest first, at most `limit` entries. */
  #samples: TimedSample[] = []

  /** Transcript length at the end of the last fold. */
  #scanned = 0

  /** Last node of the last folded transcript; its identity is what dates the fold. */
  #last: AssistantSample | undefined

  /** The reading as of the most recent {@link WindowFold.update}. */
  #reading: WindowSpeed = { steps: 0, decodeMs: 0, outputTokens: 0, speed: null }

  /**
   * @param limit - decode-timed steps to keep (default {@link DEFAULT_WINDOW_STEPS}).
   */
  constructor(limit: number = DEFAULT_WINDOW_STEPS) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`window limit must be a positive integer, got ${String(limit)}`)
    }
    this.limit = limit
  }

  /** The reading as of the most recent {@link WindowFold.update}. */
  get reading(): WindowSpeed {
    return this.#reading
  }

  /**
   * Fold the transcript, reusing what the previous fold already read when the
   * transcript only grew.
   * @param nodes - the Chat snapshot's settled nodes, in transcript order.
   * @returns the reading over the last `limit` decode-timed steps.
   */
  update(nodes: readonly AssistantSample[]): WindowSpeed {
    const appended = this.#scanned > 0
      && nodes.length >= this.#scanned
      && nodes[this.#scanned - 1] === this.#last
    if (appended) {
      for (let index = this.#scanned; index < nodes.length; index += 1) {
        const sample = sampleOf(nodes[index]!)
        if (sample === null) continue
        this.#samples.push(sample)
      }
      if (this.#samples.length > this.limit) {
        this.#samples.splice(0, this.#samples.length - this.limit)
      }
    } else {
      this.#samples = []
      for (let index = nodes.length - 1; index >= 0 && this.#samples.length < this.limit; index -= 1) {
        const sample = sampleOf(nodes[index]!)
        if (sample !== null) this.#samples.push(sample)
      }
      this.#samples.reverse()
    }
    this.#scanned = nodes.length
    this.#last = nodes.length > 0 ? nodes[nodes.length - 1] : undefined
    this.#reading = total(this.#samples)
    return this.#reading
  }
}

/**
 * Fold the last `limit` decode-timed assistant steps, walking backwards from the
 * end of `nodes` so the cost is the tail rather than the transcript.
 * @param nodes - the Chat snapshot's settled nodes, in transcript order.
 * @param limit - how many decode-timed steps to fold (default {@link DEFAULT_WINDOW_STEPS}).
 * @returns the window totals and its tokens per second.
 */
export function recentSpeed(
  nodes: readonly AssistantSample[],
  limit: number = DEFAULT_WINDOW_STEPS,
): WindowSpeed {
  return new WindowFold(limit).update(nodes)
}

/**
 * The whole-session rate the shipped pill shows, from the same projection.
 * @param stats - the `sessionStats` projection value, when served.
 * @returns tokens per second, or null without a decode duration.
 */
export function lifetimeSpeed(stats: { decodeMs: number; decodeTokens: number } | undefined): number | null {
  if (stats === undefined || stats.decodeMs <= 0) return null
  return stats.decodeTokens / (stats.decodeMs / 1_000)
}

/**
 * Same rounding the shipped reading uses (message-chrome.ts `formatTokensPerSecond`).
 * Copied rather than imported: ui-chat does not export it from its client entry.
 * @param tps - tokens per second.
 * @returns display digits.
 */
export function formatSpeed(tps: number): string {
  const clamped = Math.max(0, tps)
  return clamped >= 10 ? String(Math.round(clamped)) : String(Math.round(clamped * 10) / 10)
}
