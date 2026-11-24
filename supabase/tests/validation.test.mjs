import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {saveInput,rasterHeader,boundedBody,MAX_FILE,photoCrop,HERO_MODELS} from '../functions/bene-admin/validation.mjs';

test('crop validates inclusive bounds and nullable framing without accepting extra fields',()=>{
  for(const crop of [null,{x:0,y:100,zoom:1},{x:100,y:0,zoom:3},{x:12.25,y:81.5,zoom:1.25}])assert.deepEqual(photoCrop(crop),crop);
  for(const crop of [undefined,{},[],true,'crop',2,{x:50,y:50},{x:50,y:50,zoom:1,extra:0},JSON.parse('{"x":50,"y":50,"zoom":1,"__proto__":{}}'),{x:'50',y:50,zoom:1},{x:50,y:null,zoom:1},{x:NaN,y:50,zoom:1},{x:50,y:Infinity,zoom:1},{x:-1,y:50,zoom:1},{x:101,y:50,zoom:1},{x:50,y:-1,zoom:1},{x:50,y:101,zoom:1},{x:50,y:50,zoom:.99},{x:50,y:50,zoom:3.01}])assert.throws(()=>photoCrop(crop));
});
test('save preserves omitted crop, carries null reset and clones validated metadata',()=>{
  const crop={x:23,y:67,zoom:1.8};
  const out=saveInput({action:'save',revision:7,photos:[{...photo,crop}]}).photos[0];
  assert.deepEqual(out.crop,crop);assert.notEqual(out.crop,crop);assert.equal(out.id,photo.id);assert.equal(out.position,0);assert.equal(out.visible,true);
  assert(!Object.hasOwn(saveInput({action:'save',revision:7,photos:[photo]}).photos[0],'crop'));
  assert.equal(saveInput({action:'save',revision:7,photos:[{...photo,crop:null}]}).photos[0].crop,null);
  assert.throws(()=>saveInput({action:'save',revision:7,photos:[{...photo,crop:undefined}]}));
});

const photo={id:'bene-1',title:'Foto',caption:'',alt:'Uma foto',category:'comida',visible:true,position:0};
test('site choices allow exactly the curated hero models and visible draft photo IDs',()=>{
  const base={action:'save',revision:0,photos:[photo]};
  assert(!Object.hasOwn(saveInput(base),'settings'));
  for(const heroModel of HERO_MODELS){
    const settings={heroModel,featureOneId:'bene-1',featureTwoId:null};
    const output=saveInput({...base,settings});
    assert.deepEqual(output.settings,settings);assert.notEqual(output.settings,settings);
  }
  const good={heroModel:'bene-cheddar',featureOneId:null,featureTwoId:null};
  for(const settings of [null,undefined,[],true,'hero',{}, {...good,heroModel:'https://evil.test/model.glb'}, {...good,heroModel:4}, {...good,extra:1}, {...good,featureOneId:undefined}, {...good,featureOneId:7}, {...good,featureOneId:'bene-2'}, {...good,featureOneId:'assets/bene-cheddar.webp'},JSON.parse('{"heroModel":"bene-cheddar","featureOneId":null,"featureTwoId":null,"__proto__":{}}')])assert.throws(()=>saveInput({...base,settings}));
  assert.throws(()=>saveInput({...base,photos:[{...photo,visible:false}],settings:{...good,featureOneId:'bene-1'}}));
  assert.throws(()=>saveInput({...base,photos:[],settings:{...good,featureOneId:'bene-1'}}));
});
test('metadata is bounded, duplicate IDs rejected, client src is ignored',()=>{
  assert.equal(saveInput({action:'save',revision:0,photos:[{...photo,src:'https://evil.test/x'}]}).photos[0].src,undefined);
  for(const p of [{...photo,title:'x'.repeat(71)},{...photo,alt:''},{...photo,category:'svg'},{...photo,visible:'true'},{...photo,title:'abc\0'}])assert.throws(()=>saveInput({action:'save',revision:0,photos:[p]}));
  assert.throws(()=>saveInput({action:'save',revision:0,photos:[photo,photo]}));
  assert.throws(()=>saveInput({action:'save',revision:-1,photos:[]}));
  assert.throws(()=>saveInput({action:'save',revision:0,photos:Array(101).fill(photo)}));
});
test('rejects HTML/SVG, truncated files, huge dimensions, oversized bytes and animated WebP',()=>{
  for(const raw of ['<svg xmlns="http://www.w3.org/2000/svg"/>','<!DOCTYPE html><html></html>'])assert.throws(()=>rasterHeader(new TextEncoder().encode(raw)));
  assert.throws(()=>rasterHeader(new Uint8Array(MAX_FILE+1)));
  const webp=new Uint8Array(30),v=new DataView(webp.buffer);webp.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,22,true);webp.set(new TextEncoder().encode('WEBPVP8X'),8);webp[20]=2;
  assert.throws(()=>rasterHeader(webp));
  webp[20]=0;webp[24]=255;webp[25]=255;webp[26]=255;assert.throws(()=>rasterHeader(webp));
});
test('real seed WebPs have accepted bounded headers',async()=>{
  const html=await readFile(new URL('../../index.html',import.meta.url),'utf8');
  const photos=JSON.parse(html.match(/id="seed-data"[^>]*>(\[.*?\])<\/div>/s)[1]);
  assert.equal(photos.length,12);
  for(const p of photos){const info=rasterHeader(new Uint8Array(await readFile(new URL('../../'+p.src,import.meta.url))));assert.equal(info.format,'WebP');assert.ok(info.width>0&&info.height>0);}
});
test('stream body guard checks real streamed length, not only Content-Length',async()=>{
  const req=new Request('https://example.test',{method:'POST',body:'12345'});
  await assert.rejects(()=>boundedBody(req,4));
  const exact=new Request('https://example.test',{method:'POST',body:'1234'});
  assert.equal((await boundedBody(exact,4)).length,4);
});
test('Edge TypeScript parses after native type stripping without executing server',async()=>{
  const ts=await readFile(new URL('../functions/bene-admin/index.ts',import.meta.url),'utf8');
  const js=stripTypeScriptTypes(ts,{mode:'strip'});
  assert.doesNotThrow(()=>new vm.SourceTextModule(js));
});
