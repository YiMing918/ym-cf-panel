// Cloudflare API access + usage aggregation for one account.
// All calls go server-side; the account's API token never reaches the browser.
const API = 'https://api.cloudflare.com/client/v4';

export const QUOTAS = {
  workersDaily: 100000,          // Workers requests / day (free)
  kvReadsDaily: 100000,
  kvWritesDaily: 1000,
  kvDeletesDaily: 1000,
  kvListsDaily: 1000,
  d1RowsReadDaily: 5000000,
  d1RowsWrittenDaily: 100000,
  d1StorageBytes: 5 * 1024 * 1024 * 1024,   // 5 GiB total (free)
  r2ClassAMonthly: 1000000,
  r2ClassBMonthly: 10000000,
  r2StorageBytes: 10 * 1024 * 1024 * 1024,  // 10 GiB (free)
};

const R2_CLASS_A = new Set(['PutObject', 'CopyObject', 'CompleteMultipartUpload', 'CreateMultipartUpload',
  'UploadPart', 'UploadPartCopy', 'ListBuckets', 'ListObjects', 'ListObjectsV2', 'ListMultipartUploads',
  'ListParts', 'PutBucket', 'PutBucketCors', 'PutBucketLifecycleConfiguration', 'CreateBucket']);

async function cfFetch(account, path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + account.token, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.success === false) {
    const msg = (data.errors && data.errors[0] && data.errors[0].message) || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return data;
}

// Full-pagination for cfFetch (same guardrails as _manage.js cfApiAll:
// per_page=100, max 50 pages / 5000 items; truncated + real total surfaced
// in result_info instead of silently dropping everything past page 1).
async function cfFetchAll(account, path, opts = {}) {
  // Most CF list endpoints accept per_page=100, but a few cap it lower
  // (Pages lists cap at 25) — those callers pass opts.perPage to override.
  const { perPage = 100, ...fetchOpts } = opts;
  const maxPages = 50, maxItems = 5000;
  const q = path.indexOf('?');
  const kept = q < 0 ? [] : path.slice(q + 1).split('&').filter((kv) => kv && !kv.startsWith('per_page=') && !kv.startsWith('page='));
  const base = q < 0 ? path : path.slice(0, q) + (kept.length ? '?' + kept.join('&') : '');
  const sep = base.includes('?') ? '&' : '?';
  const all = [];
  let total = null, prevFirst = null;
  for (let page = 1; page <= maxPages; page++) {
    const data = await cfFetch(account, `${base}${sep}per_page=${perPage}&page=${page}`, fetchOpts);
    const rows = Array.isArray(data.result) ? data.result : [];
    const info = data.result_info || {};
    if (typeof info.total_count === 'number') total = info.total_count;
    if (!rows.length) break;
    const firstSig = JSON.stringify(rows[0]);
    if (page > 1 && prevFirst !== null && firstSig === prevFirst && total === null) break;
    prevFirst = firstSig;
    all.push(...rows);
    if (total !== null && all.length >= total) break;
    if (info.total_pages && page >= info.total_pages) break;
    if (!info.total_pages && total === null && rows.length < perPage) break;
    if (all.length >= maxItems) break;
  }
  const truncated = (total !== null && all.length < total) || (all.length >= maxItems && (total === null || all.length < total));
  return { result: all.slice(0, maxItems), result_info: { count: Math.min(all.length, maxItems), total_count: total !== null ? total : all.length, truncated: !!truncated } };
}

async function cfFetchAllNested(account, path, key, opts = {}) {
  const perPage = 100, maxPages = 50, maxItems = 5000;
  const q = path.indexOf('?');
  const kept = q < 0 ? [] : path.slice(q + 1).split('&').filter((kv) => kv && !kv.startsWith('per_page=') && !kv.startsWith('page='));
  const base = q < 0 ? path : path.slice(0, q) + (kept.length ? '?' + kept.join('&') : '');
  const sep = base.includes('?') ? '&' : '?';
  const all = [];
  let total = null, prevFirst = null, firstResult = {};
  for (let page = 1; page <= maxPages; page++) {
    const data = await cfFetch(account, `${base}${sep}per_page=${perPage}&page=${page}`, opts);
    if (page === 1 && data.result && typeof data.result === 'object') firstResult = data.result;
    const rows = (data.result && Array.isArray(data.result[key])) ? data.result[key] : [];
    const info = data.result_info || {};
    if (typeof info.total_count === 'number') total = info.total_count;
    if (!rows.length) break;
    const firstSig = JSON.stringify(rows[0]);
    if (page > 1 && prevFirst !== null && firstSig === prevFirst && total === null) break;
    prevFirst = firstSig;
    all.push(...rows);
    if (total !== null && all.length >= total) break;
    if (info.total_pages && page >= info.total_pages) break;
    if (!info.total_pages && total === null && rows.length < perPage) break;
    if (all.length >= maxItems) break;
  }
  const truncated = (total !== null && all.length < total) || (all.length >= maxItems && (total === null || all.length < total));
  return { result: { ...firstResult, [key]: all.slice(0, maxItems) }, result_info: { count: Math.min(all.length, maxItems), total_count: total !== null ? total : all.length, truncated: !!truncated } };
}

