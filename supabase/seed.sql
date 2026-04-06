-- Pixobot — Seed Data for Local Testing
-- Run in Supabase Dashboard → SQL Editor → Run
-- Safe to re-run (all inserts use ON CONFLICT DO NOTHING)
--
-- Creates 3 dummy users (alice, bob, carol) with:
--   - Supabase auth accounts (password: password123)
--   - Accepted friendships between all three
--   - One conversation (alice ↔ bob) with a dummy photo message
--
-- After running, log in as any of them in the app to test the send flow.
--
-- ─── If you already have your own account ─────────────────────────────────────
-- Copy your user UUID from Supabase → Authentication → Users, then run the
-- snippet at the bottom of this file to friend yourself with the seed users.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  uid_alice uuid := 'a0000000-dead-beef-0000-000000000001';
  uid_bob   uuid := 'b0000000-dead-beef-0000-000000000002';
  uid_carol uuid := 'c0000000-dead-beef-0000-000000000003';
  conv_ab   uuid;
  conv_ac   uuid;
  conv_bc   uuid;
begin

  -- ─── 1. Auth users ───────────────────────────────────────────────────────────
  -- Inserts directly into auth.users so no email confirmation is needed.
  -- The on_auth_user_created trigger fires and creates the public.users rows.
  insert into auth.users (
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_user_meta_data,
    raw_app_meta_data,
    is_super_admin,
    created_at,
    updated_at
  ) values
    (
      uid_alice,
      'authenticated', 'authenticated',
      'alice@pixobot.internal',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"username": "alice"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, now(), now()
    ),
    (
      uid_bob,
      'authenticated', 'authenticated',
      'bob@pixobot.internal',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"username": "bob"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, now(), now()
    ),
    (
      uid_carol,
      'authenticated', 'authenticated',
      'carol@pixobot.internal',
      crypt('password123', gen_salt('bf')),
      now(),
      '{"username": "carol"}'::jsonb,
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      false, now(), now()
    )
  on conflict (id) do nothing;

  -- ─── 2. public.users ─────────────────────────────────────────────────────────
  -- The trigger above should have already created these rows.
  -- This is a safety net in case the trigger fired before the metadata was set.
  insert into public.users (id, username) values
    (uid_alice, 'alice'),
    (uid_bob,   'bob'),
    (uid_carol, 'carol')
  on conflict (id) do nothing;

  -- ─── 3. Friendships (all accepted) ───────────────────────────────────────────
  insert into public.friendships (requester_id, addressee_id, status) values
    (uid_alice, uid_bob,   'accepted'),
    (uid_alice, uid_carol, 'accepted'),
    (uid_bob,   uid_carol, 'accepted')
  on conflict (requester_id, addressee_id) do nothing;

  -- ─── 4. Conversations ────────────────────────────────────────────────────────
  -- conversations require user_id_1 < user_id_2 (enforced by CHECK constraint)
  insert into public.conversations (user_id_1, user_id_2, last_activity_at)
  values (uid_alice, uid_bob,   now() - interval '2 hours')
  on conflict (user_id_1, user_id_2) do nothing
  returning id into conv_ab;

  insert into public.conversations (user_id_1, user_id_2, last_activity_at)
  values (uid_alice, uid_carol, now() - interval '1 day')
  on conflict (user_id_1, user_id_2) do nothing
  returning id into conv_ac;

  insert into public.conversations (user_id_1, user_id_2, last_activity_at)
  values (uid_bob,   uid_carol, now() - interval '3 days')
  on conflict (user_id_1, user_id_2) do nothing
  returning id into conv_bc;

  -- ─── 5. Messages (dummy photo URLs via picsum.photos) ────────────────────────
  -- These give the chat screen real rows to render once Sprint 3 is built.
  -- They also let you verify the send-to flow sees a "recent" conversation.
  if conv_ab is not null then
    -- Bob sent alice a photo
    insert into public.messages (
      conversation_id, sender_id, media_url, media_type, replay_count, hearted
    ) values (
      conv_ab, uid_bob,
      'https://picsum.photos/seed/pixobot1/400/700',
      'photo', 0, false
    );
    -- Alice replied
    insert into public.messages (
      conversation_id, sender_id, media_url, media_type, replay_count, hearted
    ) values (
      conv_ab, uid_alice,
      'https://picsum.photos/seed/pixobot2/400/700',
      'photo', 1, true
    );
  end if;

  if conv_ac is not null then
    insert into public.messages (
      conversation_id, sender_id, media_url, media_type, replay_count, hearted
    ) values (
      conv_ac, uid_carol,
      'https://picsum.photos/seed/pixobot3/400/700',
      'photo', 0, false
    );
  end if;

end $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL: Friend your own account with the seed users
-- Replace YOUR_UUID below with your UUID from Supabase → Authentication → Users
-- ─────────────────────────────────────────────────────────────────────────────
--
-- do $$
-- declare
--   my_id     uuid := 'YOUR_UUID_HERE';
--   uid_alice uuid := 'a0000000-dead-beef-0000-000000000001';
--   uid_bob   uuid := 'b0000000-dead-beef-0000-000000000002';
--   uid_carol uuid := 'c0000000-dead-beef-0000-000000000003';
-- begin
--   -- Sort IDs so they satisfy the conversations CHECK constraint
--   insert into public.friendships (requester_id, addressee_id, status) values
--     (least(my_id, uid_alice), greatest(my_id, uid_alice), 'accepted'),
--     (least(my_id, uid_bob),   greatest(my_id, uid_bob),   'accepted'),
--     (least(my_id, uid_carol), greatest(my_id, uid_carol), 'accepted')
--   on conflict (requester_id, addressee_id) do nothing;
-- end $$;
