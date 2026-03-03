<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import DailyOverview from '@/components/DailyOverview.vue'
import { useAccountStore } from '@/stores/account'
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
const accountStore = useAccountStore()
const { status, dailyGifts, realtimeConnected } = storeToRefs(statusStore)
const { currentAccountId, currentAccount } = storeToRefs(accountStore)

const growth = computed(() => dailyGifts.value?.growth || null)

async function refresh() {
  if (currentAccountId.value) {
    const acc = currentAccount.value
    if (!acc)
      return

    if (!realtimeConnected.value) {
      await statusStore.fetchStatus(currentAccountId.value)
    }
    if (acc.running && status.value?.connection?.connected) {
      statusStore.fetchDailyGifts(currentAccountId.value)
    }
  }
}

onMounted(() => {
  refresh()
})

watch(currentAccountId, () => {
  refresh()
})

function formatTaskProgress(task: any) {
  if (!task)
    return '未开始'
  const rawCurrent = task.progress ?? task.current
  const rawTarget = task.totalProgress ?? task.target

  const current = Number.isFinite(rawCurrent)
    ? rawCurrent
    : (rawCurrent ? Number(rawCurrent) || 0 : 0)

  const target = Number.isFinite(rawTarget)
    ? rawTarget
    : (rawTarget ? Number(rawTarget) || 0 : 0)

  if (!current && !target)
    return '未开始'

  if (target && current >= target)
    return '已完成'

  return `进度：${current}/${target}`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Daily Overview (Daily Gifts & Tasks) -->
    <DailyOverview :daily-gifts="dailyGifts" />

    <!-- Growth Task -->
    <div class="flex flex-col rounded-lg bg-white p-4 shadow dark:bg-gray-800">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="flex items-center gap-2 font-medium">
          <div class="i-carbon-growth text-green-500" />
          <span>成长任务</span>
        </h3>
        <span
          v-if="growth"
          class="rounded px-2 py-0.5 text-xs font-bold"
          :class="growth.doneToday
            ? 'text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20'
            : 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20'"
        >
          {{ growth.doneToday ? '今日已完成' : `${growth.completedCount}/${growth.totalCount}` }}
        </span>
      </div>

      <div
        v-if="!currentAccountId"
        class="flex flex-col items-center justify-center gap-3 rounded-lg bg-gray-50 py-8 text-center text-gray-500 dark:bg-gray-900/40 dark:text-gray-400"
      >
        <div class="i-carbon-user-avatar text-3xl opacity-50" />
        <span class="text-sm">请选择账号查看任务详情</span>
      </div>
      <div
        v-else-if="!status?.connection?.connected"
        class="flex flex-col items-center justify-center gap-3 rounded-lg bg-gray-50 py-8 text-center dark:bg-gray-900/40"
      >
        <div class="i-carbon-connection-signal-off text-3xl text-gray-400 dark:text-gray-500" />
        <div>
          <div class="text-sm text-gray-600 font-medium dark:text-gray-300">
            账号未登录
          </div>
          <div class="mt-1 text-xs text-gray-400">
            请先运行账号或检查网络连接
          </div>
        </div>
      </div>
      <div
        v-else-if="growth && growth.tasks && growth.tasks.length"
        class="space-y-2"
      >
        <div
          v-for="(task, idx) in growth.tasks"
          :key="idx"
          class="flex items-center justify-between text-sm"
        >
          <span class="text-gray-600 dark:text-gray-400">{{ task.desc || task.name }}</span>
          <span class="text-xs text-gray-500">{{ formatTaskProgress(task) }}</span>
        </div>
      </div>
      <div v-else class="text-center text-sm text-gray-400">
        暂无任务详情
      </div>
    </div>
  </div>
</template>
