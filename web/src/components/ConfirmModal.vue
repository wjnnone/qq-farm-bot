<script setup lang="ts">
import BaseButton from '@/components/ui/BaseButton.vue'

defineProps<{
  show: boolean
  title?: string
  message?: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'primary'
  isAlert?: boolean
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm transition-opacity" @click="emit('cancel')">
    <div class="max-w-sm w-full scale-100 transform rounded-xl bg-white p-6 shadow-2xl transition-all dark:bg-gray-800" @click.stop>
      <h3 class="mb-3 text-xl text-gray-900 font-bold dark:text-gray-100">
        {{ title || '确认操作' }}
      </h3>
      <p class="mb-8 text-gray-600 leading-relaxed dark:text-gray-400">
        {{ message || '确定要执行此操作吗？' }}
      </p>
      <div class="flex justify-end gap-3">
        <BaseButton
          v-if="!isAlert"
          variant="secondary"
          :disabled="loading"
          @click="emit('cancel')"
        >
          {{ cancelText || '取消' }}
        </BaseButton>
        <BaseButton
          :variant="type === 'danger' ? 'danger' : 'primary'"
          :loading="loading"
          @click="emit('confirm')"
        >
          {{ confirmText || '确定' }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