async function gql(account, query, variables) {
  const data = await cfFetch(account, '/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) });
  if (data.errors && data.errors.length) throw new Error(data.errors[0].message || 'GraphQL error');
  return data.data;
}

const isoDay = (d) => d.toISOString().slice(0, 10);

export function rangeWindow(range) {
  const now = new Date();
  const endISO = now.toISOString();
  if (range === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { startISO: start.toISOString(), endISO, startDate: isoDay(start), endDate: isoDay(now) };
  }
  const days = range === '30d' ? 30 : 7;
  const start = new Date(now.getTime() - days * 86400000);
  return { startISO: start.toISOString(), endISO, startDate: isoDay(start), endDate: isoDay(now) };
}

async function section(fn) { // isolate failures per dataset
  try { return { ok: true, data: await fn() }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
}

const Q_WORKERS = `query($a: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: {accountTag: $a}) {
  byScript: workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $e}) {
    sum { requests errors subrequests } quantiles { cpuTimeP50 cpuTimeP99 } dimensions { scriptName } }
} } }`;

const Q_TREND_DAY = `query($a: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: {accountTag: $a}) {
  workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $e}) {
    sum { requests errors } dimensions { date } }
} } }`;

const Q_TREND_HOUR = `query($a: String!, $s: Time!, $e: Time!) { viewer { accounts(filter: {accountTag: $a}) {
  workersInvocationsAdaptive(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $e}) {
    sum { requests errors } dimensions { datetimeFiveMinutes } }
} } }`;

const Q_KV = `query($a: String!, $s: Date!, $e: Date!) { viewer { accounts(filter: {accountTag: $a}) {
  kvOperationsAdaptiveGroups(limit: 1000, filter: {date_geq: $s, date_leq: $e}) {
    sum { requests } dimensions { namespaceId actionType } }
} } }`;

const Q_D1 = `query($a: String!, $s: Date!, $e: Date!) { viewer { accounts(filter: {accountTag: $a}) {
  d1AnalyticsAdaptiveGroups(limit: 1000, filter: {date_geq: $s, date_leq: $e}) {
    sum { readQueries writeQueries rowsRead rowsWritten } dimensions { databaseId } }
} } }`;

const Q_R2 = `query($a: String!, $s: Date!, $e: Date!) { viewer { accounts(filter: {accountTag: $a}) {
  r2OperationsAdaptiveGroups(limit: 1000, filter: {date_geq: $s, date_leq: $e}) {
    sum { requests } dimensions { bucketName actionType } }
  r2StorageAdaptiveGroups(limit: 1000, filter: {date_geq: $s, date_leq: $e}) {
    max { payloadSize } dimensions { bucketName } }
} } }`;

// NOTE: httpRequestsAdaptiveGroups has no sum.requests/sum.bytes — request count is
// the top-level `count` field and transfer is sum.edgeResponseBytes (per CF migration guide).
const Q_ZONE_HTTP = `query($z: String!, $s: Time!, $e: Time!) { viewer { zones(filter: {zoneTag: $z}) {
  httpRequestsAdaptiveGroups(limit: 1000, filter: {datetime_geq: $s, datetime_leq: $e}) {
    count sum { edgeResponseBytes } dimensions { clientCountryName } }
} } }`;
const Q_ZONE_STATUS = `query($z: String!, $s: Time!, $e: Time!) { viewer { zones(filter: {zoneTag: $z}) {
  httpRequestsAdaptiveGroups(limit: 30, filter: {datetime_geq: $s, datetime_leq: $e}, orderBy: [count_DESC]) {
    count dimensions { edgeResponseStatus } }
} } }`;
const Q_ZONE_PATHS = `query($z: String!, $s: Time!, $e: Time!) { viewer { zones(filter: {zoneTag: $z}) {
  httpRequestsAdaptiveGroups(limit: 10, filter: {datetime_geq: $s, datetime_leq: $e}, orderBy: [count_DESC]) {
    count dimensions { clientRequestPath } }
} } }`;
const Q_ZONE_CACHE = `query($z: String!, $s: Time!, $e: Time!) { viewer { zones(filter: {zoneTag: $z}) {
  httpRequestsAdaptiveGroups(limit: 30, filter: {datetime_geq: $s, datetime_leq: $e}) {
    count dimensions { cacheStatus } }
} } }`;

export async function verifyToken(account) {
  const data = await cfFetch(account, '/user/tokens/verify');
  return data.result; // { id, status }
}

export async function getUsage(account, range) {
  const w = rangeWindow(range);
  const vars = { a: account.accountId, s: w.startISO, e: w.endISO };
  const varsD = { a: account.accountId, s: w.startDate, e: w.endDate };

  const [workers, kv, d1, r2, inv] = await Promise.all([
    section(async () => {
      const d = await gql(account, Q_WORKERS, vars);
      const acc = d.viewer.accounts[0] || {};
      const scripts = {};
      let requests = 0, errors = 0, subrequests = 0, pagesRequests = 0;
      for (const row of acc.byScript || []) {
        const name = row.dimensions.scriptName || '(unknown)';
        const s = scripts[name] || (scripts[name] = { name, requests: 0, errors: 0, subrequests: 0, cpuP99: 0, pages: name.startsWith('pages-worker--') });
        s.requests += row.sum.requests; s.errors += row.sum.errors; s.subrequests += row.sum.subrequests;
        s.cpuP99 = Math.max(s.cpuP99, (row.quantiles && row.quantiles.cpuTimeP99) || 0);
        requests += row.sum.requests; errors += row.sum.errors; subrequests += row.sum.subrequests;
        if (s.pages) pagesRequests += row.sum.requests;
      }
      const trend = {};
      try {
        const td = await gql(account, range === 'today' ? Q_TREND_HOUR : Q_TREND_DAY, vars);
        const rows = (td.viewer.accounts[0] || {}).workersInvocationsAdaptive || [];
        for (const row of rows) {
          const raw = row.dimensions.datetimeFiveMinutes || row.dimensions.date || '';
          const label = raw.length > 10 ? raw.slice(11, 16) : raw;
          const t = trend[label] || (trend[label] = { label, requests: 0, errors: 0 });
          t.requests += row.sum.requests; t.errors += row.sum.errors;
        }
      } catch { /* trend is optional */ }
      return {
        requests, errors, subrequests, pagesRequests,
        scripts: Object.values(scripts).sort((x, y) => y.requests - x.requests).slice(0, 20),
        scriptsTotal: Object.keys(scripts).length, // distinct scripts before the Top-20 presentation slice (totals above already cover all)
        trend: Object.values(trend).sort((x, y) => (x.label < y.label ? -1 : 1)),
      };
    }),
    section(async () => {
      const d = await gql(account, Q_KV, varsD);
      const rows = (d.viewer.accounts[0] || {}).kvOperationsAdaptiveGroups || [];
      const tot = { read: 0, write: 0, delete: 0, list: 0, other: 0 };
      const perNs = {};
      for (const row of rows) {
        const act = String(row.dimensions.actionType || '').toLowerCase();
        const key = act in tot ? act : 'other';
        tot[key] += row.sum.requests;
        const ns = row.dimensions.namespaceId || '(unknown)';
        const p = perNs[ns] || (perNs[ns] = { namespaceId: ns, read: 0, write: 0, delete: 0, list: 0, total: 0 });
        if (key !== 'other') p[key] += row.sum.requests;
        p.total += row.sum.requests;
      }
      return { ...tot, namespaces: Object.values(perNs).sort((x, y) => y.total - x.total).slice(0, 20), namespacesTotal: Object.keys(perNs).length };
    }),
    section(async () => {
      const d = await gql(account, Q_D1, varsD);
      const rows = (d.viewer.accounts[0] || {}).d1AnalyticsAdaptiveGroups || [];
      const tot = { readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0 };
      const perDb = {};
      for (const row of rows) {
        for (const k of Object.keys(tot)) tot[k] += row.sum[k] || 0;
        const id = row.dimensions.databaseId || '(unknown)';
        const p = perDb[id] || (perDb[id] = { databaseId: id, readQueries: 0, writeQueries: 0, rowsRead: 0, rowsWritten: 0 });
        for (const k of Object.keys(tot)) p[k] += row.sum[k] || 0;
      }
      return { ...tot, databases: Object.values(perDb).sort((x, y) => y.rowsRead - x.rowsRead) };
    }),
    section(async () => {
      const d = await gql(account, Q_R2, varsD);
      const acc = d.viewer.accounts[0] || {};
      let classA = 0, classB = 0, other = 0;
      const perBucket = {};
      for (const row of acc.r2OperationsAdaptiveGroups || []) {
        const act = row.dimensions.actionType || '';
        const b = row.dimensions.bucketName || '(unknown)';
        const p = perBucket[b] || (perBucket[b] = { bucket: b, classA: 0, classB: 0, storageBytes: 0 });
        if (R2_CLASS_A.has(act)) { classA += row.sum.requests; p.classA += row.sum.requests; }
        else if (act) { classB += row.sum.requests; p.classB += row.sum.requests; }
        else other += row.sum.requests;
      }
      let storageBytes = 0;
      for (const row of acc.r2StorageAdaptiveGroups || []) {
        const b = row.dimensions.bucketName || '(unknown)';
        const p = perBucket[b] || (perBucket[b] = { bucket: b, classA: 0, classB: 0, storageBytes: 0 });
        p.storageBytes = Math.max(p.storageBytes, (row.max && row.max.payloadSize) || 0);
      }
      for (const p of Object.values(perBucket)) storageBytes += p.storageBytes;
      return { classA, classB, other, storageBytes, buckets: Object.values(perBucket).sort((x, y) => (y.classA + y.classB) - (x.classA + x.classB)) };
    }),
    section(async () => {
      const id = account.accountId;
      const wrap = (pr) => pr.then((r) => ({ rows: r.result, info: r.result_info || null })).catch(() => null);
      const [scriptsW, projectsW, dbsW, kvsW, bucketsW, zonesW] = await Promise.all([
        wrap(cfFetchAll(account, `/accounts/${id}/workers/scripts`)),
        wrap(cfFetchAll(account, `/accounts/${id}/pages/projects`, { perPage: 25 })), // Pages lists reject per_page > 25
        wrap(cfFetchAll(account, `/accounts/${id}/d1/database`)),
        wrap(cfFetchAll(account, `/accounts/${id}/storage/kv/namespaces`)),
        wrap(cfFetchAllNested(account, `/accounts/${id}/r2/buckets`, 'buckets')),
        wrap(cfFetchAll(account, `/zones?account.id=${id}`)),
      ]);
      const rowsOf = (w) => (w === null ? null : (Array.isArray(w.rows) ? w.rows : (w.rows && w.rows.buckets) || []));
      const scripts = rowsOf(scriptsW), projects = rowsOf(projectsW), dbs = rowsOf(dbsW), kvs = rowsOf(kvsW), buckets = rowsOf(bucketsW), zones = rowsOf(zonesW);
      const listMeta = {};
      for (const [name, w] of [['scripts', scriptsW], ['projects', projectsW], ['databases', dbsW], ['kvNamespaces', kvsW], ['buckets', bucketsW], ['zones', zonesW]]) {
        if (w && w.info) listMeta[name] = { total: w.info.total_count, truncated: !!w.info.truncated };
      }
      return {
        scripts: scripts === null ? null : scripts.map((s) => ({ name: s.id, modified: s.modified_on })),
        projects: projects === null ? null : projects.map((p) => ({ name: p.name, domains: p.domains || [], modified: p.latest_deployment && p.latest_deployment.modified_on })),
        databases: dbs === null ? null : dbs.map((d) => ({ id: d.uuid || d.id, name: d.name, fileSize: d.file_size || 0 })),
        kvNamespaces: kvs === null ? null : kvs.map((k) => ({ id: k.id, title: k.title })),
        buckets: buckets === null ? null : buckets.map((b) => ({ name: b.name, created: b.creation_date })),
        zones: zones === null ? null : zones.map((z) => ({ id: z.id, name: z.name, status: z.status, plan: z.plan && z.plan.name })),
        listMeta, // per-list { total, truncated } from full pagination (guard 50 pages / 5000 items)
      };
    }),
  ]);

  // Zone HTTP totals (needs zone ids from inventory; skip quietly if unavailable)
  let http = { ok: false, error: 'no zones' };
  if (inv.ok && inv.data.zones && inv.data.zones.length) {
    http = await section(async () => {
      let requests = 0, bytes = 0, firstError = null, okZones = 0;
      const countries = {};
      const byZone = [];
      for (const z of inv.data.zones.slice(0, 100)) { // guard: at most 100 zones analysed; zonesTotal/zonesTruncated below surface any excess
        try {
          const d = await gql(account, Q_ZONE_HTTP, { z: z.id, s: w.startISO, e: w.endISO });
          const rows = ((d.viewer.zones || [])[0] || {}).httpRequestsAdaptiveGroups || [];
          okZones++;
          let zr = 0, zb = 0;
          for (const row of rows) {
            const n = row.count || 0, b = (row.sum && row.sum.edgeResponseBytes) || 0;
            requests += n; bytes += b; zr += n; zb += b;
            const c = row.dimensions.clientCountryName || 'Unknown';
            countries[c] = (countries[c] || 0) + n;
          }
          byZone.push({ name: z.name, requests: zr, bytes: zb });
        } catch (e) { if (!firstError) firstError = e; }
      }
      if (!okZones && firstError) throw firstError;
      const out = {
        requests, bytes,
        zonesAnalyzed: Math.min(inv.data.zones.length, 100), zonesTotal: inv.data.zones.length, zonesTruncated: inv.data.zones.length > 100,
        topCountries: Object.entries(countries).map(([name, requests]) => ({ name, requests }))
          .sort((x, y) => y.requests - x.requests).slice(0, 8),
        byZone: byZone.sort((x, y) => y.requests - x.requests),
      };
      // v3 extras (best-effort, same Zone Analytics Read permission)
      try {
        const statusMap = {}, pathMap = {};
        let cacheHit = 0, cacheTot = 0;
        for (const z of inv.data.zones.slice(0, 5)) {
          const v = { z: z.id, s: w.startISO, e: w.endISO };
          const [qs, qp, qc] = await Promise.allSettled([gql(account, Q_ZONE_STATUS, v), gql(account, Q_ZONE_PATHS, v), gql(account, Q_ZONE_CACHE, v)]);
          if (qs.status === 'fulfilled') for (const row of (((qs.value.viewer.zones || [])[0] || {}).httpRequestsAdaptiveGroups || [])) {
            const c = row.dimensions.edgeResponseStatus; if (c) statusMap[c] = (statusMap[c] || 0) + (row.count || 0);
          }
          if (qp.status === 'fulfilled') for (const row of (((qp.value.viewer.zones || [])[0] || {}).httpRequestsAdaptiveGroups || [])) {
            const p = row.dimensions.clientRequestPath || '/'; pathMap[p] = (pathMap[p] || 0) + (row.count || 0);
          }
          if (qc.status === 'fulfilled') for (const row of (((qc.value.viewer.zones || [])[0] || {}).httpRequestsAdaptiveGroups || [])) {
            const n = row.count || 0; cacheTot += n;
            if (['hit', 'stale', 'updating', 'revalidated'].includes(String(row.dimensions.cacheStatus || '').toLowerCase())) cacheHit += n;
          }
        }
        out.detailZones = Math.min(inv.data.zones.length, 5); // status/paths/cache are aggregated from the first 5 zones only (3 GraphQL calls per zone) — labelled, not hidden
        out.detailTruncated = inv.data.zones.length > 5;
        out.statusCodes = Object.entries(statusMap).map(([code, requests]) => ({ code: Number(code), requests })).sort((a, b) => b.requests - a.requests).slice(0, 10);
        out.topPaths = Object.entries(pathMap).map(([path, requests]) => ({ path, requests })).sort((a, b) => b.requests - a.requests).slice(0, 8);
        out.cacheHitPct = cacheTot > 0 ? Math.round((cacheHit / cacheTot) * 1000) / 10 : null;
      } catch { /* extras are optional */ }
      return out;
    });
  }

  return { range, window: w, workers, kv, d1, r2, inventory: inv, http };
}
