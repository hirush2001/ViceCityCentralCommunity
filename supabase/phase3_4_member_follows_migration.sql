-- Vice City Central Phase 3.4: member following relationships
-- Run once in Supabase Dashboard > SQL Editor.
-- Following lists are public; each signed-in member can create/remove only their own follows.

create table if not exists public.member_follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint member_follows_no_self_follow check (follower_id <> following_id),
  primary key (follower_id, following_id)
);

create index if not exists member_follows_following_id_idx
  on public.member_follows (following_id, created_at desc);

create index if not exists member_follows_follower_id_idx
  on public.member_follows (follower_id, created_at desc);

alter table public.member_follows enable row level security;

-- Public counts and public follower/following lists.
drop policy if exists "Following relationships are publicly viewable" on public.member_follows;
create policy "Following relationships are publicly viewable"
on public.member_follows for select
to anon, authenticated
using (true);

-- The authenticated member can only follow as themselves.
drop policy if exists "Members can follow as themselves" on public.member_follows;
create policy "Members can follow as themselves"
on public.member_follows for insert
to authenticated
with check (
  auth.uid() = follower_id
  and follower_id <> following_id
);

-- A member can only remove a follow relationship they initiated.
drop policy if exists "Members can unfollow as themselves" on public.member_follows;
create policy "Members can unfollow as themselves"
on public.member_follows for delete
to authenticated
using (auth.uid() = follower_id);

grant select on public.member_follows to anon, authenticated;
grant insert, delete on public.member_follows to authenticated;
