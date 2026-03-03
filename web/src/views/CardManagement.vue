<script setup lang="ts">
import type { Card } from '@/stores/user'
import { computed, onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
const toast = useToastStore()

const cards = ref<Card[]>([])
const loading = ref(false)
const showCreateModal = ref(false)

// 创建卡密表单
const newCard = ref({
  description: '',
  days: 30,
  count: 1,
})

// 选中的卡密（用于导出）
const selectedCards = ref<Set<string>>(new Set())
const selectAll = ref(false)

// 过滤和搜索
const searchQuery = ref('')
const filterStatus = ref<'all' | 'used' | 'unused' | 'enabled' | 'disabled'>('all')

const filteredCards = computed(() => {
  let result = cards.value

  // 搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    result = result.filter(card =>
      card.code.toLowerCase().includes(query)
      || card.description.toLowerCase().includes(query)
      || (card.usedBy && card.usedBy.toLowerCase().includes(query)),
    )
  }

  // 状态过滤
  switch (filterStatus.value) {
    case 'used':
      result = result.filter(card => card.usedBy)
      break
    case 'unused':
      result = result.filter(card => !card.usedBy)
      break
    case 'enabled':
      result = result.filter(card => card.enabled)
      break
    case 'disabled':
      result = result.filter(card => !card.enabled)
      break
  }

  return result
})

