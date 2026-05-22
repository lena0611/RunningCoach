export function isLocalhost() {
  return ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)
}

export function hasNativeBridge() {
  return Boolean(window.webkit?.messageHandlers?.runContextHealthKit)
}

export function canUseAppFeatures() {
  return isLocalhost() || hasNativeBridge()
}
