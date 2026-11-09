import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Account-level administration: members, roles, billing profile, Cloudflare's
// own audit log, RUM (Web Analytics) sites, account rename.
// Permissions vary per feature (Members Edit / Billing Read / Audit Logs Read /
// Account Settings Edit) — each part degrades gracefully when missing.
const A = (acct) => `/accounts/${acct.accountId}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const what = url.searchParams.get('what') || 'members';
    if (what === 'members') {
      const [m, r] = await Promise.all([
        cfApiAll(acct, `${A(acct)}/members`).catch((e) => ({ error: String(e.message || e) })),
        cfApiAll(acct, `${A(acct)}/roles`).catch(() => null),
      ]);
      if (m.error) return json({ error: m.error }, 502);
      return json({
        members: (m.result || []).map((x) => ({
          id: x.id, email: (x.user && x.user.email) || '', status: x.status,
          roles: (x.roles || []).map((role) => ({ id: role.id, name: role.name })),
        })),
        roles: ((r && r.result) || []).map((role) => ({ id: role.id, name: role.name, description: role.description || '' })),
        membersTotal: m.result_info ? m.result_info.total_count : (m.result || []).length, membersTruncated: !!(m.result_info && m.result_info.truncated),
        rolesTotal: r && r.result_info ? r.result_info.total_count : ((r && r.result) || []).length, rolesTruncated: !!(r && r.result_info && r.result_info.truncated),
      });
    }
    if (what === 'billing') {
      const d = await cfApi(acct, `${A(acct)}/billing/profile`);
      const p = d.result || {};
      return json({ profile: { name: [p.first_name, p.last_name].filter(Boolean).join(' '), company: p.company || '', country: p.country || '', currency: '', payment: p.payment_method || p.card_info || null } });
    }
    if (what === 'auditlog') {
      const d = await cfApiAll(acct, `${A(acct)}/audit_logs`);
      return json({
        total: d.result_info ? d.result_info.total_count : (d.result || []).length, truncated: !!(d.result_info && d.result_info.truncated),
        entries: (d.result || []).map((x) => ({
          at: x.when, actor: (x.actor && (x.actor.email || x.actor.name)) || '', ip: (x.actor && x.actor.ip) || '',
          action: (x.action && x.action.type) || '', resource: (x.resource && (x.resource.product || x.resource.id)) || '', result: x.result,
        })),
      });
    }
    if (what === 'rum') {
      const d = await cfApiAll(acct, `${A(acct)}/rum/site_info/list`);
      return json({ sites: (d.result || []).map((x) => ({ id: x.site_tag, name: (x.ruleset && x.ruleset.zone_name) || x.site_tag, autoInstall: !!(x.auto_install && x.auto_install.enabled) })), total: d.result_info ? d.result_info.total_count : (d.result || []).length, truncated: !!(d.result_info && d.result_info.truncated) });
    }
    return json({ error: '未知查询' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'invite') {
      const email = String(b.email || '').trim();
      if (!email.includes('@')) return json({ error: '邮箱格式不对' }, 400);
      const roleIds = Array.isArray(b.roleIds) ? b.roleIds : [];
      if (!roleIds.length) return json({ error: '至少选一个角色' }, 400);
      await cfApi(acct, `${A(acct)}/members`, { method: 'POST', body: JSON.stringify({ email, roles: roleIds.map((id) => ({ id })) }) });
      await addAudit(env, a.sess.user, 'member.invite', `${acct.name} · 邀请 ${email}`);
      return json({ ok: true });
    }
    if (b.what === 'rename') {
      const name = String(b.name || '').trim();
      if (!name) return json({ error: '账号名不能为空' }, 400);
      await cfApi(acct, A(acct), { method: 'PUT', body: JSON.stringify({ name }) });
      await addAudit(env, a.sess.user, 'account.rename', `${acct.name} · 改名为 ${name}`);
      return json({ ok: true });
    }
    return json({ error: '未知操作' }, 400);
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${A(acct)}/members/${url.searchParams.get('member')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'member.remove', `${acct.name} · 移除成员`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
