import { requireAuth, json, readBody, getAdmin, verifyPassword, hashPassword } from '../_auth.js';
import { getSettings, saveSettings } from '../_store.js';

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  return json({ settings: await getSettings(env) });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(env, request);
  if (a.error) return a.error;
  const body = await readBody(request);
  const s = await getSettings(env);
  if (typeof body.panelName === 'string' && body.panelName.trim()) s.panelName = body.panelName.trim().slice(0, 40);
  if (typeof body.publicSummary === 'boolean') s.publicSummary = body.publicSummary;
  await saveSettings(env, s);
  // optional password change
  if (body.newPassword) {
    const admin = await getAdmin(env);
    if (!(await verifyPassword(String(body.oldPassword || ''), admin))) return json({ error: '原密码不对，设置已保存但密码未改' }, 400);
    if (String(body.newPassword).length < 4) return json({ error: '新密码至少 4 位' }, 400);
    const { salt, hash } = await hashPassword(String(body.newPassword));
    await env.PANEL_KV.put('admin', JSON.stringify({ ...admin, salt, hash }));
  }
  return json({ ok: true, settings: s });
}
