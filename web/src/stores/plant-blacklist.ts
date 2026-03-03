import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'
import { useAccountStore } from './account'

export interface PlantBlacklistItem {
  seedId: number
  name: string
}

export const usePlantBlacklistStore = defineStore('plant-blacklist', () => {
  const blacklist = ref<number[]>([])
  const loading = ref(false)

  async function fetchBlacklist() {
    const accountStore = useAccountStore()
    const accountId = accountStore.currentAccountId
    if (!accountId)
      return
    try {
      const res = await api.get('/api/plant-blacklist', {
        headers: { 'x-account-id': accountId },
      })
      if (res.data.ok) {
        blacklist.value = res.data.data || []
      }
    }
    catch { /* ignore */ }
  }

  async function addToBlacklist(seedId: number) {
    const accountStore = useAccountStore()
    const accountId = accountStore.currentAccountId
    if (!accountId)
      return
    const res = await api.post('/api/plant-blacklist', { seedId }, {
      headers: { 'x-account-id': accountId },
    })
    if (res.data.ok) {
      blacklist.value = res.data.data || []
    }
  }

  async function removeFromBlacklist(seedId: number) {
    const accountStore = useAccountStore()
    const accountId = accountStore.currentAccountId
    if (!accountId)
      return
    const res = await api.delete(`/api/plant-blacklist/${seedId}`, {
      headers: { 'x-account-id': accountId },
    })
    if (res.data.ok) {
      blacklist.value = res.data.data || []
    }
  }

  async function toggleBlacklist(seedId: number) {
    if (blacklist.value.includes(seedId)) {
      await removeFromBlacklist(seedId)
    }
    else {
      await addToBlacklist(seedId)
    }
  }

  function isBlacklisted(seedId: number) {
    return blacklist.value.includes(seedId)
  }

  return {
    blacklist,
    loading,
    fetchBlacklist,
    addToBlacklist,
    removeFromBlacklist,
    toggleBlacklist,
    isBlacklisted,
  }
})
