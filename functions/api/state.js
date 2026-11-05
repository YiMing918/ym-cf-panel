import { getAdmin, getSession, json } from '../_auth.js';
import { getAccounts, getSettings, maskAccount } from '../_store.js';

export async function onRequestGet({ request, env }) {
  const admin = await getAdmin(env);
  const settings = await getSettings(env);
  if (!admin) return json({ needsSetup: true, authed: false, settings: { panelName: settings.panelName, publicSummary: settings.publicSummary } });
  const sess = await getSession(env, request);
  if (!sess) return json({ needsSetup: false, authed: false, settings: { panelName: settings.panelName, publicSummary: settings.publicSummary } });
  const accounts = await getAccounts(env);
  return json({ needsSetup: false, authed: true, user: sess.user, settings, accounts: accounts.map(maskAccount) });
}
