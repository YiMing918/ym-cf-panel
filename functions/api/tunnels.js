import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Cloudflare Tunnel: list / create / delete / ingress view + one-click DNS route.
// Needs Account → Cloudflare Tunnel Edit (+ DNS Edit for the route record).
const base = (acct) => `/accounts/${acct.accountId}/cfd_tunnel`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const one = url.searchParams.get('tunnel');
    if (one) {
      const [t, cfg] = await Promise.all([
        cfApi(acct, `${base(acct)}/${one}`).catch(() => null),
        cfApi(acct, `${base(acct)}/${one}/configurations`).catch(() => null),
      ]);
      const r = (t && t.result) || {};
      return json({
        tunnel: { id: r.id, name: r.name, status: r.status, created: r.created_at, connections: (r.connections || []).length },
        ingress: ((cfg && cfg.result && cfg.result.config && cfg.result.config.ingress) || []).map((x) => ({ hostname: x.hostname || '(catch-all)', service: x.service })),
      });
    }
    const d = await cfApi(acct, `${base(acct)}?per_page=50&is_deleted=false`);
    return json({
      tunnels: (d.result || []).map((t) => ({
        id: t.id, name: t.name, status: t.status, created: t.created_at,
        connections: (t.connections || []).length,
      })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'create') {
      const name = String(b.name || '').trim();
      if (!name) return json({ error: '隧道名不能为空' }, 400);
      const d = await cfApi(acct, base(acct), { method: 'POST', body: JSON.stringify({ name, config_src: 'cloudflare' }) });
      // Token is shown ONCE to the logged-in admin so they can run cloudflared.
      await addAudit(env, a.sess.user, 'tunnel.post', acct.name);
      return json({ ok: true, id: d.result && d.result.id, token: d.result && d.result.token });
    }
    if (b.what === 'route') {
      const host = String(b.hostname || '').trim();
      if (!host) return json({ error: '主机名不能为空' }, 400);
      await cfApi(acct, `/zones/${b.zone}/dns_records`, {
        method: 'POST',
        body: JSON.stringify({ type: 'CNAME', name: host, content: `${b.tunnel}.cfargotunnel.com`, proxied: true, ttl: 1 }),
      });
      await addAudit(env, a.sess.user, 'tunnel.post', acct.name);
      return json({ ok: true });
    }
    if (b.what === 'ingress') {
      // Replace ingress rules (last rule must be the catch-all http_status:404).
      const rulesIn = Array.isArray(b.rules) ? b.rules : [];
      const rules = rulesIn.filter((r) => r.hostname && r.service).map((r) => ({ hostname: String(r.hostname).trim(), service: String(r.service).trim() }));
      rules.push({ service: 'http_status:404' });
      await cfApi(acct, `${base(acct)}/${b.tunnel}/configurations`, { method: 'PUT', body: JSON.stringify({ config: { ingress: rules } }) });
      await addAudit(env, a.sess.user, 'tunnel.post', acct.name);
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
    const id = url.searchParams.get('tunnel');
    await cfApi(acct, `${base(acct)}/${id}/connections`, { method: 'DELETE' }).catch(() => null);
    await cfApi(acct, `${base(acct)}/${id}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'tunnel.delete', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
