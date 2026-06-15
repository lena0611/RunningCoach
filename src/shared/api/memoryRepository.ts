import { createBlankTrainingMemory, normalizeTrainingMemory, type TrainingMemory } from '@/entities/training-memory/model'
import { requireSupabase } from '@/shared/api/supabase'

export async function fetchTrainingMemory(): Promise<TrainingMemory> {
  const supabase = requireSupabase()
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw userError ?? new Error('로그인이 필요합니다.')

  const { data, error } = await supabase.from('training_memory').select('memory').eq('user_id', userData.user.id).maybeSingle()
  if (error) throw error
  if (data?.memory) return normalizeTrainingMemory(data.memory as Partial<TrainingMemory>)

  // #332: 신규 사용자에게 개발자 예시 루틴(initialTrainingMemory) 대신 중립 메모리를 시드한다.
  // 온보딩이 weeklyPattern/처방/목표/부상을 사용자 값으로 채운다.
  const blank = createBlankTrainingMemory()
  await saveTrainingMemory(blank)
  return blank
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
