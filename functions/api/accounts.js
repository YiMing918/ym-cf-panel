import { requireAuth, json, readBody, randomToken } from '../_auth.js';
import { getAccounts, saveAccounts, maskAccount, addAudit } from '../_store.js';
import { verifyToken, verifyAccountAccess } from '../_cf.js';

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
    await verifyAccountAccess(acct);
  } catch (e) {
    return json({ error: '令牌验证失败：' + e.message }, 400);
  }
  list.push(acct);
  await saveAccounts(env, list);
  await addAudit(env, a.sess.user, 'accounts.create', `添加账号 ${n}`);
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
  let idChanged = false;
  if (accountId) {
    const nid = String(accountId).trim();
    if (!/^[a-f0-9]{32}$/i.test(nid)) return json({ error: 'Account ID 格式不对' }, 400);
    // POST 有查重、PUT 以前没有：改 ID 时也要防与已有账号撞车
    if (nid !== acct.accountId && list.some((x) => x.id !== acct.id && x.accountId === nid)) {
      return json({ error: '这个 Account ID 已经添加过了' }, 409);
    }
    idChanged = nid !== acct.accountId;
    acct.accountId = nid;
  }
  if (token) {
    const t = String(token).trim();
    try { await verifyToken({ ...acct, token: t }); } catch (e) { return json({ error: '新令牌验证失败：' + e.message }, 400); }
    acct.token = t;
  }
  if (idChanged && !token) {
    // 只改了 ID 没换令牌：也要确认现有令牌能访问新账号，否则存进去才发现处处报错
    try { await verifyAccountAccess(acct); } catch (e) { return json({ error: '现有令牌无法访问新账号：' + e.message }, 400); }
  }
  await saveAccounts(env, list);
  await addAudit(env, a.sess.user, 'accounts.update', `更新账号 ${acct.name}`);
  return json({ ok: true, account: maskAccount(acct) });
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const id = new URL(request.url).searchParams.get('id');
  const list = await getAccounts(env);
  const gone = list.find((x) => x.id === id);
  const next = list.filter((x) => x.id !== id);
  if (next.length === list.length) return json({ error: '账号不存在' }, 404);
  await saveAccounts(env, next);
  await addAudit(env, a.sess.user, 'accounts.delete', `删除账号 ${gone ? gone.name : id}`);
  return json({ ok: true });
}
