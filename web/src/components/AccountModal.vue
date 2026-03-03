<script setup lang="ts">
import { useIntervalFn } from '@vueuse/core'
import { computed, reactive, ref, watch } from 'vue'
import api from '@/api'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import BaseTextarea from '@/components/ui/BaseTextarea.vue'
import { useWxLoginStore } from '@/stores/wx-login'

const props = defineProps<{
  show: boolean
  editData?: any
}>()

const emit = defineEmits(['close', 'saved'])

const wxLoginStore = useWxLoginStore()

// 标签页：qq-qq扫码, wx-微信扫码, wx-config-微信配置, manual-手动填码
const activeTab = ref<'qq' | 'wx' | 'wx-config' | 'manual'>('qq')
const loading = ref(false)
const errorMessage = ref('')

// QQ扫码相关
const qqQrData = ref<{ image?: string, code: string, qrcode?: string, url?: string } | null>(null)
const qqQrStatus = ref('')

// 微信扫码相关
const wxAccountName = ref('')

// 表单数据
const form = reactive({
  name: '',
  code: '',
  platform: 'qq' as 'qq' | 'wx',
})

// QQ扫码轮询
const { pause: stopQQCheck, resume: startQQCheck } = useIntervalFn(async () => {
  if (!qqQrData.value)
    return
  try {
    const res = await api.post('/api/qr/check', { code: qqQrData.value.code })
    if (res.data.ok) {
      const status = res.data.data.status
      if (status === 'OK') {
        stopQQCheck()
        qqQrStatus.value = '登录成功'
        const { uin, code: authCode, nickname } = res.data.data
        const accName = form.name.trim() || nickname || (uin ? String(uin) : 'QQ账号')
        await addAccount({
          id: props.editData?.id,
          uin,
          code: authCode,
          loginType: 'qr',
          name: props.editData ? (props.editData.name || accName) : accName,
          platform: 'qq',
        })
      }
      else if (status === 'Used') {
        qqQrStatus.value = '二维码已失效'
        stopQQCheck()
      }
      else if (status === 'Wait') {
        qqQrStatus.value = '等待扫码'
      }
      else {
        qqQrStatus.value = `错误: ${res.data.data.error}`
      }
    }
  }
  catch (e) {
    console.error(e)
  }
}, 1000, { immediate: false })

// 微信扫码轮询
const { pause: stopWxCheck, resume: startWxCheck } = useIntervalFn(async () => {
  if (wxLoginStore.status !== 'qr_ready' && wxLoginStore.status !== 'confirming') {
    return
  }
  const result = await wxLoginStore.checkLogin()
  if (result.success && result.wxid) {
    stopWxCheck()
    // 获取Code并添加账号
    const codeResult = await wxLoginStore.getFarmCode()
    if (codeResult.success && codeResult.code) {
      const name = wxAccountName.value.trim() || result.nickname || `微信账号${Date.now()}`
      await addAccount({
        id: props.editData?.id,
        name: props.editData ? (props.editData.name || name) : name,
        code: codeResult.code,
        platform: 'wx',
        loginType: 'wx_qr',
        wxid: result.wxid,
      })
    }
  }
}, 2000, { immediate: false })

// 获取QQ二维码
async function loadQQQRCode() {
  if (activeTab.value !== 'qq')
    return
  loading.value = true
  qqQrStatus.value = '正在获取二维码'
  errorMessage.value = ''
  try {
    const res = await api.post('/api/qr/create')
    if (res.data.ok) {
      qqQrData.value = res.data.data
      qqQrStatus.value = '请使用手机QQ扫码'
      startQQCheck()
    }
    else {
      qqQrStatus.value = `获取失败: ${res.data.error}`
    }
  }
  catch (e) {
    qqQrStatus.value = '获取失败'
    console.error(e)
  }
  finally {
    loading.value = false
  }
}

// 获取微信二维码
async function loadWxQRCode() {
  if (activeTab.value !== 'wx')
    return
  wxLoginStore.resetState()
  const success = await wxLoginStore.getQRCode()
  if (success) {
    startWxCheck()
  }
}

// 保存微信配置
function saveWxConfig() {
  wxLoginStore.updateConfig({
    apiBase: wxLoginStore.config.apiBase,
    apiKey: wxLoginStore.config.apiKey,
    proxyApiUrl: wxLoginStore.config.proxyApiUrl,
  })
  activeTab.value = 'wx'
  loadWxQRCode()
}

