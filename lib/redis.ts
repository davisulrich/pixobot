// Upstash Redis via raw REST API — avoids the Node/browser crypto dependency
// in the @upstash/redis SDK, which doesn't run in React Native's JS environment.
// The REST API accepts JSON command arrays and returns JSON responses, so
// plain fetch is all we need for the small number of commands presence uses.

const BASE_URL = process.env.EXPO_PUBLIC_UPSTASH_REDIS_URL!;
const TOKEN = process.env.EXPO_PUBLIC_UPSTASH_REDIS_TOKEN!;

async function command<T>(args: (string | number)[]): Promise<T> {
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const json = await res.json();
  return json.result as T;
}

export const redis = {
  // SET key value EX seconds
  set(key: string, value: string | number, options?: { ex: number }) {
    const args: (string | number)[] = ['SET', key, value];
    if (options?.ex) args.push('EX', options.ex);
    return command<string>(args);
  },

  // MGET key1 key2 ...
  mget<T = string | null>(...keys: string[]) {
    return command<T[]>(['MGET', ...keys]);
  },
};
