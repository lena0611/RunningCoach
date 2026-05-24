import { defineStore } from 'pinia'

export type ToastTone = 'neutral' | 'success' | 'error'

export type ToastMessage = {
  id: string
  message: string
  tone: ToastTone
}

export const useToastStore = defineStore('toastStore', {
  state: () => ({
    current: null as ToastMessage | null
  }),
  actions: {
    show(message: string, tone: ToastTone = 'neutral', durationMs = 3200) {
      const id = crypto.randomUUID()
      this.current = { id, message, tone }
      window.setTimeout(() => {
        if (this.current?.id === id) this.current = null
      }, durationMs)
    },
    success(message: string, durationMs?: number) {
      this.show(message, 'success', durationMs)
    },
    error(message: string, durationMs?: number) {
      this.show(message, 'error', durationMs)
    },
    clear() {
      this.current = null
    }
  }
})
