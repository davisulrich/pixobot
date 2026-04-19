import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/push/v2/send';

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { type, table, record, old_record } = payload;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const messages: object[] = [];

    // ── New DM message ──────────────────────────────────────────────────────
    if (table === 'messages' && type === 'INSERT') {
      const { data: conv } = await supabase
        .from('conversations')
        .select('user_id_1, user_id_2')
        .eq('id', record.conversation_id)
        .single();

      if (!conv) return ok();

      const recipientId =
        conv.user_id_1 === record.sender_id ? conv.user_id_2 : conv.user_id_1;

      const [{ data: sender }, { data: recipient }] = await Promise.all([
        supabase.from('users').select('username').eq('id', record.sender_id).single(),
        supabase.from('users').select('push_token').eq('id', recipientId).single(),
      ]);

      if (recipient?.push_token) {
        messages.push({
          to: recipient.push_token,
          title: sender?.username ?? 'New Message',
          body: `${sender?.username} sent you a Message`,
          data: { type: 'message', conversationId: record.conversation_id },
        });
      }
    }

    // ── New group message ───────────────────────────────────────────────────
    if (table === 'group_messages' && type === 'INSERT') {
      const [{ data: members }, { data: sender }, { data: group }] = await Promise.all([
        supabase
          .from('group_members')
          .select('user_id')
          .eq('group_id', record.group_id)
          .neq('user_id', record.sender_id),
        supabase.from('users').select('username').eq('id', record.sender_id).single(),
        supabase.from('groups').select('name').eq('id', record.group_id).single(),
      ]);

      if (members?.length && sender && group) {
        const { data: recipients } = await supabase
          .from('users')
          .select('push_token')
          .in('id', members.map((m: any) => m.user_id))
          .not('push_token', 'is', null);

        for (const r of (recipients ?? [])) {
          if (r.push_token) {
            messages.push({
              to: r.push_token,
              title: group.name,
              body: `${sender.username} sent a snap`,
              data: { type: 'group_message', groupId: record.group_id },
            });
          }
        }
      }
    }

    // ── Friend request received ─────────────────────────────────────────────
    if (table === 'friendships' && type === 'INSERT' && record.status === 'pending') {
      const [{ data: requester }, { data: addressee }] = await Promise.all([
        supabase.from('users').select('username').eq('id', record.requester_id).single(),
        supabase.from('users').select('push_token').eq('id', record.addressee_id).single(),
      ]);

      if (addressee?.push_token) {
        messages.push({
          to: addressee.push_token,
          title: 'Friend Request',
          body: `${requester?.username} wants to be friends`,
          data: { type: 'friend_request' },
        });
      }
    }

    // ── Friend request accepted ─────────────────────────────────────────────
    if (
      table === 'friendships' &&
      type === 'UPDATE' &&
      record.status === 'accepted' &&
      old_record?.status === 'pending'
    ) {
      const [{ data: addressee }, { data: requester }] = await Promise.all([
        supabase.from('users').select('username').eq('id', record.addressee_id).single(),
        supabase.from('users').select('push_token').eq('id', record.requester_id).single(),
      ]);

      if (requester?.push_token) {
        messages.push({
          to: requester.push_token,
          title: 'Friend Request Accepted',
          body: `${addressee?.username} accepted your friend request`,
          data: { type: 'friend_accepted' },
        });
      }
    }

    if (messages.length > 0) {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(messages.length === 1 ? messages[0] : messages),
      });
    }
  } catch (err) {
    console.error('send-push error:', err);
  }

  return ok();
});

function ok() {
  return new Response('ok', { status: 200 });
}
