<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, ref, watch } from 'vue'
import api from '@/api'
import BaseSelect from '@/components/ui/BaseSelect.vue'
import { useAccountStore } from '@/stores/account'
import { usePlantBlacklistStore } from '@/stores/plant-blacklist'
import { useToastStore } from '@/stores/toast'

const accountStore = useAccountStore()
const plantBlacklistStore = usePlantBlacklistStore()
const toast = useToastStore()
const { currentAccountId } = storeToRefs(accountStore)
const { blacklist } = storeToRefs(plantBlacklistStore)

const loading = ref(false)
const list = ref<any[]>([])
const sortKey = ref('exp')
const imageErrors = ref<Record<string | number, boolean>>({})
const showBlacklistModal = ref(false)

const sortOptions = [
  { value: 'exp', label: '经验/小时' },
  { value: 'fert', label: '普通肥经验/小时' },
  { value: 'profit', label: '利润/小时' },
  { value: 'fert_profit', label: '普通肥利润/小时' },
  { value: 'level', label: '等级' },
]

async function loadAnalytics() {
  if (!currentAccountId.value)
    return
  loading.value = true
  try {
    const res = await api.get(`/api/analytics`, {
      params: { sort: sortKey.value },
      headers: { 'x-account-id': currentAccountId.value },
    })
    const data = res.data.data
    if (Array.isArray(data)) {
      list.value = data
      // web sort as fallback
      const metricMap: Record<string, string> = {
        exp: 'expPerHour',
        fert: 'normalFertilizerExpPerHour',
        profit: 'profitPerHour',
        fert_profit: 'normalFertilizerProfitPerHour',
        level: 'level',
      }
      const metric = metricMap[sortKey.value]
      if (metric) {
        list.value.sort((a, b) => {
          const av = Number(a[metric])
          const bv = Number(b[metric])
          if (!Number.isFinite(av) && !Number.isFinite(bv))
            return 0
          if (!Number.isFinite(av))
            return 1
          if (!Number.isFinite(bv))
            return -1
          return bv - av
        })
      }
    }
    else {
      list.value = []
    }
  }
  catch (e) {
    console.error(e)
    list.value = []
  }
  finally {
    loading.value = false
  }
}

async function handleToggleBlacklist(item: any) {
  await plantBlacklistStore.toggleBlacklist(item.seedId)
  if (plantBlacklistStore.isBlacklisted(item.seedId)) {
    toast.success(`${item.name} 已加入偷菜黑名单`)
  }
  else {
    toast.success(`${item.name} 已移出偷菜黑名单`)
  }
}

onMounted(() => {
  loadAnalytics()
  plantBlacklistStore.fetchBlacklist()
})

watch([currentAccountId, sortKey], () => {
  loadAnalytics()
})

function formatLv(level: any) {
  if (level === null || level === undefined || level === '' || Number(level) < 0)
    return '未知'
  return String(level)
}

// 根据 seedId 获取蔬菜名字
function getSeedNameById(seedId: number) {
  const item = list.value.find((i: any) => i.seedId === seedId)
  return item?.name || `蔬菜ID:${seedId}`
}

function formatGrowTime(seconds: any) {
  const s = Number(seconds)
  if (!Number.isFinite(s) || s <= 0)
    return '0秒'
  if (s < 60)
    return `${s}秒`
  if (s < 3600) {
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return secs > 0 ? `${mins}分${secs}秒` : `${mins}分`
  }
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  return mins > 0 ? `${hours}时${mins}分` : `${hours}时`
}
</script>

