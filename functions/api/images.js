import { requireAuth, json } from '../_auth.js';
import { resolveAccount, cfApi, cfApiAll, cfApiAllNested, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Images: list / stats / delete. Needs the Images permission.
const A = (acct) => `/accounts/${acct.accountId}/images/v1`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const [list, stats] = await Promise.all([
      cfApiAllNested(acct, A(acct), 'images'),
      cfApi(acct, `${A(acct)}/stats`).catch(() => null),
    ]);
    const imgs = (list.result && list.result.images) || [];
    return json({
      images: imgs.map((im) => ({ id: im.id, filename: im.filename, uploaded: im.uploaded, variants: (im.variants || []).length, firstVariant: (im.variants || [])[0] || '' })),
      stats: stats && stats.result ? stats.result.current : null,
      total: list.result_info ? list.result_info.total_count : imgs.length, truncated: !!(list.result_info && list.result_info.truncated),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${A(acct)}/${url.searchParams.get('id')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'image.delete', `${acct.name} · 删除图片`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
