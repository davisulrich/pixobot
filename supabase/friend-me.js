// Pixobot — Friend your own account with the seed users
//
// Usage:
//   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=eyJ... MY_UUID=<your-uuid> node supabase/friend-me.js
//
// Find your UUID in Supabase Dashboard → Authentication → Users

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MY_UUID           = process.env.MY_UUID;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !MY_UUID) {
  console.error('Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... MY_UUID=<uuid> node supabase/friend-me.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_USERNAMES = ['alice', 'bob', 'carol'];

async function run() {
  const { data: seedUsers, error } = await supabase
    .from('users')
    .select('id, username')
    .in('username', SEED_USERNAMES);

  if (error || !seedUsers?.length) {
    console.error('Could not find seed users. Run seed.js first.');
    process.exit(1);
  }

  const rows = seedUsers.map(u => {
    const [uid1, uid2] = [MY_UUID, u.id].sort();
    return { requester_id: uid1, addressee_id: uid2, status: 'accepted' };
  });

  const { error: fErr } = await supabase
    .from('friendships')
    .upsert(rows, { onConflict: 'requester_id,addressee_id' });

  if (fErr) { console.error('Failed:', fErr.message); process.exit(1); }

  console.log(`✅ You are now friends with: ${seedUsers.map(u => u.username).join(', ')}`);
}

run().catch(err => { console.error(err); process.exit(1); });
