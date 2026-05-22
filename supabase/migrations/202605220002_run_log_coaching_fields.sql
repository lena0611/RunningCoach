alter table public.run_logs
  add column if not exists session_title text not null default '',
  add column if not exists humidity numeric,
  add column if not exists wind_mps numeric,
  add column if not exists elevation_gain_m numeric,
  add column if not exists elevation_loss_m numeric,
  add column if not exists course_type text not null default 'Unknown',
  add column if not exists workout_feeling text not null default '',
  add column if not exists pain_note text not null default '',
  add column if not exists sleep_quality numeric,
  add column if not exists condition_score numeric,
  add column if not exists stress_level numeric,
  add column if not exists companion text not null default '';
