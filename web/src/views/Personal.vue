<script setup lang="ts">
import { ref } from 'vue'
import BagPanel from '@/components/BagPanel.vue'
import FarmPanel from '@/components/FarmPanel.vue'
import TaskPanel from '@/components/TaskPanel.vue'

const currentTab = ref<'farm' | 'bag' | 'task'>('farm')
</script>

<template>
  <div class="h-full flex flex-col p-4">
    <div class="mb-4 flex space-x-2">
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="currentTab === 'farm'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="currentTab = 'farm'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-sprout text-lg" />
          <span>我的农场</span>
        </div>
      </button>
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="currentTab === 'bag'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="currentTab = 'bag'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-box text-lg" />
          <span>我的背包</span>
        </div>
      </button>
      <button
        class="rounded-lg px-4 py-2 font-medium transition-colors"
        :class="currentTab === 'task'
          ? 'bg-blue-500 text-white shadow-md'
          : 'bg-white text-gray-600 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'"
        @click="currentTab = 'task'"
      >
        <div class="flex items-center space-x-2">
          <div class="i-carbon-task text-lg" />
          <span>我的任务</span>
        </div>
      </button>
    </div>

    <div class="flex-1 overflow-hidden overflow-y-auto">
      <Transition
        mode="out-in"
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="transform opacity-0 scale-95"
        enter-to-class="transform opacity-100 scale-100"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="transform opacity-100 scale-100"
        leave-to-class="transform opacity-0 scale-95"
      >
        <component :is="currentTab === 'farm' ? FarmPanel : (currentTab === 'bag' ? BagPanel : TaskPanel)" />
      </Transition>
    </div>
  </div>
</template>
