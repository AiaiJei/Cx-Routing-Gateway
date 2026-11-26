import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import { validateUpstreamDestination } from '../../../packages/shared/src/destination-policy.mjs';
import { createClientKeyService } from './client-key-service.mjs';
import { saveRouteBatch } from './route-service.mjs';
import { updateRouteCapabilities } from '../../../packages/shared/src/model-capabilities.cjs';
import { updateRouteReasoning } from '../../../packages/shared/src/reasoning-policy.mjs';

const MAX_BODY = 1024 * 1024;
const protocols = new Set(['Res', 'Mes', 'Chat']);
const defaultProfiles = { Res: { providerId: 'openai', apiProfile: 'openai-responses-v1' }, Mes: { providerId: 'anthropic', apiProfile: 'anthropic-messages-2026-10-21' }, Chat: { providerId: 'openai', apiProfile: 'openai-chat-completions-v1' } };
function upstreamUrl(baseUrl, endpoint) { const base = baseUrl.replace(/\/$/, ''); return base.endsWith('/v1') && endpoint.startsWith('/v1/') ? `${base}${endpoint.slice(3)}` : `${base}${endpoint}`; }

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

async function bodyOf(req) {
  let size = 0;
  let data = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    data += chunk;
  }
  if (!data) return {};
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }); }
}

function publicState(config) {
  return { ...config, clientKeys: config.clientKeys.map(({ keyHash, secretRef, ...key }) => key) };
}

function requireProtocol(value) {
  if (!protocols.has(value)) throw Object.assign(new Error('Unsupported protocol'), { statusCode: 400 });
}

function profileFor(protocol, input = {}) {
  const defaults = defaultProfiles[protocol];
  const providerId = String(input.providerId || defaults.providerId).trim();
  const apiProfile = String(input.apiProfile || defaults.apiProfile).trim();
  if (!/^[a-z0-9][a-z0-9._-]{1,99}$/i.test(providerId) || !/^[a-z0-9][a-z0-9._-]{1,119}$/i.test(apiProfile)) throw Object.assign(new Error('Invalid upstream profile'), { statusCode: 400 });
  return { providerId, apiProfile };
}

async function validateBaseUrl(raw, allowPrivateNetwork = false, lookup = dns.lookup, approvedAddresses = []) {
  return validateUpstreamDestination(raw, { trustedPrivateNetwork: allowPrivateNetwork, lookup, approvedAddresses });
}

function requestJsonAtApprovedAddress(rawUrl, headers, approvedAddresses, timeoutMs = 5000) {
  const target = new URL(rawUrl);
  const address = approvedAddresses[0];
  if (!address) throw Object.assign(new Error('Upstream host did not resolve'), { code: 'upstream_error' });
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: target.protocol,
      hostname: address,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers: { ...headers, host: target.host },
      servername: target.hostname,
      timeout: timeoutMs,
    }, (response) => {
      let data = '';
      let size = 0;
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_BODY) request.destroy(Object.assign(new Error('Upstream response too large'), { code: 'response_too_large' }));
        else data += chunk;
      });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) return reject(Object.assign(new Error(`Upstream returned ${response.statusCode}`), { code: 'upstream_status', statusCode: 502 }));
        try { resolve(JSON.parse(data)); } catch { reject(Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 })); }
      });
    });
    request.on('timeout', () => request.destroy(Object.assign(new Error('Upstream timeout'), { code: 'timeout' })));
    request.on('error', reject);
    request.end();
  });
}

function authorize(req, controlToken) {
  if (!controlToken) return;
  const value = req.headers.authorization;
  if (value !== `Bearer ${controlToken}`) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
}

