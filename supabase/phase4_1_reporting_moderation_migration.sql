-- Vice City Central Phase 4.1: private reporting and moderation queue.
-- Run once in Supabase SQL Editor after Phase 3.6 is working.
-- This migration does NOT automatically grant anyone admin access.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'moderator')),
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

create or replace function public.has_moderation_role()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = (select auth.uid())
      and ur.role in ('admin', 'moderator')
  );
$$;

revoke all on function public.has_moderation_role() from public, anon;
grant execute on function public.has_moderation_role() to authenticated;

drop policy if exists "Members can view their own moderation role" on public.user_roles;
create policy "Members can view their own moderation role"
on public.user_roles for select
to authenticated
using (user_id = (select auth.uid()) or public.has_moderation_role());

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users (id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment')),
  -- Keep target IDs without cascading FKs so report/audit history survives content deletion.
  post_id uuid,
  comment_id uuid,
  reason text not null check (reason in ('spam', 'harassment', 'hate_or_abuse', 'sexual_content', 'violence', 'misinformation', 'copyright', 'other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),
  moderator_note text check (moderator_note is null or char_length(moderator_note) <= 1000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reports_target_matches_type check (
    (target_type = 'post' and post_id is not null and comment_id is null)
    or (target_type = 'comment' and post_id is null and comment_id is not null)
  )
);

create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);
create unique index if not exists reports_one_post_report_per_member
  on public.reports (reporter_id, post_id) where post_id is not null;
create unique index if not exists reports_one_comment_report_per_member
  on public.reports (reporter_id, comment_id) where comment_id is not null;

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
grant insert (reporter_id, target_type, post_id, comment_id, reason, details) on public.reports to authenticated;
grant update (status, reviewed_by, reviewed_at, moderator_note) on public.reports to authenticated;

drop policy if exists "Members can submit reports about other members content" on public.reports;
create policy "Members can submit reports about other members content"
on public.reports for insert
to authenticated
with check (
  reporter_id = (select auth.uid())
  and (
    (
      target_type = 'post'
      and post_id is not null
      and comment_id is null
      and exists (
        select 1 from public.posts p
        where p.id = reports.post_id
          and p.status = 'published'
          and p.author_id <> (select auth.uid())
      )
    )
    or
    (
      target_type = 'comment'
      and comment_id is not null
      and post_id is null
      and exists (
        select 1
        from public.comments c
        join public.posts p on p.id = c.post_id
        where c.id = reports.comment_id
          and c.status = 'published'
          and c.author_id <> (select auth.uid())
          and p.status = 'published'
      )
    )
  )
);

drop policy if exists "Members and moderators can view permitted reports" on public.reports;
create policy "Members and moderators can view permitted reports"
on public.reports for select
to authenticated
using (reporter_id = (select auth.uid()) or public.has_moderation_role());

drop policy if exists "Moderators can update report decisions" on public.reports;
create policy "Moderators can update report decisions"
on public.reports for update
to authenticated
using (public.has_moderation_role())
with check (public.has_moderation_role());

-- No client-side role assignment, report deletion, or direct content moderation in Phase 4.1.
-- Grant an initial administrator manually from the SQL Editor using the bootstrap query in README_PHASE4_1.txt.
