import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { ConfigStore } from '../../packages/shared/src/config-store.mjs';
import { createGatewayServer } from '../../services/gateway/src/server.mjs';
import { createControlServer } from '../../services/local-control/src/server.mjs';
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const endpoints = { Res: '/v1/responses', Mes: '/v1/messages', Chat: '/v1/chat/completions' };
async function fixture(t, outbound = 'Chat') {
  const captured = [];
  const upstream = http.createServer(async (req, res) => {
    let bytes = ''; for await (const part of req) bytes += part;
    captured.push(JSON.parse(bytes)); res.setHeader('content-type','application/json');
    res.end(JSON.stringify(outbound === 'Res' ? { id:'ok',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'ok'}]}] } : outbound === 'Mes' ? {id:'ok',type:'message',role:'assistant',content:[{type:'text',text:'ok'}],stop_reason:'end_turn'} : {id:'ok',choices:[{message:{role:'assistant',content:'ok'},finish_reason:'stop'}]}));
  });
  const url = await listen(upstream);
  const parent = path.resolve('.tmp/codex-route-management-20261125/revision7');
  await fs.mkdir(parent,{recursive:true}); const dir=await fs.mkdtemp(path.join(parent,'capability-http-'));
  const store=new ConfigStore(path.join(dir,'config.json'));
  await store.update(c=>({...c,upstreams:[{id:'u',enabled:true,baseUrl:url,trustedPrivateNetwork:true,approvedAddresses:['127.0.0.1']}],routes:Object.keys(endpoints).map(protocol=>({id:protocol,alias:protocol,enabled:true,inboundProtocol:protocol,outboundProtocol:outbound,upstreamId:'u',modelId:'fixture',capabilities:{maxOutputTokens:64}})),clientKeys:[{id:'key',enabled:true,scope:[],keyHash:crypto.createHash('sha256').update('fixture-key').digest('hex')}]}));
  const gateway=createGatewayServer({store,vault:{},rateLimitPerMinute:1000});const base=await listen(gateway);
  const control=createControlServer({store,vault:{},controlToken:'fixture-control'});const controlBase=await listen(control);
  t.after(async()=>{for(const server of [gateway,upstream,control]){server.closeAllConnections();server.close();}await store.writeQueue;});
  return {store,captured,async call(protocol,extra={}){const r=await fetch(base+endpoints[protocol],{method:'POST',headers:{authorization:'Bearer fixture-key','content-type':'application/json'},body:JSON.stringify({model:protocol,...(protocol==='Res'?{input:'hi'}:{messages:[{role:'user',content:'hi'}]}),...extra})});return {status:r.status,body:await r.json()};},async control(endpoint,body,method='POST'){const r=await fetch(controlBase+'/v1/control/'+endpoint,{method,headers:{authorization:'Bearer fixture-control','content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};}};
}
for(const outbound of Object.keys(endpoints))test(`configured output ceiling reaches ${outbound} for each input protocol`,async t=>{
  const app=await fixture(t,outbound);
  for(const protocol of Object.keys(endpoints))for(const [asked,expected]of[[undefined,64],[200,64],[16,16]]){
    const field=protocol==='Res'?'max_output_tokens':protocol==='Chat'?'max_completion_tokens':'max_tokens';
    const r=await app.call(protocol,asked===undefined?{}:{[field]:asked});assert.equal(r.status,200,JSON.stringify(r.body));
    const body=app.captured.at(-1);assert.equal(outbound==='Res'?body.max_output_tokens:outbound==='Chat'?(body.max_completion_tokens??body.max_tokens):body.max_tokens,expected);
  }
});
test('explicit unsupported capabilities reject before upstream; malformed output budgets do not evade ceiling',async t=>{
  const app=await fixture(t);
  for(const invalid of [0,-1,1.2,'20',null]) assert.equal((await app.call('Res',{max_output_tokens:invalid})).status,400);
  assert.equal(app.captured.length,0);
  await app.store.update(c=>({...c,routes:c.routes.map(r=>({...r,capabilities:{maxOutputTokens:64,inputModalities:['text'],tools:false,reasoningEfforts:[]}}))}));
  for(const extra of [{tools:[{type:'function',name:'local',parameters:{type:'object'}}]},{reasoning:{effort:'high'}},{input:[{role:'user',content:[{type:'input_image',image_url:'https://example.invalid/a.png'}]}]}]){
    const r=await app.call('Res',extra);assert.equal(r.status,400);assert.equal(r.body.error,'model_capability_unsupported');
  }
  assert.equal(app.captured.length,0);assert.equal((await app.call('Res')).status,200);
});
test('control single creation/patch persists capabilities and rejects incompatible range atomically',async t=>{
  const app=await fixture(t);
  const capabilities={contextWindow:128000,maxOutputTokens:8192,inputModalities:['text','image'],reasoningEfforts:['low','high']};
  const r=await app.control('routes',{alias:'new',modelId:'new',inboundProtocol:'Res',outboundProtocol:'Chat',upstreamId:'u',capabilities});assert.equal(r.status,201);assert.deepEqual(r.body.capabilities,capabilities);
  const endpoint='routes/'+r.body.id;
  assert.deepEqual((await app.control(endpoint,{alias:'renamed'},'PATCH')).body.capabilities,capabilities);
  const before=await fs.readFile(app.store.filePath,'utf8');assert.equal((await app.control(endpoint,{reasoning:{min:'max',max:'max'}},'PATCH')).status,400);assert.equal(await fs.readFile(app.store.filePath,'utf8'),before);
  assert.equal(Object.hasOwn((await app.control(endpoint,{capabilities:null},'PATCH')).body,'capabilities'),false);
});

test('tool aliases and native thinking cannot bypass explicit unsupported model capabilities',async t=>{
  for (const outbound of ['Chat','Mes','Res']) {
    const app=await fixture(t,outbound);
    await app.store.update(c=>({...c,routes:c.routes.map(r=>({...r,capabilities:{tools:false,reasoningEfforts:[]}}))}));
    const tool={type:'function',name:'lookup',parameters:{type:'object'}};
    for(const extra of [{additional_tools:{tools:[tool]}},{input:[{type:'tool_search_output',call_id:'search',tools:[tool]}]}]){
      assert.equal((await app.call('Res',extra)).status,400);
    }
    assert.equal((await app.call('Mes',{thinking:{type:'enabled',budget_tokens:1024}})).status,400);
    assert.equal((await app.call('Mes',{thinking:{type:'adaptive'}})).status,400);
    assert.equal((await app.call('Chat',{functions:[{name:'lookup',parameters:{type:'object'}}],function_call:'auto'})).status,400);
    assert.equal((await app.call('Res',{input:[{type:'function_call',name:'lookup',call_id:'c',arguments:'{}'},{type:'function_call_output',call_id:'c',output:'result'}]})).status,400);
    assert.equal((await app.call('Chat',{messages:[{role:'assistant',tool_calls:[{id:'c',type:'function',function:{name:'lookup',arguments:'{}'}}]},{role:'tool',tool_call_id:'c',content:'result'}]})).status,400);
    assert.equal((await app.call('Mes',{messages:[{role:'assistant',content:[{type:'tool_use',id:'c',name:'lookup',input:{}}]},{role:'user',content:[{type:'tool_result',tool_use_id:'c',content:'result'}]}]})).status,400);
    await app.store.update(c=>({...c,routes:c.routes.map(r=>({...r,capabilities:{reasoningEfforts:['none']}}))}));
    assert.equal((await app.call('Mes',{thinking:{type:'enabled',budget_tokens:1024}})).status,400);
    assert.equal(app.captured.length,0);
  }
});
