import { requireAuth, json } from '../_auth.js';
import { getAccounts } from '../_store.js';
import { verifyToken } from '../_cf.js';

// Token self-check: verify each stored token + probe the main data sources,
// so the user can see exactly which permission area is missing.
export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  const list = await getAccounts(env);
  const out = [];
  for (const acct of list) {
    const item = { id: acct.id, name: acct.name, tokenStatus: null, probes: {} };
    try { const v = await verifyToken(acct); item.tokenStatus = (v && v.status) || 'unknown'; }
    catch (e) { item.tokenStatus = 'invalid: ' + String(e.message || e); }
    const checks = [
      ['资源清单', `https://api.cloudflare.com/client/v4/accounts/${acct.accountId}/workers/scripts`],
      ['域名列表', `https://api.cloudflare.com/client/v4/zones?account.id=${acct.accountId}&per_page=1`],
      ['KV', `https://api.cloudflare.com/client/v4/accounts/${acct.accountId}/storage/kv/namespaces?per_page=1`],
      ['D1', `https://api.cloudflare.com/client/v4/accounts/${acct.accountId}/d1/database?per_page=1`],
      ['Pages', `https://api.cloudflare.com/client/v4/accounts/${acct.accountId}/pages/projects?per_page=1`],
      ['R2', `https://api.cloudflare.com/client/v4/accounts/${acct.accountId}/r2/buckets?per_page=1`],
    ];
    for (const [label, url] of checks) {
      try {
        const r = await fetch(url, { headers: { 'Authorization': 'Bearer ' + acct.token } });
        item.probes[label] = r.ok ? 'ok' : 'HTTP ' + r.status;
      } catch (e) { item.probes[label] = '失败'; }
    }
    out.push(item);
  }
  return json({ accounts: out });
}
