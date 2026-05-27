type HapticStyle = 'light' | 'medium'

export function triggerSelectionHaptic() {
  const handlers = window.webkit?.messageHandlers as
    | {
        runContextHaptics?: {
          postMessage: (message: { type: string; style?: HapticStyle }) => void
        }
      }
    | undefined
  const handler = handlers?.runContextHaptics
  if (handler) {
    handler.postMessage({ type: 'selectionChanged', style: 'light' })
    return
  }

  if ('vibrate' in navigator) {
    navigator.vibrate(8)
  }
}
