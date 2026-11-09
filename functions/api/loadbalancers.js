import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Load Balancers: zone LBs (list / enable-disable / delete) + account pools
// and monitors (list). Needs Load Balancing permissions.
const AA = (acct) => `/accounts/${acct.accountId}`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const zone = url.searchParams.get('zone');
    const [lbs, pools, monitors] = await Promise.all([
      zone ? cfApiAll(acct, `/zones/${zone}/load_balancers`).catch((e) => ({ error: String(e.message || e) })) : Promise.resolve({ result: [], result_info: { total_count: 0, truncated: false } }),
      cfApiAll(acct, `${AA(acct)}/load_balancers/pools`).catch(() => null),
      cfApiAll(acct, `${AA(acct)}/load_balancers/monitors`).catch(() => null),
    ]);
    if (lbs.error) return json({ error: lbs.error }, 502);
    return json({
      lbs: (lbs.result || []).map((x) => ({ id: x.id, name: x.name, enabled: x.enabled, proxied: x.proxied, fallbackPool: x.fallback_pool, pools: (x.default_pools || []).length })),
      pools: ((pools && pools.result) || []).map((x) => ({ id: x.id, name: x.name, enabled: x.enabled, origins: (x.origins || []).length })),
      monitors: ((monitors && monitors.result) || []).map((x) => ({ id: x.id, type: x.type, description: x.description || '', path: x.path || '' })),
      totals: {
        lbs: lbs.result_info ? lbs.result_info.total_count : (lbs.result || []).length, lbsTruncated: !!(lbs.result_info && lbs.result_info.truncated),
        pools: pools && pools.result_info ? pools.result_info.total_count : ((pools && pools.result) || []).length, poolsTruncated: !!(pools && pools.result_info && pools.result_info.truncated),
        monitors: monitors && monitors.result_info ? monitors.result_info.total_count : ((monitors && monitors.result) || []).length, monitorsTruncated: !!(monitors && monitors.result_info && monitors.result_info.truncated),
      },
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    if (b.what === 'toggle') {
      await cfApi(acct, `/zones/${b.zone}/load_balancers/${b.id}`, { method: 'PATCH', body: JSON.stringify({ enabled: !!b.enabled }) });
      await addAudit(env, a.sess.user, 'lb.toggle', `${acct.name} · 负载均衡 ${b.enabled ? '启用' : '停用'}`);
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
    await cfApi(acct, `/zones/${url.searchParams.get('zone')}/load_balancers/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'lb.delete', `${acct.name} · 删除负载均衡`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
