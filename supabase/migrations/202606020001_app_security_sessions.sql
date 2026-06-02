create table if not exists public.app_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  device_token_hash text,
  verification_method text not null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);

create index if not exists app_sessions_user_expires_idx
  on public.app_sessions(user_id, expires_at desc);

create table if not exists public.edge_function_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  function_name text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, function_name, window_start)
);

alter table public.app_sessions enable row level security;
alter table public.edge_function_rate_limits enable row level security;

create or replace function public.consume_edge_function_rate_limit(
  p_user_id uuid,
  p_function_name text,
  p_window_start timestamptz,
  p_limit integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.edge_function_rate_limits (
    user_id,
    function_name,
    window_start,
    request_count,
    updated_at
  )
  values (
    p_user_id,
    p_function_name,
    p_window_start,
    1,
    now()
  )
  on conflict (user_id, function_name, window_start)
  do update set
    request_count = public.edge_function_rate_limits.request_count + 1,
    updated_at = now()
  returning request_count into new_count;

  return new_count;
end;
$$;

revoke all on function public.consume_edge_function_rate_limit(uuid, text, timestamptz, integer) from public;