export function createControlServer({ store, vault, controlToken = process.env.CXRG_CONTROL_TOKEN, allowUnauthenticated = false, dnsLookup = dns.lookup } = {}) {
  if (!store || !vault) throw new Error('Control server requires store and vault');
  if (!controlToken && !allowUnauthenticated) throw new Error('CXRG_CONTROL_TOKEN is required for local-control');
  const clientKeys = createClientKeyService({ store, vault });
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok', service: 'local-control' });
      authorize(req, allowUnauthenticated ? undefined : controlToken);
      if (req.method === 'GET' && url.pathname === '/v1/control/state') return send(res, 200, publicState(await store.read()));
      if (req.method === 'GET' && url.pathname === '/v1/control/logs') {
        const config = await store.read();
        const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 500);
        const status = url.searchParams.get('status');
        const logs = config.usage.filter((item) => !status || item.status === status).slice(-limit).reverse();
        return send(res, 200, { logs });
      }
      if (req.method === 'DELETE' && url.pathname === '/v1/control/logs') {
        let removedCount = 0;
        await store.update((config) => {
          removedCount = config.usage.length;
          return { ...config, usage: [] };
        });
        return send(res, 200, { deleted: true, removedCount });
      }
      if (req.method === 'GET' && url.pathname === '/v1/control/metrics') {
        const usage = (await store.read()).usage || [];
        const completed = usage.filter((item) => item.status === 'completed').length;
        const rejected = usage.filter((item) => item.status === 'rejected').length;
        const failed = usage.filter((item) => item.status === 'failed').length;
        const timed = usage.filter((item) => typeof item.durationMs === 'number');
        return send(res, 200, { total: usage.length, completed, rejected, failed, avgDurationMs: timed.length ? Math.round(timed.reduce((sum, item) => sum + item.durationMs, 0) / timed.length) : null });
      }
      if (parts[0] !== 'v1' || parts[1] !== 'control') return send(res, 404, { error: 'not_found' });

      if (req.method === 'PATCH' && parts[2] === 'settings' && parts.length === 3) {
        const input = await bodyOf(req);
        if (input.usageRetentionCount !== undefined && (!Number.isInteger(input.usageRetentionCount) || input.usageRetentionCount < 1 || input.usageRetentionCount > 100_000)) throw Object.assign(new Error('Invalid usage retention count'), { statusCode: 400 });
        const next = await store.update((value) => ({ ...value, settings: { ...value.settings, ...(input.usageRetentionCount === undefined ? {} : { usageRetentionCount: input.usageRetentionCount }) } }));
        return send(res, 200, { settings: next.settings });
      }

      if (req.method === 'POST' && parts[2] === 'upstreams' && parts.length === 3) {
        const input = await bodyOf(req);
        const upstreamProtocol = input.protocol || 'Chat';
        requireProtocol(upstreamProtocol);
        const profile = profileFor(upstreamProtocol, input);
        const destination = await validateBaseUrl(input.baseUrl, input.allowPrivateNetwork === true, dnsLookup);
        const credentialRef = input.apiKey ? await vault.put(input.apiKey) : undefined;
        const upstream = { id: `up_${crypto.randomUUID()}`, name: String(input.name || 'Upstream'), baseUrl: input.baseUrl.replace(/\/$/, ''), protocol: upstreamProtocol, ...profile, credentialRef, trustedPrivateNetwork: input.allowPrivateNetwork === true, approvedAddresses: destination.addresses, enabled: input.enabled !== false, models: [] };
        await store.update((config) => ({ ...config, upstreams: [...config.upstreams, upstream] }));
        return send(res, 201, upstream);
      }
      if (req.method === 'POST' && url.pathname === '/v1/control/routes/batch') {
        const input = await bodyOf(req);
        const { inboundProtocol, outboundProtocol, targets, failover } = input;
        requireProtocol(inboundProtocol);
        requireProtocol(outboundProtocol);
        if (!Array.isArray(targets) || !targets.length || targets.length > 512) return send(res, 400, { error: 'invalid_targets' });
        if (failover !== undefined && (!failover || !Number.isInteger(failover.failureThreshold) || failover.failureThreshold < 1 || failover.failureThreshold > 100 || !Array.isArray(failover.statusClasses) || !failover.statusClasses.length || failover.statusClasses.some(value => value !== 4 && value !== 5) || new Set(failover.statusClasses).size !== failover.statusClasses.length)) return send(res, 400, { error: 'invalid_failover_policy' });
        let saved;
        await store.update(config => {
          const result = saveRouteBatch(config, input);
          saved = result.routes;
          return result.config;
        });
        return send(res, 200, { routes: saved });
      }
      if (req.method === 'POST' && parts[2] === 'routes' && parts.length === 3) {
        const input = await bodyOf(req);
        requireProtocol(input.inboundProtocol); requireProtocol(input.outboundProtocol);
        const route = updateRouteCapabilities(updateRouteReasoning({ id: `route_${crypto.randomUUID()}`, alias: String(input.alias || ''), inboundProtocol: input.inboundProtocol, outboundProtocol: input.outboundProtocol, upstreamId: input.upstreamId, modelId: String(input.modelId || ''), enabled: input.enabled !== false, allowLossy: input.allowLossy === true }, input), input);
        if (!route.alias || !route.modelId) throw Object.assign(new Error('Route alias and model are required'), { statusCode: 400 });
        await store.update((value) => {
          if (!value.upstreams.some((item) => item.id === route.upstreamId)) throw Object.assign(new Error('Unknown upstream'), { statusCode: 400 });
          if (route.enabled && value.routes.some((item) => item.enabled && item.alias === route.alias && item.inboundProtocol === route.inboundProtocol)) throw Object.assign(new Error('route_conflict'), { statusCode: 409 });
          return { ...value, routes: [...value.routes, route] };
        });
        return send(res, 201, route);
      }
      if ((req.method === 'PATCH' || req.method === 'DELETE') && parts[2] === 'upstreams' && parts[3]) {
        const id = parts[3];
        const config = await store.read();
        const current = config.upstreams.find((item) => item.id === id);
        if (!current) return send(res, 404, { error: 'not_found' });
        if (req.method === 'DELETE') {
          let deletedUpstream;
          await store.update((value) => {
            deletedUpstream = value.upstreams.find((item) => item.id === id);
            if (!deletedUpstream) throw Object.assign(new Error('not_found'), { statusCode: 404 });
            const routes = value.routes
              .filter((route) => route.upstreamId === id || (Array.isArray(route.targets) && route.targets.some((target) => target?.upstreamId === id)))
              .map(({ id: routeId, alias, inboundProtocol }) => ({ id: routeId, alias, inboundProtocol }));
            if (routes.length) throw Object.assign(new Error('upstream_in_use'), { statusCode: 409, routes });
            return { ...value, upstreams: value.upstreams.filter((item) => item.id !== id) };
          });
          if (deletedUpstream.credentialRef) await vault.remove(deletedUpstream.credentialRef);
          return send(res, 200, { id, deleted: true });
        }
        const input = await bodyOf(req);
        if (input.protocol) requireProtocol(input.protocol);
        if (input.baseUrl !== undefined && (typeof input.baseUrl !== 'string' || !input.baseUrl.trim())) throw Object.assign(new Error('Invalid upstream URL'), { statusCode: 400 });
        if (input.apiKey !== undefined && typeof input.apiKey !== 'string') throw Object.assign(new Error('Invalid upstream key'), { statusCode: 400 });
        const baseUrl = input.baseUrl === undefined ? current.baseUrl : input.baseUrl.trim();
        const shouldValidateDestination = input.baseUrl !== undefined || input.allowPrivateNetwork !== undefined;
        const trustedPrivateNetwork = input.allowPrivateNetwork === undefined ? current.trustedPrivateNetwork === true : input.allowPrivateNetwork === true;
        let destination;
        if (shouldValidateDestination) {
          if (typeof baseUrl !== 'string' || !baseUrl.trim()) throw Object.assign(new Error('Invalid upstream URL'), { statusCode: 400 });
          try { destination = await validateBaseUrl(baseUrl, trustedPrivateNetwork, dnsLookup); }
          catch (error) { if (!error.statusCode) error.statusCode = 400; throw error; }
        }
        const replacementCredentialRef = input.apiKey ? await vault.put(input.apiKey) : undefined;
        let replacedCredentialRef;
        let updatedUpstream;
        try {
          await store.update((value) => {
            const latest = value.upstreams.find((item) => item.id === id);
            if (!latest) throw Object.assign(new Error('not_found'), { statusCode: 404 });
            if (shouldValidateDestination && input.baseUrl === undefined && latest.baseUrl !== current.baseUrl) throw Object.assign(new Error('Upstream changed while validating its destination'), { statusCode: 409 });
            if (input.baseUrl !== undefined && input.allowPrivateNetwork === undefined && (latest.trustedPrivateNetwork === true) !== (current.trustedPrivateNetwork === true)) throw Object.assign(new Error('Upstream trust changed while validating its destination'), { statusCode: 409 });
            const next = { ...latest, ...Object.fromEntries(['name', 'baseUrl', 'protocol', 'enabled'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]])) };
            if (input.protocol) Object.assign(next, profileFor(input.protocol, input));
            else if (input.providerId !== undefined || input.apiProfile !== undefined) Object.assign(next, profileFor(latest.protocol, { providerId: input.providerId ?? latest.providerId, apiProfile: input.apiProfile ?? latest.apiProfile }));
            if (destination) {
              next.baseUrl = baseUrl.replace(/\/$/, '');
              next.approvedAddresses = destination.addresses;
              next.trustedPrivateNetwork = trustedPrivateNetwork;
            }
            if (input.allowPrivateNetwork !== undefined) next.trustedPrivateNetwork = input.allowPrivateNetwork === true;
            if (replacementCredentialRef) {
              replacedCredentialRef = latest.credentialRef;
              next.credentialRef = replacementCredentialRef;
            }
            updatedUpstream = next;
            return { ...value, upstreams: value.upstreams.map((item) => item.id === id ? next : item) };
          });
        } catch (error) {
          if (replacementCredentialRef) await vault.remove(replacementCredentialRef).catch(() => {});
          throw error;
        }
        if (replacementCredentialRef && replacedCredentialRef) await vault.remove(replacedCredentialRef).catch(() => {});
        return send(res, 200, updatedUpstream);
      }
      if (req.method === 'PATCH' && parts[2] === 'routes' && parts[3]) {
        const id = parts[3];
        const input = await bodyOf(req);
        if (input.inboundProtocol) requireProtocol(input.inboundProtocol);
        if (input.outboundProtocol) requireProtocol(input.outboundProtocol);
        let updatedRoute;
        await store.update((value) => {
          const current = value.routes.find((item) => item.id === id);
          if (!current) throw Object.assign(new Error('not_found'), { statusCode: 404 });
          const next = updateRouteCapabilities(updateRouteReasoning({ ...current, ...Object.fromEntries(['alias', 'inboundProtocol', 'outboundProtocol', 'upstreamId', 'modelId', 'enabled', 'allowLossy'].filter((key) => input[key] !== undefined).map((key) => [key, input[key]])) }, input), input);
          if (!next.alias || !next.modelId) throw Object.assign(new Error('Route alias and model are required'), { statusCode: 400 });
          if (!value.upstreams.some((item) => item.id === next.upstreamId) || (next.targets !== undefined && (!Array.isArray(next.targets) || next.targets.some((target) => !target || !value.upstreams.some((item) => item.id === target.upstreamId))))) throw Object.assign(new Error('Unknown upstream'), { statusCode: 400 });
          if (next.enabled && value.routes.some((item) => item.id !== id && item.enabled && item.alias === next.alias && item.inboundProtocol === next.inboundProtocol)) throw Object.assign(new Error('route_conflict'), { statusCode: 409 });
          updatedRoute = next;
          return { ...value, routes: value.routes.map((item) => item.id === id ? next : item) };
        });
        return send(res, 200, updatedRoute);
      }
      if (req.method === 'DELETE' && parts[2] === 'routes' && parts[3]) {
        const id = parts[3];
        const config = await store.read();
        if (!config.routes.some((item) => item.id === id)) return send(res, 404, { error: 'not_found' });
        await store.update((value) => ({ ...value, routes: value.routes.filter((item) => item.id !== id) }));
        return send(res, 200, { id, deleted: true });
      }
      if (req.method === 'POST' && parts[2] === 'upstreams' && parts[3] && parts[4] === 'test') {
        const config = await store.read();
        const upstream = config.upstreams.find((item) => item.id === parts[3]);
        if (!upstream) return send(res, 404, { error: 'not_found' });
        let destination;
        try {
          destination = await validateBaseUrl(upstream.baseUrl, upstream.trustedPrivateNetwork === true, dnsLookup, upstream.approvedAddresses || []);
        } catch (error) {
          return send(res, 502, { ok: false, error: error.code === 'destination_changed' ? 'destination_changed' : 'destination_untrusted' });
        }
        try {
          const headers = {};
          const secret = upstream.credentialRef ? await vault.get(upstream.credentialRef) : undefined;
          if (secret) headers[upstream.protocol === 'Mes' ? 'x-api-key' : 'authorization'] = upstream.protocol === 'Mes' ? secret : `Bearer ${secret}`;
          if (upstream.protocol === 'Mes') headers['anthropic-version'] = '2026-10-21';
          const payload = await requestJsonAtApprovedAddress(upstreamUrl(upstream.baseUrl, '/v1/models'), headers, destination.addresses, 5000);
          const models = Array.isArray(payload.data) ? payload.data.map((item) => item.id).filter(Boolean) : [];
          await store.update((value) => ({ ...value, upstreams: value.upstreams.map((item) => item.id === upstream.id ? { ...item, models, lastCheckedAt: new Date().toISOString() } : item) }));
          return send(res, 200, { ok: true, models, checkedAt: new Date().toISOString() });
        } catch (error) {
          return send(res, 502, { ok: false, error: error.code === 'timeout' ? 'timeout' : 'unavailable' });
        }
      }
      if (parts[0] === 'v1' && parts[1] === 'control' && parts[2] === 'client-keys') {
        if (parts.length === 3 && req.method === 'GET') return send(res, 200, await clientKeys.list());
        if (parts.length === 3 && req.method === 'POST') return send(res, 201, await clientKeys.create(await bodyOf(req)));
        if (parts.length === 4 && parts[3] === 'match' && req.method === 'POST') return send(res, 200, await clientKeys.match(await bodyOf(req)));
        if (parts.length === 5 && parts[4] === 'secret' && req.method === 'GET') return send(res, 200, await clientKeys.secret(parts[3]));
        if (parts.length === 5 && parts[4] === 'secret' && req.method === 'POST') return send(res, 200, await clientKeys.retain(parts[3], await bodyOf(req)));
        if (parts.length === 5 && parts[4] === 'rotate' && req.method === 'POST') return send(res, 200, await clientKeys.rotate(parts[3]));
        if (parts.length === 5 && parts[4] === 'permanent' && req.method === 'DELETE') return send(res, 200, await clientKeys.delete(parts[3]));
        if (parts.length === 4 && req.method === 'DELETE') return send(res, 200, await clientKeys.revoke(parts[3]));
      }
      return send(res, 404, { error: 'not_found' });
    } catch (error) {
      return send(res, error.statusCode || 500, { error: error.statusCode ? error.message : 'internal_error', ...(error.routes ? { routes: error.routes } : {}) });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.CXRG_DATA_DIR || './.cxrg-data';
  const { ConfigStore } = await import('../../../packages/shared/src/config-store.mjs');
  const { SecretVault } = await import('../../../packages/shared/src/secret-vault.mjs');
  const server = createControlServer({ store: new ConfigStore(`${dataDir}/config.json`), vault: new SecretVault(`${dataDir}/secrets.json`) });
  server.listen(Number(process.env.CXRG_CONTROL_PORT || 4319), '127.0.0.1');
  process.stdin.on('end', () => server.close(() => process.exit(0)));
  process.stdin.resume();
}
