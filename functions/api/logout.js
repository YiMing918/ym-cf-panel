import { cookieOf, clearCookie, json } from '../_auth.js';

export async function onRequestPost({ request, env }) {
  const token = cookieOf(request);
  if (token) await env.PANEL_KV.delete('sess:' + token);
  return json({ ok: true }, 200, { 'Set-Cookie': clearCookie() });
}
