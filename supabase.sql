-- 热量账本 · Supabase 初始化脚本
-- 在 Supabase 控制台 → SQL Editor 中整段执行一次即可

-- 记录表：饮食与运动统一存放
create table if not exists public.records (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  record_date date not null,
  type        text not null check (type in ('meal', 'exercise')),
  meal        text,
  name        text not null,
  kcal        numeric not null check (kcal >= 0),
  detail      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists idx_records_user_date
  on public.records (user_id, record_date);

-- 行级安全：每个用户只能读写自己的记录
alter table public.records enable row level security;

drop policy if exists "records_select_own" on public.records;
create policy "records_select_own" on public.records
  for select using (auth.uid() = user_id);

drop policy if exists "records_insert_own" on public.records;
create policy "records_insert_own" on public.records
  for insert with check (auth.uid() = user_id);

drop policy if exists "records_update_own" on public.records;
create policy "records_update_own" on public.records
  for update using (auth.uid() = user_id);

drop policy if exists "records_delete_own" on public.records;
create policy "records_delete_own" on public.records
  for delete using (auth.uid() = user_id);
