const { fail, sanitize } = require("./codex-errors.cjs");
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const idValid = (value) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value);
const keyValid = (value) =>
  typeof value === "string" && value.length >= 8 && value.length <= 512 && /^[\x21-\x7e]+$/.test(value);
function createGatewayCredentialBridge({
  getCurrentKey,
  getGatewayCredentials,
  resolveGatewayCredential,
  retainGatewayCredential,
}) {
  function metadata(result, currentKey) {
    if (!record(result) || !Array.isArray(result.credentials) || result.credentials.length > 1000)
      throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
    const credentials = result.credentials.map((value) => {
      if (
        !record(value) ||
        !idValid(value.id) ||
        typeof value.name !== "string" ||
        value.name.length > 256 ||
        !Array.isArray(value.scope) ||
        value.scope.length > 100 ||
        !value.scope.every(
          (alias) =>
            typeof alias === "string" &&
            alias.length > 0 &&
            alias.length <= 256 &&
            !/[\u0000-\u001f\u007f]/.test(alias),
        ) ||
        typeof value.enabled !== "boolean" ||
        typeof value.secretAvailable !== "boolean"
      )
        throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
      return {
        id: value.id,
        name: value.name,
        scope: [...value.scope],
        enabled: value.enabled,
        secretAvailable: value.secretAvailable,
        current: result.currentCredentialId === value.id && value.enabled,
      };
    });
    if (new Set(credentials.map((value) => value.id)).size !== credentials.length)
      throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
    const currentId = credentials.find((value) => value.current)?.id;
    return {
      credentials,
      ...(currentId ? { currentCredentialId: currentId } : {}),
      currentConfigured: keyValid(currentKey),
    };
  }
  async function list() {
    const currentKey = await getCurrentKey();
    if (typeof getGatewayCredentials !== "function") throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
    let result;
    try {
      result = await getGatewayCredentials(currentKey);
    } catch (error) {
      throw sanitize(error, "CODEX_CREDENTIAL_UNAVAILABLE");
    }
    return metadata(result, currentKey);
  }
  return {
    list,
    async resolve(id) {
      if (!idValid(id) || typeof resolveGatewayCredential !== "function") throw fail("CODEX_INPUT_INVALID");
      let result;
      try {
        result = await resolveGatewayCredential(id);
      } catch (error) {
        throw sanitize(error, "CODEX_CREDENTIAL_UNAVAILABLE");
      }
      if (!record(result) || result.id !== id || !keyValid(result.key)) throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
      return result.key;
    },
    async retain(input) {
      if (
        !record(input) ||
        !idValid(input.id) ||
        Object.keys(input).some((key) => !["id", "key", "fromCurrent"].includes(key)) ||
        (typeof input.key === "string") === (input.fromCurrent === true) ||
        (input.fromCurrent !== undefined && input.fromCurrent !== true)
      )
        throw fail("CODEX_INPUT_INVALID");
      const key = input.fromCurrent === true ? await getCurrentKey() : input.key;
      if (!keyValid(key)) throw fail(input.fromCurrent ? "CODEX_CREDENTIAL_UNAVAILABLE" : "CODEX_INPUT_INVALID");
      if (typeof retainGatewayCredential !== "function") throw fail("CODEX_CREDENTIAL_UNAVAILABLE");
      try {
        await retainGatewayCredential(input.id, key);
      } catch (error) {
        throw sanitize(error, "CODEX_CREDENTIAL_UNAVAILABLE");
      }
      return list();
    },
  };
}
module.exports = { createGatewayCredentialBridge };
