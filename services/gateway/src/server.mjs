import { createRequestMetrics } from './request-metrics.mjs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dns from 'node:dns/promises';
import { validateUpstreamDestination } from '../../../packages/shared/src/destination-policy.mjs';
import { applyRouteReasoningPolicy } from '../../../packages/shared/src/reasoning-policy.mjs';
import { applyModelCapabilities } from './model-capability-policy.mjs';
import net from 'node:net';
import { Readable } from 'node:stream';
import { performance } from 'node:perf_hooks';
import { parseRequest as parseAdapterRequest, serializeRequest as serializeAdapterRequest, parseResponse as parseAdapterResponse, serializeResponse as serializeAdapterResponse, parseStreamEvent as parseAdapterStreamEvent, serializeStreamEvent as serializeAdapterStreamEvent } from './protocol-adapters.mjs';

const DEFAULT_MAX_REQUEST_BODY_BYTES = 64 * 1024 * 1024;
const pathProtocols = { '/v1/responses': 'Res', '/v1/messages': 'Mes', '/v1/chat/completions': 'Chat' };
const upstreamStatusMap = new Map([
  [400, { clientStatus: 400, errorCode: 'upstream_http_400' }],
  [401, { clientStatus: 401, errorCode: 'upstream_http_401' }],
  [402, { clientStatus: 402, errorCode: 'upstream_http_402' }],
  [403, { clientStatus: 403, errorCode: 'upstream_http_403' }],
  [404, { clientStatus: 404, errorCode: 'upstream_http_404' }],
  [408, { clientStatus: 408, errorCode: 'upstream_http_408' }],
  [409, { clientStatus: 409, errorCode: 'upstream_http_409' }],
  [413, { clientStatus: 413, errorCode: 'upstream_payload_too_large' }],
  [415, { clientStatus: 415, errorCode: 'upstream_http_415' }],
  [422, { clientStatus: 422, errorCode: 'upstream_http_422' }],
  [429, { clientStatus: 429, errorCode: 'upstream_rate_limited' }],
]);
export function classifyUpstreamStatus(status) {
  return upstreamStatusMap.get(status) || { clientStatus: 502, errorCode: 'upstream_error' };
}

const connectionErrorCodes = new Set(['ECONNRESET', 'EPIPE', 'UND_ERR_SOCKET', 'ECONNABORTED']);
function normalizeUpstreamError(error) {
  let current = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (connectionErrorCodes.has(current.code)) return Object.assign(new Error('Upstream connection reset'), { code: 'upstream_connection_reset', statusCode: 502 });
    current = current.cause;
  }
  if (typeof error?.message === 'string' && /(?:socket hang up|fetch failed|terminated)/i.test(error.message) && connectionErrorCodes.has(error?.cause?.code)) {
    return Object.assign(new Error('Upstream connection reset'), { code: 'upstream_connection_reset', statusCode: 502 });
  }
  if (error?.statusCode) return error;
  return Object.assign(new Error('Upstream unavailable'), { code: 'upstream_error', statusCode: 502, cause: error });
}
function requestBodyLimit(value) {
  if (value === undefined) return DEFAULT_MAX_REQUEST_BODY_BYTES;
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim())) throw new Error('maxRequestBodyBytes must be a positive safe integer');
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('maxRequestBodyBytes must be a positive safe integer');
  return parsed;
}
function upstreamUrl(baseUrl, endpoint) {
  const base = baseUrl.replace(/\/$/, '');
  return base.endsWith('/v1') && endpoint.startsWith('/v1/') ? `${base}${endpoint.slice(3)}` : `${base}${endpoint}`;
}

function send(res, status, body, requestId) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  if (requestId) res.setHeader('x-request-id', requestId);
  res.end(JSON.stringify(body));
}

async function bodyOf(req, maxBytes, timeoutMs = 30_000) {
  const tooLarge = () => {
    if (!req.complete && !req.readableEnded) {
      const drainTimer = setTimeout(() => req.destroy(), timeoutMs);
      drainTimer.unref();
      const finishDrain = () => {
        clearTimeout(drainTimer);
        req.off('end', finishDrain);
        req.off('close', finishDrain);
        req.off('error', finishDrain);
      };
      req.once('end', finishDrain);
      req.once('close', finishDrain);
      req.once('error', finishDrain);
    }
    req.resume();
    return Object.assign(new Error(`Request body exceeds ${maxBytes} byte limit`), { code: 'request_body_too_large', statusCode: 413, limitBytes: maxBytes });
  };
  const declaredLength = req.headers['content-length'];
  if (declaredLength !== undefined && /^\d+$/.test(declaredLength) && Number(declaredLength) > maxBytes) throw tooLarge();
  let size = 0; let timer;
  const chunks = [];
  try {
    const stream = (async () => {
      for await (const chunk of req.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxBytes) throw tooLarge();
        chunks.push(chunk);
      }
    })();
    await Promise.race([stream, new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('Request body timeout'), { code: 'request_timeout', statusCode: 408 })), timeoutMs); })]);
  } finally { clearTimeout(timer); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 }); }
}

