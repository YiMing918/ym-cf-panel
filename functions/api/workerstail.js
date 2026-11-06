import { requireAuth, json, readBody } from '../_auth.js';
import { resolveAccount, cfApi, fail } from '../_manage.js';

// Workers live logs (best effort): open a Tail session, listen over a
// WebSocket for a few seconds from inside the Function, return what arrived.
// Pages Functions can't hold a browser-facing stream for real tailing, so this
// is a snapshot — trigger traffic while it listens.
export async function onRequestPost({ request, env, waitUntil }) {
  const a = await requireAuth(env, request); if (a.error) return a.error;
  try {
    const b = await readBody(request);
    const acct = await resolveAccount(env, b.account);
    const script = String(b.script || '');
    const d = await cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/tails`, { method: 'POST', body: JSON.stringify({}) });
    const tail = d.result;
    if (!tail || !tail.url) return json({ error: '创建日志会话失败' }, 502);
    const events = [];
    const cleanup = () => cfApi(acct, `/accounts/${acct.accountId}/workers/scripts/${script}/tails/${tail.id}`, { method: 'DELETE' }).catch(() => {});
    try {
      const wsResp = await fetch(tail.url.replace(/^http/, 'ws'), { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Protocol': 'trace-v1' } });
      const ws = wsResp.webSocket;
      if (!ws) throw new Error('当前环境不支持 WebSocket 客户端');
      ws.accept();
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 7000);
        ws.addEventListener('message', (ev) => {
          try {
            const m = JSON.parse(ev.data);
            const logs = (m.logs || []).map((l) => (l.message || []).join(' ')).slice(0, 3);
            const exc = (m.exceptions || []).map((x) => x.message).slice(0, 2);
            events.push({ at: m.eventTimestamp, outcome: m.outcome, url: m.event && m.event.request && m.event.request.url, logs, exc });
            if (events.length >= 30) { clearTimeout(timer); resolve(); }
          } catch { /* ignore non-JSON frames */ }
        });
        ws.addEventListener('close', resolve);
        ws.addEventListener('error', resolve);
      });
      try { ws.close(); } catch { /* noop */ }
    } catch (e) {
      await cleanup();
      return json({ error: '日志监听失败：' + String(e.message || e).slice(0, 160) }, 502);
    }
    if (waitUntil) waitUntil(cleanup()); else await cleanup();
    return json({ events, note: '这是 7 秒窗口内的日志快照；先点开始、再去访问这个 Worker 才能抓到请求。' });
  } catch (e) { return fail(e); }
}
