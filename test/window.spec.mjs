import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_WINDOW_STEPS, WindowFold, formatSpeed, lifetimeSpeed, recentSpeed, stepSample,
} from '../src/client/window.ts'

/** One settled assistant node: `decodeMs` of decode time for `tokens` completion tokens. */
const step = (decodeMs, tokens) => ({
  kind: 'assistant',
  timing: { firstTokenTime: 1_000, completedTime: 1_000 + decodeMs },
  usage: { outputTokens: tokens },
})

/**
 * A node that records every read of its `kind` — the fold's only per-node
 * access — so a test can assert WHICH nodes were read, not merely what the
 * totals came out to. A value assertion cannot tell a tail walk from a full
 * fold, because both return the same numbers.
 */
const counted = (node, index, touched) => {
  const copy = { ...node }
  Object.defineProperty(copy, 'kind', {
    enumerable: true,
    get() {
      touched.add(index)
      return node.kind
    },
  })
  return copy
}

test('a slow stretch followed by a fast one reads fast in the window and slow for life', () => {
  // Eight steps at 12.5 tok/s, then eight at 100 tok/s.
  const slow = Array.from({ length: 8 }, () => step(8_000, 100))
  const fast = Array.from({ length: 8 }, () => step(1_000, 100))
  const nodes = [...slow, ...fast]
  const window = recentSpeed(nodes)
  const lifetime = lifetimeSpeed({
    decodeMs: nodes.reduce((sum, node) => sum + (node.timing.completedTime - node.timing.firstTokenTime), 0),
    decodeTokens: nodes.reduce((sum, node) => sum + node.usage.outputTokens, 0),
  })
  assert.equal(window.steps, 8)
  assert.ok(window.speed > 99 && window.speed < 101, `window ${window.speed}`)
  assert.ok(lifetime > 22 && lifetime < 23, `lifetime ${lifetime}`)
  // The discriminator: the window rises again where the whole-session figure cannot.
  assert.ok(window.speed > lifetime * 4)
})

test('the first fold reads the tail only, whatever the transcript length', () => {
  const touched = new Set()
  const nodes = Array.from({ length: 5_000 }, (_, index) => counted(step(1_000, 100), index, touched))
  const window = recentSpeed(nodes, 4)
  assert.equal(window.steps, 4)
  assert.equal(window.outputTokens, 400)
  assert.equal(window.speed, 100)
  // A fold that walked the transcript would read every node; the tail walk reads four.
  assert.deepEqual([...touched].sort((a, b) => a - b), [4_996, 4_997, 4_998, 4_999])
})

test('a later fold reads only the nodes that arrived since the last one', () => {
  const touched = new Set()
  const nodes = Array.from({ length: 400 }, (_, index) => counted(step(1_000, 10), index, touched))
  const fold = new WindowFold(4)
  assert.equal(fold.update(nodes).outputTokens, 40)
  touched.clear()
  nodes.push(counted(step(1_000, 90), nodes.length, touched))
  const reading = fold.update(nodes)
  // One new node is one new read; the 400 already folded are not read again.
  assert.deepEqual([...touched], [400])
  assert.equal(reading.steps, 4)
  assert.equal(reading.outputTokens, 120)
})

test('a transcript that was re-paged is folded from its tail again', () => {
  const fold = new WindowFold(3)
  const nodes = Array.from({ length: 10 }, (_, index) => step(1_000, index))
  assert.equal(fold.update(nodes).outputTokens, 24)
  // A shorter list, as a reloaded window hands back: the cached tail is dropped.
  const repaged = [step(1_000, 1), step(1_000, 2)]
  assert.equal(fold.update(repaged).outputTokens, 3)
  // A second identical read is idempotent rather than additive.
  assert.equal(fold.update(repaged).outputTokens, 3)
})

test('a window needs at least one step', () => {
  assert.throws(() => new WindowFold(0), RangeError)
  assert.throws(() => recentSpeed([], 2.5), RangeError)
})

test('a step without both halves is not a step', () => {
  const nodes = [
    step(1_000, 100),
    { kind: 'assistant', timing: { firstTokenTime: null, completedTime: 2_000 }, usage: { outputTokens: 50 } },
    { kind: 'assistant', timing: { firstTokenTime: 1_000, completedTime: 2_000 } },
    step(0, 100),
    { kind: 'tool-result', time: 5 },
  ]
  const window = recentSpeed(nodes, DEFAULT_WINDOW_STEPS)
  assert.equal(window.steps, 1)
  assert.equal(window.outputTokens, 100)
  assert.equal(window.speed, 100)
})

test('no decode-timed step means no reading', () => {
  const window = recentSpeed([{ kind: 'user', seq: 0 }], DEFAULT_WINDOW_STEPS)
  assert.equal(window.speed, null)
  assert.equal(lifetimeSpeed(undefined), null)
  assert.equal(lifetimeSpeed({ decodeMs: 0, decodeTokens: 10 }), null)
})

test('one node reads the same numbers the shipped reading uses', () => {
  assert.deepEqual(stepSample(step(2_500, 42)), { decodeMs: 2_500, outputTokens: 42 })
  assert.deepEqual(stepSample({ kind: 'assistant', usage: { outputTokens: -1 } }), { decodeMs: null, outputTokens: null })
})

test('the reading is formatted like the shipped one', () => {
  assert.equal(formatSpeed(86.14), '86')
  assert.equal(formatSpeed(9.44), '9.4')
  assert.equal(formatSpeed(-1), '0')
})
