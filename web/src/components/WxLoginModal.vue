<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useAccountStore } from '@/stores/account'
import { useWxLoginStore } from '@/stores/wx-login'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits(['close', 'saved'])

const wxLoginStore = useWxLoginStore()
const accountStore = useAccountStore()

const activeTab = ref<'login' | 'settings'>('login')
const accountName = ref('')

// 轮询检查登录状态
const { pause: stopCheck, resume: startCheck } = useIntervalFn(async () => {
  if (wxLoginStore.status !== 'qr_ready' && wxLoginStore.status !== 'confirming') {
    return
  }

  const result = await wxLoginStore.checkLogin()

  if (result.success && result.wxid) {
    stopCheck()

    // 自动添加账号
    await handleAutoAddAccount(result.wxid, result.nickname)
  }
}, 2000, { immediate: false })

// 自动添加账号
async function handleAutoAddAccount(wxid: string, nickname?: string) {
  try {
    const result = await wxLoginStore.getFarmCode()

    if (result.success && result.code) {
      const name = accountName.value.trim() || nickname || `微信账号${Date.now()}`

      await accountStore.addAccount({
        name,
        code: result.code,
        platform: 'wx',
        loginType: 'wx_qr',
        wxid,
      })

      emit('saved')
      close()
    }
  }
  catch (e) {
    console.error('自动添加账号失败:', e)
  }
}

// 获取二维码
async function loadQRCode() {
  wxLoginStore.resetState()
  const success = await wxLoginStore.getQRCode()
  if (success) {
    startCheck()
  }
}

// 保存配置
function saveConfig() {
  wxLoginStore.updateConfig({
    apiBase: wxLoginStore.config.apiBase,
    apiKey: wxLoginStore.config.apiKey,
    proxyApiUrl: wxLoginStore.config.proxyApiUrl,
  })
  activeTab.value = 'login'
}

// 关闭弹窗
function close() {
  stopCheck()
  wxLoginStore.resetState()
  accountName.value = ''
  emit('close')
}

// 二维码图片地址
const qrImageSrc = computed(() => {
  if (!wxLoginStore.qrCode)
    return ''
  if (wxLoginStore.qrCode.startsWith('data:'))
    return wxLoginStore.qrCode
  if (wxLoginStore.qrCode.startsWith('http'))
    return wxLoginStore.qrCode
  return `data:image/png;base64,${wxLoginStore.qrCode}`
})

// 状态样式
const statusClass = computed(() => {
  switch (wxLoginStore.status) {
    case 'success':
      return 'text-green-600'
    case 'error':
      return 'text-red-600'
    case 'qr_loading':
    case 'scanning':
      return 'text-blue-600'
    default:
      return 'text-gray-600'
  }
})

watch(() => props.show, (newVal) => {
  if (newVal) {
    activeTab.value = 'login'
    loadQRCode()
  }
  else {
    stopCheck()
  }
})
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="max-w-md w-full overflow-hidden rounded-lg shadow-xl" :style="{ background: 'var(--theme-bg)' }">
      <!-- Header -->
      <div class="flex items-center justify-between border-b p-4" :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 10%, transparent)' }">
        <h3 class="text-lg font-semibold" :style="{ color: 'var(--theme-text)' }">
          微信扫码登录
        </h3>
        <BaseButton variant="ghost" class="!p-1" @click="close">
          <div class="i-carbon-close text-xl" :style="{ color: 'var(--theme-text)' }" />
        </BaseButton>
      </div>

      <!-- Tabs -->
      <div class="flex border-b" :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 10%, transparent)' }">
        <button
          class="flex-1 py-2 text-center text-sm font-medium transition-colors"
          :class="activeTab === 'login' ? 'border-b-2' : 'opacity-60 hover:opacity-80'"
          :style="{
            color: 'var(--theme-text)',
            borderColor: activeTab === 'login' ? 'var(--theme-primary)' : 'transparent',
          }"
          @click="activeTab = 'login'"
        >
          扫码登录
        </button>
        <button
          class="flex-1 py-2 text-center text-sm font-medium transition-colors"
          :class="activeTab === 'settings' ? 'border-b-2' : 'opacity-60 hover:opacity-80'"
          :style="{
            color: 'var(--theme-text)',
            borderColor: activeTab === 'settings' ? 'var(--theme-primary)' : 'transparent',
          }"
          @click="activeTab = 'settings'"
        >
          设置
        </button>
      </div>

      <!-- Login Tab -->
      <div v-if="activeTab === 'login'" class="p-4 space-y-4">
        <!-- 账号名称输入 -->
        <BaseInput
          v-model="accountName"
          label="账号备注（可选）"
          placeholder="留空使用微信昵称"
        />

        <!-- 二维码区域 -->
        <div class="flex flex-col items-center justify-center py-4 space-y-4">
          <div
            v-if="qrImageSrc"
            class="border rounded-lg p-2"
            :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 20%, transparent)', background: '#fff' }"
          >
            <img :src="qrImageSrc" class="h-48 w-48">
          </div>
          <div
            v-else
            class="h-48 w-48 flex items-center justify-center rounded-lg"
            :style="{ background: 'color-mix(in srgb, var(--theme-bg) 90%, var(--theme-text))' }"
          >
            <div v-if="wxLoginStore.isLoading" i-svg-spinners-90-ring-with-bg class="text-3xl" :style="{ color: 'var(--theme-primary)' }" />
            <span v-else class="text-sm" :style="{ color: 'var(--theme-text)' }">点击获取二维码</span>
          </div>

          <!-- 状态信息 -->
          <p class="text-center text-sm" :class="statusClass">
            {{ wxLoginStore.statusMessage }}
          </p>

          <!-- 错误信息 -->
          <p v-if="wxLoginStore.errorMessage" class="text-center text-sm text-red-600">
            {{ wxLoginStore.errorMessage }}
          </p>

          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <BaseButton
              variant="secondary"
              size="sm"
              :loading="wxLoginStore.isLoading"
              @click="loadQRCode"
            >
              刷新二维码
            </BaseButton>
          </div>
        </div>

        <!-- 说明文字 -->
        <div class="text-center text-xs opacity-60" :style="{ color: 'var(--theme-text)' }">
          使用微信扫描二维码登录，登录成功后将自动添加账号
        </div>
      </div>

      <!-- Settings Tab -->
      <div v-else class="p-4 space-y-4">
        <div class="space-y-4">
          <BaseInput
            v-model="wxLoginStore.config.apiBase"
            label="API地址"
            placeholder="http://127.0.0.1:8059/api"
          />
          <BaseInput
            v-model="wxLoginStore.config.apiKey"
            label="API Key（可选）"
            placeholder="留空使用本地登录，填写则使用代理登录"
          />
          <BaseInput
            v-model="wxLoginStore.config.proxyApiUrl"
            label="代理API地址"
            placeholder="https://api.aineishe.com/api/wxnc"
          />
        </div>

        <div class="flex justify-end pt-4">
          <BaseButton variant="primary" @click="saveConfig">
            保存设置
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>
