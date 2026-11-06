import { requireAuth, json } from '../_auth.js';
import { getAudit } from '../_store.js';

// Panel-local audit log viewer data (management actions, newest first).
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  return json({ entries: await getAudit(env) });
}
