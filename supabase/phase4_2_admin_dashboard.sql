-- VICE CITY CENTRAL — PHASE 4.2 ADMIN DASHBOARD
-- Prerequisite: Phase 4.1 reporting migration has been applied.
-- This migration is safe to run again.
-- It intentionally does not depend on Phase 4.3 member_moderation tables.

create or replace function public.get_admin_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if (select auth.uid()) is null or not public.has_moderation_role() then
    raise exception 'Administrator or moderator access required.';
  end if;

  return jsonb_build_object(
    'members', (select count(*) from public.profiles),
    'published_posts', (select count(*) from public.posts where status = 'published'),
    'published_comments', (select count(*) from public.comments where status = 'published'),
    'likes', (select count(*) from public.post_likes),
    'polls', (select count(*) from public.polls),
    'pending_reports', (select count(*) from public.reports where status = 'pending'),
    'reviewing_reports', (select count(*) from public.reports where status = 'reviewing'),
    'resolved_reports', (select count(*) from public.reports where status = 'resolved'),
    'dismissed_reports', (select count(*) from public.reports where status = 'dismissed')
  );
end;
$$;

revoke all on function public.get_admin_dashboard_stats() from public, anon;
grant execute on function public.get_admin_dashboard_stats() to authenticated;
