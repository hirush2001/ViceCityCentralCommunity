-- Vice City Central: Phase 2 database schema
-- Run this entire file once in Supabase Dashboard > SQL Editor.
-- This script uses Row Level Security (RLS); do not disable RLS on these tables.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (char_length(username) between 3 and 24)
    check (username ~ '^[a-zA-Z0-9_]+$'),
  display_name text not null default 'New member'
    check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  body text not null check (char_length(body) between 10 and 3000),
  category text not null check (category in ('Theories', 'Characters', 'Vehicles', 'Locations')),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  parent_comment_id uuid references public.comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1500),
  status text not null default 'published' check (status in ('published', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.bookmarks (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- Automatically create a public profile when a Supabase Auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base_username text;
  chosen_username text;
begin
  base_username := lower(
    regexp_replace(
      coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1)),
      '[^a-z0-9_]',
      '',
      'g'
    )
  );

  if char_length(base_username) < 3 then
    base_username := 'player_' || substr(new.id::text, 1, 8);
  end if;

  base_username := left(base_username, 24);
  chosen_username := base_username;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    chosen_username,
    left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), chosen_username), 40)
  )
  on conflict do nothing;

  if not found then
    chosen_username := left(base_username, 15) || '_' || substr(new.id::text, 1, 8);
    insert into public.profiles (id, username, display_name)
    values (
      new.id,
      chosen_username,
      left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), chosen_username), 40)
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Keep updated_at current when a profile, post or comment is edited.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists posts_set_updated_at on public.posts;
create trigger posts_set_updated_at before update on public.posts
for each row execute procedure public.set_updated_at();

drop trigger if exists comments_set_updated_at on public.comments;
create trigger comments_set_updated_at before update on public.comments
for each row execute procedure public.set_updated_at();

-- Useful indexes for the community feed and profile activity.
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_id_idx on public.posts (author_id);
create index if not exists posts_category_idx on public.posts (category);
create index if not exists comments_post_id_created_at_idx on public.comments (post_id, created_at);
create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists bookmarks_user_id_idx on public.bookmarks (user_id);

-- Enable Row Level Security on every application table.
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.bookmarks enable row level security;

-- Profiles: visible to everyone; each member can edit only their own profile.
drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone"
on public.profiles for select
to anon, authenticated
using (true);

drop policy if exists "Members can update their own profile" on public.profiles;
create policy "Members can update their own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Posts: public can read published posts; members can publish and manage only their own.
drop policy if exists "Published posts are viewable by everyone" on public.posts;
create policy "Published posts are viewable by everyone"
on public.posts for select
to anon, authenticated
using (status = 'published');

drop policy if exists "Members can publish their own posts" on public.posts;
create policy "Members can publish their own posts"
on public.posts for insert
to authenticated
with check (auth.uid() = author_id and status = 'published');

drop policy if exists "Members can update their own posts" on public.posts;
create policy "Members can update their own posts"
on public.posts for update
to authenticated
using (auth.uid() = author_id)
with check (auth.uid() = author_id);

drop policy if exists "Members can delete their own posts" on public.posts;
create policy "Members can delete their own posts"
on public.posts for delete
to authenticated
using (auth.uid() = author_id);

-- Comments: public can read published comments; authenticated members manage their own.
drop policy if exists "Published comments are viewable by everyone" on public.comments;
create policy "Published comments are viewable by everyone"
on public.comments for select
to anon, authenticated
using (
  status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can add comments as themselves" on public.comments;
create policy "Members can add comments as themselves"
on public.comments for insert
to authenticated
with check (
  auth.uid() = author_id
  and status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can update their own comments" on public.comments;
create policy "Members can update their own comments"
on public.comments for update
to authenticated
using (auth.uid() = author_id)
with check (
  auth.uid() = author_id
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can delete their own comments" on public.comments;
create policy "Members can delete their own comments"
on public.comments for delete
to authenticated
using (auth.uid() = author_id);

-- Likes are publicly readable for counts; each member can add/remove only their own like.
drop policy if exists "Post likes are viewable by everyone" on public.post_likes;
create policy "Post likes are viewable by everyone"
on public.post_likes for select
to anon, authenticated
using (
  exists (
    select 1 from public.posts p
    where p.id = post_likes.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can like posts as themselves" on public.post_likes;
create policy "Members can like posts as themselves"
on public.post_likes for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts p
    where p.id = post_likes.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can remove their own likes" on public.post_likes;
create policy "Members can remove their own likes"
on public.post_likes for delete
to authenticated
using (auth.uid() = user_id);

-- Bookmarks are private to the member who created them.
drop policy if exists "Members can view their own bookmarks" on public.bookmarks;
create policy "Members can view their own bookmarks"
on public.bookmarks for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Members can create their own bookmarks" on public.bookmarks;
create policy "Members can create their own bookmarks"
on public.bookmarks for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.posts p
    where p.id = bookmarks.post_id and p.status = 'published'
  )
);

drop policy if exists "Members can delete their own bookmarks" on public.bookmarks;
create policy "Members can delete their own bookmarks"
on public.bookmarks for delete
to authenticated
using (auth.uid() = user_id);

-- Explicit table privileges; RLS above still decides which rows each role can access.
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.posts, public.comments, public.post_likes to anon, authenticated;
grant update on public.profiles to authenticated;
grant insert, update, delete on public.posts, public.comments to authenticated;
grant insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
