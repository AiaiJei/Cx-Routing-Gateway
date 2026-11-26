import test from 'node:test';
import { encryptedStorage } from './codex-direct-fixture.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('../../apps/desktop/node_modules/smol-toml');
const { createCodexConfigService } = require('../../apps/desktop/electron/codex-config-service.cjs');
const fixtureRoot = path.resolve('.tmp/codex-direct-management-20261126');
const key = 'cxrg_revision3_fixture_key';
const selection = { mode:'gateway', routeIds:['res-a','res-b'], defaultRouteId:'res-b' };
const routes = [{id:'res-a',model:'coding-a'},{id:'res-b',model:'coding-b'}];
async function fixture({original, fsImpl = fs, getRoutes = async ids => ({ routes:ids.map(id=>routes.find(item=>item.id===id)), baseUrl:'http://127.0.0.1:4318/v1'}), validateKey = async()=>{}}={}) {
  await fs.mkdir(fixtureRoot,{recursive:true});
  const codexHome=await fs.mkdtemp(path.join(fixtureRoot,'modes-'));
  const configPath=path.join(codexHome,'config.toml');
  if(original!==undefined) await fs.writeFile(configPath,original);
  const service=createCodexConfigService({safeStorage:encryptedStorage(),platform:"win32",profilesPath:path.join(codexHome,'direct-profiles.enc'),codexHome,fsImpl,getRoutes,validateKey});
  return {codexHome,configPath,service};
}
async function apply(service,input=selection,extra={}) {
  const preview=await service.preview(input);
  return service.apply({...input,expectedRevision:preview.revision,...(input.mode==='gateway'?{clientKey:key}:{}),...extra});
}
test('gateway catalogue activates all selected models with one default and exact unrelated reasoning',async()=>{
  const original='model_reasoning_effort = "high" # retain\n[nested]\nprecise = 1.0\n';
  const validated=[];
  const {service,configPath}=await fixture({original,validateKey:async(_key,alias)=>validated.push(alias)});
  const preview=await service.preview(selection);
  assert.equal(preview.mode,'gateway');
  assert.deepEqual(preview.selectedModelAliases,['coding-a','coding-b']);
  assert.deepEqual(JSON.parse(preview.catalogPreview)._cxrg,{version:5,capabilities:[null,null],kind:'gateway',routeIds:['res-a','res-b'],defaultRouteId:'res-b',aliases:['coding-a','coding-b'],reasoningRanges:[null,null]});
  assert.ok(!preview.catalogPreview.includes('base_instructions'));
  assert.ok(preview.catalogPreview.length<2048);
  const status=await service.apply({...selection,expectedRevision:preview.revision,clientKey:key});
  assert.equal(status.mode,'gateway');assert.equal(status.catalogStatus,'managed');
  assert.deepEqual(status.selectedRouteIds,['res-a','res-b']); assert.equal(status.defaultRouteId,'res-b');
  assert.equal(status.reasoningEffort,undefined);
  assert.deepEqual(validated,['coding-a','coding-b']);
  const text=await fs.readFile(configPath,'utf8');
  assert.ok(text.includes(original));
  const config=parse(text); assert.equal(config.model,'coding-b');
  const bytes=await fs.readFile(config.model_catalog_json);
  assert.equal(path.basename(config.model_catalog_json),crypto.createHash('sha256').update(bytes).digest('hex')+'.json');
  const catalog=JSON.parse(bytes);
  assert.deepEqual(catalog.models.map(model=>model.slug),['coding-a','coding-b']);
  assert.equal(catalog.models[1].priority,0);assert.ok(catalog.models[0].priority>0);
  assert.equal(catalog.models[0].base_instructions,await fs.readFile(path.resolve('apps/desktop/electron/codex-fallback-prompt.txt'),'utf8'));
  assert.equal(catalog.models[0].guardian,undefined);assert.equal(catalog.models[0].model_messages,undefined);
  assert.equal(catalog.models[0].context_window,undefined);assert.deepEqual(catalog.models[0].supported_reasoning_levels.map(item=>item.effort),['none','minimal','low','medium','high','xhigh']);
  assert.ok(!JSON.stringify(status).includes(key));
});
test('official apply works without Gateway and removes default/catalogue/built-in redirects while preserving inactive Gateway Key',async()=>{
  const original='model = "gateway-alias"\nmodel_provider = "cx_routing_gateway"\nmodel_catalog_json = "C:/external/catalog.json"\nopenai_base_url = "http://redirect/v1"\nchatgpt_base_url = "http://redirect/chatgpt"\nforced_login_method = "api"\nmodel_reasoning_effort = "xhigh"\n[model_providers.openai]\nbase_url = "http://redirect/v1"\n[model_providers.cx_routing_gateway]\nexperimental_bearer_token = "'+key+'"\n[nested]\nfloat = 1.0\n';
  const {service,configPath,codexHome}=await fixture({original,getRoutes:async()=>{throw Error('offline');},validateKey:async()=>{throw Error('offline');}});
  const before=await service.getStatus(); assert.equal(before.credentialConfigured,true);
  const library=await service.getDirectProfiles(); const directInput={mode:'direct',profileId:'official',profilesRevision:library.revision}; const preview=await service.preview(directInput); assert.equal(preview.mode,'direct'); assert.equal(preview.catalogPreview,undefined);
  const status=await service.apply({...directInput,expectedRevision:preview.revision});
  assert.equal(status.mode,'direct');assert.equal(status.direct.kind,'official');assert.equal(status.configured,true);assert.equal(status.credentialConfigured,true);assert.equal(status.catalogStatus,'none');
  const config=parse(await fs.readFile(configPath,'utf8'));
  assert.equal(config.model_provider,undefined);assert.equal(config.forced_login_method,undefined);assert.equal(config.model,undefined);
  for(const name of ['model_catalog_json','openai_base_url','chatgpt_base_url'])assert.equal(config[name],undefined);
  assert.equal(config.model_providers.openai,undefined);assert.equal(config.model_providers.cx_routing_gateway.experimental_bearer_token,key);
  assert.equal(config.model_reasoning_effort,'xhigh');
  const restarted=createCodexConfigService({safeStorage:encryptedStorage(),platform:"win32",profilesPath:path.join(codexHome,'direct-profiles.enc'),codexHome,getRoutes:async()=>{throw Error('offline');},validateKey:async()=>{}});
  await restarted.restore({backupId:status.backup.id,expectedRevision:status.revision});
  assert.equal(await fs.readFile(configPath,'utf8'),original);
});
test('gateway reuses inactive stored Key for every selected alias and removes forced official login without reasoning changes',async()=>{
  const seen=[];
  const {service,configPath}=await fixture({original:'model_provider = "openai"\nforced_login_method = "chatgpt"\nmodel_reasoning_effort = "high"\n[model_providers.cx_routing_gateway]\nexperimental_bearer_token = "'+key+'"\n',validateKey:async(value,alias)=>seen.push([value,alias])});
  const status=await apply(service,selection,{clientKey:'  '});
  assert.equal(status.configured,true);assert.deepEqual(seen,[[key,'coding-a'],[key,'coding-b']]);
  const config=parse(await fs.readFile(configPath,'utf8'));assert.equal(config.forced_login_method,undefined);assert.equal(config.model_reasoning_effort,'high');
});
test('selection and all-alias credential failures never write catalogue or config',async()=>{
  const {service,codexHome}=await fixture({validateKey:async(_key,alias)=>{if(alias==='coding-b')throw Error('secret');}});
  for(const input of [
    {mode:'gateway',routeIds:[],defaultRouteId:'res-a'},
    {...selection,routeIds:['res-a','res-a']},
    {...selection,routeIds:Array.from({length:101},(_,index)=>'route-'+index),defaultRouteId:'route-0'},
    {...selection,defaultRouteId:'missing'},
    {...selection,reasoningEffort:'low'},
    {mode:'official',clientKey:key},
  ]) await assert.rejects(service.preview(input),{code:'CODEX_INPUT_INVALID'});
  await assert.rejects(apply(service),error=>error.code==='CODEX_KEY_REJECTED'&&!error.message.includes('secret'));
  assert.deepEqual(await fs.readdir(codexHome),[]);
  const duplicate=await fixture({getRoutes:async()=>({routes:[{id:'res-a',model:'same'},{id:'res-b',model:'same'}],baseUrl:'http://127.0.0.1:4318/v1'})});
  await assert.rejects(duplicate.service.preview(selection),{code:'CODEX_ROUTE_UNAVAILABLE'});
});
test('catalogue write failure keeps old config and failed config commit retains old immutable catalogue across restart restore',async()=>{
  const data=await fixture({original:'model = "original"\n'});
  const first=await apply(data.service);
  const firstBytes=await fs.readFile(data.configPath,'utf8');
  const firstCatalog=parse(firstBytes).model_catalog_json; const catalogBytes=await fs.readFile(firstCatalog);
  const failCatalog={...fs,open:async(target,...args)=>{if(String(target).includes(path.sep+'catalogs'+path.sep)&&args[0]==='wx')throw Error('secret');return fs.open(target,...args);}};
  const alternate={mode:'gateway',routeIds:['res-a'],defaultRouteId:'res-a'};
  const blocked=createCodexConfigService({safeStorage:encryptedStorage(),platform:"win32",profilesPath:path.join(data.codexHome,'direct-profiles.enc'),codexHome:data.codexHome,fsImpl:failCatalog,getRoutes:async()=>({routes:[routes[0]],baseUrl:'http://127.0.0.1:4318/v1'}),validateKey:async()=>{}});
  await assert.rejects(apply(blocked,alternate),{code:'CODEX_IO_FAILED'});assert.equal(await fs.readFile(data.configPath,'utf8'),firstBytes);
  const failConfig={...fs,rename:async(source,target)=>{if(target===data.configPath)throw Error('secret');return fs.rename(source,target);}};
  const blockedConfig=createCodexConfigService({safeStorage:encryptedStorage(),platform:"win32",profilesPath:path.join(data.codexHome,'direct-profiles.enc'),codexHome:data.codexHome,fsImpl:failConfig,getRoutes:async()=>({routes:[routes[0]],baseUrl:'http://127.0.0.1:4318/v1'}),validateKey:async()=>{}});
  await assert.rejects(apply(blockedConfig,alternate),{code:'CODEX_IO_FAILED'});assert.equal(await fs.readFile(data.configPath,'utf8'),firstBytes);
  assert.deepEqual(await fs.readFile(firstCatalog),catalogBytes);
  const restarted=createCodexConfigService({safeStorage:encryptedStorage(),platform:"win32",profilesPath:path.join(data.codexHome,'direct-profiles.enc'),codexHome:data.codexHome,getRoutes:async()=>({routes,baseUrl:'http://127.0.0.1:4318/v1'}),validateKey:async()=>{}});
  const status=await restarted.getStatus();assert.equal(status.backup.id,first.backup.id);assert.equal(status.catalogStatus,'managed');
  await restarted.restore({backupId:status.backup.id,expectedRevision:status.revision});assert.equal(await fs.readFile(data.configPath,'utf8'),'model = "original"\n');
});
test('status reports legacy/external/missing/tampered catalogues without reading external files or blocking restore',async()=>{
  const legacy=await fixture({original:'model = "coding-a"\nmodel_provider = "cx_routing_gateway"\n[model_providers.cx_routing_gateway]\nbase_url = "http://127.0.0.1:4318/v1"\nwire_api = "responses"\nexperimental_bearer_token = "'+key+'"\n'});
  const old=await legacy.service.getStatus();assert.equal(old.catalogStatus,'legacy');assert.deepEqual(old.selectedModelAliases,['coding-a']);assert.deepEqual(old.selectedRouteIds,[]);
  let externalRead=false;
  const fsImpl={...fs,open:async(target,...args)=>{if(String(target)==='C:/external/catalog.json')externalRead=true;return fs.open(target,...args);}};
  const external=await fixture({original:'model_catalog_json = "C:/external/catalog.json"\n',fsImpl});
  assert.equal((await external.service.getStatus()).catalogStatus,'external');assert.equal(externalRead,false);
  const active=await fixture({original:'model = "before"\n'});
  const applied=await apply(active.service);const catalogPath=parse(await fs.readFile(active.configPath,'utf8')).model_catalog_json;
  await fs.writeFile(catalogPath,'{"models":[]}');
  const invalid=await active.service.getStatus();assert.equal(invalid.catalogStatus,'invalid');assert.ok(invalid.backup);
  await active.service.restore({backupId:invalid.backup.id,expectedRevision:invalid.revision});assert.equal(await fs.readFile(active.configPath,'utf8'),'model = "before"\n');
  const missing=await fixture();await apply(missing.service);const file=parse(await fs.readFile(missing.configPath,'utf8')).model_catalog_json;
  await fs.unlink(file);assert.equal((await missing.service.getStatus()).catalogStatus,'missing');
});
test('gateway revalidation catches a route change after Key checks and stale previews activate nothing',async()=>{
  let reads=0;const {service,configPath}=await fixture({original:'model = "before"\n',getRoutes:async()=>({routes:routes.map(item=>({...item,model:++reads>4?'changed':item.model})),baseUrl:'http://127.0.0.1:4318/v1'})});
  const preview=await service.preview(selection);
  await fs.writeFile(configPath,'model = "external"\n');
  await assert.rejects(service.apply({...selection,expectedRevision:preview.revision,clientKey:key}),{code:'CODEX_CONFIG_CHANGED'});
  assert.equal(await fs.readFile(configPath,'utf8'),'model = "external"\n');
});

