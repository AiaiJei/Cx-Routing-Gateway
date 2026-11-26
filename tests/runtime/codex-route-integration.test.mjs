import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {ConfigStore} from '../../packages/shared/src/config-store.mjs';
import {createControlServer} from '../../services/local-control/src/server.mjs';
import {createGatewayServer} from '../../services/gateway/src/server.mjs';
import {encryptedStorage} from './codex-direct-fixture.mjs';
import {REASONING_LEVELS} from '../../packages/shared/src/reasoning-policy.mjs';
const require=createRequire(import.meta.url);
const {parse}=require('../../apps/desktop/node_modules/smol-toml');
const {createCodexRuntimeClient}=require('../../apps/desktop/electron/codex-runtime-client.cjs');
const {createCodexConfigService}=require('../../apps/desktop/electron/codex-config-service.cjs');
const listen=s=>new Promise(resolve=>s.listen(0,'127.0.0.1',()=>resolve(s.address().port)));
const close=s=>new Promise(resolve=>{s.closeAllConnections?.();s.close(resolve)});

test('native catalog and Gateway policy use the same ordered effort levels',()=>{
 const native=require('../../apps/desktop/electron/codex-reasoning-range.cjs');
 assert.deepEqual(native.REASONING_LEVELS,REASONING_LEVELS);
});

test('saved route intervals flow through Control and native catalog; stale clients obey new route limits immediately', async t=>{
 const area=path.resolve('.tmp/codex-routing-range-20261126');await fs.mkdir(area,{recursive:true});
 const dir=await fs.mkdtemp(path.join(area,'contract-integration-')),home=path.join(dir,'codex');await fs.mkdir(home);
 await fs.writeFile(path.join(home,'config.toml'),'web_search = "cached"\n');
 const observed=[];
 const upstream=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const body=JSON.parse(text);observed.push(body.reasoning_effort);res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'fixture',object:'chat.completion',model:body.model,choices:[{index:0,message:{role:'assistant',content:'OK'},finish_reason:'stop'}]}));});
 const upstreamPort=await listen(upstream);t.after(()=>close(upstream));
 const token='inert-integration-client',store=new ConfigStore(path.join(dir,'config.json'));
 await store.update(c=>({...c,upstreams:[{id:'up-a',name:'A',enabled:true,models:['shared-model'],baseUrl:'http://127.0.0.1:'+upstreamPort,trustedPrivateNetwork:true,approvedAddresses:['127.0.0.1']},{id:'up-b',name:'B',enabled:true,models:['shared-model'],baseUrl:'http://127.0.0.1:'+upstreamPort,trustedPrivateNetwork:true,approvedAddresses:['127.0.0.1']}],clientKeys:[{id:'key',enabled:true,keyHash:crypto.createHash('sha256').update(token).digest('hex')}]}));
 const control=createControlServer({store,vault:{},controlToken:'inert-control'}),gateway=createGatewayServer({store,vault:{}});
 const controlPort=await listen(control),gatewayPort=await listen(gateway);t.after(()=>close(control));t.after(()=>close(gateway));
 const save=async(min,max)=>{
  const response=await fetch('http://127.0.0.1:'+controlPort+'/v1/control/routes/batch',{method:'POST',headers:{authorization:'Bearer inert-control','content-type':'application/json'},body:JSON.stringify({inboundProtocol:'Res',outboundProtocol:'Chat',targets:[{upstreamId:'up-b',modelId:'shared-model'},{upstreamId:'up-a',modelId:'shared-model'}],replaceTargets:true,modelReasoning:[{modelId:'shared-model',min,max}]})});
  assert.equal(response.status,200);return(await response.json()).routes[0];
 };
 const route=await save('low','high');
 const client=createCodexRuntimeClient({getControlPort:()=>controlPort,getGatewayPort:()=>gatewayPort,getControlToken:()=>'inert-control',isRuntimeReady:()=>true});
 const service=createCodexConfigService({codexHome:home,profilesPath:path.join(dir,'profiles.enc'),safeStorage:encryptedStorage(),platform:'win32',getRoutes:client.getRoutes,validateKey:client.validateKey});
 const selection={mode:'gateway',routeIds:[route.id],defaultRouteId:route.id};
 const preview=await service.preview(selection);await service.apply({...selection,clientKey:token,expectedRevision:preview.revision});
 const config=parse(await fs.readFile(path.join(home,'config.toml'),'utf8'));
 const catalog=JSON.parse(await fs.readFile(config.model_catalog_json,'utf8'));
 assert.equal(config.web_search,'disabled');
 assert.equal(catalog._cxrg.version,5);
 assert.deepEqual(catalog.models[0].supported_reasoning_levels.map(x=>x.effort),['low','medium','high']);
 assert.equal(catalog.models[0].default_reasoning_level,'medium');
 const changed=await save('high','max');assert.equal(changed.id,route.id);
 const run=async(effort)=>{
  const response=await fetch('http://127.0.0.1:'+gatewayPort+'/v1/responses',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({model:'shared-model',input:'fixture',...(effort===undefined?{}:{reasoning:{effort}})})});
  assert.equal(response.status,200);await response.json();
 };
 await run('low');await run('xhigh');await run(undefined);
 assert.deepEqual(observed,['high','xhigh','high']);
 const state=await store.read();assert.equal(state.routes.length,1);assert.deepEqual(state.routes[0].targets.map(x=>x.upstreamId),['up-b','up-a']);
 assert.deepEqual(state.usage.map(x=>x.reasoningEffort),observed);
 assert.deepEqual(JSON.parse(await fs.readFile(config.model_catalog_json,'utf8')),catalog,'route-only saves do not silently rewrite user config/catalog');
 const refreshed=await service.preview(selection);await service.apply({...selection,clientKey:token,expectedRevision:refreshed.revision});
 const next=parse(await fs.readFile(path.join(home,'config.toml'),'utf8'));
 const nextCatalog=JSON.parse(await fs.readFile(next.model_catalog_json,'utf8'));
 assert.deepEqual(nextCatalog.models[0].supported_reasoning_levels.map(x=>x.effort),['high','xhigh','max']);
 assert.equal(nextCatalog.models[0].default_reasoning_level,'high');
});
