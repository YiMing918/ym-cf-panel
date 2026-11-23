import { requireAuth, json, readBody, randomToken } from '../_auth.js';
import { getAccounts, mutateAccounts, maskAccount, addAudit } from '../_store.js';

// mutateAccounts 的结果转响应：业务错误按其 status，冲突耗尽统一 409 提示重试
function mutErr(r) {
  if (r && r.error === 'conflict') return json({ error: '账号列表刚被其他操作修改，请重试' }, 409);
  return json({ error: (r && r.error) || '操作失败' }, (r && r.status) || 400);
}
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
  let _b; try { _b = await readBody(request); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const { name, accountId, token } = _b;
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
  // 写回走版本校验+重试（#13）：验证期间列表可能已被改动，重查查重再落库
  const r = await mutateAccounts(env, (fresh) => {
    if (fresh.some((x) => x.accountId === id)) return { error: '这个 Account ID 已经添加过了', status: 409 };
    return { list: [...fresh, acct] };
  });
  if (r.error) return mutErr(r);
  await addAudit(env, a.sess.user, 'accounts.create', `添加账号 ${n}`);
  return json({ ok: true, account: maskAccount(acct) });
}

export async function onRequestPut({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  let _b; try { _b = await readBody(request); } catch (e) { return json({ error: e.message }, e.status || 400); }
  const { id, name, accountId, token } = _b;
  const list = await getAccounts(env);
  const acct = list.find((x) => x.id === id);
  if (!acct) return json({ error: '账号不存在' }, 404);
  if (name) { const nn = String(name).trim(); if (!nn) return json({ error: '名称不能为空' }, 400); acct.name = nn; }
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
  if (idChanged) {
    // 只要改了 ID 就必须确认（新）令牌能访问新账号：同时改 ID+令牌时以前
    // 只验了令牌本身、跳过账号访问权校验，新账号可能根本不在令牌权限里，
    // 存进去才发现处处报错。acct 此时已带上新 ID 与（如有）新令牌。
    try { await verifyAccountAccess(acct); } catch (e) { return json({ error: '令牌无法访问新账号：' + e.message }, 400); }
  }
  // 写回走版本校验+重试（#13）：把已验证的改动重新应用到最新列表上
  const patch = { name: acct.name, accountId: acct.accountId, token: acct.token };
  const r = await mutateAccounts(env, (fresh) => {
    const cur = fresh.find((x) => x.id === id);
    if (!cur) return { error: '账号不存在', status: 404 };
    if (patch.accountId !== cur.accountId && fresh.some((x) => x.id !== cur.id && x.accountId === patch.accountId)) {
      return { error: '这个 Account ID 已经添加过了', status: 409 };
    }
    cur.name = patch.name;
    cur.accountId = patch.accountId;
    cur.token = patch.token;
    return { list: fresh };
  });
  if (r.error) return mutErr(r);
  await addAudit(env, a.sess.user, 'accounts.update', `更新账号 ${patch.name}`);
  return json({ ok: true, account: maskAccount({ ...acct, ...patch }) });
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const id = new URL(request.url).searchParams.get('id');
  let goneName = '';
  const r = await mutateAccounts(env, (fresh) => {
    const gone = fresh.find((x) => x.id === id);
    if (!gone) return { error: '账号不存在', status: 404 };
    goneName = gone.name;
    return { list: fresh.filter((x) => x.id !== id) };
  });
  if (r.error) return mutErr(r);
  await addAudit(env, a.sess.user, 'accounts.delete', `删除账号 ${goneName || id}`);
  return json({ ok: true });
}
