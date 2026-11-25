/** Copy for the window reading, one namespace registered per language. */

/** Locale namespace this plugin's copy lives under. */
export const NS = 'composer-speed-window'

/** Every key this namespace carries; each language supplies all of them. */
export type SpeedWindowKey = 'window.reading' | 'window.full' | 'window.fullNoLifetime'

/** One language's dictionary. */
export type SpeedWindowDict = Record<SpeedWindowKey, string>

export const en: SpeedWindowDict = {
  'window.reading': '{speed} tok/s · {steps}',
  'window.full': 'Last {steps} steps: {speed} tok/s — lifetime average {lifetime} tok/s',
  'window.fullNoLifetime': 'Last {steps} steps: {speed} tok/s',
}

export const zh: SpeedWindowDict = {
  'window.reading': '{speed} tok/s · {steps} 步',
  'window.full': '最近 {steps} 步：{speed} tok/s —— 全程平均 {lifetime} tok/s',
  'window.fullNoLifetime': '最近 {steps} 步：{speed} tok/s',
}