test('failed catalogue bytes never publish a hash file and the same selection can retry successfully',async()=>{
  let once=true;
  const fsImpl={...fs,open:async(target,...args)=>{
    const handle=await fs.open(target,...args);
    if(once&&String(target).includes(path.sep+'catalogs'+path.sep)&&args[0]==='wx'){
      return {writeFile:async()=>{once=false;await handle.writeFile('partial');throw Error('injected-secret');},sync:()=>handle.sync(),close:()=>handle.close()};
    }
    return handle;
  }};
  const data=await fixture({fsImpl,original:'model = "before"\n'});
  await assert.rejects(apply(data.service),{code:'CODEX_IO_FAILED'});
  assert.equal(await fs.readFile(data.configPath,'utf8'),'model = "before"\n');
  assert.deepEqual((await fs.readdir(path.join(data.codexHome,'.cx-routing-gateway','catalogs'))).filter(name=>/^[a-f0-9]{64}\.json$/.test(name)),[]);
  const status=await apply(data.service);assert.equal(status.catalogStatus,'managed');
});

test('custom built-in OpenAI redirects and forced API login stay direct snapshots before explicit official cleanup',async()=>{
  for(const original of [
    'openai_base_url = "http://custom/v1"\n',
    'chatgpt_base_url = "http://custom/chatgpt"\n',
    'forced_login_method = "api"\n',
    '[model_providers.openai]\nbase_url = "http://custom/v1"\n',
    'model_catalog_json = "C:/custom.json"\n',
  ]){
    const data=await fixture({original,getRoutes:async()=>{throw Error('offline');}});
    const before=await data.service.getStatus();assert.equal(before.mode,'direct');assert.ok(before.direct.kind!=='official');
    const library=await data.service.getDirectProfiles();const saved=await apply(data.service,{mode:'direct',profileId:'official',profilesRevision:library.revision});
    assert.equal(saved.mode,'direct');assert.equal(saved.direct.kind,'official');assert.equal(saved.configured,true);
  }
  assert.equal((await (await fixture()).service.getStatus()).direct.kind,'official');
});