async function fetchCards() {
  loading.value = true
  try {
    const result = await userStore.getAllCards()
    if (result.ok) {
      cards.value = result.data
    }
    else {
      toast.error(result.error || '获取卡密列表失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '获取卡密列表失败')
  }
  finally {
    loading.value = false
  }
}

async function createCard() {
  if (!newCard.value.description) {
    toast.warning('请输入卡密描述')
    return
  }

  const count = Math.min(Math.max(Number.parseInt(String(newCard.value.count), 10) || 1, 1), 100)

  try {
    const result = await userStore.createCard(
      newCard.value.description,
      newCard.value.days,
      count > 1 ? count : undefined,
    )
    if (result.ok) {
      if (result.batch) {
        toast.success(`成功创建 ${result.count} 个卡密`)
        // 如果是批量创建，自动导出
        exportCardsToFile(result.data, `卡密批量导出_${newCard.value.description}_${formatDateForFile(Date.now())}.txt`)
      }
      else {
        toast.success('卡密创建成功')
      }
      showCreateModal.value = false
      newCard.value = { description: '', days: 30, count: 1 }
      await fetchCards()
    }
    else {
      toast.error(result.error || '创建卡密失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '创建卡密失败')
  }
}

async function toggleCardStatus(card: Card) {
  try {
    const result = await userStore.updateCard(card.code, { enabled: !card.enabled })
    if (result.ok) {
      toast.success(card.enabled ? '卡密已禁用' : '卡密已启用')
      await fetchCards()
    }
    else {
      toast.error(result.error || '操作失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '操作失败')
  }
}

async function deleteCard(card: Card) {
  if (!confirm(`确定要删除卡密 ${card.code} 吗？`))
    return

  try {
    const result = await userStore.deleteCard(card.code)
    if (result.ok) {
      toast.success('卡密删除成功')
      await fetchCards()
    }
    else {
      toast.error(result.error || '删除卡密失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '删除卡密失败')
  }
}

// 批量删除卡密
async function deleteSelectedCards() {
  const selectedCodes = Array.from(selectedCards.value)
  if (selectedCodes.length === 0) {
    toast.warning('请先选择要删除的卡密')
    return
  }

  if (!confirm(`确定要删除选中的 ${selectedCodes.length} 个卡密吗？此操作不可恢复！`))
    return

  try {
    const result = await userStore.deleteCardsBatch(selectedCodes)
    if (result.ok) {
      toast.success(`成功删除 ${result.deletedCount} 个卡密`)
      if (result.notFoundCount > 0) {
        toast.warning(`${result.notFoundCount} 个卡密未找到`)
      }
      selectedCards.value.clear()
      selectAll.value = false
      await fetchCards()
    }
    else {
      toast.error(result.error || '批量删除卡密失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '批量删除卡密失败')
  }
}

async function copyCode(code: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(code)
      toast.success('卡密已复制到剪贴板')
    }
    else {
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea')
      textArea.value = code
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      toast.success('卡密已复制到剪贴板')
      document.body.removeChild(textArea)
    }
  }
  catch (e) {
    toast.error('复制失败，请手动复制')
    console.error('复制失败:', e)
  }
}

async function copySelectedCodes() {
  const codes = filteredCards.value
    .filter(card => selectedCards.value.has(card.code))
    .map(card => card.code)
    .join('\n')

  if (!codes) {
    toast.warning('请先选择要复制的卡密')
    return
  }

  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(codes)
      toast.success(`已复制 ${selectedCards.value.size} 个卡密到剪贴板`)
    }
    else {
      // 降级方案：使用 document.execCommand
      const textArea = document.createElement('textarea')
      textArea.value = codes
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      toast.success(`已复制 ${selectedCards.value.size} 个卡密到剪贴板`)
      document.body.removeChild(textArea)
    }
  }
  catch (e) {
    toast.error('复制失败，请手动复制')
    console.error('复制失败:', e)
  }
}

function formatDate(timestamp: number | null) {
  if (!timestamp)
    return '-'
  return new Date(timestamp).toLocaleString('zh-CN')
}

function formatDateForFile(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`
}

function getDaysLabel(days: number) {
  if (days === -1)
    return '永久'
  return `${days}天`
}

// 导出卡密到文件
function exportCardsToFile(cardsToExport: Card[], filename?: string) {
  if (!cardsToExport || cardsToExport.length === 0) {
    toast.warning('没有可导出的卡密')
    return
  }

  const content = cardsToExport.map(card =>
    `卡密: ${card.code}\n描述: ${card.description}\n时长: ${getDaysLabel(card.days)}\n状态: ${card.enabled ? '启用' : '禁用'}\n${card.usedBy ? `使用者: ${card.usedBy}\n使用时间: ${formatDate(card.usedAt)}` : '未使用'}\n创建时间: ${formatDate(card.createdAt)}\n${'='.repeat(40)}`,
  ).join('\n\n')

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || `卡密导出_${formatDateForFile(Date.now())}.txt`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)

  toast.success(`已导出 ${cardsToExport.length} 个卡密到文件`)
}

// 导出选中的卡密
function exportSelectedCards() {
  const selected = filteredCards.value.filter(card => selectedCards.value.has(card.code))
  if (selected.length === 0) {
    toast.warning('请先选择要导出的卡密')
    return
  }
  exportCardsToFile(selected, `卡密导出_选中_${formatDateForFile(Date.now())}.txt`)
}

// 导出所有卡密
function exportAllCards() {
  if (cards.value.length === 0) {
    toast.warning('没有可导出的卡密')
    return
  }
  exportCardsToFile(cards.value, `卡密导出_全部_${formatDateForFile(Date.now())}.txt`)
}

// 切换全选
function toggleSelectAll() {
  if (selectAll.value) {
    filteredCards.value.forEach(card => selectedCards.value.add(card.code))
  }
  else {
    filteredCards.value.forEach(card => selectedCards.value.delete(card.code))
  }
}

// 切换单个选择
function toggleSelectCard(code: string) {
  if (selectedCards.value.has(code)) {
    selectedCards.value.delete(code)
    selectAll.value = false
  }
  else {
    selectedCards.value.add(code)
    // 检查是否全部选中
    if (filteredCards.value.every(card => selectedCards.value.has(card.code))) {
      selectAll.value = true
    }
  }
}

onMounted(() => {
  fetchCards()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        卡密管理
      </h1>
      <div class="flex gap-2">
        <BaseButton variant="secondary" @click="exportAllCards">
          导出全部
        </BaseButton>
        <BaseButton variant="primary" @click="showCreateModal = true">
          创建卡密
        </BaseButton>
      </div>
    </div>

    <!-- 搜索和过滤 -->
    <div class="flex flex-wrap gap-4 rounded-lg bg-white p-4 shadow dark:bg-gray-800">
      <div class="min-w-[200px] flex-1">
        <BaseInput
          v-model="searchQuery"
          placeholder="搜索卡密、描述或使用者..."
        />
      </div>
      <select
        v-model="filterStatus"
        class="border border-gray-300 rounded-lg bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
      >
        <option value="all">
          全部状态
        </option>
        <option value="unused">
          未使用
        </option>
        <option value="used">
          已使用
        </option>
        <option value="enabled">
          已启用
        </option>
        <option value="disabled">
          已禁用
        </option>
      </select>
    </div>

    <!-- 批量操作栏 -->
    <div v-if="selectedCards.size > 0" class="flex items-center gap-4 rounded-lg bg-blue-50 p-4 dark:bg-blue-900/20">
      <span class="text-sm text-blue-700 dark:text-blue-300">
        已选择 {{ selectedCards.size }} 个卡密
      </span>
      <BaseButton variant="secondary" size="sm" @click="copySelectedCodes">
        复制选中
      </BaseButton>
      <BaseButton variant="primary" size="sm" @click="exportSelectedCards">
        导出选中
      </BaseButton>
      <BaseButton variant="danger" size="sm" @click="deleteSelectedCards">
        批量删除
      </BaseButton>
      <button
        class="ml-auto text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
        @click="selectedCards.clear(); selectAll = false"
      >
        清除选择
      </button>
    </div>

    <!-- 卡密列表 -->
    <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-4 py-3 text-left">
                <input
                  v-model="selectAll"
                  type="checkbox"
                  class="border-gray-300 rounded text-green-600 focus:ring-green-500"
                  @change="toggleSelectAll"
                >
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                卡密
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                描述
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                时长
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                状态
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                使用者
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                创建时间
              </th>
              <th class="px-6 py-3 text-right text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <tr v-for="card in filteredCards" :key="card.code">
              <td class="px-4 py-4">
                <input
                  :checked="selectedCards.has(card.code)"
                  type="checkbox"
                  class="border-gray-300 rounded text-green-600 focus:ring-green-500"
                  @change="toggleSelectCard(card.code)"
                >
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <div class="flex items-center space-x-2">
                  <code class="rounded bg-gray-100 px-2 py-1 text-sm dark:bg-gray-700">{{ card.code }}</code>
                  <button
                    class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    @click="copyCode(card.code)"
                  >
                    复制
                  </button>
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                {{ card.description }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                {{ getDaysLabel(card.days) }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="card.enabled ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'"
                >
                  {{ card.enabled ? '启用' : '禁用' }}
                </span>
                <span
                  v-if="card.usedBy"
                  class="ml-2 inline-flex rounded-full bg-blue-100 px-2 text-xs text-blue-800 font-semibold leading-5 dark:bg-blue-900 dark:text-blue-200"
                >
                  已使用
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                {{ card.usedBy || '-' }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                {{ formatDate(card.createdAt) }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <button
                  class="mr-3 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                  @click="toggleCardStatus(card)"
                >
                  {{ card.enabled ? '禁用' : '启用' }}
                </button>
                <button
                  class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                  @click="deleteCard(card)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="filteredCards.length === 0">
              <td colspan="8" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                暂无卡密
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 创建卡密弹窗 -->
    <div
      v-if="showCreateModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showCreateModal = false"
    >
      <div class="max-w-md w-full rounded-lg bg-white p-6 dark:bg-gray-800">
        <h2 class="mb-4 text-xl text-gray-900 font-bold dark:text-white">
          创建卡密
        </h2>
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              描述
            </label>
            <BaseInput
              v-model="newCard.description"
              placeholder="例如：月卡-2024"
            />
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              天数
            </label>
            <BaseInput
              v-model.number="newCard.days"
              type="number"
              placeholder="天数"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              输入-1表示永久，其他数字表示天数
            </p>
          </div>
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              数量
            </label>
            <BaseInput
              v-model.number="newCard.count"
              type="number"
              min="1"
              max="100"
              placeholder="数量"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              批量创建数量（1-100），批量创建后会自动导出文件
            </p>
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <BaseButton variant="secondary" @click="showCreateModal = false">
            取消
          </BaseButton>
          <BaseButton variant="primary" @click="createCard">
            创建
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
