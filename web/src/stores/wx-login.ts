import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useUserStore } from './user'

export interface WxLoginConfig {
  enabled: boolean
  apiBase: string
  apiKey: string
  proxyApiUrl: string
  appId: string
  autoAddAccount: boolean
  userIsolation: boolean
}

export const useWxLoginStore = defineStore('wx-login', () => {
  // 默认配置
  const defaultConfig: WxLoginConfig = {
    enabled: true,
    apiBase: 'http://127.0.0.1:8059/api',
    apiKey: '',
    proxyApiUrl: 'https://api.aineishe.com/api/wxnc',
    appId: 'wx5306c5978fdb76e4',
    autoAddAccount: true,
    userIsolation: true,
  }

  // 获取当前用户ID
  const userStore = useUserStore()
  const currentUserId = computed(() => userStore.username || 'default')

  // 使用 ref 存储配置
  const rawConfig = ref<WxLoginConfig>({ ...defaultConfig })

  // 初始化时从服务器加载
  async function loadConfig() {
    await loadConfigFromServer()
  }

  // 从服务器加载配置
  async function loadConfigFromServer() {
    try {
      const response = await fetch('/api/user/wxlogin-config', {
        headers: {
          'x-admin-token': localStorage.getItem('admin_token') || '',
        },
      })
      const result = await response.json()
      if (result.ok && result.config) {
        // 合并服务器配置（服务器配置优先）
        rawConfig.value = { ...defaultConfig, ...result.config }
      }
      else {
        rawConfig.value = { ...defaultConfig }
      }
    }
    catch (e) {
      console.error('从服务器加载配置失败:', e)
      rawConfig.value = { ...defaultConfig }
    }
  }

  // 初始化加载
  loadConfig()

  // 合并配置：确保新字段有默认值
  const config = computed<WxLoginConfig>(() => ({
    ...defaultConfig,
    ...rawConfig.value,
  }))

  // 扫码登录状态
  const isLoading = ref(false)
  const qrCode = ref<string | null>(null)
  const uuid = ref('')
  const wxid = ref('')
  const status = ref<'idle' | 'qr_loading' | 'qr_ready' | 'scanning' | 'confirming' | 'success' | 'error'>('idle')
  const statusMessage = ref('')
  const errorMessage = ref('')

  // 获取二维码接口地址
  const qrEndpoint = 'LoginGetQRCar'

  // 更新配置
  async function updateConfig(newConfig: Partial<WxLoginConfig>) {
    rawConfig.value = { ...rawConfig.value, ...newConfig }
    await syncConfigToServer()
  }

  // 同步配置到服务器
  async function syncConfigToServer() {
    try {
      await fetch('/api/user/wxlogin-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': localStorage.getItem('admin_token') || '',
        },
        body: JSON.stringify(rawConfig.value),
      })
    }
    catch (e) {
      console.error('同步配置到服务器失败:', e)
    }
  }

  // 重置登录状态
  function resetState() {
    qrCode.value = null
    uuid.value = ''
    wxid.value = ''
    status.value = 'idle'
    statusMessage.value = ''
    errorMessage.value = ''
  }

  // 判断是否需要使用代理模式（api_key 不为空）
  const useProxyMode = computed(() => !!config.value.apiKey)

  // 获取代理API URL（确保有默认值）
  const proxyApiUrl = computed(() => config.value.proxyApiUrl || defaultConfig.proxyApiUrl)

  // 获取二维码
  async function getQRCode(): Promise<boolean> {
    isLoading.value = true
    status.value = 'qr_loading'
    statusMessage.value = '正在获取二维码...'
    errorMessage.value = ''

    try {
      let data: any

      if (useProxyMode.value) {
        // 使用代理模式（vxcode 逻辑）- 请求本地后端代理接口
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-api-key': config.value.apiKey,
            'x-proxy-api-url': proxyApiUrl.value,
          },
          body: JSON.stringify({ action: 'getqr' }),
        })
        const result = await response.json()
        if (result.code === 0 && result.data) {
          data = {
            Success: true,
            Data: {
              Uuid: result.data.Uuid,
              QrBase64: result.data.QrBase64,
            },
          }
        }
        else {
          data = { Success: false, Message: result.msg || '获取二维码失败' }
        }
      }
      else {
        // 使用本地 API 模式（原有逻辑）
        const response = await fetch(`${config.value.apiBase}/Login/${qrEndpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        })
        data = await response.json()
      }

      if (data.Success && data.Data) {
        uuid.value = data.Data.Uuid
        qrCode.value = data.Data.QrBase64 || data.Data.qrBase64 || ''
        status.value = 'qr_ready'
        statusMessage.value = '请使用微信扫码登录'
        return true
      }
      else {
        status.value = 'error'
        errorMessage.value = data.Message || '获取二维码失败'
        return false
      }
    }
    catch (e: any) {
      status.value = 'error'
      errorMessage.value = `请求失败: ${e.message}`
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  // 检查登录状态
  async function checkLogin(): Promise<{ success: boolean, wxid?: string, nickname?: string }> {
    if (!uuid.value) {
      return { success: false }
    }

    status.value = 'scanning'
    statusMessage.value = '正在检查登录状态...'

    try {
      let data: any

      if (useProxyMode.value) {
        // 使用代理模式（vxcode 逻辑）- 请求本地后端代理接口
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-api-key': config.value.apiKey,
            'x-proxy-api-url': proxyApiUrl.value,
          },
          body: JSON.stringify({ action: 'checkqr', uuid: uuid.value }),
        })
        const result = await response.json()
        // 尝试从不同字段获取wxid
        const wxid = result.data?.wxid || result.data?.Wxid || result.data?.userName || ''
        const nickname = result.data?.nickname || result.data?.Nickname || result.data?.nickName || '微信用户'

        if (result.code === 0 && wxid) {
          // 真正登录成功（有wxid）
          data = {
            Success: true,
            Data: {
              acctSectResp: {
                userName: wxid,
                nickName: nickname,
              },
            },
          }
        }
        else if (result.code === -1 || result.code === -2 || (result.code === 0 && !wxid)) {
          // 等待扫码或等待确认，不是错误
          // 注意：有些API在code===0但wxid为空时也表示等待中
          data = {
            Success: true,
            Data: {
              status: result.code === -2 ? 1 : 0, // -2表示已扫码待确认，-1表示等待扫码
            },
          }
        }
        else {
          data = { Success: false, Message: result.msg || '登录检查失败' }
        }
      }
      else {
        // 使用本地 API 模式（原有逻辑）
        const response = await fetch(`${config.value.apiBase}/Login/LoginCheckQR?uuid=${uuid.value}`, {
          method: 'POST',
        })
        data = await response.json()
      }

      const acctResp = data?.Data?.acctSectResp || data?.Data?.AcctSectResp
      const userName = acctResp?.userName || acctResp?.UserName
      const nickName = acctResp?.nickName || acctResp?.NickName || '微信用户'
      const qrStatus = data?.Data?.status

      if (data.Success && userName) {
        wxid.value = userName
        status.value = 'success'
        statusMessage.value = `登录成功！欢迎 ${nickName}`
        return { success: true, wxid: userName, nickname: nickName }
      }
      else if (data.Success && (qrStatus === 1 || qrStatus === 0)) {
        status.value = qrStatus === 1 ? 'confirming' : 'qr_ready'
        statusMessage.value = qrStatus === 1 ? '已扫码，请在手机确认登录' : '等待扫码中'
        return { success: false }
      }
      else {
        status.value = 'error'
        errorMessage.value = data.Message || '登录检查失败'
        return { success: false }
      }
    }
    catch (e: any) {
      status.value = 'error'
      errorMessage.value = `请求失败: ${e.message}`
      return { success: false }
    }
  }

  // 获取QQ农场Code
  async function getFarmCode(wxidParam?: string): Promise<{ success: boolean, code?: string }> {
    const targetWxid = wxidParam || wxid.value
    if (!targetWxid) {
      return { success: false }
    }

    isLoading.value = true
    statusMessage.value = '正在获取QQ农场Code...'

    try {
      let data: any

      if (useProxyMode.value) {
        // 使用代理模式（vxcode 逻辑）- 请求本地后端代理接口
        const response = await fetch('/api/proxy', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-proxy-api-key': config.value.apiKey,
            'x-proxy-api-url': proxyApiUrl.value,
          },
          body: JSON.stringify({ action: 'jslogin', wxid: targetWxid }),
        })
        const result = await response.json()
        if (result.code === 0 && result.data) {
          data = {
            Success: true,
            Data: {
              code: result.data.code,
            },
          }
        }
        else {
          data = { Success: false, Message: result.msg || '获取Code失败' }
        }
      }
      else {
        // 使用本地 API 模式（原有逻辑）
        const response = await fetch(`${config.value.apiBase}/Wxapp/JSLogin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Wxid: wxid.value,
            Appid: config.value.appId,
          }),
        })
        data = await response.json()
      }

      if (data.Success && data.Data && data.Data.code) {
        return { success: true, code: data.Data.code }
      }
      else {
        const errMsg = data.Data?.jsapiBaseresponse?.errmsg || data.Message || '获取Code失败'
        errorMessage.value = errMsg
        return { success: false }
      }
    }
    catch (e: any) {
      errorMessage.value = `请求失败: ${e.message}`
      return { success: false }
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    config,
    isLoading,
    qrCode,
    uuid,
    wxid,
    status,
    statusMessage,
    errorMessage,
    qrEndpoint,
    currentUserId,
    useProxyMode,
    updateConfig,
    resetState,
    getQRCode,
    checkLogin,
    getFarmCode,
    loadConfigFromServer,
  }
})
