import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { encryptedStorage, directFixtureRoot } from "./codex-direct-fixture.mjs";
const require = createRequire(import.meta.url);
const { createDirectProfileStore } = require("../../apps/desktop/electron/codex-direct-store.cjs");
const profile = () => ({
  id: "direct_00000000-0000-4000-8000-000000000001",
  kind: "custom",
  name: "Local",
  baseUrl: "https://api.example/v1",
  models: ["alpha"],
  defaultModel: "alpha",
  apiKey: "private-profile-key",
  updatedAt: "2026-11-26T00:00:00.000Z",
});
async function fixture(options = {}) {
  const root = await directFixtureRoot("store-");
  const store = createDirectProfileStore({
    filePath: root.profilesPath,
    safeStorage: root.safeStorage,
    platform: "win32",
    ...options,
  });
  return { ...root, store };
}
test("encrypted profile store validates decrypted schema and never accepts unsafe URL/key/recipe metadata", async () => {
  for (const patch of [
    { baseUrl: "http://remote.example/v1" },
    { apiKey: "bad\nkey" },
    { models: ["a", "a"] },
    { defaultModel: "missing" },
    { kind: "snapshot" },
    { unexpected: "private" },
  ]) {
    const data = await fixture();
    await fs.mkdir(path.dirname(data.profilesPath), { recursive: true });
    const payload = { version: 1, profiles: [{ ...profile(), ...patch }] };
    await fs.writeFile(data.profilesPath, await data.safeStorage.encryptStringAsync(JSON.stringify(payload)));
    await assert.rejects(
      data.store.read(),
      (error) => error.code === "CODEX_PROFILES_INVALID" && !error.message.includes("private"),
    );
  }
});
test("encrypted profile writes are serialized across instances and stale revisions cannot overwrite newer content", async () => {
  const data = await fixture();
  const other = createDirectProfileStore({
    filePath: data.profilesPath,
    safeStorage: data.safeStorage,
    platform: "win32",
  });
  const result = await Promise.allSettled(
    [data.store, other].map((store) => store.update("missing", (value) => ({ ...value, profiles: [profile()] }))),
  );
  assert.equal(result.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(result.find((item) => item.status === "rejected").reason.code, "CODEX_PROFILES_CHANGED");
  const read = await data.store.read();
  assert.equal(read.data.profiles[0].apiKey, "private-profile-key");
  assert.ok(!(await fs.readFile(data.profilesPath)).includes(Buffer.from("private-profile-key")));
});
test("secure encryption failure and atomic replacement failure preserve previous encrypted library", async () => {
  const data = await fixture();
  const first = await data.store.update("missing", (value) => ({ ...value, profiles: [profile()] }));
  const before = await fs.readFile(data.profilesPath);
  const broken = encryptedStorage();
  broken.encryptStringAsync = async () => {
    throw Error("raw-private");
  };
  const encryptFail = createDirectProfileStore({ filePath: data.profilesPath, safeStorage: broken, platform: "win32" });
  await assert.rejects(
    encryptFail.update(first.revision, (value) => value),
    { code: "CODEX_PROFILES_UNAVAILABLE" },
  );
  const fsImpl = {
    ...fs,
    rename: async () => {
      throw Error("raw-private");
    },
  };
  const ioFail = createDirectProfileStore({
    filePath: data.profilesPath,
    safeStorage: data.safeStorage,
    platform: "win32",
    fsImpl,
  });
  await assert.rejects(
    ioFail.update(first.revision, (value) => value),
    (error) => !error.message.includes("raw-private"),
  );
  assert.deepEqual(await fs.readFile(data.profilesPath), before);
});
test("profile store rejects symlink/hardlink storage and enforces maximum fifty saved profiles", async () => {
  const data = await fixture();
  await fs.mkdir(path.dirname(data.profilesPath), { recursive: true });
  const outside = path.join(data.directory, "outside.enc");
  await fs.writeFile(outside, "untouched");
  await fs.symlink(outside, data.profilesPath, "file");
  await assert.rejects(data.store.read(), { code: "CODEX_PATH_UNSAFE" });
  await fs.unlink(data.profilesPath);
  await fs.link(outside, data.profilesPath);
  await assert.rejects(data.store.read(), { code: "CODEX_PATH_UNSAFE" });
  assert.equal(await fs.readFile(outside, "utf8"), "untouched");
  const normal = await fixture();
  await assert.rejects(
    normal.store.update("missing", (value) => ({
      ...value,
      profiles: Array.from({ length: 51 }, (_, index) => ({
        ...profile(),
        id: "direct_" + String(index).padStart(8, "0") + "-0000-4000-8000-000000000001",
      })),
    })),
    { code: "CODEX_PROFILES_INVALID" },
  );
  await assert.rejects(fs.readFile(normal.profilesPath), { code: "ENOENT" });
});