function keyFrom(req) {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return req.headers['x-api-key'];
}

function reasoningEffortOf(input) {
  const candidates = [input?.reasoning_effort, input?.reasoning?.effort, input?.output_config?.effort, input?.thinking?.effort];
  const value = candidates.find((item) => typeof item === 'string' && item.trim());
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length <= 32 ? normalized : undefined;
}

export async function validateDestination(baseUrl, trustedPrivateNetwork, approvedAddresses = [], lookup = dns.lookup) {
  try {
    return (await validateUpstreamDestination(baseUrl, { trustedPrivateNetwork, approvedAddresses, lookup })).addresses;
  } catch (error) {
    throw Object.assign(new Error(error.message), { code: 'upstream_error', statusCode: 502 });
  }
}

function upstreamTimeoutError() {
  return Object.assign(new Error('Upstream timeout'), { code: 'upstream_timeout', statusCode: 504 });
}

async function readBeforeDeadline(reader, deadline, monotonicNow) {
  const remaining = deadline - monotonicNow();
  if (remaining <= 0) throw upstreamTimeoutError();
  let timer;
  try {
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(upstreamTimeoutError()), remaining); });
    return await Promise.race([reader.read(), timeout]);
  } finally { clearTimeout(timer); }
}

async function fetchWithTimeout(url, options, addresses, headerTimeoutMs, requestDeadline, signal, onTimeout, monotonicNow) {
  const target = new URL(url);
  const transport = target.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    let timedOut = false;
    let settled = false;
    let timer;
    let addressIndex = 0;
    let activeRequest;
    let lastConnectionError;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortRequest);
    };
    const abortRequest = () => activeRequest?.destroy(Object.assign(new Error('Gateway request was cancelled'), { code: 'request_aborted', statusCode: 499 }));
    const remaining = Math.max(0, requestDeadline - monotonicNow());
    if (remaining <= 0) return reject(upstreamTimeoutError());
    timer = setTimeout(() => {
      timedOut = true;
      onTimeout?.();
      activeRequest?.destroy(upstreamTimeoutError());
    }, Math.min(headerTimeoutMs, remaining));
    const attemptAddress = () => {
      if (settled) return;
      if (signal?.aborted) {
        settled = true;
        cleanup();
        return reject(Object.assign(new Error('Gateway request was cancelled'), { code: 'request_aborted', statusCode: 499 }));
      }
      if (timedOut) {
        settled = true;
        cleanup();
        return reject(upstreamTimeoutError());
      }
      const address = addresses[addressIndex++];
      if (!address) {
        settled = true;
        cleanup();
        return reject(lastConnectionError || Object.assign(new Error('Upstream address unavailable'), { code: 'upstream_error', statusCode: 502 }));
      }
      let connectionReady = false;
      const request = transport.request(target, {
        method: options.method,
        headers: options.headers,
        agent: false,
        lookup: (_hostname, lookupOptions, callback) => {
          const record = { address, family: net.isIP(address) };
          if (lookupOptions.all) callback(null, [record]);
          else callback(null, record.address, record.family);
        },
      }, (response) => {
        if (settled) { response.destroy(); return; }
        try {
          const status = response.statusCode;
          if (!Number.isInteger(status) || status < 200 || status > 599) throw new Error('Invalid upstream status');
          const headers = new Headers();
          for (let index = 0; index < response.rawHeaders.length; index += 2) headers.append(response.rawHeaders[index], response.rawHeaders[index + 1]);
          const noBody = [204, 205, 304].includes(status);
          const result = new Response(noBody ? null : Readable.toWeb(response), { status, headers });
          settled = true;
          clearTimeout(timer);
          response.once('end', cleanup);
          response.once('close', cleanup);
          if (noBody) response.resume();
          resolve(result);
        } catch {
          settled = true;
          cleanup();
          response.destroy();
          reject(Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 }));
        }
      });
      activeRequest = request;
      request.once('socket', (socket) => {
        const sendRequest = () => {
          if (settled || connectionReady) return;
          connectionReady = true;
          request.end(options.body);
        };
        if (target.protocol === 'https:') {
          const secureConnectionReady = () => { if (socket.authorized !== false) sendRequest(); };
          if (socket.encrypted && socket.secureConnecting === false) secureConnectionReady();
          else socket.once('secureConnect', secureConnectionReady);
        } else if (!socket.connecting) sendRequest();
        else socket.once('connect', sendRequest);
      });
      request.on('error', (error) => {
        if (settled) return;
        if (!connectionReady && !signal?.aborted && !timedOut && addressIndex < addresses.length) {
          lastConnectionError = error;
          attemptAddress();
          return;
        }
        settled = true;
        cleanup();
        reject(timedOut ? upstreamTimeoutError() : error.code === 'request_aborted' ? error : normalizeUpstreamError(error));
      });
    };
    if (signal?.aborted) abortRequest();
    else signal?.addEventListener('abort', abortRequest, { once: true });
    attemptAddress();
  });
}

