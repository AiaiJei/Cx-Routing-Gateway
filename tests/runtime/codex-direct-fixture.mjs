import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
export function encryptedStorage(available = true) {
  const key = Buffer.alloc(32, 0x4d);
  return {
    isAsyncEncryptionAvailable: async () => available,
    encryptStringAsync: async (text) => {
      const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      return Buffer.concat([iv, cipher.update(text, "utf8"), cipher.final(), cipher.getAuthTag()]);
    },
    decryptStringAsync: async (bytes) => {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(-16));
      return {
        result: Buffer.concat([decipher.update(bytes.subarray(12, -16)), decipher.final()]).toString("utf8"),
        shouldReEncrypt: false,
      };
    },
  };
}
export async function directFixtureRoot(prefix = "direct-") {
  const root = path.resolve(".tmp/codex-direct-management-20261126");
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, prefix));
  return {
    directory,
    codexHome: path.join(directory, "codex"),
    profilesPath: path.join(directory, "userdata", "codex-direct-profiles.enc"),
    safeStorage: encryptedStorage(),
    platform: "win32",
  };
}
