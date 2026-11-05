import { requireAuth, json, readBody, randomToken } from '../_auth.js';
import { getAccounts, saveAccounts, maskAccount } from '../_store.js';
import { verifyToken } from '../_cf.js';

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const list = await getAccounts(env);
  return json({ accounts: list.map(maskAccount) });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const { name, accountId, token } = await readBody(request);
  const n = String(name || '').trim();
  const id = String(accountId || '').trim();
  const t = String(token || '').trim();
  if (!n || !/^[a-f0-9]{32}$/i.test(id) || !t) return json({ error: '名称必填，Account ID 应为 32 位十六进制，令牌必填' }, 400);
  const list = await getAccounts(env);
  if (list.some((x) => x.accountId === id)) return json({ error: '这个 Account ID 已经添加过了' }, 409);
  const acct = { id: 'acct_' + randomToken().slice(0, 10), name: n, accountId: id, token: t, createdAt: Date.now() };
  try {
    await verifyToken(acct);
  } catch (e) {
    return json({ error: '令牌验证失败：' + e.message }, 400);
  }
  list.push(acct);
  await saveAccounts(env, list);
  return json({ ok: true, account: maskAccount(acct) });
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const { id, name, accountId, token } = await readBody(request);
  const list = await getAccounts(env);
  const acct = list.find((x) => x.id === id);
  if (!acct) return json({ error: '账号不存在' }, 404);
  if (name) acct.name = String(name).trim();
  if (accountId) {
    const nid = String(accountId).trim();
    if (!/^[a-f0-9]{32}$/i.test(nid)) return json({ error: 'Account ID 格式不对' }, 400);
    acct.accountId = nid;
  }
  if (token) {
    const t = String(token).trim();
    try { await verifyToken({ ...acct, token: t }); } catch (e) { return json({ error: '新令牌验证失败：' + e.message }, 400); }
    acct.token = t;
  }
  await saveAccounts(env, list);
  return json({ ok: true, account: maskAccount(acct) });
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const id = new URL(request.url).searchParams.get('id');
  const list = await getAccounts(env);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return json({ error: '账号不存在' }, 404);
  await saveAccounts(env, next);
  return json({ ok: true });
}
