-- Vice City Central Phase 3.2: public member avatars
-- Run once in Supabase Dashboard > SQL Editor.
-- Creates a public avatar bucket with per-member upload/update/delete access.

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Avatar images are intended to be public profile assets.
drop policy if exists "Public avatar images are viewable" on storage.objects;
create policy "Public avatar images are viewable"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'avatars');

-- A member may upload only into the folder named with their own auth user ID.
drop policy if exists "Members can upload their own avatar" on storage.objects;
create policy "Members can upload their own avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Upsert requires update permission when a member replaces their current avatar.
drop policy if exists "Members can update their own avatar" on storage.objects;
create policy "Members can update their own avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Members can delete their own avatar" on storage.objects;
create policy "Members can delete their own avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);
