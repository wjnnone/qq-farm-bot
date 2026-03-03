import { defineStore } from 'pinia'
import { ref } from 'vue'
import api from '@/api'

export interface Land {
  id: number
  plantName?: string
  phaseName?: string
  seedImage?: string
  status: string
  matureInSec: number
  needWater?: boolean
  needWeed?: boolean
  needBug?: boolean
  [key: string]: any
}

export const useFarmStore = defineStore('farm', () => {
  const lands = ref<Land[]>([])
  const seeds = ref<any[]>([])
  const summary = ref<any>({})
  const loading = ref(false)

  async function fetchLands(accountId: string) {
    if (!accountId)
      return
    loading.value = true
    try {
      const { data } = await api.get('/api/lands', {
        headers: { 'x-account-id': accountId },
      })
      if (data && data.ok) {
        lands.value = data.data.lands || []
        summary.value = data.data.summary || {}
      }
    }
    finally {
      loading.value = false
    }
  }

  async function fetchSeeds(accountId: string) {
    if (!accountId)
      return
    const { data } = await api.get('/api/seeds', {
      headers: { 'x-account-id': accountId },
    })
    if (data && data.ok)
      seeds.value = data.data || []
  }

  async function operate(accountId: string, opType: string) {
    if (!accountId)
      return
    await api.post('/api/farm/operate', { opType }, {
      headers: { 'x-account-id': accountId },
    })
    await fetchLands(accountId)
  }

  return { lands, summary, seeds, loading, fetchLands, fetchSeeds, operate }
})
