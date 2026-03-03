<script setup lang="ts">
import { useDateFormat, useIntervalFn, useNow } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import api from '@/api'
import AccountModal from '@/components/AccountModal.vue'
import RemarkModal from '@/components/RemarkModal.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'

import { menuRoutes } from '@/router/menu'
import { getPlatformClass, getPlatformLabel, useAccountStore } from '@/stores/account'
import { useAppStore } from '@/stores/app'
import { useStatusStore } from '@/stores/status'
import { useUserStore } from '@/stores/user'

const accountStore = useAccountStore()
const statusStore = useStatusStore()
const appStore = useAppStore()
const userStore = useUserStore()
const route = useRoute()
const router = useRouter()
const { accounts, currentAccount } = storeToRefs(accountStore)
const { status, realtimeConnected } = storeToRefs(statusStore)
const { sidebarOpen } = storeToRefs(appStore)

const showAccountDropdown = ref(false)
const showAccountModal = ref(false)
const showRemarkModal = ref(false)
const accountToEdit = ref<any>(null)
const wsErrorNotifiedAt = ref<Record<string, number>>({})

const systemConnected = ref(true)
const serverUptimeBase = ref(0)
const serverVersion = ref('')
const lastPingTime = ref(Date.now())
const now = useNow()
const formattedTime = useDateFormat(now, 'YYYY-MM-DD HH:mm:ss')

async function checkConnection() {
  try {
    const res = await api.get('/api/ping')
    systemConnected.value = true
    if (res.data.ok && res.data.data) {
      if (res.data.data.uptime) {
        serverUptimeBase.value = res.data.data.uptime
        lastPingTime.value = Date.now()
      }
      if (res.data.data.version) {
        serverVersion.value = res.data.data.version
      }
    }
    const accountRef = currentAccount.value?.id || currentAccount.value?.uin
    if (accountRef) {
      statusStore.connectRealtime(String(accountRef))
    }
  }
  catch {
    systemConnected.value = false
  }
}

async function refreshStatusFallback() {
  if (realtimeConnected.value)
    return

  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  if (accountRef) {
    await statusStore.fetchStatus(String(accountRef))
  }
}

async function handleAccountSaved() {
  await accountStore.fetchAccounts()
  await refreshStatusFallback()
  showAccountModal.value = false
  showRemarkModal.value = false
}

function openRemarkModal(acc: any) {
  accountToEdit.value = acc
  showRemarkModal.value = true
  showAccountDropdown.value = false
}

onMounted(() => {
  accountStore.fetchAccounts()
  checkConnection()
  // 获取当前用户信息
  userStore.fetchUserInfo()
})

onBeforeUnmount(() => {
  statusStore.disconnectRealtime()
})

const platform = computed(() => getPlatformLabel(currentAccount.value?.platform))

useIntervalFn(checkConnection, 30000)
useIntervalFn(() => {
  refreshStatusFallback()
  accountStore.fetchAccounts()
}, 10000)

watch(() => currentAccount.value?.id || currentAccount.value?.uin || '', () => {
  const accountRef = currentAccount.value?.id || currentAccount.value?.uin
  statusStore.connectRealtime(String(accountRef || ''))
  refreshStatusFallback()
}, { immediate: true })

watch(() => status.value?.wsError, (wsError: any) => {
  if (!wsError || Number(wsError.code) !== 400 || !currentAccount.value)
    return

  const errAt = Number(wsError.at) || 0
  const accId = String(currentAccount.value.id || currentAccount.value.uin || '')
  const lastNotified = wsErrorNotifiedAt.value[accId] || 0
  if (errAt <= lastNotified)
    return

  wsErrorNotifiedAt.value[accId] = errAt
  accountToEdit.value = currentAccount.value
  showAccountModal.value = true
}, { deep: true })

const uptime = computed(() => {
  const diff = Math.floor(serverUptimeBase.value + (now.value.getTime() - lastPingTime.value) / 1000)
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  const s = diff % 60
  return `${h}h ${m}m ${s}s`
})

const displayName = computed(() => {
  const acc = currentAccount.value
  if (!acc)
    return '选择账号'

  // 1. 优先显示实时状态中的昵称 (如果有且不是未登录)
  const liveName = status.value?.status?.name
  if (liveName && liveName !== '未登录') {
    // 如果有备注，显示为"昵称（备注）"
    if (acc.name) {
      return `${liveName} (${acc.name})`
    }
    return liveName
  }

  // 2. 其次显示账号存储的备注名称 (name)
  if (acc.name) {
    // 如果有同步的昵称，显示为"昵称（备注）"
    if (acc.nick) {
      return `${acc.nick} (${acc.name})`
    }
    return acc.name
  }

  // 3. 显示同步的昵称 (nick)
  if (acc.nick)
    return acc.nick

  // 4. 最后显示UIN
  return acc.uin
})

