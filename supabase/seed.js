// Pixobot — Seed script for local testing
// Uses the Supabase Admin API so passwords work exactly like real signups.
//
// Usage:
//   1. Copy your project URL + service role key from Supabase Dashboard →
//      Project Settings → API → "service_role" (NOT the anon key)
//   2. Run:  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... node supabase/seed.js
//
// Creates: alice, bob, carol (password: password123) + friendships + conversations

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Run with:\n  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node supabase/seed.js');
  process.exit(1);
}

// Use the service role key — this bypasses RLS and lets us create auth users
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_USERS = [
  { username: 'alice', password: 'password123' },
  { username: 'bob',   password: 'password123' },
  { username: 'carol', password: 'password123' },
];

async function run() {
  console.log('🌱 Seeding Pixobot...\n');

  // ─── 1. Create auth users ─────────────────────────────────────────────────
  const uids = {};

  for (const u of SEED_USERS) {
    // Check if already exists in public.users
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('username', u.username)
      .maybeSingle();

    if (existing) {
      console.log(`  ✓ ${u.username} already exists (${existing.id})`);
      uids[u.username] = existing.id;
      continue;
    }

    // admin.createUser bypasses email confirmation and uses real bcrypt
    const { data, error } = await supabase.auth.admin.createUser({
      email: `${u.username}@pixobot.internal`,
      password: u.password,
      email_confirm: true,
      user_metadata: { username: u.username },
    });

    if (error) {
      console.error(`  ✗ Failed to create ${u.username}:`, error.message);
      process.exit(1);
    }

    uids[u.username] = data.user.id;
    console.log(`  ✓ Created ${u.username} (${data.user.id})`);

    // Small delay to let the on_auth_user_created trigger settle
    await new Promise(r => setTimeout(r, 500));
  }

  const { alice: uid_alice, bob: uid_bob, carol: uid_carol } = uids;

  // ─── 2. Friendships ───────────────────────────────────────────────────────
  console.log('\n🤝 Creating friendships...');

  const friendships = [
    { requester_id: uid_alice, addressee_id: uid_bob,   status: 'accepted' },
    { requester_id: uid_alice, addressee_id: uid_carol, status: 'accepted' },
    { requester_id: uid_bob,   addressee_id: uid_carol, status: 'accepted' },
  ];

  const { error: fErr } = await supabase
    .from('friendships')
    .upsert(friendships, { onConflict: 'requester_id,addressee_id' });

  if (fErr) console.error('  ✗ Friendships:', fErr.message);
  else console.log('  ✓ alice ↔ bob, alice ↔ carol, bob ↔ carol (all accepted)');

  // ─── 3. Conversations ─────────────────────────────────────────────────────
  console.log('\n💬 Creating conversations...');

  // conversations CHECK requires user_id_1 < user_id_2 (UUID string sort)
  function sortedPair(a, b) {
    return a < b ? { user_id_1: a, user_id_2: b } : { user_id_1: b, user_id_2: a };
  }

  const convRows = [
    { ...sortedPair(uid_alice, uid_bob),   last_activity_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { ...sortedPair(uid_alice, uid_carol), last_activity_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() },
    { ...sortedPair(uid_bob,   uid_carol), last_activity_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() },
  ];

  const { data: convData, error: cErr } = await supabase
    .from('conversations')
    .upsert(convRows, { onConflict: 'user_id_1,user_id_2' })
    .select('id, user_id_1, user_id_2');

  if (cErr) { console.error('  ✗ Conversations:', cErr.message); }
  else console.log(`  ✓ ${convData.length} conversations created`);

  // ─── 4. Messages ─────────────────────────────────────────────────────────
  if (convData?.length) {
    console.log('\n📸 Inserting dummy messages...');

    const conv_ab = convData.find(c =>
      (c.user_id_1 === uid_alice && c.user_id_2 === uid_bob) ||
      (c.user_id_1 === uid_bob   && c.user_id_2 === uid_alice)
    );
    const conv_ac = convData.find(c =>
      (c.user_id_1 === uid_alice && c.user_id_2 === uid_carol) ||
      (c.user_id_1 === uid_carol && c.user_id_2 === uid_alice)
    );

    const messages = [];

    if (conv_ab) {
      messages.push(
        { conversation_id: conv_ab.id, sender_id: uid_bob,   media_url: 'https://picsum.photos/seed/pixobot1/400/700', media_type: 'photo', replay_count: 0, hearted: false },
        { conversation_id: conv_ab.id, sender_id: uid_alice, media_url: 'https://picsum.photos/seed/pixobot2/400/700', media_type: 'photo', replay_count: 1, hearted: true  },
      );
    }
    if (conv_ac) {
      messages.push(
        { conversation_id: conv_ac.id, sender_id: uid_carol, media_url: 'https://picsum.photos/seed/pixobot3/400/700', media_type: 'photo', replay_count: 0, hearted: false },
      );
    }

    const { error: mErr } = await supabase.from('messages').insert(messages);
    if (mErr) console.error('  ✗ Messages:', mErr.message);
    else console.log(`  ✓ ${messages.length} messages inserted`);
  }

  // ─── Done ─────────────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('  Log in with any of:');
  console.log('    username: alice  password: password123');
  console.log('    username: bob    password: password123');
  console.log('    username: carol  password: password123');
  console.log('\n  To friend your own account, run:');
  console.log('  SUPABASE_URL=... SUPABASE_SERVICE_KEY=... MY_UUID=<your-uuid> node supabase/friend-me.js\n');
}

run().catch(err => { console.error(err); process.exit(1); });
