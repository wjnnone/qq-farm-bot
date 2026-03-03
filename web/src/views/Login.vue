<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseInput from '@/components/ui/BaseInput.vue'
import { useUserStore } from '@/stores/user'

const router = useRouter()
const userStore = useUserStore()

const isLogin = ref(true)
const username = ref('')
const password = ref('')
const cardCode = ref('')
const error = ref('')
const success = ref('')
const loading = ref(false)

async function handleSubmit() {
  loading.value = true
  error.value = ''
  success.value = ''

  try {
    if (isLogin.value) {
      // 登录
      const result = await userStore.login(username.value, password.value)
      if (result.ok) {
        router.push('/')
      }
      else {
        error.value = result.error || '登录失败'
      }
    }
    else {
      // 注册
      if (!cardCode.value) {
        error.value = '请输入卡密'
        loading.value = false
        return
      }
      const result = await userStore.register(username.value, password.value, cardCode.value)
      if (result.ok) {
        success.value = '注册成功，请登录'
        isLogin.value = true
        cardCode.value = ''
      }
      else {
        error.value = result.error || '注册失败'
      }
    }
  }
  catch (e: any) {
    error.value = e.response?.data?.error || e.message || '操作异常'
  }
  finally {
    loading.value = false
  }
}

function toggleMode() {
  isLogin.value = !isLogin.value
  error.value = ''
  success.value = ''
}
</script>

<template>
  <div class="h-screen w-screen flex items-center justify-center" :style="{ background: 'var(--theme-bg)' }">
    <div class="max-w-md w-full rounded-xl p-8 shadow-lg space-y-6" :style="{ background: 'color-mix(in srgb, var(--theme-bg) 95%, white)' }">
      <div class="mb-8 py-4 text-center">
        <h1 class="text-3xl font-bold tracking-tight" :style="{ color: 'var(--theme-text)' }">
          农场智能助手
        </h1>
        <p class="mt-3 text-sm tracking-widest uppercase" :style="{ color: 'var(--theme-primary)' }">
          {{ isLogin ? '管理面板' : '用户注册' }}
        </p>
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label class="mb-1 block text-sm font-medium" :style="{ color: 'var(--theme-text)' }">
            用户名
          </label>
          <BaseInput
            id="username"
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            required
          />
        </div>

        <div>
          <label class="mb-1 block text-sm font-medium" :style="{ color: 'var(--theme-text)' }">
            密码
          </label>
          <BaseInput
            id="password"
            v-model="password"
            type="password"
            placeholder="请输入密码"
            required
          />
        </div>

        <div v-if="!isLogin">
          <label class="mb-1 block text-sm font-medium" :style="{ color: 'var(--theme-text)' }">
            卡密
          </label>
          <BaseInput
            id="cardCode"
            v-model="cardCode"
            type="text"
            placeholder="请输入卡密"
            :required="!isLogin"
          />
          <p class="mt-1 text-xs" :style="{ color: 'var(--theme-primary)' }">
            请输入有效的卡密进行注册
          </p>
        </div>

        <div v-if="error" class="rounded bg-red-50 p-2 text-sm text-red-600 dark:bg-red-900/20">
          {{ error }}
        </div>

        <div v-if="success" class="rounded bg-green-50 p-2 text-sm text-green-600 dark:bg-green-900/20">
          {{ success }}
        </div>

        <BaseButton
          type="submit"
          variant="primary"
          block
          :loading="loading"
        >
          {{ isLogin ? '登录' : '注册' }}
        </BaseButton>
      </form>

      <div class="text-center">
        <button
          type="button"
          class="text-sm hover:opacity-80"
          :style="{ color: 'var(--theme-primary)' }"
          @click="toggleMode"
        >
          {{ isLogin ? '没有账号？立即注册' : '已有账号？立即登录' }}
        </button>
      </div>
    </div>
  </div>
</template>
