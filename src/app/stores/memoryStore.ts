import { defineStore } from 'pinia'
import { createBlankTrainingMemory, normalizeTrainingMemory, type TrainingMemory } from '@/entities/training-memory/model'
import { isSupabaseConfigured } from '@/shared/api/supabase'
import { fetchTrainingMemory, saveTrainingMemory } from '@/shared/api/memoryRepository'

const storageKey = 'runcontext.trainingMemory'
const usersStorageKey = 'runcontext.users'

export type RunContextUser = {
  id: string
  name: string
  memory: TrainingMemory
  createdAt: string
  updatedAt: string
}

export const useMemoryStore = defineStore('memoryStore', {
  state: () => ({
    users: loadUsers(),
    selectedUserId: loadSelectedUserId(),
    loading: false,
    loaded: false,
    error: ''
  }),
  getters: {
    selectedUser: (state): RunContextUser => {
      const selected = state.users.find((user) => user.id === state.selectedUserId)
      return selected ?? state.users[0]
    },
    memory(): TrainingMemory {
      return this.selectedUser.memory
    }
  },
  actions: {
    async load() {
      this.loading = true
      this.error = ''
      try {
        if (isSupabaseConfigured) {
          const memory = await fetchTrainingMemory()
          const user = this.selectedUser
          user.memory = memory
          user.updatedAt = new Date().toISOString()
        }
      } catch (err) {
        this.error = err instanceof Error ? err.message : 'TrainingMemory를 불러오지 못했습니다.'
      } finally {
        this.loading = false
        this.loaded = true
      }
    },
    selectUser(userId: string) {
      if (!this.users.some((user) => user.id === userId)) return
      this.selectedUserId = userId
      persistSelectedUserId(userId)
    },
    addUser(name: string, goal: string) {
      const now = new Date().toISOString()
      // #332: 새 사용자도 개발자 예시 루틴이 아니라 중립 메모리에서 시작한다.
      const memory = createBlankTrainingMemory()
      if (goal.trim()) memory.goal = goal.trim()
      const user: RunContextUser = {
        id: crypto.randomUUID(),
        name: name.trim() || '새 사용자',
        memory,
        createdAt: now,
        updatedAt: now
      }
      this.users.push(user)
      this.selectedUserId = user.id
      this.persist()
      persistSelectedUserId(user.id)
      return user
    },
    updateSelectedUserName(name: string) {
      const user = this.selectedUser
      user.name = name.trim() || user.name
      user.updatedAt = new Date().toISOString()
      this.persist()
    },
    async update(memory: TrainingMemory) {
      const user = this.selectedUser
      user.memory = normalizeTrainingMemory(memory)
      user.updatedAt = new Date().toISOString()
      if (isSupabaseConfigured) {
        await saveTrainingMemory(user.memory)
      }
      this.persist()
      localStorage.setItem(storageKey, JSON.stringify(user.memory))
    },
    persist() {
      localStorage.setItem(usersStorageKey, JSON.stringify(this.users))
    }
  }
})

function loadUsers(): RunContextUser[] {
  try {
    const raw = localStorage.getItem(usersStorageKey)
    if (raw) {
      const parsed = JSON.parse(raw) as RunContextUser[]
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.map((user) => ({
          ...user,
          memory: normalizeTrainingMemory(user.memory)
        }))
      }
    }
  } catch {
    // fall through to legacy migration
  }

  const now = new Date().toISOString()
  const legacyMemory = loadLegacyMemory()
  const defaultUser: RunContextUser = {
    id: 'default',
    name: '기본 사용자',
    memory: legacyMemory,
    createdAt: now,
    updatedAt: now
  }
  localStorage.setItem(usersStorageKey, JSON.stringify([defaultUser]))
  persistSelectedUserId(defaultUser.id)
  return [defaultUser]
}

function loadSelectedUserId(): string {
  return localStorage.getItem('runcontext.selectedUserId') || 'default'
}

function persistSelectedUserId(userId: string) {
  localStorage.setItem('runcontext.selectedUserId', userId)
}

function loadLegacyMemory(): TrainingMemory {
  try {
    const raw = localStorage.getItem(storageKey)
    // #332: 로컬 메모리가 없으면 개발자 예시 루틴이 아니라 중립 메모리로 시작한다.
    return raw ? normalizeTrainingMemory(JSON.parse(raw)) : createBlankTrainingMemory()
  } catch {
    return createBlankTrainingMemory()
  }
}