const connectionStatus = computed(() => {
  if (!systemConnected.value) {
    return {
      text: '系统离线',
      color: 'bg-red-500',
      pulse: false,
    }
  }

  if (!currentAccount.value?.id) {
    return {
      text: '请添加账号',
      color: 'bg-gray-400',
      pulse: false,
    }
  }

  const isConnected = status.value?.connection?.connected
  if (isConnected) {
    return {
      text: '运行中',
      color: 'bg-green-500',
      pulse: true,
    }
  }

  return {
    text: '未连接',
    color: 'bg-gray-400', // Or red? Old version uses gray/offline class which is gray usually
    pulse: false,
  }
})

// 根据用户角色过滤导航菜单
const navItems = computed(() => {
  const isAdmin = userStore.isAdmin
  return menuRoutes
    .filter(item => !item.adminOnly || isAdmin)
    .map(item => ({
      path: item.path ? `/${item.path}` : '/',
      label: item.label,
      icon: item.icon,
    }))
})

function selectAccount(acc: any) {
  accountStore.setCurrentAccount(acc)
  showAccountDropdown.value = false
}

const version = __APP_VERSION__

watch(
  () => route.path,
  () => {
    // Close sidebar on route change (mobile only)
    if (window.innerWidth < 1024)
      appStore.closeSidebar()
  },
)

// 用户相关
const showUserDropdown = ref(false)

async function handleLogout() {
  await userStore.logout()
  router.push('/login')
}

// 计算剩余时间（基于到期时间和当前时间）
// 计算剩余时间（基于到期时间和当前时间）
function getRemainingTime(expiresAt: number | null): string {
  const now = Date.now()

  // 没有到期时间
  if (expiresAt === null)
    return '无限制'

  // 已过期
  if (now >= expiresAt)
    return '已过期'

  // 计算剩余时间
  const diff = expiresAt - now
  const days = Math.floor(diff / (24 * 60 * 60 * 1000))
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000))

  if (days > 0) {
    return `剩余${days}天`
  }
  if (hours > 0) {
    return `剩余${hours}小时`
  }
  return `剩余${minutes}分钟`
}
// function getDaysLabel(days: number) {
//   if (days === -1)
//     return '永久'
//   return `${days}天`
// }
</script>

