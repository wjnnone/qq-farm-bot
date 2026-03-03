<script setup lang="ts">
import type { UserCard } from '@/stores/user'
import { onMounted, ref } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useToastStore } from '@/stores/toast'
import { useUserStore } from '@/stores/user'

interface UserWithPassword {
  username: string
  password: string
  role: string
  card: UserCard | null
}

const userStore = useUserStore()
const toast = useToastStore()

const users = ref<UserWithPassword[]>([])
const loading = ref(false)
const showRenewModal = ref(false)
const selectedUser = ref<UserWithPassword | null>(null)
const renewCardCode = ref('')

async function fetchUsers() {
  loading.value = true
  try {
    const result = await userStore.getAllUsersWithPassword()
    if (result.ok) {
      users.value = result.data
    }
    else {
      toast.error(result.error || '获取用户列表失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '获取用户列表失败')
  }
  finally {
    loading.value = false
  }
}

async function toggleUserStatus(user: UserWithPassword) {
  try {
    const updates: Partial<UserCard> = { enabled: !user.card?.enabled }
    const result = await userStore.updateUser(user.username, updates)
    if (result.ok) {
      toast.success(user.card?.enabled ? '用户已封禁' : '用户已解封')
      await fetchUsers()
    }
    else {
      toast.error(result.error || '操作失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '操作失败')
  }
}

async function deleteUser(user: UserWithPassword) {
  if (!confirm(`确定要删除用户 ${user.username} 吗？此操作不可恢复！`))
    return

  try {
    const result = await userStore.deleteUser(user.username)
    if (result.ok) {
      toast.success('用户删除成功')
      await fetchUsers()
    }
    else {
      toast.error(result.error || '删除用户失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '删除用户失败')
  }
}

function openRenewModal(user: UserWithPassword) {
  selectedUser.value = user
  renewCardCode.value = ''
  showRenewModal.value = true
}

async function handleRenew() {
  if (!selectedUser.value || !renewCardCode.value) {
    toast.warning('请输入卡密')
    return
  }

  try {
    const result = await userStore.renewUser(selectedUser.value.username, renewCardCode.value)
    if (result.ok) {
      toast.success('续费成功')
      showRenewModal.value = false
      await fetchUsers()
    }
    else {
      toast.error(result.error || '续费失败')
    }
  }
  catch (e: any) {
    toast.error(e.message || '续费失败')
  }
}

async function copyPassword(password: string) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(password)
      toast.success('密码已复制到剪贴板')
    }
    else {
      const textArea = document.createElement('textarea')
      textArea.value = password
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      toast.success('密码已复制到剪贴板')
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
    return '永久有效'
  return new Date(timestamp).toLocaleString('zh-CN')
}

function getDaysLabel(days: number) {
  if (days === -1)
    return '永久'
  return `${days}天`
}

function isExpired(card: UserCard | null) {
  if (!card?.expiresAt)
    return false
  return Date.now() > card.expiresAt
}

onMounted(() => {
  fetchUsers()
})
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl text-gray-900 font-bold dark:text-white">
        用户管理
      </h1>
      <BaseButton variant="primary" @click="fetchUsers">
        刷新
      </BaseButton>
    </div>

    <!-- 用户列表 -->
    <div class="overflow-hidden rounded-lg bg-white shadow dark:bg-gray-800">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead class="bg-gray-50 dark:bg-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                用户名
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                密码
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                角色
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                卡密类型
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                过期时间
              </th>
              <th class="px-6 py-3 text-left text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                状态
              </th>
              <th class="px-6 py-3 text-right text-xs text-gray-500 font-medium tracking-wider uppercase dark:text-gray-300">
                操作
              </th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200 dark:bg-gray-800 dark:divide-gray-700">
            <tr v-for="user in users" :key="user.username">
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 font-medium dark:text-white">
                {{ user.username }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                <div class="flex items-center space-x-2">
                  <span class="font-mono">{{ user.password }}</span>
                  <button
                    class="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    @click="copyPassword(user.password)"
                  >
                    复制
                  </button>
                </div>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                <span
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="user.role === 'admin' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'"
                >
                  {{ user.role === 'admin' ? '管理员' : '用户' }}
                </span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm text-gray-900 dark:text-white">
                {{ user.card ? getDaysLabel(user.card.days) : '无' }}
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-sm" :class="isExpired(user.card) ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'">
                {{ formatDate(user.card?.expiresAt || null) }}
              </td>
              <td class="whitespace-nowrap px-6 py-4">
                <span
                  v-if="user.card"
                  class="inline-flex rounded-full px-2 text-xs font-semibold leading-5"
                  :class="user.card.enabled === false ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' : (isExpired(user.card) ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200')"
                >
                  {{ user.card.enabled === false ? '封禁' : (isExpired(user.card) ? '已过期' : '正常') }}
                </span>
                <span v-else class="text-gray-500 dark:text-gray-400">-</span>
              </td>
              <td class="whitespace-nowrap px-6 py-4 text-right text-sm font-medium">
                <button
                  v-if="user.role !== 'admin'"
                  class="mr-3 text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                  @click="openRenewModal(user)"
                >
                  续费
                </button>
                <button
                  v-if="user.role !== 'admin' && user.card"
                  class="mr-3 text-yellow-600 dark:text-yellow-400 hover:text-yellow-900 dark:hover:text-yellow-300"
                  @click="toggleUserStatus(user)"
                >
                  {{ user.card.enabled === false ? '解封' : '封禁' }}
                </button>
                <button
                  v-if="user.role !== 'admin'"
                  class="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                  @click="deleteUser(user)"
                >
                  删除
                </button>
              </td>
            </tr>
            <tr v-if="users.length === 0">
              <td colspan="7" class="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                暂无用户
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 续费弹窗 -->
    <div
      v-if="showRenewModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      @click.self="showRenewModal = false"
    >
      <div class="max-w-md w-full rounded-lg bg-white p-6 dark:bg-gray-800">
        <h2 class="mb-4 text-xl text-gray-900 font-bold dark:text-white">
          为用户续费
        </h2>
        <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
          用户：{{ selectedUser?.username }}
        </p>
        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-sm text-gray-700 font-medium dark:text-gray-300">
              卡密
            </label>
            <BaseInput
              v-model="renewCardCode"
              placeholder="请输入卡密"
            />
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-3">
          <BaseButton variant="secondary" @click="showRenewModal = false">
            取消
          </BaseButton>
          <BaseButton variant="primary" @click="handleRenew">
            续费
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
