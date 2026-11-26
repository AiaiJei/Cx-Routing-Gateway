import crypto from 'node:crypto';

class ClientKeyError extends Error {
  constructor(code, statusCode) { super(code); this.statusCode = statusCode; }
}
const fail = (code, statusCode = 409) => { throw new ClientKeyError(code, statusCode); };
const hashOf = key => crypto.createHash('sha256').update(key).digest('hex');
const storageError = error => error instanceof ClientKeyError ? error : new ClientKeyError('key_secret_storage_unavailable', 503);
const metadata = record => ({ id: record.id, name: record.name, scope: record.scope || [], enabled: record.enabled === true, secretAvailable: Boolean(record.secretRef) });
const find = (config, id) => config.clientKeys.find(record => record.id === id) || fail('not_found', 404);
const authRevision = record => record.authMutationRevision ?? 0;
function nextAuthRevision(record) {
  const revision = authRevision(record);
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) fail('key_changed');
  return revision + 1;
}
const unchanged = (record, previous) => record.keyHash === previous.keyHash && record.secretRef === previous.secretRef && record.enabled === previous.enabled && authRevision(record) === authRevision(previous);
function requireEnabled(record) { if (!record.enabled) fail('key_disabled'); return record; }
function requireUnchanged(record, previous) {
  if (!unchanged(record, previous)) fail('key_changed');
}
function originalKey(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(field => field !== 'key') || typeof input.key !== 'string' || !input.key.length || input.key.length > 4096 || /[\s\x00-\x1f\x7f]/u.test(input.key)) fail('invalid_client_key', 400);
  return input.key;
}

// All authentication continues to use keyHash. Only explicit secret endpoints
// may resolve secretRef; neither metadata nor workspace state returns it.
export function createClientKeyService({ store, vault }) {
  const read = async () => { try { return await store.read(); } catch (error) { throw storageError(error); } };
  const update = async mutator => { try { return await store.update(mutator); } catch (error) { throw storageError(error); } };
  const removeSecret = async ref => {
    if (!ref) return true;
    try { await vault.remove(ref); return true; } catch { return false; }
  };
  const cleanupResult = async (ref, result) => await removeSecret(ref) ? result : { ...result, secretCleanupPending: true };
  async function stageSecret(key, mutator) {
    let secretRef; let intended;
    try {
      secretRef = await vault.put(key);
      await update(config => {
        const next = mutator(config, secretRef);
        intended = next.clientKeys.find(record => record.secretRef === secretRef);
        return next;
      });
      return {};
    } catch (error) {
      if (secretRef) {
        let durable;
        // ConfigStore can finish its atomic write then fail releasing its lock.
        // An ambiguous result must never delete a potentially active secret.
        try { durable = await store.read({ initialize: false }); }
        catch { throw storageError(error); }
        const current = intended && durable.clientKeys.find(record => record.id === intended.id);
        if (current && unchanged(current, intended)) return { stateWriteReconciled: true };
        const referenced = durable.clientKeys.some(record => record.secretRef === secretRef) || durable.upstreams.some(record => record.credentialRef === secretRef);
        if (!referenced) await removeSecret(secretRef);
        // A newer auth mutation superseded this successful write during error
        // recovery. Preserve referenced ciphertext and refuse a stale success.
        if (intended && current && authRevision(current) > authRevision(intended)) fail('key_changed');
      }
      throw storageError(error);
    }
  }
  return {
    async list() { return { credentials: (await read()).clientKeys.map(metadata) }; },
    async match(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(field => field !== 'keyHash') || typeof input.keyHash !== 'string' || !/^[a-f0-9]{64}$/i.test(input.keyHash)) fail('invalid_key_hash', 400);
      const record = (await read()).clientKeys.find(record => record.enabled && record.keyHash === input.keyHash.toLowerCase());
      return record ? { credential: metadata(record) } : {};
    },
    async create(input) {
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid_client_key', 400);
      const key = `cxrg_${crypto.randomBytes(24).toString('base64url')}`;
      const scope = Array.isArray(input.scope) ? input.scope.filter(item => typeof item === 'string' && item.trim()).slice(0, 100) : [];
      const record = { id: `key_${crypto.randomUUID()}`, name: String(input.name || 'Client key'), scope, keyHash: hashOf(key), createdAt: new Date().toISOString(), enabled: true, authMutationRevision: 1 };
      const outcome = await stageSecret(key, (config, secretRef) => ({ ...config, clientKeys: [...config.clientKeys, { ...record, secretRef }] }));
      return { id: record.id, name: record.name, scope, key, createdAt: record.createdAt, enabled: true, ...outcome };
    },
    async secret(id) {
      const before = requireEnabled(find(await read(), id));
      if (!before.secretRef) fail('key_secret_unavailable');
      let key;
      try { key = await vault.get(before.secretRef); } catch (error) { throw storageError(error); }
      // Recheck after vault I/O: a revoked/deleted/rotated snapshot cannot leak.
      const current = requireEnabled(find(await read(), id));
      requireUnchanged(current, before);
      if (typeof key !== 'string' || !key) fail('key_secret_unavailable');
      if (hashOf(key) !== current.keyHash) fail('key_secret_mismatch');
      return { id, key };
    },
    async retain(id, input) {
      const key = originalKey(input);
      const before = requireEnabled(find(await read(), id));
      const keyHash = hashOf(key);
      if (keyHash !== before.keyHash) fail('key_secret_mismatch');
      let retained;
      const outcome = await stageSecret(key, (config, secretRef) => {
        const current = requireEnabled(find(config, id));
        if (current.keyHash !== keyHash) fail('key_secret_mismatch');
        requireUnchanged(current, before);
        retained = { ...current, secretRef, authMutationRevision: nextAuthRevision(current) };
        return { ...config, clientKeys: config.clientKeys.map(record => record.id === id ? retained : record) };
      });
      return cleanupResult(before.secretRef, { ...metadata(retained), ...outcome });
    },
    async rotate(id) {
      const before = find(await read(), id);
      const key = `cxrg_${crypto.randomBytes(24).toString('base64url')}`;
      const rotatedAt = new Date().toISOString();
      let rotated;
      const outcome = await stageSecret(key, (config, secretRef) => {
        const current = find(config, id);
        requireUnchanged(current, before);
        rotated = { ...current, keyHash: hashOf(key), secretRef, enabled: true, rotatedAt, authMutationRevision: nextAuthRevision(current) };
        return { ...config, clientKeys: config.clientKeys.map(record => record.id === id ? rotated : record) };
      });
      return cleanupResult(before.secretRef, { id, name: rotated.name, scope: rotated.scope || [], key, rotatedAt, enabled: true, ...outcome });
    },
    async revoke(id) {
      await update(config => { find(config, id); return { ...config, clientKeys: config.clientKeys.map(record => record.id === id ? { ...record, enabled: false, authMutationRevision: nextAuthRevision(record) } : record) }; });
      return { id, enabled: false };
    },
    async delete(id) {
      let removed;
      await update(config => { removed = find(config, id); return { ...config, clientKeys: config.clientKeys.filter(record => record.id !== id) }; });
      return cleanupResult(removed.secretRef, { id, deleted: true });
    },
  };
}
