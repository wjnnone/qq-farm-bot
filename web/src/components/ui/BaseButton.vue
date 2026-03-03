<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'

const props = defineProps<{
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost' | 'outline' | 'text'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  block?: boolean
  to?: string
  href?: string
  type?: 'button' | 'submit' | 'reset'
}>()

const emit = defineEmits<{
  (e: 'click', event: MouseEvent): void
}>()

const componentTag = computed(() => {
  if (props.to)
    return RouterLink
  if (props.href)
    return 'a'
  return 'button'
})

const baseClasses = 'inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60'

const variantClasses = computed(() => {
  switch (props.variant) {
    case 'primary':
      return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm dark:bg-blue-600 dark:hover:bg-blue-500'
    case 'secondary':
      return 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
    case 'success':
      return 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 shadow-sm dark:bg-green-600 dark:hover:bg-green-500'
    case 'danger':
      return 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm dark:bg-red-600 dark:hover:bg-red-500'
    case 'ghost':
      return 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
    case 'outline':
      return 'border border-gray-300 bg-transparent text-gray-700 hover:bg-gray-50 focus:ring-gray-500 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
    case 'text':
      return 'text-blue-600 hover:underline p-0 bg-transparent shadow-none hover:bg-transparent dark:text-blue-400'
    default:
      return 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 shadow-sm dark:bg-blue-600 dark:hover:bg-blue-500'
  }
})

const sizeClasses = computed(() => {
  if (props.variant === 'text')
    return ''

  switch (props.size) {
    case 'sm':
      return 'px-3 py-1.5 text-sm'
    case 'lg':
      return 'px-6 py-3 text-lg'
    default:
      return 'px-4 py-2 text-sm'
  }
})

const widthClasses = computed(() => props.block ? 'w-full' : '')
</script>

<template>
  <component
    :is="componentTag"
    :to="to"
    :href="href"
    :type="!to && !href ? (type || 'button') : undefined"
    :disabled="disabled || loading"
    :class="[baseClasses, variantClasses, sizeClasses, widthClasses]"
    v-bind="$attrs"
    @click="!disabled && !loading && emit('click', $event)"
  >
    <div v-if="loading" class="i-svg-spinners-ring-resize mr-2 animate-spin" />
    <slot />
  </component>
</template>
