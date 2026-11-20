import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import vm from 'node:vm';
import {saveInput,rasterHeader,boundedBody,MAX_FILE} from '../functions/bene-admin/validation.mjs';

const photo={id:'bene-1',title:'Foto',caption:'',alt:'Uma foto',category:'comida',visible:true,position:0};
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
