import { requireAuth, json } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Images: list / stats / delete. Needs the Images permission.
const A = (acct) => `/accounts/${acct.accountId}/images/v1`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const [list, stats] = await Promise.all([
      cfApi(acct, `${A(acct)}?per_page=50`),
      cfApi(acct, `${A(acct)}/stats`).catch(() => null),
    ]);
    const imgs = (list.result && list.result.images) || [];
    return json({
      images: imgs.map((im) => ({ id: im.id, filename: im.filename, uploaded: im.uploaded, variants: (im.variants || []).length, firstVariant: (im.variants || [])[0] || '' })),
      stats: stats && stats.result ? stats.result.current : null,
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
