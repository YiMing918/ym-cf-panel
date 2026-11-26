// build/worker-entry.js — 「_worker.js 高级模式包」的构建入口（本文件不要直接部署）
//
// 为什么需要它：Cloudflare 控制台的「上传资产 / 拖拽」部署**不会编译 functions/
// 文件夹**（官方文档明示），把普通部署包直传上去会得到一个页面能开、但全部
// 管理接口都坏死的站。官方确认根目录的单个 `_worker.js` 在拖拽上传下受
// 支持，所以打包时用 esbuild 把 functions/ 的原处理函数合成一个 _worker.js，
// 原函数源码一字不改，逻辑还是同一套。
//
// 构建命令（release-pack 工作流里执行，本地复现也是这一条）：
//   esbuild build/worker-entry.js --bundle --format=esm \
//     --platform=neutral --target=es2022 --outfile=_worker.js
//
// 路由语义与 functions 文件路由对齐：本仓 40 个接口文件全部是方法专用导出
// （onRequestGet/Post/Put/Delete 的组合），入口按（路径，方法）精确分发；
// 已知接口路径的方法未命中（含 HEAD 打 /api/*）直接回 JSON 404，不落
// 静态层；只有路径未命中才落到静态层。路径匹配前去掉一个尾斜杠
// （与原版文件路由的尾斜杠等价口径一致）。未命中走 env.ASSETS.fetch；资产
// 未命中且是 GET/HEAD 时，按 Pages 在无 404.html 时的单页回退口径回
// /index.html（原版线上即如此）。
// _headers：高级模式下平台不再应用 _headers。原版口径是「_headers 只管静态
// 层响应、不管函数响应」（函数响应里的 no-store 等都是函数自己设的，线上
// 实测），故本入口只给资产层出来的响应补 _headers 的四个安全头，函数响应
// 原样返回。改 _headers 时记得同步改这里的 STATIC_HEADERS。

import * as m_access from '../functions/api/access.js';
import * as m_accountadmin from '../functions/api/accountadmin.js';
import * as m_accounts from '../functions/api/accounts.js';
import * as m_accttokens from '../functions/api/accttokens.js';
import * as m_audit from '../functions/api/audit.js';
import * as m_certs from '../functions/api/certs.js';
import * as m_d1admin from '../functions/api/d1admin.js';
import * as m_d1sql from '../functions/api/d1sql.js';
import * as m_dns from '../functions/api/dns.js';
import * as m_dnsio from '../functions/api/dnsio.js';
import * as m_domains from '../functions/api/domains.js';
import * as m_emailroute from '../functions/api/emailroute.js';
import * as m_health from '../functions/api/health.js';
import * as m_images from '../functions/api/images.js';
import * as m_kvdata from '../functions/api/kvdata.js';
import * as m_kvio from '../functions/api/kvio.js';
import * as m_kvns from '../functions/api/kvns.js';
import * as m_loadbalancers from '../functions/api/loadbalancers.js';
import * as m_login from '../functions/api/login.js';
import * as m_logout from '../functions/api/logout.js';
import * as m_pagesadmin from '../functions/api/pagesadmin.js';
import * as m_pagesops from '../functions/api/pagesops.js';
import * as m_public from '../functions/api/public.js';
import * as m_purge from '../functions/api/purge.js';
import * as m_queues from '../functions/api/queues.js';
import * as m_r2admin from '../functions/api/r2admin.js';
import * as m_r2objects from '../functions/api/r2objects.js';
import * as m_registrar from '../functions/api/registrar.js';
import * as m_rules from '../functions/api/rules.js';
import * as m_settings from '../functions/api/settings.js';
import * as m_setup from '../functions/api/setup.js';
import * as m_state from '../functions/api/state.js';
import * as m_stream from '../functions/api/stream.js';
import * as m_tunnels from '../functions/api/tunnels.js';
import * as m_usage from '../functions/api/usage.js';
import * as m_workerscode from '../functions/api/workerscode.js';
import * as m_workersinfo from '../functions/api/workersinfo.js';
import * as m_workersops from '../functions/api/workersops.js';
import * as m_workerstail from '../functions/api/workerstail.js';
import * as m_zoneset from '../functions/api/zoneset.js';

