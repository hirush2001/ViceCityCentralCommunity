-- Vice City Central Phase 3.3: real community polls and one-vote-per-member rules.
-- Run once in Supabase Dashboard > SQL Editor.

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.profiles (id) on delete set null,
  question text not null check (char_length(question) between 8 and 140),
  description text not null default '' check (char_length(description) <= 300),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 70),
  position integer not null default 0 check (position between 0 and 5),
  vote_count bigint not null default 0 check (vote_count >= 0),
  created_at timestamptz not null default now(),
  constraint poll_options_poll_label_unique unique (poll_id, label),
  constraint poll_options_id_poll_unique unique (id, poll_id)
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls (id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint poll_votes_one_vote_per_member primary key (poll_id, user_id),
  constraint poll_votes_option_belongs_to_poll
    foreign key (option_id, poll_id)
    references public.poll_options (id, poll_id)
    on delete cascade
);

create index if not exists polls_created_at_idx on public.polls (created_at desc);
create index if not exists poll_options_poll_position_idx on public.poll_options (poll_id, position);
create index if not exists poll_votes_option_id_idx on public.poll_votes (option_id);

-- Keep the public aggregate count separate from private individual vote records.
alter table public.poll_options
  add column if not exists vote_count bigint not null default 0 check (vote_count >= 0);

update public.poll_options po
set vote_count = (
  select count(*)::bigint
  from public.poll_votes pv
  where pv.option_id = po.id and pv.poll_id = po.poll_id
);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "Polls are viewable by everyone" on public.polls;
create policy "Polls are viewable by everyone"
on public.polls for select
to anon, authenticated
using (true);

drop policy if exists "Members can create polls as themselves" on public.polls;
create policy "Members can create polls as themselves"
on public.polls for insert
to authenticated
with check (auth.uid() = created_by and status = 'active');

drop policy if exists "Poll creators can close their polls" on public.polls;
create policy "Poll creators can close their polls"
on public.polls for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "Poll creators can delete their polls" on public.polls;
create policy "Poll creators can delete their polls"
on public.polls for delete
to authenticated
using (auth.uid() = created_by);

drop policy if exists "Poll options are viewable by everyone" on public.poll_options;
create policy "Poll options are viewable by everyone"
on public.poll_options for select
to anon, authenticated
using (true);

drop policy if exists "Poll creators can add options to their active polls" on public.poll_options;
create policy "Poll creators can add options to their active polls"
on public.poll_options for insert
to authenticated
with check (
  exists (
    select 1
    from public.polls p
    where p.id = poll_options.poll_id
      and p.created_by = auth.uid()
      and p.status = 'active'
      and not exists (
        select 1 from public.poll_votes pv where pv.poll_id = p.id
      )
  )
);

drop policy if exists "Members can view their own poll votes" on public.poll_votes;
create policy "Members can view their own poll votes"
on public.poll_votes for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Members can vote once in active polls" on public.poll_votes;
create policy "Members can vote once in active polls"
on public.poll_votes for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.polls p
    where p.id = poll_votes.poll_id
      and p.status = 'active'
  )
  and exists (
    select 1
    from public.poll_options po
    where po.id = poll_votes.option_id
      and po.poll_id = poll_votes.poll_id
  )
);

-- Aggregate results are exposed without exposing individual members' vote choices.
create or replace function public.get_poll_results(p_poll_id uuid)
returns table (
  option_id uuid,
  option_label text,
  vote_count bigint,
  total_votes bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with option_counts as (
    select
      po.id as option_id,
      po.label as option_label,
      po.position,
      po.vote_count::bigint as vote_count
    from public.poll_options po
    where po.poll_id = p_poll_id
  ), totals as (
    select coalesce(sum(option_counts.vote_count), 0)::bigint as total_votes
    from option_counts
  )
  select
    option_counts.option_id,
    option_counts.option_label,
    option_counts.vote_count,
    totals.total_votes
  from option_counts
  cross join totals
  order by option_counts.position, option_counts.option_label;
$$;


-- Increment only the aggregate counter when a member casts a vote.
create or replace function public.increment_poll_option_vote_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.poll_options
  set vote_count = vote_count + 1
  where id = new.option_id and poll_id = new.poll_id;
  return new;
end;
$$;

drop trigger if exists poll_votes_increment_option_count on public.poll_votes;
create trigger poll_votes_increment_option_count
after insert on public.poll_votes
for each row execute function public.increment_poll_option_vote_count();

-- Publish only aggregate option-count updates to Supabase Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'poll_options'
     ) then
    alter publication supabase_realtime add table public.poll_options;
  end if;
end;
$$;

revoke all on function public.get_poll_results(uuid) from public;
grant execute on function public.get_poll_results(uuid) to anon, authenticated;

grant select on public.polls, public.poll_options to anon, authenticated;
grant insert, update, delete on public.polls to authenticated;
grant insert on public.poll_options to authenticated;
grant select, insert on public.poll_votes to authenticated;

-- Seed one real community poll so the Pulse panel is useful immediately.
insert into public.polls (created_by, question, description, status)
select null, 'What is your first stop in Leonida?',
       'Your first free-roam move. Where are you heading?', 'active'
where not exists (
  select 1 from public.polls
  where question = 'What is your first stop in Leonida?'
);

insert into public.poll_options (poll_id, label, position)
select p.id, seed.label, seed.position
from public.polls p
cross join (values
  ('Explore Vice City', 0),
  ('Hit the highways', 1),
  ('Discover the Keys', 2),
  ('Explore the countryside', 3)
) as seed(label, position)
where p.question = 'What is your first stop in Leonida?'
on conflict (poll_id, label) do nothing;
