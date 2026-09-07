import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSetupCode,presetServices,sameServerUrl,prepareSetup} from '../lib/lancache-setup.ts';
import {createLanCacheIntegration} from '../server/lancache-integration.mjs';

const code={format:'lancache-setup',version:1,managementUrl:'http://192.168.20.10:20722',pairingToken:'a'.repeat(43),instanceId:'cache-instance-123'};
test('setup code validates version and secret, with editable same-server IPv4 and IPv6 defaults',()=>{
 assert.equal(parseSetupCode(JSON.stringify(code)).managementUrl,'http://192.168.20.10:20722/');
 assert.equal(sameServerUrl('http://10.20.30.40:20721/#settings'),'http://10.20.30.40:20722/');
 assert.equal(sameServerUrl('https://[fd00::12]:20721/'),'https://[fd00::12]:20722/');
 for(const value of ['wrong',JSON.stringify({...code,version:2}),JSON.stringify({...code,pairingToken:'short'}),JSON.stringify({...code,managementUrl:'http://u:p@192.168.20.10/'}),JSON.stringify({...code,managementUrl:'javascript:alert(1)'})])assert.throws(()=>parseSetupCode(value));
});
test('presets use advertised services and preserve already-enabled selections',()=>{
 assert.deepEqual(presetServices('gaming',['steam','epicgames','wsus'],['wsus']),['epicgames','steam','wsus']);
 assert.deepEqual(presetServices('steam',['steam','wsus'],['wsus']),['steam','wsus']);
 assert.deepEqual(presetServices('all',['steam','wsus']),['steam','wsus']);
});
test('quick setup uses the real integration service and cannot write DNS before review',async()=>{
 let lines=['server=/home/10.1.1.1'],writes=0;
 const svc=createLanCacheIntegration({path:':memory:',pihole:{integrationState:async()=>({lines:[...lines]}),replaceIntegrationLines:async(expected,next)=>{assert.deepEqual(expected,lines);lines=next;writes++;}},fetchImpl:async(url,init)=>{
  assert.equal(init.headers.Authorization,'Bearer '+code.pairingToken);
  return Response.json(String(url).endsWith('/identity')?{apiVersion:1,product:'lancache',version:'0.1.0',instanceId:code.instanceId,capabilities:['status.read','services.read']}:String(url).endsWith('/status')?{engine:{healthy:true},contentAddresses:{ipv4:['192.168.20.10'],ipv6:[]},managementUrl:code.managementUrl}:{revision:'catalog-v1',services:[{id:'steam',name:'Steam',domains:[{type:'exact',domain:'lancache.steamcontent.com'}]}]});
 }});
 const request=async(path,body)=>path.endsWith('/configure')?svc.configure(body):path.endsWith('/test')?svc.test():path.endsWith('/preview')?svc.preview(body.selectedServices):svc.snapshot();
 try{
  const prepared=await prepareSetup(request,{code:parseSetupCode(JSON.stringify(code)),managementUrl:'',pairingToken:'',preset:'steam'});
  assert.equal(writes,0);assert.equal(prepared.state.connection.state,'Connected');assert.ok(prepared.preview.add.includes('host-record=lancache.steamcontent.com,192.168.20.10'));
  await svc.apply({revision:prepared.preview.configurationRevision,selectedServices:prepared.preview.selectedServices,previewHash:prepared.preview.previewHash});assert.equal(writes,1);assert.ok(lines.includes('server=/home/10.1.1.1'));
  await assert.rejects(()=>prepareSetup(request,{code:{...code,instanceId:'different-cache'},managementUrl:'',pairingToken:'',preset:'steam'}),/another cache/);assert.equal(writes,1);
 }finally{svc.close();}
});

