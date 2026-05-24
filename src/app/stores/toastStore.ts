import { defineStore } from 'pinia'

export type ToastTone = 'neutral' | 'success' | 'error'
export type ToastPlacement = 'bottom' | 'top'

export type ToastMessage = {
  id: string
  message: string
  tone: ToastTone
  placement: ToastPlacement
}

export type ToastOptions = {
  durationMs?: number
  placement?: ToastPlacement
  delayMs?: number
}

export const useToastStore = defineStore('toastStore', {
  state: () => ({
    current: null as ToastMessage | null,
    pendingTimer: null as number | null
  }),
  actions: {
    show(message: string, tone: ToastTone = 'neutral', options: ToastOptions = {}) {
      const { durationMs = 3200, placement = 'bottom', delayMs = 0 } = options
      const id = crypto.randomUUID()
      if (this.pendingTimer) {
        window.clearTimeout(this.pendingTimer)
        this.pendingTimer = null
      }

      const display = () => {
        this.current = { id, message, tone, placement }
        this.pendingTimer = null
      }

      if (delayMs > 0) {
        this.current = null
        this.pendingTimer = window.setTimeout(display, delayMs)
      } else {
        display()
      }

      window.setTimeout(() => {
        if (this.current?.id === id) this.current = null
      }, delayMs + durationMs)
    },
    success(message: string, options?: ToastOptions) {
      this.show(message, 'success', options)
    },
    error(message: string, options?: ToastOptions) {
      this.show(message, 'error', options)
    },
    clear() {
      if (this.pendingTimer) {
        window.clearTimeout(this.pendingTimer)
        this.pendingTimer = null
      }
      this.current = null
    }
  }
})