// 添加账号
async function addAccount(data: any) {
  loading.value = true
  errorMessage.value = ''
  try {
    const res = await api.post('/api/accounts', data)
    if (res.data.ok) {
      emit('saved')
      close()
    }
    else {
      errorMessage.value = `保存失败: ${res.data.error}`
    }
  }
  catch (e: any) {
    errorMessage.value = `保存失败: ${e.response?.data?.error || e.message}`
  }
  finally {
    loading.value = false
  }
}

// 手动提交
async function submitManual() {
  errorMessage.value = ''
  if (!form.code) {
    errorMessage.value = '请输入Code'
    return
  }

  let code = form.code.trim()
  const match = code.match(/[?&]code=([^&]+)/i)
  if (match && match[1]) {
    code = decodeURIComponent(match[1])
    form.code = code
  }

  let payload: any = {}
  if (props.editData) {
    const onlyNameChanged = form.name !== props.editData.name
      && form.code === (props.editData.code || '')
      && form.platform === (props.editData.platform || 'qq')

    if (onlyNameChanged) {
      payload = { id: props.editData.id, name: form.name }
    }
    else {
      payload = {
        id: props.editData.id,
        name: form.name,
        code,
        platform: form.platform,
        loginType: 'manual',
      }
    }
  }
  else {
    payload = {
      name: form.name,
      code,
      platform: form.platform,
      loginType: 'manual',
    }
  }

  await addAccount(payload)
}

// QQ二维码图片
const qqQrImageSrc = computed(() => {
  if (!qqQrData.value)
    return ''
  if (qqQrData.value.image) {
    return qqQrData.value.image.startsWith('data:') ? qqQrData.value.image : `data:image/png;base64,${qqQrData.value.image}`
  }
  return qqQrData.value.qrcode || ''
})

// 判断是否为移动端
const isMobile = computed(() => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent))

// 打开QQ扫码登录链接
function openQRCodeLoginUrl() {
  if (!qqQrData.value?.url)
    return

  const url = qqQrData.value.url
  if (!isMobile.value) {
    window.open(url, '_blank')
    return
  }

  // 移动端深度链接跳转
  try {
    const b64 = btoa(decodeURIComponent(encodeURIComponent(url)))
    const qqDeepLink = `mqqapi://forward/url?url_prefix=${encodeURIComponent(b64)}&version=1&src_type=web`
    window.location.href = qqDeepLink
  }
  catch (e) {
    console.error('打开二维码登录链接失败:', e)
    window.location.href = url
  }
}

// 微信二维码图片
const wxQrImageSrc = computed(() => {
  if (!wxLoginStore.qrCode)
    return ''
  if (wxLoginStore.qrCode.startsWith('data:'))
    return wxLoginStore.qrCode
  if (wxLoginStore.qrCode.startsWith('http'))
    return wxLoginStore.qrCode
  return `data:image/png;base64,${wxLoginStore.qrCode}`
})

function close() {
  stopQQCheck()
  stopWxCheck()
  wxLoginStore.resetState()
  emit('close')
}

watch(() => props.show, (newVal) => {
  if (newVal) {
    errorMessage.value = ''
    if (props.editData) {
      activeTab.value = 'qq'
      form.name = props.editData.name || ''
      form.code = props.editData.code || ''
      form.platform = props.editData.platform || 'qq'
      wxAccountName.value = props.editData.name || ''
      loadQQQRCode()
    }
    else {
      activeTab.value = 'qq'
      form.name = ''
      form.code = ''
      form.platform = 'qq'
      wxAccountName.value = ''
      loadQQQRCode()
    }
  }
  else {
    stopQQCheck()
    stopWxCheck()
    qqQrData.value = null
    qqQrStatus.value = ''
    wxLoginStore.resetState()
  }
})

