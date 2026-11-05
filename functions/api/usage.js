import { requireAuth, json } from '../_auth.js';
import { getAccounts } from '../_store.js';
import { getUsage, QUOTAS } from '../_cf.js';

const CACHE_TTL_MS = 120000;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const url = new URL(request.url);
  const id = url.searchParams.get('account');
  const range = ['today', '7d', '30d'].includes(url.searchParams.get('range')) ? url.searchParams.get('range') : 'today';
  const fresh = url.searchParams.get('fresh') === '1';
  const list = await getAccounts(env);
  const acct = list.find((x) => x.id === id);
  if (!acct) return json({ error: '账号不存在' }, 404);

  const cacheKey = `cache:${acct.id}:${range}`;
  if (!fresh) {
    const raw = await env.PANEL_KV.get(cacheKey);
    if (raw) {
      const c = JSON.parse(raw);
      if (Date.now() - c.at < CACHE_TTL_MS) return json({ ...c.data, cachedAt: c.at });
    }
  }
  const data = await getUsage(acct, range);
  const payload = { account: { id: acct.id, name: acct.name, accountId: acct.accountId }, quotas: QUOTAS, usage: data };
  await env.PANEL_KV.put(cacheKey, JSON.stringify({ at: Date.now(), data: payload }), { expirationTtl: 3600 });
  return json({ ...payload, cachedAt: Date.now() });
}
