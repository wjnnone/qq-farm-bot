<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useToastStore } from '@/stores/toast'

const toastStore = useToastStore()
const { toasts } = storeToRefs(toastStore)

function getIcon(type: string) {
  switch (type) {
    case 'success': return 'i-carbon-checkmark-filled text-green-500'
    case 'error': return 'i-carbon-error-filled text-red-500'
    case 'warning': return 'i-carbon-warning-filled text-yellow-500'
    case 'info': return 'i-carbon-information-filled text-blue-500'
    default: return 'i-carbon-information-filled text-blue-500'
  }
}

function getBgColor(_type: string) {
  // Tailwind colors with some transparency?
  // Actually, standard white/dark background with colored border/icon is usually cleaner.
  return 'bg-white dark:bg-gray-800 border-l-4'
}

function getBorderColor(type: string) {
  switch (type) {
    case 'success': return 'border-green-500'
    case 'error': return 'border-red-500'
    case 'warning': return 'border-yellow-500'
    case 'info': return 'border-blue-500'
    default: return 'border-gray-500'
  }
}
</script>

<template>
  <div class="fixed right-4 top-4 z-[9999] flex flex-col gap-2">
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="w-80 flex items-start gap-3 rounded p-4 shadow-lg transition-all duration-300"
        :class="[getBgColor(toast.type), getBorderColor(toast.type)]"
      >
        <div :class="getIcon(toast.type)" class="mt-0.5 shrink-0 text-xl" />
        <div class="flex-1 break-words text-sm text-gray-700 dark:text-gray-200">
          {{ toast.message }}
        </div>
        <button
          class="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          @click="toastStore.remove(toast.id)"
        >
          <div class="i-carbon-close text-lg" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>
