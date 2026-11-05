// Management (write-capable) helpers for YM CF Panel v2.
// Every caller must pass requireAuth first. Tokens stay server-side.
import { getAccounts } from './_store.js';

const API = 'https://api.cloudflare.com/client/v4';

export async function resolveAccount(env, panelId) {
  const list = await getAccounts(env);
  const acct = list.find((x) => x.id === panelId);
  if (!acct) throw Object.assign(new Error('账号不存在'), { status: 404 });
  return acct;
}

export async function cfApi(account, path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + account.token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const text = await r.text();
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!r.ok || data.success === false) {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status);
    throw Object.assign(new Error(msg), { status: r.status });
  }
  return data;
}

export function fail(e) {
  return new Response(JSON.stringify({ error: String(e.message || e) }), {
    status: e.status || 500,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