test('catalogue links are refused and valid historical prompt bytes remain readable without current-template rewriting',async()=>{
  const data=await fixture();
  const applied=await apply(data.service);
  const file=parse(await fs.readFile(data.configPath,'utf8')).model_catalog_json;
  const catalog=JSON.parse(await fs.readFile(file,'utf8'));
  for(const model of catalog.models)model.base_instructions='Historical generic fallback retained under schema 1.';
  const bytes=Buffer.from(JSON.stringify(catalog,null,2)+'\n');
  const historical=path.join(path.dirname(file),crypto.createHash('sha256').update(bytes).digest('hex')+'.json');
  await fs.writeFile(historical,bytes);
  const text=await fs.readFile(data.configPath,'utf8');
  await fs.writeFile(data.configPath,text.replace(JSON.stringify(file),JSON.stringify(historical)));
  assert.equal((await data.service.getStatus()).catalogStatus,'managed');
  await fs.unlink(historical);
  await fs.symlink(file,historical,'file');
  const linked=await data.service.getStatus();assert.equal(linked.catalogStatus,'invalid');
  // The current file was externally edited, so the original restore revision
  // must still reject rather than hiding the conflict behind catalogue status.
  await assert.rejects(data.service.restore({backupId:applied.backup.id,expectedRevision:applied.revision}),{code:'CODEX_CONFIG_CHANGED'});
});

