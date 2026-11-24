import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
// Existing Miralto test runtime, or an explicitly supplied local installation.
const {PGlite}=require(process.env.BENE_PGLITE_MODULE || 'C:/Miralto/Clientes/O Benedito/Administracao/enquadramento-existente-2026-11-23/test-runtime/node_modules/@electric-sql/pglite');

test('settings migrate, save atomically and enforce public/admin boundaries in PostgreSQL',async()=>{
 const db=new PGlite();
 const actor='11111111-1111-4111-8111-111111111111',session='22222222-2222-4222-8222-222222222222',upload='33333333-3333-4333-8333-333333333333';
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create table auth.users(id uuid primary key);create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(bucket_id text);alter table storage.objects enable row level security;');
  const migrations=new URL('../migrations/',import.meta.url);
  const names=(await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort();
  for(const name of names.filter(name=>!name.includes('bene_site_settings')))await db.exec(await readFile(new URL(name,migrations),'utf8'));
  await db.query('insert into auth.users(id) values($1)',[actor]);
  await db.query('insert into auth.sessions values($1,$2,null)',[session,actor]);
  await db.query('insert into public.bene_gallery_admins(user_id,active) values($1,true)',[actor]);
  await db.query("update public.bene_gallery_photos set crop=$1::jsonb where id='bene-1'",[JSON.stringify({x:23,y:64,zoom:1.4})]);
  const beforeMigration=(await db.query('select * from public.bene_gallery_photos order by position')).rows;
  for(const name of names.filter(name=>name.includes('bene_site_settings')))await db.exec(await readFile(new URL(name,migrations),'utf8'));
  assert.deepEqual((await db.query('select * from public.bene_gallery_photos order by position')).rows,beforeMigration);
  const snap=async()=>(await db.query('select public.bene_admin_snapshot($1,$2) as data',[actor,session])).rows[0].data;
  const save=async(state,photos=state.photos,settings)=>{
   const values=[actor,session,state.revision,JSON.stringify(photos)];
   if(settings!==undefined)values.push(JSON.stringify(settings));
   return (await db.query('select public.bene_admin_save($1,$2,$3,$4::jsonb'+(settings===undefined?'':',$5::jsonb')+') as data',values)).rows[0].data;
  };
  let state=await snap();assert.deepEqual(state.settings,{heroModel:'bene-cheddar',featureOneId:null,featureTwoId:null});
  state=await save(state,state.photos,{heroModel:'menu',featureOneId:'bene-1',featureTwoId:'bene-2'});assert.equal(state.revision,1);
  const selected=structuredClone(state.settings), crop=structuredClone(state.photos[0].crop);
  state=await save(state,state.photos.map(({crop,...photo})=>photo));assert.equal(state.revision,2);assert.deepEqual(state.settings,selected);assert.deepEqual(state.photos[0].crop,crop);
  for(const settings of [null,[],{}, {...selected,heroModel:'arbitrary-url'}, {...selected,heroModel:null},{...selected,featureOneId:7},{...selected,featureOneId:false},{...selected,featureOneId:{}},{...selected,featureOneId:'bene-99'},{...selected,featureOneId:'assets/image.webp'},{...selected,extra:0}]){
   await assert.rejects(()=>save(state,state.photos.map((photo,index)=>({...photo,title:index===0?'Should rollback':photo.title})),settings));
   assert.deepEqual(await snap(),state);
  }
  await assert.rejects(()=>save(state,state.photos.map(photo=>({...photo,visible:photo.id==='bene-1'?false:photo.visible})),selected));assert.deepEqual(await snap(),state);
  await assert.rejects(()=>save(state,state.photos.filter(photo=>photo.id!=='bene-1'),selected));assert.deepEqual(await snap(),state);
  await assert.rejects(()=>save({...state,revision:state.revision-1},state.photos,{...selected,heroModel:'smash-duplo'}),/revision_conflict/);assert.deepEqual(await snap(),state);
  const rev=state.revision;
  state=await save(state,state.photos.map(photo=>({...photo,visible:photo.id==='bene-1'?false:photo.visible})));
  assert.equal(state.revision,rev+1);assert.equal(state.settings.featureOneId,null);assert.equal(state.settings.featureTwoId,'bene-2');
  state=await save(state,state.photos.filter(photo=>photo.id!=='bene-2'));assert.equal(state.settings.featureTwoId,null);assert.equal(state.settings.heroModel,'menu');
  // Defense in depth: a privileged change outside save cannot publish a hidden ref.
  await db.query("update public.bene_gallery_state set feature_one_id='bene-1'");
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   const view=(await db.query('select * from public.bene_site_settings_public')).rows;
   assert.deepEqual(view,[{hero_model:'menu',feature_one_id:null,feature_two_id:null}]);
   assert.deepEqual(Object.keys(view[0]).sort(),['feature_one_id','feature_two_id','hero_model']);
   await db.query('select hero_model,feature_one_id,feature_two_id from public.bene_gallery_state');
   await assert.rejects(()=>db.query('select revision from public.bene_gallery_state'));
   await assert.rejects(()=>db.query('select private_path from public.bene_gallery_photos'));
   await assert.rejects(()=>db.query("update public.bene_gallery_state set hero_model='smash-duplo'"));
   for(const five of [false,true])await assert.rejects(()=>db.query('select public.bene_admin_save($1,$2,$3,$4::jsonb'+(five?',$5::jsonb':'')+')',[actor,session,state.revision,'[]',...(five?['{}']:[])]));
   await assert.rejects(()=>db.query('select public.bene_admin_snapshot($1,$2)',[actor,session]));
   await db.exec('reset role');
  }
  // SQL constraints protect choices even from accidental privileged writes.
  await assert.rejects(()=>db.query("update public.bene_gallery_state set hero_model='bad'"));
  await assert.rejects(()=>db.query("update public.bene_gallery_state set feature_one_id='bene-99'"));
  await db.exec('set role service_role');
  await assert.rejects(()=>db.query('select public.bene_admin_snapshot($1,$2)',[actor,upload]),/forbidden/);
  await assert.rejects(()=>db.query('select public.bene_admin_save($1,$2,$3,$4::jsonb,$5::jsonb)',[actor,upload,state.revision,JSON.stringify(state.photos),JSON.stringify(selected)]),/forbidden/);
  await db.exec('reset role');
  await db.query('update auth.sessions set not_after=now()-interval \'1 second\' where id=$1',[session]);
  await assert.rejects(()=>snap(),/forbidden/);
  await db.query('update auth.sessions set not_after=null where id=$1',[session]);
  await db.query('update public.bene_gallery_admins set active=false where user_id=$1',[actor]);
  await assert.rejects(()=>snap(),/forbidden/);
  await db.query('update public.bene_gallery_admins set active=true where user_id=$1',[actor]);
  const beforeInsert=await snap();
  const inserted=(await db.query('select public.bene_admin_insert($1,$2,$3,$4) as data',[actor,session,upload,upload+'.webp'])).rows[0].data;
  assert.deepEqual(inserted.settings,beforeInsert.settings);assert.equal(inserted.revision,beforeInsert.revision+1);
 }finally{await db.close();}
});
