-- Pixobot — Supabase schema (idempotent — safe to run multiple times)
-- Paste the full contents into Supabase Dashboard → SQL Editor → Run.

-- ─── Extensions ──────────────────────────────────────────────────────────────

create extension if not exists "uuid-ossp";

-- ─── Users ───────────────────────────────────────────────────────────────────

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null unique,
  created_at  timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users: read all"  on public.users;
drop policy if exists "users: update own" on public.users;
create policy "users: read all"   on public.users for select using (true);
create policy "users: update own" on public.users for update using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.users (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Friendships ─────────────────────────────────────────────────────────────

create table if not exists public.friendships (
  id            uuid primary key default uuid_generate_v4(),
  requester_id  uuid not null references public.users(id) on delete cascade,
  addressee_id  uuid not null references public.users(id) on delete cascade,
  status        text not null default 'pending'
                  check (status in ('pending', 'accepted', 'rejected', 'blocked')),
  created_at    timestamptz not null default now(),
  unique (requester_id, addressee_id)
);

create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists friendships_requester_idx on public.friendships(requester_id);

alter table public.friendships enable row level security;

drop policy if exists "friendships: read own"            on public.friendships;
drop policy if exists "friendships: insert as requester" on public.friendships;
drop policy if exists "friendships: update as addressee" on public.friendships;
create policy "friendships: read own"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);
create policy "friendships: insert as requester"
  on public.friendships for insert
  with check (auth.uid() = requester_id);
create policy "friendships: update as addressee"
  on public.friendships for update
  using (auth.uid() = addressee_id);

-- ─── Conversations ────────────────────────────────────────────────────────────

create table if not exists public.conversations (
  id                uuid primary key default uuid_generate_v4(),
  user_id_1         uuid not null references public.users(id) on delete cascade,
  user_id_2         uuid not null references public.users(id) on delete cascade,
  last_activity_at  timestamptz not null default now(),
  unique (user_id_1, user_id_2),
  check (user_id_1 < user_id_2)
);

create index if not exists conversations_user1_idx on public.conversations(user_id_1);
create index if not exists conversations_user2_idx on public.conversations(user_id_2);

alter table public.conversations enable row level security;

drop policy if exists "conversations: read own"              on public.conversations;
drop policy if exists "conversations: insert as participant"  on public.conversations;
drop policy if exists "conversations: update as participant"  on public.conversations;
create policy "conversations: read own"
  on public.conversations for select
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);
create policy "conversations: insert as participant"
  on public.conversations for insert
  with check (auth.uid() = user_id_1 or auth.uid() = user_id_2);
create policy "conversations: update as participant"
  on public.conversations for update
  using (auth.uid() = user_id_1 or auth.uid() = user_id_2);

-- ─── Messages ─────────────────────────────────────────────────────────────────

create table if not exists public.messages (
  id               uuid primary key default uuid_generate_v4(),
  conversation_id  uuid not null references public.conversations(id) on delete cascade,
  sender_id        uuid not null references public.users(id) on delete cascade,
  media_url        text not null,
  media_type       text not null check (media_type in ('photo', 'video')),
  replay_count     int not null default 0 check (replay_count <= 3),
  hearted          boolean not null default false,
  opened_at        timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages(conversation_id);

-- Drawing/text overlay data captured in the edit screen (null = no overlay)
alter table public.messages add column if not exists overlay_data jsonb;

alter table public.messages enable row level security;

drop policy if exists "messages: read as participant"  on public.messages;
drop policy if exists "messages: insert as sender"     on public.messages;
drop policy if exists "messages: update as recipient"  on public.messages;
create policy "messages: read as participant"
  on public.messages for select
  using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_id_1 = auth.uid() or c.user_id_2 = auth.uid())
    )
  );
create policy "messages: insert as sender"
  on public.messages for insert
  with check (auth.uid() = sender_id);
create policy "messages: update as recipient"
  on public.messages for update
  using (
    auth.uid() != sender_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id
        and (c.user_id_1 = auth.uid() or c.user_id_2 = auth.uid())
    )
  );

-- ─── Memories ─────────────────────────────────────────────────────────────────

create table if not exists public.memories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  message_id  uuid not null references public.messages(id) on delete cascade,
  saved_at    timestamptz not null default now(),
  unique (user_id, message_id)
);

alter table public.memories enable row level security;

drop policy if exists "memories: read own"   on public.memories;
drop policy if exists "memories: insert own" on public.memories;
drop policy if exists "memories: delete own" on public.memories;
create policy "memories: read own"   on public.memories for select using (auth.uid() = user_id);
create policy "memories: insert own" on public.memories for insert with check (auth.uid() = user_id);
create policy "memories: delete own" on public.memories for delete using (auth.uid() = user_id);

-- ─── Groups ───────────────────────────────────────────────────────────────────

create table if not exists public.groups (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_by  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.groups enable row level security;

drop policy if exists "groups: read member"  on public.groups;
drop policy if exists "groups: insert own"   on public.groups;
create policy "groups: read member"
  on public.groups for select
  using (
    exists (
      select 1 from public.group_members gm
      where gm.group_id = id and gm.user_id = auth.uid()
    )
  );
create policy "groups: insert own"
  on public.groups for insert
  with check (auth.uid() = created_by);

create table if not exists public.group_members (
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists group_members_user_idx on public.group_members(user_id);

alter table public.group_members enable row level security;

drop policy if exists "group_members: read own"  on public.group_members;
drop policy if exists "group_members: insert"    on public.group_members;
create policy "group_members: read own"
  on public.group_members for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );
create policy "group_members: insert"
  on public.group_members for insert
  with check (
    exists (
      select 1 from public.groups g
      where g.id = group_id and g.created_by = auth.uid()
    )
  );

-- ─── Done ─────────────────────────────────────────────────────────────────────
-- After this runs successfully:
-- 1. Go to Storage → Create bucket → name: "messages" → enable Public bucket → Save
-- 2. Under Storage → Policies, add:
--      INSERT: auth.role() = 'authenticated'
--      SELECT: true
-- 3. Run the groups/group_members section above in your Supabase SQL editor
--    to enable the Make a Group feature.
