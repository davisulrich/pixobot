import { redis } from './redis';

// How long (seconds) before a user is considered offline.
// If we haven't heard from them in 5 minutes, their key expires and they're gone.
const PRESENCE_TTL_SECONDS = 300;

// Write: called when the app comes to the foreground.
// Sets presence:{userId} = current timestamp, with a 5-minute TTL.
// If the app goes to the background and stays there, the key naturally
// expires — no cleanup needed.
export async function updatePresence(userId: string): Promise<void> {
  await redis.set(`presence:${userId}`, Date.now(), {
    ex: PRESENCE_TTL_SECONDS,
  });
}

// Read: batch-fetch last-seen timestamps for a list of user IDs.
// Uses MGET so it's one round-trip regardless of how many users.
// Returns null for users whose key has expired (i.e. offline).
export async function getPresence(
  userIds: string[],
): Promise<Record<string, number | null>> {
  if (userIds.length === 0) return {};

  const keys = userIds.map((id) => `presence:${id}`);
  const values = await redis.mget<(number | null)[]>(...keys);

  return Object.fromEntries(userIds.map((id, i) => [id, values[i]]));
}

// Format a raw timestamp (or null) into a human-readable string.
// Returns null if the user has been offline for more than 24 hours
// — no point showing "22h ago" on a chat app.
export function formatPresence(timestamp: number | null): string | null {
  if (!timestamp) return null;

  const diffMs = Date.now() - timestamp;
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return 'Active now';
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return null;
}
