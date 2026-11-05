import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// Workers versions + deployments; deploying a version = rollback/roll-forward.
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const script = encodeURIComponent(url.searchParams.get('script'));
    const [vers, deps] = await Promise.all([
      cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/versions?per_page=10`).catch(() => ({ result: { items: [] } })),
      cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/deployments`).catch(() => ({ result: { deployments: [] } })),
    ]);
    const items = (vers.result && (vers.result.items || vers.result)) || [];
    const deployments = (deps.result && deps.result.deployments) || [];
    return json({
      versions: (Array.isArray(items) ? items : []).map((v) => ({ id: v.id, number: v.number, created: v.metadata && v.metadata.created_on, author: v.metadata && v.metadata.author_email })),
      deployments: deployments.map((d) => ({ id: d.id, strategy: d.strategy, created: d.created_on, versions: (d.versions || []).map((v) => ({ id: v.version_id, pct: v.percentage })) })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) { // deploy one version at 100%
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    await cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${encodeURIComponent(b.script)}/deployments`, {
      method: 'POST',
      body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: b.version, percentage: 100 }], annotations: { 'workers/message': 'Deployed from YM CF Panel' } }),
    });
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
