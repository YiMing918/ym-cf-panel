import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Cloudflare Tunnel: list / create / delete / ingress view + one-click DNS route.
// Needs Account → Cloudflare Tunnel Edit (+ DNS Edit for the route record).
const base = (acct) => `/accounts/${acct.accountId}/cfd_tunnel`;

// Build the configuration to PUT when saving ingress rules.
// - Starts from the CURRENT full configuration, so top-level fields the
//   panel doesn't model survive the save.
// - Client rules keep any extra fields they carried from the read
//   (path, originRequest, …); hostname/service are re-trimmed here.
// - A literal '(catch-all)' hostname (an old display artifact) and any
//   hostname-less rules the client sent are dropped; the tail rule is
//   the tunnel's ORIGINAL hostname-less rule when there was one, else
//   the standard http_status:404. (Cloudflare requires the last rule
//   to have no hostname.)
export function buildIngressConfig(curCfg, clientRules) {
  const cur = curCfg || {};
  const orig = Array.isArray(cur.ingress) ? cur.ingress : [];
  const origTail = [...orig].reverse().find((x) => x && !x.hostname) || null;
  const rules = (Array.isArray(clientRules) ? clientRules : [])
    .filter((r) => r && r.hostname && r.service && String(r.hostname).trim() !== '(catch-all)')
    .map((r) => ({ ...r, hostname: String(r.hostname).trim(), service: String(r.service).trim() }));
  rules.push(origTail ? { ...origTail } : { service: 'http_status:404' });
  return { ...cur, ingress: rules };
}

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
      const cfgObj = (cfg && cfg.result && cfg.result.config) || {};
      return json({
        tunnel: { id: r.id, name: r.name, status: r.status, created: r.created_at, connections: (r.connections || []).length },
        // Full rule objects, hostname left EMPTY for the catch-all rule.
        // (An earlier version rewrote it to the display string
        // '(catch-all)', which the save path then wrote back to
        // Cloudflare as a literal hostname.) Extra rule fields (path,
        // originRequest, …) ride along so a save can preserve them.
        ingress: (cfgObj.ingress || []).map((x) => ({ ...x })),
        config: cfgObj,
      });
    }
    const d = await cfApiAll(acct, `${base(acct)}?is_deleted=false`);
    return json({
      total: d.result_info ? d.result_info.total_count : (d.result || []).length, truncated: !!(d.result_info && d.result_info.truncated),
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
      // Merge onto the CURRENT configuration (fetched fresh): PUTting
      // only { config: { ingress } } would drop every other field of
      // the tunnel config (top-level settings and per-rule extras like
      // path / originRequest). If the current config cannot be read,
      // abort — never overwrite blind.
      let curCfg = null;
      try {
        const cur = await cfApi(acct, `${base(acct)}/${b.tunnel}/configurations`);
        curCfg = (cur && cur.result && cur.result.config) || null;
      } catch { curCfg = null; }
      if (!curCfg) return json({ error: '读取现有隧道配置失败，已取消保存（避免丢失原有配置）' }, 502);
      const config = buildIngressConfig(curCfg, b.rules);
      await cfApi(acct, `${base(acct)}/${b.tunnel}/configurations`, { method: 'PUT', body: JSON.stringify({ config }) });
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