function raceWithAbort(work, signal) {
  if (signal.aborted) return Promise.reject(new Error('Connectivity probe timed out'));
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(new Error('Connectivity probe timed out'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([work, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
}

function connectAddress(target, address, port, timeoutMs, signal) {
  return new Promise((resolve) => {
    let socket;
    let settled = false;
    let timer;
    const finish = (connected) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      socket?.destroy();
      resolve(connected);
    };
    const onAbort = () => finish(false);
    if (signal.aborted) return finish(false);
    signal.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(false), Math.max(1, timeoutMs));
    try {
      if (target.protocol === 'https:') {
        const hostname = target.hostname.replace(/^\[(.*)\]$/, '$1');
        const options = { host: address, port, rejectUnauthorized: true };
        if (!net.isIP(hostname)) options.servername = hostname;
        socket = tls.connect(options);
      } else {
        socket = net.createConnection({ host: address, port });
      }
    } catch {
      finish(false);
      return;
    }
    socket.once(target.protocol === 'https:' ? 'secureConnect' : 'connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('close', () => finish(false));
  });
}

async function checkTransportConnectivity(baseUrl, addresses, timeoutMs, signal, monotonicNow) {
  const target = new URL(baseUrl);
  if (!['http:', 'https:'].includes(target.protocol) || !Array.isArray(addresses) || !addresses.length) return false;
  const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
  const deadline = monotonicNow() + timeoutMs;
  for (const address of addresses) {
    const remaining = deadline - monotonicNow();
    if (remaining <= 0 || signal.aborted) return false;
    if (!net.isIP(address)) continue;
    // Connect to the validated IP; use the URL hostname only for TLS identity.
    if (await connectAddress(target, address, port, remaining, signal)) return true;
  }
  return false;
}

async function readJson(response, deadline, monotonicNow, maxBytes = 4 * 1024 * 1024) {
  let size = 0; let data = '';
  const reader = response.body.getReader();
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream response too large'), { code: 'upstream_error', statusCode: 502 });
      data += Buffer.from(result.value).toString('utf8');
    }
  } finally { await reader.cancel().catch(() => {}); }
  try { return JSON.parse(data); } catch { throw Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 }); }
}

function createResponsesStreamRelay(res) {
  const decoder = new TextDecoder();
  let buffer = '';
  let lastSequence = -1;
  let finished = false;
  let terminalWire;
  const streamError = () => Object.assign(new Error('Invalid or incomplete upstream stream'), { code: 'upstream_error', statusCode: 502 });
  const forwardFrame = (frame, delimiter = '') => {
    const data = frame.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    const wire = frame + delimiter;
    if (!data || data === '[DONE]') {
      if (terminalWire !== undefined) terminalWire += wire;
      else if (data !== '[DONE]') res.write(wire);
      return;
    }
    let payload;
    try { payload = JSON.parse(data); } catch { throw streamError(); }
    if (!payload || typeof payload !== 'object') throw streamError();
    const sequence = payload.sequence_number;
    if (sequence !== undefined && (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= Number.MAX_SAFE_INTEGER || sequence <= lastSequence)) throw streamError();
    const type = frame.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim() || payload.type;
    if (terminalWire !== undefined || ['error', 'response.failed', 'response.incomplete'].includes(type)) throw streamError();
    if (sequence !== undefined) lastSequence = sequence;
    if (type === 'response.completed' || type === 'response.done') terminalWire = wire;
    else res.write(wire);
  };
  const consume = (text) => {
    buffer += text;
    let delimiter;
    while ((delimiter = /\r?\n\r?\n/.exec(buffer))) {
      const frame = buffer.slice(0, delimiter.index);
      buffer = buffer.slice(delimiter.index + delimiter[0].length);
      forwardFrame(frame, delimiter[0]);
    }
  };
  return {
    push(chunk) {
      if (finished) return;
      try { consume(decoder.decode(chunk, { stream: true })); }
      catch (error) { finished = true; buffer = ''; throw error; }
    },
    finish(cleanEnd) {
      if (finished) return;
      finished = true;
      consume(decoder.decode());
      const tail = buffer;
      buffer = '';
      if (tail.trim()) forwardFrame(tail);
      if (cleanEnd) {
        if (terminalWire === undefined) throw streamError();
        res.write(terminalWire);
      }
    },
    nextSequence() { return lastSequence + 1; },
  };
}

async function pipeStream(response, res, metrics, deadline, monotonicNow, sequenceTracker, maxBytes = 4 * 1024 * 1024) {
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) { metrics.endUpstreamBody(); break; }
      metrics.observeUpstreamChunk(result.value);
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
      metrics.measureProcessing(() => {
        metrics.push(result.value);
        if (sequenceTracker) sequenceTracker.push(result.value);
        else res.write(Buffer.from(result.value));
      });
    }
    metrics.measureProcessing(() => {
      sequenceTracker?.finish(true);
      metrics.finish();
      res.end();
    });
  } catch (error) {
    try { metrics.measureProcessing(() => sequenceTracker?.finish(false)); } catch { /* Preserve the original failure. */ }
    throw error;
  } finally {
    metrics.endUpstreamBody();
    await reader.cancel().catch(() => {});
  }
}