const ROUTES = {
  '/api/access': { onRequestDelete: m_access.onRequestDelete, onRequestGet: m_access.onRequestGet, onRequestPost: m_access.onRequestPost },
  '/api/accountadmin': { onRequestDelete: m_accountadmin.onRequestDelete, onRequestGet: m_accountadmin.onRequestGet, onRequestPost: m_accountadmin.onRequestPost },
  '/api/accounts': { onRequestDelete: m_accounts.onRequestDelete, onRequestGet: m_accounts.onRequestGet, onRequestPost: m_accounts.onRequestPost, onRequestPut: m_accounts.onRequestPut },
  '/api/accttokens': { onRequestDelete: m_accttokens.onRequestDelete, onRequestGet: m_accttokens.onRequestGet, onRequestPost: m_accttokens.onRequestPost },
  '/api/audit': { onRequestGet: m_audit.onRequestGet },
  '/api/certs': { onRequestDelete: m_certs.onRequestDelete, onRequestGet: m_certs.onRequestGet, onRequestPost: m_certs.onRequestPost },
  '/api/d1admin': { onRequestDelete: m_d1admin.onRequestDelete, onRequestPost: m_d1admin.onRequestPost },
  '/api/d1sql': { onRequestGet: m_d1sql.onRequestGet, onRequestPost: m_d1sql.onRequestPost },
  '/api/dns': { onRequestDelete: m_dns.onRequestDelete, onRequestGet: m_dns.onRequestGet, onRequestPost: m_dns.onRequestPost, onRequestPut: m_dns.onRequestPut },
  '/api/dnsio': { onRequestGet: m_dnsio.onRequestGet, onRequestPost: m_dnsio.onRequestPost },
  '/api/domains': { onRequestDelete: m_domains.onRequestDelete, onRequestGet: m_domains.onRequestGet, onRequestPost: m_domains.onRequestPost },
  '/api/emailroute': { onRequestDelete: m_emailroute.onRequestDelete, onRequestGet: m_emailroute.onRequestGet, onRequestPost: m_emailroute.onRequestPost },
  '/api/health': { onRequestPost: m_health.onRequestPost },
  '/api/images': { onRequestDelete: m_images.onRequestDelete, onRequestGet: m_images.onRequestGet },
  '/api/kvdata': { onRequestDelete: m_kvdata.onRequestDelete, onRequestGet: m_kvdata.onRequestGet, onRequestPut: m_kvdata.onRequestPut },
  '/api/kvio': { onRequestGet: m_kvio.onRequestGet, onRequestPost: m_kvio.onRequestPost },
  '/api/kvns': { onRequestDelete: m_kvns.onRequestDelete, onRequestPost: m_kvns.onRequestPost, onRequestPut: m_kvns.onRequestPut },
  '/api/loadbalancers': { onRequestDelete: m_loadbalancers.onRequestDelete, onRequestGet: m_loadbalancers.onRequestGet, onRequestPost: m_loadbalancers.onRequestPost },
  '/api/login': { onRequestPost: m_login.onRequestPost },
  '/api/logout': { onRequestPost: m_logout.onRequestPost },
  '/api/pagesadmin': { onRequestDelete: m_pagesadmin.onRequestDelete, onRequestGet: m_pagesadmin.onRequestGet, onRequestPost: m_pagesadmin.onRequestPost },
  '/api/pagesops': { onRequestGet: m_pagesops.onRequestGet, onRequestPost: m_pagesops.onRequestPost },
  '/api/public': { onRequestGet: m_public.onRequestGet },
  '/api/purge': { onRequestPost: m_purge.onRequestPost },
  '/api/queues': { onRequestDelete: m_queues.onRequestDelete, onRequestGet: m_queues.onRequestGet, onRequestPost: m_queues.onRequestPost },
  '/api/r2admin': { onRequestDelete: m_r2admin.onRequestDelete, onRequestPost: m_r2admin.onRequestPost },
  '/api/r2objects': { onRequestDelete: m_r2objects.onRequestDelete, onRequestGet: m_r2objects.onRequestGet, onRequestPost: m_r2objects.onRequestPost },
  '/api/registrar': { onRequestGet: m_registrar.onRequestGet, onRequestPost: m_registrar.onRequestPost },
  '/api/rules': { onRequestDelete: m_rules.onRequestDelete, onRequestGet: m_rules.onRequestGet, onRequestPost: m_rules.onRequestPost },
  '/api/settings': { onRequestGet: m_settings.onRequestGet, onRequestPost: m_settings.onRequestPost },
  '/api/setup': { onRequestPost: m_setup.onRequestPost },
  '/api/state': { onRequestGet: m_state.onRequestGet },
  '/api/stream': { onRequestDelete: m_stream.onRequestDelete, onRequestGet: m_stream.onRequestGet },
  '/api/tunnels': { onRequestDelete: m_tunnels.onRequestDelete, onRequestGet: m_tunnels.onRequestGet, onRequestPost: m_tunnels.onRequestPost },
  '/api/usage': { onRequestGet: m_usage.onRequestGet },
  '/api/workerscode': { onRequestDelete: m_workerscode.onRequestDelete, onRequestGet: m_workerscode.onRequestGet, onRequestPost: m_workerscode.onRequestPost },
  '/api/workersinfo': { onRequestGet: m_workersinfo.onRequestGet },
  '/api/workersops': { onRequestGet: m_workersops.onRequestGet, onRequestPost: m_workersops.onRequestPost },
  '/api/workerstail': { onRequestPost: m_workerstail.onRequestPost },
  '/api/zoneset': { onRequestGet: m_zoneset.onRequestGet, onRequestPost: m_zoneset.onRequestPost },
};

const STATIC_HEADERS = [
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'no-referrer'],
  ['Content-Security-Policy', "frame-ancestors 'none'"],
];

async function serveAsset(request, env, url) {
  let resp = await env.ASSETS.fetch(request);
  if (resp.status === 404 && (request.method === 'GET' || request.method === 'HEAD')) {
    const idx = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
    if (idx.ok) {
      resp = new Response(request.method === 'HEAD' ? null : idx.body, {
        status: 200,
        headers: idx.headers,
      });
    }
  }
  const headers = new Headers(resp.headers);
  for (const [k, v] of STATIC_HEADERS) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let path = url.pathname;
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    const route = ROUTES[path];
    if (!route && path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
    if (route) {
      const handler = route['onRequest' + request.method.charAt(0) + request.method.slice(1).toLowerCase()];
      if (!handler) {
        return new Response(JSON.stringify({ error: 'not_found' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      return handler({
        request,
        env,
        params: {},
        waitUntil: ctx.waitUntil.bind(ctx),
        next: () => serveAsset(request, env, url),
      });
    }
    return serveAsset(request, env, url);
  },
};
