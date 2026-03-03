import { defineStore } from 'pinia'
import { ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: number
  message: string
  type: ToastType
  duration?: number
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([])
  const recentMessages = new Set<string>()
  let nextId = 1

  function add(message: string, type: ToastType = 'info', duration = 3000) {
    const key = `${type}:${message}`

    // Prevent duplicate toasts if one with the same message and type is already visible
    if (toasts.value.some(t => t.message === message && t.type === type)) {
      return
    }

    // Prevent rapid re-appearance (debounce)
    if (recentMessages.has(key)) {
      return
    }

    recentMessages.add(key)
    setTimeout(() => recentMessages.delete(key), 2000)

    const id = nextId++
    const toast: Toast = { id, message, type, duration }
    toasts.value.push(toast)

    if (duration > 0) {
      setTimeout(() => {
        remove(id)
      }, duration)
    }
  }

  function remove(id: number) {
    const index = toasts.value.findIndex(t => t.id === id)
    if (index !== -1) {
      toasts.value.splice(index, 1)
    }
  }

  function success(message: string, duration = 3000) {
    add(message, 'success', duration)
  }

  function error(message: string, duration = 5000) {
    add(message, 'error', duration)
  }

  function warning(message: string, duration = 4000) {
    add(message, 'warning', duration)
  }

  function info(message: string, duration = 3000) {
    add(message, 'info', duration)
  }

  return {
    toasts,
    add,
    remove,
    success,
    error,
    warning,
    info,
  }
})
