import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { encryptedStorage } from './codex-direct-fixture.mjs';
const require = createRequire(import.meta.url);
const { createCodexConfigService } = require('../../apps/desktop/electron/codex-config-service.cjs');
const { parse } = require('../../apps/desktop/node_modules/smol-toml');

test('native apply preserves model facts through resolution, writes readable catalog and refuses stale capability updates',async()=>{
  const area=path.resolve('.tmp/codex-route-management-20261125/revision7');await fs.mkdir(area,{recursive:true});
  const codexHome=await fs.mkdtemp(path.join(area,'native-cap-'));
  const capabilities={contextWindow:128000,maxOutputTokens:8192,inputModalities:['text','image'],reasoningEfforts:['low','high'],tools:true};
  let change=false,calls=0;
  const service=createCodexConfigService({codexHome,profilesPath:path.join(codexHome,'profiles.enc'),safeStorage:encryptedStorage(),platform:'win32',validateKey:async()=>{},getRoutes:async()=>({baseUrl:'http://127.0.0.1:4318/v1',routes:[{id:'r',model:'vision',outboundProtocol:'Chat',capabilities:{...capabilities,...(change&&++calls>1?{contextWindow:64000}:{})}}]})});
  const selection={mode:'gateway',routeIds:['r'],defaultRouteId:'r'};const preview=await service.preview(selection);
  assert.deepEqual(JSON.parse(preview.catalogPreview)._cxrg.capabilities,[capabilities]);
  await service.apply({...selection,clientKey:'fixture-only-key',expectedRevision:preview.revision});
  const file=path.join(codexHome,'config.toml');const config=parse(await fs.readFile(file,'utf8'));const data=JSON.parse(await fs.readFile(config.model_catalog_json,'utf8'));
  assert.equal(data.models[0].context_window,128000);assert.deepEqual(data.models[0].input_modalities,['text','image']);
  assert.equal((await service.getStatus()).catalogStatus,'managed');
  const before=await fs.readFile(file);const expectedRevision=(await service.getStatus()).revision;change=true;calls=0;
  await assert.rejects(service.apply({...selection,clientKey:'fixture-only-key',expectedRevision}),{code:'CODEX_ROUTE_UNAVAILABLE'});
  assert.deepEqual(await fs.readFile(file),before);
});
