<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  type?: string
  placeholder?: string
  label?: string
  disabled?: boolean
  clearable?: boolean
}>()
const emit = defineEmits<{
  (e: 'clear'): void
}>()
const model = defineModel<string | number>()
const showPassword = ref(false)
const inputType = computed(() => {
  if (props.type === 'password' && showPassword.value) {
    return 'text'
  }
  return props.type || 'text'
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label v-if="label" class="text-sm text-gray-700 font-medium dark:text-gray-300">
      {{ label }}
    </label>
    <div class="relative">
      <input
        v-model="model"
        :type="inputType"
        :placeholder="placeholder"
        :disabled="disabled"
        class="base-input w-full border border-gray-200 rounded-lg bg-white px-3 py-2 outline-none transition-all duration-200 dark:border-gray-700 focus:border-green-500 dark:bg-gray-800 disabled:bg-gray-50 dark:text-white disabled:text-gray-400 focus:ring-2 focus:ring-green-500/20 dark:focus:border-green-500 dark:disabled:bg-gray-800/50"
        :class="{ 'pr-10': type === 'password' || (clearable && model) }"
      >
      <button
        v-if="type === 'password'"
        type="button"
        class="absolute right-3 top-1/2 text-gray-400 -translate-y-1/2 hover:text-gray-600 dark:hover:text-gray-300"
        @click="showPassword = !showPassword"
      >
        <div v-if="showPassword" class="i-carbon-view-off" />
        <div v-else class="i-carbon-view" />
      </button>

      <button
        v-else-if="clearable && model"
        type="button"
        class="absolute right-3 top-1/2 text-gray-400 -translate-y-1/2 hover:text-gray-600 dark:hover:text-gray-300"
        @click="model = ''; emit('clear')"
      >
        <div class="i-carbon-close" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.base-input::-ms-reveal,
.base-input::-ms-clear {
  display: none;
}
</style>