test('changing any selected route while validating all Keys aborts before catalogue activation',async()=>{
  let changed=false;
  const data=await fixture({
    original:'model = "before"\n',
    getRoutes:async()=>({routes:routes.map(item=>({...item,model:changed&&item.id==='res-b'?'changed-model':item.model})),baseUrl:'http://127.0.0.1:4318/v1'}),
    validateKey:async(_key,alias)=>{if(alias==='coding-b')changed=true;},
  });
  await assert.rejects(apply(data.service),{code:'CODEX_ROUTE_UNAVAILABLE'});
  assert.equal(await fs.readFile(data.configPath,'utf8'),'model = "before"\n');
  assert.deepEqual(await fs.readdir(data.codexHome),['config.toml']);
});

test('one hundred selected models fit the bounded catalogue while preview remains a compact summary',async()=>{
  const ids=Array.from({length:100},(_,index)=>'route-'+index);
  const data=await fixture({getRoutes:async requested=>({routes:requested.map(id=>({id,model:'model-'+id})),baseUrl:'http://127.0.0.1:4318/v1'})});
  const input={mode:'gateway',routeIds:ids,defaultRouteId:ids[99]};
  const preview=await data.service.preview(input);
  assert.equal(JSON.parse(preview.catalogPreview).models.length,100);
  assert.ok(preview.catalogPreview.length<64*1024);
  const saved=await data.service.apply({...input,expectedRevision:preview.revision,clientKey:key});
  assert.equal(saved.selectedRouteIds.length,100);assert.equal(saved.defaultRouteId,ids[99]);
  const config=parse(await fs.readFile(data.configPath,'utf8'));
  const catalog=JSON.parse(await fs.readFile(config.model_catalog_json,'utf8'));
  assert.equal(catalog.models[99].priority,0);assert.ok((await fs.stat(config.model_catalog_json)).size<8*1024*1024);
});