<template>
  <div class="p-4">
    <div class="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <h2 class="flex items-center gap-2 text-2xl font-bold">
        <div class="i-carbon-chart-line" />
        数据分析
      </h2>

      <div class="flex items-center gap-2">
        <button
          class="flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 transition dark:bg-red-900/20 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
          @click="showBlacklistModal = true"
        >
          <div class="i-carbon-list-blocked" />
          偷菜黑名单 ({{ blacklist.length }})
        </button>
        <label class="whitespace-nowrap text-sm font-medium">排序方式:</label>
        <BaseSelect
          v-model="sortKey"
          :options="sortOptions"
          class="w-40"
        />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center py-12">
      <div class="i-svg-spinners-90-ring-with-bg text-4xl text-blue-500" />
    </div>

    <div v-else-if="!currentAccountId" class="rounded-lg bg-white p-8 text-center text-gray-500 shadow dark:bg-gray-800">
      请选择账号后查看数据分析
    </div>

    <div v-else-if="list.length === 0" class="rounded-lg bg-white p-8 text-center text-gray-500 shadow dark:bg-gray-800">
      暂无数据
    </div>

    <div v-else class="space-y-4">
      <!-- Mobile Card View -->
      <div class="block sm:hidden space-y-4">
        <div v-for="(item, idx) in list" :key="idx" class="border border-gray-200 rounded-lg bg-white p-4 shadow dark:border-gray-700 dark:bg-gray-800">
          <div class="mb-3 flex items-start gap-3">
            <div class="relative h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 rounded-lg bg-gray-100 dark:border-gray-600 dark:bg-gray-700">
              <img
                v-if="item.image && !imageErrors[item.seedId]"
                :src="item.image"
                class="h-10 w-10 object-contain"
                loading="lazy"
                @error="imageErrors[item.seedId] = true"
              >
              <div v-else class="i-carbon-sprout text-2xl text-gray-400" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <div class="truncate text-gray-900 font-bold dark:text-gray-100">
                  {{ item.name }}
                  <span v-if="blacklist.includes(item.seedId)" class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">黑名单</span>
                </div>
                <div class="text-xs text-gray-500">
                  ID:{{ item.seedId }}
                </div>
              </div>
              <div class="mt-1 flex items-center gap-2">
                <span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 font-medium dark:bg-gray-700">Lv{{ formatLv(item.level) }}</span>
                <span class="text-xs text-gray-400">{{ item.seasons }}季</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div class="flex flex-col">
              <span class="text-xs text-gray-500">时间</span>
              <span class="text-gray-700 font-medium dark:text-gray-300">{{ formatGrowTime(item.growTime) }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-gray-500">经验/时</span>
              <span class="text-purple-600 font-bold dark:text-purple-400">{{ item.expPerHour }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-gray-500">净利润/时</span>
              <span class="text-amber-500 font-bold">{{ item.profitPerHour ?? '-' }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-gray-500">普肥经验/时</span>
              <span class="text-blue-600 font-bold dark:text-blue-400">{{ item.normalFertilizerExpPerHour ?? '-' }}</span>
            </div>
            <div class="flex flex-col">
              <span class="text-xs text-gray-500">普肥利润/时</span>
              <span class="text-green-500 font-bold">{{ item.normalFertilizerProfitPerHour ?? '-' }}</span>
            </div>
          </div>

          <div class="mt-3">
            <button
              class="w-full rounded px-3 py-2 text-sm transition"
              :class="blacklist.includes(item.seedId)
                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
              @click="handleToggleBlacklist(item)"
            >
              {{ blacklist.includes(item.seedId) ? '移出偷菜黑名单' : '加入偷菜黑名单' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Desktop Table View -->
      <div class="hidden overflow-hidden border border-gray-200 rounded-lg bg-white shadow sm:block dark:border-gray-700 dark:bg-gray-800">
        <div class="overflow-x-auto">
          <table class="w-full whitespace-nowrap text-left text-sm">
            <thead class="border-b bg-gray-50 text-xs text-gray-500 uppercase dark:border-gray-700 dark:bg-gray-700/50 dark:text-gray-400">
              <tr>
                <th class="sticky left-0 z-10 bg-gray-50 px-4 py-3 font-medium shadow-[1px_0_0_0_rgba(0,0,0,0.05)] dark:bg-gray-800 dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)]">
                  作物 (Lv)
                </th>
                <th class="px-4 py-3 font-medium">
                  时间
                </th>
                <th class="px-4 py-3 text-right font-medium">
                  经验/时
                </th>
                <th class="px-4 py-3 text-right font-medium">
                  普通肥经验/时
                </th>
                <th class="px-4 py-3 text-right font-medium">
                  净利润/时
                </th>
                <th class="px-4 py-3 text-right font-medium">
                  普通肥净利润/时
                </th>
                <th class="px-4 py-3 text-center font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
              <tr v-for="(item, idx) in list" :key="idx" class="group transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <td class="sticky left-0 bg-white px-4 py-2 shadow-[1px_0_0_0_rgba(0,0,0,0.05)] transition-colors dark:bg-gray-800 group-hover:bg-gray-50 dark:shadow-[1px_0_0_0_rgba(255,255,255,0.05)] dark:group-hover:bg-gray-700/50">
                  <div class="flex items-center gap-3">
                    <div class="relative h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden border border-gray-200 rounded-lg bg-gray-100 dark:border-gray-600 dark:bg-gray-700">
                      <img
                        v-if="item.image && !imageErrors[item.seedId]"
                        :src="item.image"
                        class="h-8 w-8 object-contain"
                        loading="lazy"
                        @error="imageErrors[item.seedId] = true"
                      >
                      <div v-else class="i-carbon-sprout text-xl text-gray-400" />
                    </div>
                    <div>
                      <div class="text-gray-900 font-bold dark:text-gray-100">
                        {{ item.name }}
                        <span v-if="blacklist.includes(item.seedId)" class="ml-1 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">黑名单</span>
                      </div>
                      <div class="mt-0.5 flex items-center gap-1.5">
                        <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 font-medium dark:bg-gray-700">Lv{{ formatLv(item.level) }}</span>
                        <span class="text-[10px] text-gray-400">ID:{{ item.seedId }}</span>
                      </div>
                    </div>
                  </div>
                </td>
                <td class="px-4 py-2 text-gray-600 dark:text-gray-300">
                  <div class="font-medium">
                    {{ formatGrowTime(item.growTime) }}
                  </div>
                  <div class="text-xs text-gray-400">
                    {{ item.seasons }}季
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-purple-600 font-bold dark:text-purple-400">
                    {{ item.expPerHour }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-blue-600 font-bold dark:text-blue-400">
                    {{ item.normalFertilizerExpPerHour ?? '-' }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-amber-500 font-bold">
                    {{ item.profitPerHour ?? '-' }}
                  </div>
                </td>
                <td class="px-4 py-2 text-right">
                  <div class="text-green-500 font-bold">
                    {{ item.normalFertilizerProfitPerHour ?? '-' }}
                  </div>
                </td>
                <td class="px-4 py-2 text-center">
                  <button
                    class="rounded px-3 py-1.5 text-xs transition"
                    :class="blacklist.includes(item.seedId)
                      ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'"
                    @click="handleToggleBlacklist(item)"
                  >
                    {{ blacklist.includes(item.seedId) ? '移出黑名单' : '加入黑名单' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 黑名单管理弹窗 -->
    <div
      v-if="showBlacklistModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showBlacklistModal = false"
    >
      <div class="max-w-md w-full rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
        <h3 class="mb-4 text-lg text-gray-900 font-bold dark:text-white">
          偷菜黑名单管理
        </h3>
        <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
          加入黑名单的蔬菜在自动偷菜时会被跳过，但不会影响自己种植。
        </p>
        <div v-if="blacklist.length === 0" class="py-4 text-center text-gray-500 dark:text-gray-400">
          暂无黑名单蔬菜
        </div>
        <div v-else class="max-h-60 overflow-y-auto space-y-2">
          <div
            v-for="seedId in blacklist"
            :key="seedId"
            class="flex items-center justify-between rounded-lg bg-gray-50 px-4 py-2 dark:bg-gray-700"
          >
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-900 font-medium dark:text-white">{{ getSeedNameById(seedId) }}</span>
              <span class="text-xs text-gray-400">({{ seedId }})</span>
            </div>
            <button
              class="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-900/30"
              @click="plantBlacklistStore.removeFromBlacklist(seedId)"
            >
              移除
            </button>
          </div>
        </div>
        <div class="mt-4 flex justify-end">
          <button
            class="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 dark:bg-gray-700 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-600"
            @click="showBlacklistModal = false"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