function sequenceResponsesFrames(wire, responseState) {
  return wire.split(/\r?\n\r?\n/).filter(frame => frame.trim()).map(frame => {
    const lines = frame.split(/\r?\n/);
    const eventName = lines.find(line => line.startsWith('event:'))?.slice(6).trim();
    const payload = JSON.parse(lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'));
    payload.sequence_number = responseState.nextSequence++;
    return `event: ${eventName || payload.type}\ndata: ${JSON.stringify(payload)}\n\n`;
  }).join('');
}

function convertedResponsesUsage(tokens) {
  if (!tokens || tokens.input === undefined || tokens.output === undefined) return undefined;
  return {
    input_tokens: tokens.input,
    output_tokens: tokens.output,
    total_tokens: tokens.total ?? (tokens.input + tokens.output),
    ...(tokens.cacheRead !== undefined ? { input_tokens_details: { cached_tokens: tokens.cacheRead } } : {}),
    ...(tokens.reasoning !== undefined ? { output_tokens_details: { reasoning_tokens: tokens.reasoning } } : {}),
  };
}

async function pipeConvertedStream(response, res, outboundProtocol, inboundProtocol, requestId, metrics, deadline, monotonicNow, toolContext, responseState, model, maxBytes = 4 * 1024 * 1024) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let size = 0;
  let terminalEvent;
  const streamState = { nextToolIndex: 0, toolContext, model };
  const writeEvent = (event) => {
    if (event.type === 'batch') {
      for (const item of event.events) writeEvent(item);
      return;
    }
    if (event.type === 'ignore') return;
    if (event.type === 'done') {
      if (event.finishReason || !terminalEvent) terminalEvent = event;
      return;
    }
    const wire = serializeAdapterStreamEvent(inboundProtocol, event, requestId, streamState);
    if (wire) res.write(inboundProtocol === 'Res' ? sequenceResponsesFrames(wire, responseState) : wire);
  };
  const writeFrame = (frame) => {
    const lines = frame.split(/\r?\n/);
    const eventName = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() || '';
    const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    const payload = data === '[DONE]' ? '[DONE]' : JSON.parse(data);
    const type = eventName || payload?.type;
    if (inboundProtocol === 'Res' && (type === 'error' || payload?.error)) {
      throw Object.assign(new Error('Upstream stream reported an error'), { code: 'upstream_error', statusCode: 502 });
    }
    writeEvent(parseAdapterStreamEvent(outboundProtocol, type, payload, streamState));
  };
  try {
    while (true) {
      const result = await readBeforeDeadline(reader, deadline, monotonicNow);
      if (result.done) { metrics.endUpstreamBody(); break; }
      metrics.observeUpstreamChunk(result.value);
      size += result.value.byteLength;
      if (size > maxBytes) throw Object.assign(new Error('Upstream stream too large'), { code: 'upstream_error', statusCode: 502 });
      metrics.measureProcessing(() => {
        metrics.push(result.value);
        buffer += decoder.decode(result.value, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() || '';
        for (const frame of frames) writeFrame(frame);
      });
    }
    metrics.measureProcessing(() => {
      buffer += decoder.decode();
      if (buffer.trim()) writeFrame(buffer);
      metrics.finish();
      if (!terminalEvent) throw Object.assign(new Error('Upstream stream ended before completion'), { code: 'upstream_error', statusCode: 502 });
      if (inboundProtocol === 'Res') streamState.usage = convertedResponsesUsage(metrics.snapshot().tokens);
      const terminalWire = serializeAdapterStreamEvent(inboundProtocol, terminalEvent, requestId, streamState);
      if (terminalWire) res.write(inboundProtocol === 'Res' ? sequenceResponsesFrames(terminalWire, responseState) : terminalWire);
      res.end();
    });
  } finally {
    metrics.endUpstreamBody();
    await reader.cancel().catch(() => {});
  }
}

async function appendUsage(store, record) {
  try {
    await store.update((value) => {
      const configured = Number(value.settings?.usageRetentionCount);
      const retention = Number.isInteger(configured) ? Math.min(Math.max(configured, 1), 100_000) : 1000;
      return { ...value, usage: [...(value.usage || []), record].slice(-retention) };
    });
  } catch {}
}

async function markCredentialUsed(store, credential) {
  if (credential.temporary) return false;
  try {
    await store.update((value) => ({ ...value, clientKeys: value.clientKeys.map((item) => item.id === credential.id ? { ...item, lastUsedAt: new Date().toISOString() } : item) }));
    return false;
  } catch {
    return true;
  }
}

export function createGatewayServer({ store, vault, rateLimitPerMinute = 60, maxConcurrentRequests = 32, upstreamHeaderTimeoutMs = 300_000, upstreamHealthProbeTimeoutMs = 5000, maxRequestDurationMs = 600_000, routeTestTimeoutMs = 610_000, maxRequestBodyBytes = process.env.CXRG_MAX_REQUEST_BODY_BYTES, dnsLookup = dns.lookup, connectivityCheck = checkTransportConnectivity, now = Date.now, monotonicNow = () => performance.now() } = {}) {
  if (!store || !vault) throw new Error('Gateway server requires store and vault');
  const requestBodyLimitBytes = requestBodyLimit(maxRequestBodyBytes);
  const rateBuckets = new Map();
  const healthByRoute = new Map();
  const routeTestCredentials = new Map();
  const routeTestCalls = [];
  let inFlight = 0;
  async function probeTarget(item) {
    const health = item.health;
    if (health.probePromise) return health.probePromise;
    const generation = health.generation;
    const probe = (async () => {
      const controller = new AbortController();
      let timer;
      const deadline = monotonicNow() + upstreamHealthProbeTimeoutMs;
      timer = setTimeout(() => controller.abort(), upstreamHealthProbeTimeoutMs);
      let healthy = false;
      try {
        const addresses = await raceWithAbort(validateDestination(item.upstream.baseUrl, item.upstream.trustedPrivateNetwork === true, item.upstream.approvedAddresses || [], dnsLookup), controller.signal);
        if (controller.signal.aborted) return false;
        healthy = await raceWithAbort(connectivityCheck(item.upstream.baseUrl, addresses, upstreamHealthProbeTimeoutMs, controller.signal, monotonicNow), controller.signal);
      } catch {
        healthy = false;
      } finally {
        clearTimeout(timer);
      }
      if (health.generation === generation) {
        if (healthy) {
          health.failures = 0;
          health.openUntil = 0;
          health.generation += 1;
        } else {
          health.openUntil = now() + health.cooldownSeconds * 1000;
          health.generation += 1;
        }
      }
      return healthy || (health.generation !== generation && health.openUntil === 0);
    })();
    health.probePromise = probe.finally(() => { health.probePromise = undefined; });
    return health.probePromise;
  }
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const startedAt = now();
    const requestStartedMonotonic = monotonicNow();
    const requestDeadline = requestStartedMonotonic + maxRequestDurationMs;
    const requestController = new AbortController();
    res.once('close', () => { if (!res.writableEnded) requestController.abort(); });
    let upstreamTimedOut = false;
    let metrics;
    let inbound;
    let route;
    let upstream;
    let targetHealth;
    let requestGeneration;
    let reasoningEffort;
    let compatibilityWarnings;
    let upstreamStarted = false;
    let upstreamStatus;
    let streamRequested = false;
    let responseSequenceTracker;
    const responseState = { nextSequence: 0 };
    let outcomeRecorded = false;
    let hasFallback = false;
    let acquiredSlot = false;
    function recordOutcome(failed) {
      if (!targetHealth || outcomeRecorded) return;
      outcomeRecorded = true;
      if (!failed) {
        targetHealth.failures = 0;
        targetHealth.openUntil = 0;
        targetHealth.generation += 1;
        return;
      }
      if (targetHealth.generation !== requestGeneration) return;
      if (!hasFallback) { targetHealth.failures = 0; return; }
      targetHealth.failures += 1;
      if (targetHealth.failures >= targetHealth.threshold) {
        targetHealth.failures = 0;
        targetHealth.openUntil = now() + targetHealth.cooldownSeconds * 1000;
        targetHealth.generation += 1;
      }
    }
    try {
      if (req.method === 'GET' && req.url === '/health') return send(res, 200, { status: 'ok', service: 'gateway' }, requestId);
      if (req.method === 'GET' && new URL(req.url, 'http://127.0.0.1').pathname === '/v1/models') {
        const apiKey = keyFrom(req);
        const config = await store.read();
        const keyHash = apiKey && crypto.createHash('sha256').update(apiKey).digest('hex');
        const modelCredential = config.clientKeys.find((item) => item.enabled && item.keyHash === keyHash);
        if (!modelCredential) return send(res, 401, { error: 'unauthorized', requestId }, requestId);
        const routes = config.routes.filter((item) => item.enabled && (!modelCredential.scope?.length || modelCredential.scope.includes(item.alias)));
        return send(res, 200, { object: 'list', data: routes.map((route) => ({ id: route.alias, object: 'model', owned_by: 'cx-routing-gateway', created: Math.floor(Date.parse(route.createdAt || new Date().toISOString()) / 1000) })) }, requestId);
      }
      if (inFlight >= maxConcurrentRequests) return send(res, 429, { error: 'concurrency_limited', requestId }, requestId);
      inFlight += 1;
      acquiredSlot = true;
      inbound = pathProtocols[new URL(req.url, 'http://127.0.0.1').pathname];
      if (req.method !== 'POST' || !inbound) return send(res, 404, { error: 'not_found', requestId }, requestId);
      const apiKey = keyFrom(req);
      const config = await store.read();
      const keyHash = apiKey && crypto.createHash('sha256').update(apiKey).digest('hex');
      const persistedCredential = keyHash && config.clientKeys.find((item) => item.enabled && item.keyHash === keyHash);
      const temporaryCredential = keyHash && routeTestCredentials.get(keyHash);
      const credential = persistedCredential || (temporaryCredential?.expiresAt > now() ? temporaryCredential : undefined);
      if (!credential) return send(res, 401, { error: 'unauthorized', requestId }, requestId);
      const timestamp = Date.now();
      const recent = (rateBuckets.get(keyHash) || []).filter((entry) => timestamp - entry < 60_000);
      if (recent.length >= rateLimitPerMinute) return send(res, 429, { error: 'rate_limited', requestId }, requestId);
      recent.push(timestamp); rateBuckets.set(keyHash, recent);
      let input = await bodyOf(req, requestBodyLimitBytes);
      streamRequested = input.stream === true;
      reasoningEffort = reasoningEffortOf(input);
      route = config.routes.find((item) => item.enabled && item.alias === input.model && item.inboundProtocol === inbound);
      if (!route) return send(res, 404, { error: 'route_not_found', requestId }, requestId);
      if (credential.routeId && credential.routeId !== route.id) return send(res, 403, { error: 'forbidden', requestId }, requestId);
      if (Array.isArray(credential.scope) && credential.scope.length && !credential.scope.includes(route.alias)) return send(res, 403, { error: 'forbidden', requestId }, requestId);
      const availableTargets = (route.targets?.length ? route.targets : [{ upstreamId: route.upstreamId, modelId: route.modelId }]).map(target => ({ target, upstream: config.upstreams.find(item => item.enabled && item.id === target.upstreamId) })).filter(item => item.upstream);
      if (!availableTargets.length) return send(res, 502, { error: 'upstream_error', requestId }, requestId);
      hasFallback = availableTargets.length > 1;
      const policy = { failureThreshold: route.failover?.failureThreshold ?? 3, statusClasses: route.failover?.statusClasses ?? [4, 5], cooldownSeconds: route.failover?.cooldownSeconds ?? 60 };
      const healthTargets = (route.targets?.length ? route.targets : [{ upstreamId: route.upstreamId, modelId: route.modelId }]).map((target) => {
        const configuredUpstream = config.upstreams.find((item) => item.id === target.upstreamId);
        return {
          ...target,
          upstream: configuredUpstream ? {
            baseUrl: configuredUpstream.baseUrl,
            protocol: configuredUpstream.protocol,
            credentialRef: configuredUpstream.credentialRef,
            enabled: configuredUpstream.enabled === true,
            approvedAddresses: configuredUpstream.approvedAddresses ?? [],
            trustedPrivateNetwork: configuredUpstream.trustedPrivateNetwork === true,
          } : null,
        };
      });
      const signature = JSON.stringify({ targets: healthTargets, policy });
      let health = healthByRoute.get(route.id);
      if (!health || health.signature !== signature) { health = { signature, targets: new Map() }; healthByRoute.set(route.id, health); }
      const candidates = availableTargets.map(item => {
        const key = JSON.stringify([item.target.upstreamId, item.target.modelId]);
        if (!health.targets.has(key)) health.targets.set(key, { failures: 0, openUntil: 0, generation: 0, threshold: policy.failureThreshold, cooldownSeconds: policy.cooldownSeconds, probePromise: undefined });
        item.health = health.targets.get(key);
        return item;
      });
      let selectedTarget;
      for (const item of candidates) {
        if (item.health.openUntil > now()) continue;
        if (item.health.openUntil > 0 && !await probeTarget(item)) continue;
        selectedTarget = item;
        break;
      }
      if (!selectedTarget) return send(res, 503, { error: 'all_upstreams_unavailable', requestId }, requestId);
      targetHealth = selectedTarget.health;
      requestGeneration = targetHealth.generation;
      upstream = selectedTarget.upstream;
      route = { ...route, upstreamId: selectedTarget.target.upstreamId, modelId: selectedTarget.target.modelId };
      if (route.reasoning !== undefined) reasoningEffort = undefined;
      const effectiveReasoning = applyRouteReasoningPolicy(input, inbound, route.reasoning);
      input = applyModelCapabilities(effectiveReasoning.input, inbound, route.capabilities, { range: route.reasoning, originalInput: input });
      reasoningEffort = reasoningEffortOf(input);
      metrics = createRequestMetrics({ protocol: route.outboundProtocol, stream: input.stream === true, startedAt: requestStartedMonotonic, clock: monotonicNow });
      responseSequenceTracker = inbound === 'Res' && route.outboundProtocol === 'Res' ? createResponsesStreamRelay(res) : undefined;
      const normalized = route.outboundProtocol === inbound ? null : parseAdapterRequest(inbound, input, { direction: inbound + '->' + route.outboundProtocol });
      compatibilityWarnings = normalized?.compatibilityWarnings;
      upstreamStarted = true;
      const addresses = await validateDestination(upstream.baseUrl, upstream.trustedPrivateNetwork === true, upstream.approvedAddresses || [], dnsLookup);
      const outboundPath = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' }[route.outboundProtocol];
      const headers = { 'content-type': 'application/json', 'x-request-id': requestId };
      const secret = upstream.credentialRef ? await vault.get(upstream.credentialRef) : undefined;
      if (secret) headers[route.outboundProtocol === 'Mes' ? 'x-api-key' : 'authorization'] = route.outboundProtocol === 'Mes' ? secret : `Bearer ${secret}`;
      if (route.outboundProtocol === 'Mes') headers['anthropic-version'] = '2026-10-21';
      const payload = route.outboundProtocol === inbound ? { ...input, model: route.modelId } : serializeAdapterRequest(route.outboundProtocol, normalized, route.modelId);
      if (input.stream === true) {
        payload.stream = true;
        if (route.outboundProtocol === 'Chat') payload.stream_options = { ...payload.stream_options, include_usage: true };
      }
      const serializedPayload = JSON.stringify(payload);
      headers['content-length'] = String(Buffer.byteLength(serializedPayload, 'utf8'));
      const upstreamResponse = await fetchWithTimeout(upstreamUrl(upstream.baseUrl, outboundPath), { method: 'POST', headers, body: serializedPayload }, addresses, upstreamHeaderTimeoutMs, requestDeadline, requestController.signal, () => { upstreamTimedOut = true; }, monotonicNow);
      metrics.markUpstreamHeaders();
      upstreamStatus = upstreamResponse.status;
      if (upstreamResponse.status >= 300) {
        await upstreamResponse.body?.cancel().catch(() => {});
        recordOutcome(policy.statusClasses.includes(Math.floor(upstreamResponse.status / 100)));
        const classified = classifyUpstreamStatus(upstreamResponse.status);
        await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), ...(compatibilityWarnings?.length ? { compatibilityWarnings } : {}), inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'failed', errorCode: classified.errorCode, upstreamStatus: upstreamResponse.status, gatewayStatus: classified.clientStatus });
        return send(res, classified.clientStatus, { error: classified.errorCode, requestId }, requestId);
      }
      if (input.stream === true) {
        res.statusCode = upstreamResponse.status;
        res.setHeader('content-type', upstreamResponse.headers.get('content-type') || 'text/event-stream');
        res.setHeader('x-request-id', requestId);
        if (route.outboundProtocol === inbound) await pipeStream(upstreamResponse, res, metrics, requestDeadline, monotonicNow, responseSequenceTracker);
        else await pipeConvertedStream(upstreamResponse, res, route.outboundProtocol, inbound, requestId, metrics, requestDeadline, monotonicNow, normalized?.tools || [], responseState, route.modelId);
        recordOutcome(false);
        const credentialUsageUpdateFailed = await markCredentialUsed(store, credential);
        await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), ...(compatibilityWarnings?.length ? { compatibilityWarnings } : {}), httpStatus: upstreamResponse.status, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'completed', ...(credentialUsageUpdateFailed ? { credentialUsageUpdateFailed: true } : {}) });
        return;
      }
      const upstreamBody = await readJson(upstreamResponse, requestDeadline, monotonicNow);
      metrics.observeJson(upstreamBody);
      let clientBody = upstreamBody;
      if (route.outboundProtocol !== inbound) {
        try {
          const normalizedResponse = parseAdapterResponse(route.outboundProtocol, upstreamBody, normalized?.tools || []);
          clientBody = serializeAdapterResponse(inbound, normalizedResponse, requestId);
          if (inbound === 'Res' && (upstreamBody.error || !clientBody.output.length)) {
            throw new Error('Converted response has no deliverable output');
          }
        } catch {
          throw Object.assign(new Error('Invalid upstream response'), { code: 'upstream_error', statusCode: 502 });
        }
      }
      recordOutcome(false);
      const credentialUsageUpdateFailed = await markCredentialUsed(store, credential);
      await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), ...(compatibilityWarnings?.length ? { compatibilityWarnings } : {}), httpStatus: upstreamResponse.status, gatewayStatus: 200, inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: 'completed', ...(credentialUsageUpdateFailed ? { credentialUsageUpdateFailed: true } : {}) });
      return send(res, 200, clientBody, requestId);
    } catch (error) {
      const downstreamAborted = requestController.signal.aborted || res.destroyed;
      if (downstreamAborted) error = Object.assign(new Error('Downstream disconnected'), { code: 'request_aborted' });
      else {
        error = normalizeUpstreamError(error);
        if (upstreamTimedOut) error = Object.assign(new Error('Upstream timeout'), { code: 'upstream_timeout', statusCode: 504 });
      }
      const gatewayStatus = res.headersSent ? res.statusCode : downstreamAborted ? undefined : (error.statusCode || 500);
      const streamFailurePhase = streamRequested && upstreamStarted
        ? (downstreamAborted ? 'downstream_closed' : upstreamStatus === undefined ? 'upstream_headers' : 'upstream_body')
        : undefined;
      if (!downstreamAborted && upstreamStarted && (error.code === 'upstream_error' || error.code === 'upstream_connection_reset' || error.code === 'upstream_timeout' || !error.statusCode)) recordOutcome(true);
      if (route && upstream) await appendUsage(store, { requestId, createdAt: new Date(startedAt).toISOString(), durationMs: Math.max(0, monotonicNow() - requestStartedMonotonic), ...metrics?.snapshot(), ...(reasoningEffort ? { reasoningEffort } : {}), ...(compatibilityWarnings?.length ? { compatibilityWarnings } : {}), ...(gatewayStatus === undefined ? {} : { gatewayStatus }), ...(upstreamStatus === undefined ? {} : { upstreamStatus }), ...(streamFailurePhase ? { streamFailurePhase } : {}), inboundProtocol: inbound, outboundProtocol: route.outboundProtocol, routeId: route.id, upstreamId: upstream.id, upstreamName: upstream.name, modelId: route.modelId, status: error.statusCode === 400 ? 'rejected' : 'failed', errorCode: error.code || 'gateway_error', ...(error.field ? { errorField: error.field } : {}), ...(error.direction ? { errorDirection: error.direction } : {}), ...(error.toolType ? { errorToolType: error.toolType } : {}) });
      if (downstreamAborted) return;
      if (res.headersSent) {
        if (streamRequested && inbound === 'Res' && !res.writableEnded) {
          const sequence = route.outboundProtocol === 'Res' ? (responseSequenceTracker?.nextSequence() ?? 0) : responseState.nextSequence++;
          res.end(`\n\nevent: error\ndata: ${JSON.stringify({ type: 'error', code: error.code || 'upstream_error', message: 'Upstream stream interrupted', param: null, sequence_number: sequence })}\n\n`);
          return;
        }
        return res.destroy();
      }

      return send(res, error.statusCode || 500, { ...(error.limitBytes ? { limitBytes: error.limitBytes } : {}), error: error.code || 'internal_error', message: error.statusCode ? error.message : undefined, ...(error.field ? { field: error.field } : {}), ...(error.direction ? { direction: error.direction } : {}), ...(error.toolType ? { toolType: error.toolType } : {}), requestId }, requestId);
    } finally {
      if (acquiredSlot) inFlight -= 1;
    }
  });
  server.testRoute = async (routeId, prompt) => {
    if (typeof routeId !== 'string' || !routeId || routeId.length > 100) throw new Error('无效的路由');
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 2000) throw new Error('测试内容需为 1 至 2000 个字符');
    const config = await store.read();
    const route = config.routes.find((item) => item.id === routeId && item.enabled);
    if (!route) throw new Error('路由不存在或已停用');
    const timestamp = now();
    while (routeTestCalls.length && timestamp - routeTestCalls[0] >= 60_000) routeTestCalls.shift();
    if (routeTestCalls.length >= 10) throw new Error('真实路由测试每分钟最多 10 次');
    routeTestCalls.push(timestamp);
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Gateway 尚未启动');

    const key = `cxrg_test_${crypto.randomBytes(32).toString('base64url')}`;
    const keyHash = crypto.createHash('sha256').update(key).digest('hex');
    routeTestCredentials.set(keyHash, { id: `route-test-${crypto.randomUUID()}`, name: '临时路由测试', scope: [route.alias], routeId: route.id, enabled: true, temporary: true, expiresAt: timestamp + 60_000 });
    const endpoint = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' }[route.inboundProtocol];
    const text = prompt.trim();
    const body = route.inboundProtocol === 'Res'
      ? { model: route.alias, input: text, max_output_tokens: 256 }
      : route.inboundProtocol === 'Mes'
        ? { model: route.alias, max_tokens: 256, messages: [{ role: 'user', content: text }] }
        : { model: route.alias, max_completion_tokens: 256, messages: [{ role: 'user', content: text }] };
    const startedAt = monotonicNow();
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(routeTestTimeoutMs),
      });
      const requestId = response.headers.get('x-request-id') || '';
      const result = await response.json().catch(() => ({}));
      const durationMs = Math.max(0, monotonicNow() - startedAt);
      if (!response.ok) {
        const errors = { all_upstreams_unavailable: '所有上游当前均不可用', upstream_error: '上游请求失败，请检查上游状态和日志', upstream_rate_limited: '上游请求被限流，请稍后重试', upstream_payload_too_large: '上游拒绝了过大的请求体', request_body_too_large: '请求体超过网关限制', upstream_timeout: '上游响应超时', unsupported_feature: '当前请求包含不支持的协议特性', route_not_found: '路由未匹配到此请求协议' };
        return { routeAlias: route.alias, text: '', requestId, durationMs, status: response.status, error: errors[result.error] || `Gateway 请求失败（${response.status}）` };
      }
      const resultText = parseAdapterResponse(route.inboundProtocol, result).text;
      return { routeAlias: route.alias, text: typeof resultText === 'string' ? resultText : '', requestId, durationMs, status: response.status };
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') throw new Error('测试请求超时');
      throw error;
    } finally {
      routeTestCredentials.delete(keyHash);
      rateBuckets.delete(keyHash);
    }
  };
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = process.env.CXRG_DATA_DIR || './.cxrg-data';
  const { ConfigStore } = await import('../../../packages/shared/src/config-store.mjs');
  const { SecretVault } = await import('../../../packages/shared/src/secret-vault.mjs');
  const server = createGatewayServer({ store: new ConfigStore(`${dataDir}/config.json`), vault: new SecretVault(`${dataDir}/secrets.json`) });
  server.listen(Number(process.env.CXRG_GATEWAY_PORT || 4318), '127.0.0.1');
  process.stdin.on('end', () => server.close(() => process.exit(0)));
  process.stdin.resume();
}
