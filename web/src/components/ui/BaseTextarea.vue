<script setup lang="ts">
defineProps<{
  placeholder?: string
  label?: string
  disabled?: boolean
  rows?: number
}>()
const model = defineModel<string>()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-sm text-gray-700 font-medium dark:text-gray-300">
      {{ label }}
    </label>
    <textarea
      v-model="model"
      :rows="rows || 3"
      :placeholder="placeholder"
      :disabled="disabled"
      class="w-full border border-gray-200 rounded-lg bg-white px-3 py-2 outline-none transition-all duration-200 dark:border-gray-700 focus:border-green-500 dark:bg-gray-800 disabled:bg-gray-50 dark:text-white disabled:text-gray-400 focus:ring-2 focus:ring-green-500/20 dark:focus:border-green-500 dark:disabled:bg-gray-800/50"
    />
  </div>
</template>