<template>
  <aside
    class="fixed inset-y-0 left-0 z-50 h-full w-64 flex flex-col border-r border-gray-200/50 transition-transform duration-300 lg:static lg:translate-x-0 dark:border-gray-700/50"
    :class="sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    :style="{ background: 'var(--theme-bg)', color: 'var(--theme-text)' }"
  >
    <!-- Brand -->
    <div class="h-16 flex items-center justify-between border-b border-gray-200/50 px-6 dark:border-gray-700/50">
      <div class="flex items-center gap-3">
        <div class="i-carbon-sprout text-2xl" :style="{ color: 'var(--theme-primary)' }" />
        <span class="bg-clip-text text-lg text-transparent font-bold" :style="{ backgroundImage: 'var(--theme-gradient)' }">
          农场智能助手
        </span>
      </div>
      <!-- Mobile Close Button -->
      <button
        class="rounded-lg p-1 text-gray-500 lg:hidden hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
        @click="appStore.closeSidebar"
      >
        <div class="i-carbon-close text-xl" />
      </button>
    </div>

    <!-- User Info -->
    <div class="border-b border-gray-200/50 p-4 dark:border-gray-700/50">
      <div class="group relative">
        <button
          class="w-full flex items-center justify-between border border-transparent rounded-xl bg-gray-100/50 px-4 py-2.5 outline-none transition-all duration-200 hover:border-gray-300 dark:bg-gray-700/30 hover:bg-gray-200/50 dark:hover:border-gray-600 dark:hover:bg-gray-700/50"
          style="--focus-ring: var(--theme-primary)"
          @click="showUserDropdown = !showUserDropdown"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="h-8 w-8 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-2 ring-white dark:bg-gray-600 dark:ring-gray-700">
              <div class="i-carbon-user text-gray-400" />
            </div>
            <div class="min-w-0 flex flex-col items-start">
              <span class="w-full truncate text-left text-sm font-medium">
                {{ userStore.username || '未登录' }}
              </span>
              <div class="mt-0.5 flex items-center gap-1.5">
                <span
                  class="rounded px-1 py-0.2 text-[10px] font-medium leading-tight"
                  :class="userStore.isAdmin ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'"
                >
                  {{ userStore.isAdmin ? '管理员' : '用户' }}
                </span>
                <span v-if="userStore.userCard" class="truncate text-xs text-gray-400">
                  {{ userStore.userCard.description }}
                </span>
              </div>
            </div>
          </div>
          <div
            class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
            :class="{ 'rotate-180': showUserDropdown }"
          />
        </button>

        <!-- User Dropdown Menu -->
        <div
          v-if="showUserDropdown"
          class="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden border border-gray-200/50 rounded-xl bg-white/95 py-1 shadow-xl backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/95"
        >
          <div class="border-b border-gray-100 px-4 py-2 dark:border-gray-700">
            <div class="text-sm text-gray-900 font-medium dark:text-white">
              {{ userStore.username }}
            </div>
            <div class="text-xs text-gray-500 dark:text-gray-400">
              {{ userStore.isAdmin ? '管理员' : '普通用户' }}
            </div>
            <div v-if="userStore.userCard" class="mt-1 text-xs">
              <span class="text-gray-500">卡密类型:</span>
              <span class="ml-1" :style="{ color: 'var(--theme-primary)' }">
                {{ userStore.userCard.description }}
                ({{ getRemainingTime(userStore.userCard.expiresAt) }})
              </span>
            </div>
            <div v-if="userStore.userCard" class="text-xs">
              <span class="text-gray-500">过期时间:</span>
              <span class="ml-1" :class="userStore.isExpired ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">
                {{ userStore.expireTimeText }}
              </span>
            </div>
          </div>
          <div class="py-1">
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
              @click="handleLogout"
            >
              <div class="i-carbon-logout" />
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Account Selector -->
    <div class="border-b border-gray-200/50 p-4 dark:border-gray-700/50">
      <div class="group relative">
        <button
          class="w-full flex items-center justify-between border border-transparent rounded-xl bg-gray-100/50 px-4 py-2.5 outline-none transition-all duration-200 hover:border-gray-300 dark:bg-gray-700/30 dark:hover:border-gray-600 dark:hover:bg-gray-700/50"
          @click="showAccountDropdown = !showAccountDropdown"
        >
          <div class="flex items-center gap-3 overflow-hidden">
            <div class="h-8 w-8 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 ring-2 ring-white dark:bg-gray-600 dark:ring-gray-700">
              <img
                v-if="currentAccount?.uin"
                :src="`https://q1.qlogo.cn/g?b=qq&nk=${currentAccount.uin}&s=100`"
                class="h-full w-full object-cover"
                @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
              >
              <div v-else class="i-carbon-user text-gray-400" />
            </div>
            <div class="min-w-0 flex flex-col items-start">
              <span class="w-full truncate text-left text-sm font-medium">
                {{ displayName }}
              </span>
              <div class="mt-0.5 flex items-center gap-1.5">
                <span
                  v-if="platform"
                  class="rounded px-1 py-0.2 text-[10px] font-medium leading-tight"
                  :class="getPlatformClass(currentAccount?.platform)"
                >
                  {{ platform }}
                </span>
                <span class="truncate text-xs text-gray-400">
                  {{ currentAccount?.uin || currentAccount?.id || '未选择' }}
                </span>
              </div>
            </div>
          </div>
          <div
            class="i-carbon-chevron-down text-gray-400 transition-transform duration-200"
            :class="{ 'rotate-180': showAccountDropdown }"
          />
        </button>

        <!-- Dropdown Menu -->
        <div
          v-if="showAccountDropdown"
          class="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden border border-gray-200/50 rounded-xl bg-white/95 py-1 shadow-xl backdrop-blur-sm dark:border-gray-700/50 dark:bg-gray-900/95"
        >
          <div class="custom-scrollbar max-h-60 overflow-y-auto">
            <template v-if="accounts.length > 0">
              <button
                v-for="acc in accounts"
                :key="acc.id || acc.uin"
                class="w-full flex items-center gap-3 px-4 py-2 transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
                :class="{ 'bg-green-50/50 dark:bg-green-900/20': currentAccount?.id === acc.id }"
                :style="{ backgroundColor: currentAccount?.id === acc.id ? 'color-mix(in srgb, var(--theme-primary) 10%, transparent)' : undefined }"
                @click="selectAccount(acc)"
              >
                <div class="h-6 w-6 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-600">
                  <img
                    v-if="acc.uin"
                    :src="`https://q1.qlogo.cn/g?b=qq&nk=${acc.uin}&s=100`"
                    class="h-full w-full object-cover"
                    @error="(e) => (e.target as HTMLImageElement).style.display = 'none'"
                  >
                  <div v-else class="i-carbon-user text-gray-400" />
                </div>
                <div class="min-w-0 flex flex-1 flex-col items-start">
                  <span class="w-full truncate text-left text-sm font-medium">
                    {{ acc.nick && acc.name ? `${acc.nick} (${acc.name})` : acc.name || acc.nick || acc.uin }}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <span
                      v-if="platform"
                      class="rounded px-1 py-0.2 text-[10px] font-medium leading-tight"
                      :class="getPlatformClass(acc.platform)"
                    >
                      {{ getPlatformLabel(acc.platform) }}
                    </span>
                    <span class="text-xs text-gray-400">{{ acc.uin || acc.id }}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <button
                    class="rounded-full p-1 text-gray-400 transition-colors hover:bg-blue-50/50 hover:text-blue-500 dark:hover:bg-blue-900/20"
                    title="修改备注"
                    @click.stop="openRemarkModal(acc)"
                  >
                    <div class="i-carbon-edit" />
                  </button>
                  <div v-if="currentAccount?.id === acc.id" class="i-carbon-checkmark" :style="{ color: 'var(--theme-primary)' }" />
                </div>
              </button>
            </template>
            <div v-else class="px-4 py-3 text-center text-sm text-gray-400">
              暂无账号
            </div>
          </div>
          <div class="mt-1 border-t border-gray-100 pt-1 dark:border-gray-700">
            <button
              class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
              :style="{ color: 'var(--theme-primary)' }"
              @click="showAccountModal = true; showAccountDropdown = false"
            >
              <div class="i-carbon-add" />
              <span>添加账号</span>
            </button>
            <router-link
              to="/accounts"
              class="w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
              :style="{ color: 'var(--theme-primary)' }"
              @click="showAccountDropdown = false"
            >
              <div class="i-carbon-add-alt" />
              <span>管理账号</span>
            </router-link>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="group flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50"
        :active-class="item.path === '/' ? '' : 'font-medium shadow-sm'"
        :style="{
          '--active-color': 'var(--theme-primary)',
          '--active-bg': 'var(--theme-primary)',
          '--active-bg-opacity': '0.1',
          'color': 'var(--theme-text)',
          'opacity': '0.8',
        }"
      >
        <div class="text-xl transition-transform duration-200 group-hover:scale-110" :class="[item.icon]" />
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- Footer Status -->
    <div class="mt-auto border-t border-gray-200/50 bg-gray-100/30 p-4 dark:border-gray-700/50 dark:bg-gray-800/30">
      <div class="mb-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-1.5">
          <div
            class="h-2 w-2 rounded-full"
            :class="[connectionStatus.color, { 'animate-pulse': connectionStatus.pulse }]"
          />
          <span>{{ connectionStatus.text }}</span>
        </div>
        <div class="flex items-center gap-2">
          <span>{{ uptime }}</span>
          <ThemeToggle />
        </div>
      </div>
      <div class="mt-1 flex flex-col gap-0.5 text-xs text-gray-400 font-mono">
        <div class="flex items-center justify-between">
          <span>{{ formattedTime }}</span>
        </div>
        <div class="flex items-center justify-between opacity-50">
          <span>Web v{{ version }}</span>
          <span v-if="serverVersion">Core v{{ serverVersion }}</span>
        </div>
      </div>
    </div>
  </aside>

  <!-- Overlay for mobile when sidebar is open -->
  <div
    v-if="showAccountDropdown || showUserDropdown"
    class="fixed inset-0 z-40 bg-transparent"
    @click="showAccountDropdown = false; showUserDropdown = false"
  />

  <AccountModal
    :show="showAccountModal"
    :edit-data="accountToEdit"
    @close="showAccountModal = false; accountToEdit = null"
    @saved="handleAccountSaved"
  />

  <RemarkModal
    :show="showRemarkModal"
    :account="accountToEdit"
    @close="showRemarkModal = false"
    @saved="handleAccountSaved"
  />
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.3);
  border-radius: 2px;
}
.custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
}

/* Active router link styling */
.router-link-active {
  background-color: var(--active-bg) !important;
  background-color: color-mix(in srgb, var(--theme-primary) 10%, transparent) !important;
  color: var(--theme-primary) !important;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 0 0 1px color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}

.router-link-exact-active {
  background-color: color-mix(in srgb, var(--theme-primary) 10%, transparent) !important;
  color: var(--theme-primary) !important;
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.05),
    0 0 0 1px color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}

/* Dropdown active item */
.bg-green-50 {
  background-color: color-mix(in srgb, var(--theme-primary) 10%, transparent) !important;
}

.dark\:bg-green-900\/10 {
  background-color: color-mix(in srgb, var(--theme-primary) 15%, transparent) !important;
}
</style>