test('retry recovers only a verified module temporary alias left after catalogue hardlink publication',async()=>{
  const { createModelCatalog }=require('../../apps/desktop/electron/codex-model-catalog.cjs');
  const { CodexConfigStore }=require('../../apps/desktop/electron/codex-config-store.cjs');
  const data=await fixture();
  const catalog=createModelCatalog(new CodexConfigStore({codexHome:data.codexHome}));
  const prepared=catalog.plan(['res-a','res-b'],'res-b',['coding-a','coding-b']);
  await fs.mkdir(path.dirname(prepared.path),{recursive:true});
  const temporary=path.join(path.dirname(prepared.path),'.'+prepared.id+'.'+crypto.randomUUID()+'.tmp');
  await fs.writeFile(temporary,prepared.bytes);
  await fs.link(temporary,prepared.path);
  assert.equal((await fs.stat(prepared.path)).nlink,2);
  const saved=await apply(data.service);
  assert.equal(saved.catalogStatus,'managed');
  assert.equal((await fs.stat(prepared.path)).nlink,1);
  await assert.rejects(fs.lstat(temporary),{code:'ENOENT'});
  assert.deepEqual(await fs.readFile(prepared.path),prepared.bytes);
});

test('catalogue retry refuses arbitrary extra hardlinks and tampered module temporary aliases',async()=>{
  const { createModelCatalog }=require('../../apps/desktop/electron/codex-model-catalog.cjs');
  const { CodexConfigStore }=require('../../apps/desktop/electron/codex-config-store.cjs');
  for(const kind of ['arbitrary','tampered','unrelated','extra']){
    const data=await fixture({original:'model = "before"\n'});
    const catalog=createModelCatalog(new CodexConfigStore({codexHome:data.codexHome}));
    const prepared=catalog.plan(['res-a','res-b'],'res-b',['coding-a','coding-b']);
    await fs.mkdir(path.dirname(prepared.path),{recursive:true});
    const alias=path.join(path.dirname(prepared.path),kind==='arbitrary'?'extra-copy.json':'.'+prepared.id+'.'+crypto.randomUUID()+'.tmp');
    await fs.writeFile(prepared.path,kind==='tampered'?'tampered':prepared.bytes);
    if(kind==='unrelated')await fs.writeFile(alias,prepared.bytes);
    else await fs.link(prepared.path,alias);
    if(kind==='unrelated')await fs.link(prepared.path,path.join(path.dirname(prepared.path),'extra-copy.json'));
    if(kind==='extra')await fs.link(prepared.path,path.join(path.dirname(prepared.path),'extra-copy.json'));
    await assert.rejects(apply(data.service),{code:'CODEX_CATALOG_INVALID'});
    assert.equal(await fs.readFile(data.configPath,'utf8'),'model = "before"\n');
    assert.ok(await fs.lstat(alias));
  }
});
