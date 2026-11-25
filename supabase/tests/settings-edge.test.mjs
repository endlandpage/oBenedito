import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {boundedBody,InputError,MAX_FILE,rasterHeader,saveInput} from '../functions/bene-admin/validation.mjs';

test('Edge returns settings and forwards only explicitly validated settings to the atomic save RPC',async()=>{
 const token='header.'+Buffer.from(JSON.stringify({session_id:'22222222-2222-4222-8222-222222222222'})).toString('base64url')+'.signature';
 const initialSettings={heroModel:'menu',featureOneId:'bene-1',featureTwoId:null};
 let snapshot={revision:3,settings:initialSettings,photos:[{id:'bene-1',seed_src:'assets/bene-cheddar.webp',private_path:null,public_path:null,title:'Foto',caption:'',alt:'Descrição',category:'comida',visible:true,position:0,crop:null}]};
 let handler;const saves=[],authTokens=[];
 const db={
  auth:{getUser:async(value)=>{authTokens.push(value);return {data:{user:{id:'11111111-1111-4111-8111-111111111111'}},error:null};}},
  rpc:async(name,args)=>{
   if(name==='bene_admin_rate')return {data:null,error:null};
   if(name==='bene_admin_snapshot')return {data:structuredClone(snapshot),error:null};
   assert.equal(name,'bene_admin_save');saves.push(args);
   snapshot={...snapshot,revision:snapshot.revision+1,settings:Object.hasOwn(args,'p_settings')?args.p_settings:snapshot.settings,photos:args.p_photos.map(photo=>({...snapshot.photos.find(old=>old.id===photo.id),...photo}))};
   return {data:structuredClone(snapshot),error:null};
  },
  storage:{from:()=>({remove:async()=>({error:null})})}
 };
 const ts=await readFile(new URL('../functions/bene-admin/index.ts',import.meta.url),'utf8');
 const js=stripTypeScriptTypes(ts,{mode:'strip'}).replace(/^import .*;\r?\n/gm,'').replaceAll('import.meta.resolve','importMetaResolve');
 new vm.Script(js).runInNewContext({createClient:()=>db,boundedBody,InputError,MAX_FILE,rasterHeader,saveInput,console,Request,Response,TextDecoder,Uint8Array,File,URL,atob,crypto,importMetaResolve:()=>'',Deno:{env:{get:name=>({SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-server-only-key'}[name])},serve:value=>{handler=value;}}});
 const request=(body)=>new Request('https://example.test/functions/v1/bene-admin',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const read=await handler(request());assert.equal(read.status,200);assert.deepEqual((await read.json()).settings,initialSettings);
 let response=await handler(request({action:'save',revision:snapshot.revision,photos:snapshot.photos}));
 assert.equal(response.status,200);assert(!Object.hasOwn(saves[0],'p_settings'));assert.deepEqual((await response.json()).settings,initialSettings);
 const settings={heroModel:'smash-duplo',featureOneId:null,featureTwoId:'bene-1'};
 response=await handler(request({action:'save',revision:snapshot.revision,photos:snapshot.photos,settings}));
 assert.equal(response.status,200);assert.deepEqual(saves[1].p_settings,settings);assert.deepEqual((await response.json()).settings,settings);
 response=await handler(request({action:'save',revision:snapshot.revision,photos:snapshot.photos,settings:null}));
 assert.equal(response.status,400);assert.equal(saves.length,2);assert(authTokens.every(value=>value===token));
 for(const origin of ['https://o-benedito.onrender.com','https://o-benedito-demo-v4o6.onrender.com']){
  const preflight=await handler(new Request('https://example.test/functions/v1/bene-admin',{method:'OPTIONS',headers:{origin}}));
  assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),origin);assert.equal(preflight.headers.get('vary'),'Origin');
  const anonymous=await handler(new Request('https://example.test/functions/v1/bene-admin',{headers:{origin}}));
  assert.equal(anonymous.status,401);assert.equal(anonymous.headers.get('access-control-allow-origin'),origin);
 }
 for(const origin of ['https://untrusted.example','https://o-benedito-demo-v4o6.onrender.com.untrusted.example','http://o-benedito-demo-v4o6.onrender.com']){
  const rejected=await handler(new Request('https://example.test/functions/v1/bene-admin',{method:'OPTIONS',headers:{origin}}));
  assert.equal(rejected.status,403);assert.equal(rejected.headers.get('access-control-allow-origin'),null);
 }
});