watch(activeTab, (tab) => {
  if (tab === 'qq') {
    loadQQQRCode()
  }
  else if (tab === 'wx') {
    loadWxQRCode()
  }
})
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
    <div class="max-h-[90vh] max-w-md w-full overflow-hidden rounded-lg shadow-xl" :style="{ background: 'var(--theme-bg)' }">
      <!-- Header -->
      <div class="flex items-center justify-between border-b p-4" :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 10%, transparent)' }">
        <h3 class="text-lg font-semibold" :style="{ color: 'var(--theme-text)' }">
          {{ editData ? '编辑账号' : '添加账号' }}
        </h3>
        <BaseButton variant="ghost" class="!p-1" @click="close">
          <div class="i-carbon-close text-xl" :style="{ color: 'var(--theme-text)' }" />
        </BaseButton>
      </div>

      <div class="max-h-[calc(90vh-80px)] overflow-y-auto p-4">
        <!-- 错误信息 -->
        <div v-if="errorMessage" class="mb-4 rounded p-3 text-sm" :style="{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }">
          {{ errorMessage }}
        </div>

        <!-- Tabs -->
        <div class="mb-4 flex border-b" :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 10%, transparent)' }">
          <button
            class="flex-1 py-2 text-center text-sm font-medium transition-colors"
            :class="activeTab === 'qq' ? 'border-b-2' : 'opacity-60'"
            :style="{
              color: activeTab === 'qq' ? 'var(--theme-primary)' : 'var(--theme-text)',
              borderColor: 'var(--theme-primary)',
            }"
            @click="activeTab = 'qq'"
          >
            QQ扫码
          </button>
          <button
            class="flex-1 py-2 text-center text-sm font-medium transition-colors"
            :class="activeTab === 'wx' ? 'border-b-2' : 'opacity-60'"
            :style="{
              color: activeTab === 'wx' ? 'var(--theme-primary)' : 'var(--theme-text)',
              borderColor: 'var(--theme-primary)',
            }"
            @click="activeTab = 'wx'"
          >
            微信扫码
          </button>
          <button
            class="flex-1 py-2 text-center text-sm font-medium transition-colors"
            :class="activeTab === 'wx-config' ? 'border-b-2' : 'opacity-60'"
            :style="{
              color: activeTab === 'wx-config' ? 'var(--theme-primary)' : 'var(--theme-text)',
              borderColor: 'var(--theme-primary)',
            }"
            @click="activeTab = 'wx-config'"
          >
            微信配置
          </button>
          <button
            class="flex-1 py-2 text-center text-sm font-medium transition-colors"
            :class="activeTab === 'manual' ? 'border-b-2' : 'opacity-60'"
            :style="{
              color: activeTab === 'manual' ? 'var(--theme-primary)' : 'var(--theme-text)',
              borderColor: 'var(--theme-primary)',
            }"
            @click="activeTab = 'manual'"
          >
            手动填码
          </button>
        </div>

        <!-- QQ扫码 Tab -->
        <div v-if="activeTab === 'qq'" class="space-y-4">
          <BaseInput
            v-model="form.name"
            label="账号备注（可选）"
            placeholder="留空使用QQ昵称"
          />

          <div class="flex flex-col items-center justify-center py-4 space-y-4">
            <div
              v-if="qqQrImageSrc"
              class="border rounded-lg bg-white p-2"
              :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 20%, transparent)' }"
            >
              <img :src="qqQrImageSrc" class="h-48 w-48">
            </div>
            <div
              v-else
              class="h-48 w-48 flex items-center justify-center rounded-lg"
              :style="{ background: 'color-mix(in srgb, var(--theme-bg) 90%, var(--theme-text))' }"
            >
              <div v-if="loading" i-svg-spinners-90-ring-with-bg class="text-3xl" :style="{ color: 'var(--theme-primary)' }" />
              <span v-else class="text-sm" :style="{ color: 'var(--theme-text)' }">二维码已过期</span>
            </div>

            <p class="text-center text-sm" :style="{ color: 'var(--theme-text)' }">
              {{ qqQrStatus }}
            </p>

            <div class="flex gap-2">
              <BaseButton variant="secondary" size="sm" @click="loadQQQRCode">
                刷新二维码
              </BaseButton>
              <BaseButton
                v-if="qqQrData?.url"
                variant="secondary"
                size="sm"
                class="md:hidden"
                @click="openQRCodeLoginUrl"
              >
                跳转QQ登录
              </BaseButton>
            </div>
          </div>

          <div class="text-center text-xs opacity-60" :style="{ color: 'var(--theme-text)' }">
            使用手机QQ扫描二维码登录
          </div>
        </div>

        <!-- 微信扫码 Tab -->
        <div v-if="activeTab === 'wx'" class="space-y-4">
          <BaseInput
            v-model="wxAccountName"
            label="账号备注（可选）"
            placeholder="留空使用微信昵称"
          />

          <div class="flex flex-col items-center justify-center py-4 space-y-4">
            <div
              v-if="wxQrImageSrc"
              class="border rounded-lg p-2"
              :style="{ borderColor: 'color-mix(in srgb, var(--theme-text) 20%, transparent)', background: '#fff' }"
            >
              <img :src="wxQrImageSrc" class="h-48 w-48">
            </div>
            <div
              v-else
              class="h-48 w-48 flex items-center justify-center rounded-lg"
              :style="{ background: 'color-mix(in srgb, var(--theme-bg) 90%, var(--theme-text))' }"
            >
              <div v-if="wxLoginStore.isLoading" i-svg-spinners-90-ring-with-bg class="text-3xl" :style="{ color: 'var(--theme-primary)' }" />
              <span v-else class="text-sm" :style="{ color: 'var(--theme-text)' }">点击获取二维码</span>
            </div>

            <p class="text-center text-sm" :style="{ color: 'var(--theme-text)' }">
              {{ wxLoginStore.statusMessage }}
            </p>

            <p v-if="wxLoginStore.errorMessage" class="text-center text-sm text-red-600">
              {{ wxLoginStore.errorMessage }}
            </p>

            <BaseButton variant="secondary" size="sm" :loading="wxLoginStore.isLoading" @click="loadWxQRCode">
              刷新二维码
            </BaseButton>
          </div>

          <div class="text-center text-xs opacity-60" :style="{ color: 'var(--theme-text)' }">
            使用微信扫描二维码登录，登录成功后将自动添加账号
          </div>
        </div>

        <!-- 微信配置 Tab -->
        <div v-if="activeTab === 'wx-config'" class="space-y-4">
          <BaseInput
            v-model="wxLoginStore.config.apiBase"
            label="后端API地址"
            placeholder="http://127.0.0.1:8059/api"
          />
          <p class="text-xs opacity-60" :style="{ color: 'var(--theme-text)' }">
            当前项目后端地址，默认：http://127.0.0.1:8059/api
          </p>

          <BaseInput
            v-model="wxLoginStore.config.apiKey"
            label="API Key（可选）"
            placeholder="留空使用本地API，填写则使用代理模式"
          />

          <BaseInput
            v-if="wxLoginStore.useProxyMode"
            v-model="wxLoginStore.config.proxyApiUrl"
            label="第三方API地址"
            placeholder="https://api.aineishe.com/api/wxnc"
          />

          <div v-if="wxLoginStore.useProxyMode" class="rounded bg-blue-50 p-2 text-xs text-blue-600">
            当前使用代理模式，请求将通过后端转发到第三方API
          </div>
          <div v-else class="rounded bg-gray-50 p-2 text-xs text-gray-500">
            当前使用本地API模式，直接请求本地服务
          </div>

          <div class="flex justify-end pt-4">
            <BaseButton variant="primary" @click="saveWxConfig">
              保存并返回
            </BaseButton>
          </div>
        </div>

        <!-- 手动填码 Tab -->
        <div v-if="activeTab === 'manual'" class="space-y-4">
          <BaseInput
            v-model="form.name"
            label="账号备注（可选）"
            placeholder="留空默认账号X"
          />

          <BaseTextarea
            v-model="form.code"
            label="Code"
            placeholder="请输入登录 Code"
            :rows="3"
          />

          <div v-if="!editData" class="flex gap-4">
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="form.platform"
                type="radio"
                value="qq"
                class="h-4 w-4"
                :style="{ accentColor: 'var(--theme-primary)' }"
              >
              <span class="text-sm" :style="{ color: 'var(--theme-text)' }">QQ小程序</span>
            </label>
            <label class="flex cursor-pointer items-center gap-2">
              <input
                v-model="form.platform"
                type="radio"
                value="wx"
                class="h-4 w-4"
                :style="{ accentColor: 'var(--theme-primary)' }"
              >
              <span class="text-sm" :style="{ color: 'var(--theme-text)' }">微信小程序</span>
            </label>
          </div>

          <div class="flex justify-end gap-2 pt-4">
            <BaseButton variant="outline" @click="close">
              取消
            </BaseButton>
            <BaseButton variant="primary" :loading="loading" @click="submitManual">
              {{ editData ? '保存' : '添加' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
