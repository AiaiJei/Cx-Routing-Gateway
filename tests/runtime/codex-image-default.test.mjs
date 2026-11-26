import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { encryptedStorage } from './codex-direct-fixture.mjs';
const require=createRequire(import.meta.url);
const {createModelCatalog,catalogData}=require('../../apps/desktop/electron/codex-model-catalog.cjs');
const {CodexConfigStore}=require('../../apps/desktop/electron/codex-config-store.cjs');
const {createCodexConfigService}=require('../../apps/desktop/electron/codex-config-service.cjs');
const {catalogSyncStatus}=require('../../apps/desktop/electron/codex-catalog-status.cjs');
async function home(){const area=path.resolve('.tmp/codex-route-management-20261125/revision8');await fs.mkdir(area,{recursive:true});return fs.mkdtemp(path.join(area,'native-'));}

test('new gateway and custom direct catalogs default images without overriding explicit text-only models',async()=>{
  const catalog=createModelCatalog(new CodexConfigStore({codexHome:await home()}));
  const data=catalog.plan(['a','b'],'a',['default','text-only'],'gateway',[null,null],[null,{inputModalities:['text']}]);
  assert.equal(data.data._cxrg.version,5);
  assert.deepEqual(data.data.models.map(x=>x.input_modalities),[['text','image'],['text']]);
  await catalog.write(data);assert.equal((await catalog.inspect(data.path)).status,'managed');
  const direct=catalog.planDirect(['direct-default'],'direct-default');assert.deepEqual(direct.data.models[0].input_modalities,['text','image']);
  await catalog.write(direct);assert.equal((await catalog.inspect(direct.path)).status,'managed');
});

test('historical schemas1-4 keep old text-only default bytes and remain inspectable',async()=>{
  const codexHome=await home(),catalog=createModelCatalog(new CodexConfigStore({codexHome}));
  const directory=path.join(codexHome,'.cx-routing-gateway','catalogs');await fs.mkdir(directory,{recursive:true});
  for(const [kind,ranges,caps]of[['legacy',undefined,undefined],['gateway',undefined,undefined],['gateway',[null],undefined],['gateway',[null],[null]]]){
    const data=catalogData(['a'],'a',['old'],'Old generic prompt',kind,ranges,caps);
    assert.deepEqual(data.models[0].input_modalities,['text']);
    const bytes=Buffer.from(JSON.stringify(data,null,2)+'\n');const file=path.join(directory,crypto.createHash('sha256').update(bytes).digest('hex')+'.json');await fs.writeFile(file,bytes);
    assert.equal((await catalog.inspect(file)).status,'managed');assert.deepEqual(await fs.readFile(file),bytes);
  }
});

test('status distinguishes unapplied, synced, changed model metadata and unavailable runtime without rewriting config',async()=>{
  const codexHome=await home();const configPath=path.join(codexHome,'config.toml');await fs.writeFile(configPath,'model_provider="other"\nmodel="vision"\n[model_providers.other]\nbase_url="http://127.0.0.1:15721/v1"\nwire_api="responses"\n');
  let capabilities={inputModalities:['text','image']},offline=false;
  const service=createCodexConfigService({codexHome,profilesPath:path.join(codexHome,'profiles.enc'),safeStorage:encryptedStorage(),platform:'win32',validateKey:async()=>{},getRoutes:async()=>{if(offline)throw Error('private runtime error');return {baseUrl:'http://127.0.0.1:4318/v1',routes:[{id:'r',model:'vision',outboundProtocol:'Chat',capabilities}]};}});
  const before=await fs.readFile(configPath);const initial=await service.getStatus();
  assert.equal(initial.catalogSync.state,'not-applied');assert.equal(initial.catalogSync.source,'none');assert.deepEqual(await fs.readFile(configPath),before);
  const selection={mode:'gateway',routeIds:['r'],defaultRouteId:'r'};const preview=await service.preview(selection);await service.apply({...selection,clientKey:'fixture-key',expectedRevision:preview.revision});
  const current=await service.getStatus();assert.equal(current.catalogSync.state,'current');assert.deepEqual(current.catalogSync.models,[{model:'vision',inputModalities:['text','image']}]);
  const applied=await fs.readFile(configPath);capabilities={inputModalities:['text']};
  assert.equal((await service.getStatus()).catalogSync.state,'stale');assert.deepEqual(await fs.readFile(configPath),applied);
  offline=true;const unavailable=await service.getStatus();assert.equal(unavailable.catalogSync.state,'unavailable');assert.equal(JSON.stringify(unavailable).includes('private runtime error'),false);
});

test('a conflicting active profile or selected model cannot be reported as synchronized',async()=>{
  const catalogs=createModelCatalog(new CodexConfigStore({codexHome:await home()}));
  const planned=catalogs.plan(['r'],'r',['vision']);
  const catalog={status:'managed',data:planned.data};
  const base={model:'vision',model_catalog_json:planned.path,model_providers:{cx_routing_gateway:{base_url:'http://127.0.0.1:4318/v1'}}};
  const resolveSelection=async()=>({routes:[{id:'r',model:'vision'}],baseUrl:'http://127.0.0.1:4318/v1'});
  for(const config of [{...base,profile:'override',profiles:{override:{model_catalog_json:'C:/external.json'}}},{...base,profile:'override',profiles:{override:{model_provider:'other'}}},{...base,model:'outside-catalog'}]){
    const status=await catalogSyncStatus({catalog,mode:'gateway',config,catalogs,resolveSelection});assert.equal(status.state,'not-applied');
  }
});

test('missing managed catalogs report unavailable; imported snapshot catalogs report actual referenced capability',async()=>{
  for(const status of ['missing','invalid']) {
    const result=await catalogSyncStatus({catalog:{status},mode:'gateway',config:{model_catalog_json:'C:/managed/catalog.json'}});
    assert.equal(result.state,'unavailable');assert.equal(result.source,'gateway');
  }
  const old=catalogData(['a'],'a',['old'],'Old generic prompt','legacy');
  const result=await catalogSyncStatus({catalog:{status:'managed',data:old},mode:'direct',config:{model:'old',model_catalog_json:'C:/managed/old.json'},preserveDirectCatalog:true});
  assert.equal(result.state,'current');assert.deepEqual(result.models,[{model:'old',inputModalities:['text']}]);
});
