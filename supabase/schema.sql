-- Top 10 Geo — Supabase schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query) once,
-- after creating your Supabase project.

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per signed-in user. Created automatically on signup via the trigger
-- below. This is where score/streak/premium status live server-side, instead
-- of only in browser localStorage.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  score integer not null default 0,
  streak integer not null default 0,
  best_streak integer not null default 0,
  last_seen_level integer not null default 1,

  premium boolean not null default false,
  premium_source text,                 -- 'trial' | 'monthly' | 'annual' | 'lifetime' | null
  trial_used boolean not null default false,
  trial_ends_at timestamptz,
  lifetime boolean not null default false,

  stripe_customer_id text,
  stripe_subscription_id text,

  shield_date date,                    -- last date the daily Streak Shield was used
  practice_date date,                  -- last date practice_count was reset
  practice_count integer not null default 0,

  duel_p1_wins integer not null default 0,
  duel_p2_wins integer not null default 0,
  duel_ties integer not null default 0,

  seen_badges text[] not null default '{}',
  daily_date date,                     -- last date the free daily question was completed
  daily_question_id integer,
  daily_completed boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── round_history ───────────────────────────────────────────────────────────
-- One row per completed/abandoned round. Powers "Your Top Rounds" and badges.
create table if not exists public.round_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  question_id integer not null,
  title text not null,
  icon text,
  difficulty text not null,
  found_count integer not null,
  total integer not null,
  completed_all boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists round_history_user_id_idx on public.round_history(user_id);

-- ── auto-create a profile row when someone signs up ────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── keep updated_at fresh ───────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_updated_at();

-- ── Row Level Security ──────────────────────────────────────────────────────
-- Users can only ever read/update their OWN row. Nobody can read anyone
-- else's score, premium status, or history. The service-role key (used only
-- in serverless functions, never shipped to the browser) bypasses RLS for
-- the Stripe webhook, which needs to update a user's premium status.
alter table public.profiles enable row level security;
alter table public.round_history enable row level security;

drop policy if exists "profiles: read own row" on public.profiles;
create policy "profiles: read own row"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles: update own row" on public.profiles;
create policy "profiles: update own row"
  on public.profiles for update
  using (auth.uid() = id);

drop policy if exists "round_history: read own rows" on public.round_history;
create policy "round_history: read own rows"
  on public.round_history for select
  using (auth.uid() = user_id);

drop policy if exists "round_history: insert own rows" on public.round_history;
create policy "round_history: insert own rows"
  on public.round_history for insert
  with check (auth.uid() = user_id);
