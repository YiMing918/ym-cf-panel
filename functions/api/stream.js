import { requireAuth, json } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';
import { addAudit } from '../_store.js';

// Stream: video list / delete. Needs the Stream permission.
const A = (acct) => `/accounts/${acct.accountId}/stream`;

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    const d = await cfApi(acct, `${A(acct)}?per_page=50`);
    return json({
      videos: (d.result || []).map((v) => ({
        uid: v.uid, name: (v.meta && v.meta.name) || '(未命名)', state: v.status && v.status.state,
        duration: v.duration, size: v.size, created: v.created, ready: v.readyToStream,
        hls: v.playback && v.playback.hls,
      })),
    });
  } catch (e) { return fail(e); }
}

export async function onRequestDelete({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const url = new URL(request.url);
    const acct = await resolveAccount(env, url.searchParams.get('account'));
    await cfApi(acct, `${A(acct)}/${url.searchParams.get('uid')}`, { method: 'DELETE' });
    await addAudit(env, a.sess.user, 'stream.delete', `${acct.name} · 删除视频`);
    return json({ ok: true });
  } catch (e) { return fail(e); }
}
