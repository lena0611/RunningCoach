import { initialTrainingMemory, normalizeTrainingMemory, type TrainingMemory } from '@/entities/training-memory/model'
import { requireSupabase } from '@/shared/api/supabase'

export async function fetchTrainingMemory(): Promise<TrainingMemory> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase.from('training_memory').select('memory').eq('user_id', userData.user.id).maybeSingle()
  if (error) throw error
  if (data?.memory) return normalizeTrainingMemory(data.memory as Partial<TrainingMemory>)

  await saveTrainingMemory(initialTrainingMemory)
  return normalizeTrainingMemory(initialTrainingMemory)
}

export async function saveTrainingMemory(memory: TrainingMemory) {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { error } = await supabase.from('training_memory').upsert({
    user_id: userData.user.id,
    memory,
    updated_at: new Date().toISOString()
  })
  if (error) throw error
}
