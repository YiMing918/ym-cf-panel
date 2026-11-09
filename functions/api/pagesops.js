import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

export async function onRequestGet({ request, env }) { // deployments of one project
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const data = await cfApiAll(acct, `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(url.searchParams.get('project'))}/deployments`);
    return json({
      total: data.result_info ? data.result_info.total_count : (data.result || []).length, truncated: !!(data.result_info && data.result_info.truncated),
      deployments: (data.result || []).map((d) => ({
        id: d.id, env: d.environment, created: d.created_on, url: d.url,
        status: d.latest_stage && d.latest_stage.status, stage: d.latest_stage && d.latest_stage.name,
        source: d.deployment_trigger && d.deployment_trigger.metadata && d.deployment_trigger.metadata.commit_hash ? d.deployment_trigger.metadata.commit_hash.slice(0, 7) : '',
      })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestPost({ request, env }) { // rollback | retry
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const path = `/accounts/${acct.accountId}/pages/projects/${encodeURIComponent(b.project)}/deployments/${b.deployment}`;
    if (b.action === 'rollback') await cfApi(acct, path + '/rollback', { method: 'POST' });
    else if (b.action === 'retry') await cfApi(acct, path + '/retry', { method: 'POST' });
    else return json({ error: '未知操作' }, 400);
    await addAudit(env, a.sess.user, 'pages.deploy.post', acct.name);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
