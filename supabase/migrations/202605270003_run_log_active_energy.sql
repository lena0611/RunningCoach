alter table public.run_logs
  add column if not exists active_energy_kcal numeric;
