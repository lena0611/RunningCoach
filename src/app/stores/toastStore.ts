import { defineStore } from 'pinia'

export type ToastTone = 'neutral' | 'success' | 'error'
export type ToastPlacement = 'bottom' | 'top'

export type ToastMessage = {
  id: string
  message: string
  tone: ToastTone
  placement: ToastPlacement
}

export const useToastStore = defineStore('toastStore', {
  state: () => ({
    current: null as ToastMessage | null
  }),
  actions: {
    show(message: string, tone: ToastTone = 'neutral', durationMs = 3200, placement: ToastPlacement = 'bottom') {
      const id = crypto.randomUUID()
      this.current = { id, message, tone, placement }
      window.setTimeout(() => {
        if (this.current?.id === id) this.current = null
      }, durationMs)
    },
    success(message: string, durationMs?: number, placement?: ToastPlacement) {
      this.show(message, 'success', durationMs, placement)
    },
    error(message: string, durationMs?: number, placement?: ToastPlacement) {
      this.show(message, 'error', durationMs, placement)
    },
    clear() {
      this.current = null
    }
  }
})
