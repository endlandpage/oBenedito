import { createClient } from 'npm:@supabase/supabase-js@2.108.0';
import { ImageMagick, initializeImageMagick, MagickFormat } from 'npm:@imagemagick/magick-wasm@0.0.46';
import { boundedBody, InputError, MAX_FILE, rasterHeader, saveInput } from './validation.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if (!url || !key) throw new Error('Missing server configuration');
const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const PRIVATE='bene-gallery-private', PUBLIC='bene-gallery-public';
const allowedOrigins=new Set((Deno.env.get('ALLOWED_ORIGINS')??'http://127.0.0.1:8766,http://localhost:8766,https://o-benedito.onrender.com').split(',').map(s=>s.trim()).filter(Boolean));
allowedOrigins.add('https://o-benedito-demo-v4o6.onrender.com');
allowedOrigins.add('https://www.obeneditogastropub.com.br');
allowedOrigins.add('https://obeneditogastropub.com.br');
const allowLocal=Deno.env.get('ALLOW_LOCALHOST')==='true';
let wasmReady: Promise<void> | undefined;
let processingImage=false;
function prepareWasm(){
  return wasmReady??=(async()=>{
    const wasm=await Deno.readFile(new URL(import.meta.resolve('npm:@imagemagick/magick-wasm@0.0.46/magick.wasm')));
    await initializeImageMagick(wasm);
  })();
}
class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
async function rpc(name:string,args:Record<string,unknown>){
  const {data,error}=await db.rpc(name,args);
  if(error){
    if(error.code==='42501')throw new HttpError(403,'Acesso não autorizado.');
    if(error.message==='revision_conflict')throw new HttpError(409,'A galeria foi alterada em outra sessão. Recarregue antes de salvar.');
    if(error.message==='rate_limit')throw new HttpError(429,'Muitas operações. Aguarde antes de tentar novamente.');
    if(error.message==='photo_limit')throw new HttpError(400,'Limite de 100 fotos atingido.');
    throw new HttpError(500,'Não foi possível concluir a operação.');
  }return data;
}
async function checked(result:PromiseLike<{error:unknown}>) {if((await result).error)throw new HttpError(503,'Armazenamento temporariamente indisponível.');}
type Row={id:string;seed_src:string|null;private_path:string|null;public_path:string|null;title:string;caption:string;alt:string;category:string;visible:boolean;position:number;crop:{x:number;y:number;zoom:number}|null};
type SiteSettings={heroModel:string;featureOneId:string|null;featureTwoId:string|null};
type Snapshot={photos:Row[];revision:number;settings:SiteSettings};
async function present(snapshot:Snapshot){
  const photos=await Promise.all(snapshot.photos.map(async p=>{
    let src=p.seed_src;
    if(!src){const {data,error}=await db.storage.from(PRIVATE).createSignedUrl(p.private_path!,300);if(error||!data)throw new HttpError(503,'Não foi possível carregar as imagens.');src=data.signedUrl;}
    return {id:p.id,src,title:p.title,caption:p.caption,alt:p.alt,category:p.category,visible:p.visible,position:p.position,crop:p.crop??null};
  }));return {photos,revision:snapshot.revision,settings:snapshot.settings};
}
async function removePaths(bucket:string,paths:string[]){
  if(!paths.length)return;
  // A failed cleanup does not undo a committed edit. No raw paths/tokens logged.
  const {error}=await db.storage.from(bucket).remove(paths);
  if(error)console.warn('gallery_cleanup_pending',bucket,paths.length);
}
Deno.serve(async request=>{
  const origin=request.headers.get('origin')||'';
  const local=allowLocal && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/.test(origin);
  const originAllowed=allowedOrigins.has(origin)||local;
  const headers:Record<string,string>={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
  if(originAllowed){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type, x-client-info';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';}
  const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers});
  if(origin && !originAllowed)return reply(403,{error:'Origem não autorizada.'});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(!['GET','POST'].includes(request.method))return reply(405,{error:'Método inválido.'});
  try{
    const match=/^Bearer ([A-Za-z0-9._-]+)$/.exec(request.headers.get('authorization')||'');
    if(!match)throw new HttpError(401,'Entre para continuar.');
    const token=match[1];
    const {data,error}=await db.auth.getUser(token);
    if(error||!data.user)throw new HttpError(401,'Sessão inválida. Entre novamente.');
    // Claims are read only AFTER getUser validated this exact bearer token.
    let claims;try{claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));}catch{throw new HttpError(401,'Sessão inválida.');}
    if(typeof claims.session_id!=='string'||!/^[0-9a-f-]{36}$/.test(claims.session_id))throw new HttpError(401,'Sessão inválida.');
    const actor={p_actor:data.user.id,p_session:claims.session_id};
    const contentType=request.headers.get('content-type')||'';
    const operation=request.method==='GET'?'read':contentType.startsWith('multipart/form-data')?'upload':'save';
    await rpc('bene_admin_rate',{...actor,p_operation:operation});
    if(request.method==='GET')return reply(200,await present(await rpc('bene_admin_snapshot',actor)));
    if(operation==='upload'){
      await rpc('bene_admin_rate',{...actor,p_operation:'upload_day'});
      const before:Snapshot=await rpc('bene_admin_snapshot',actor);
      if(before.photos.length>=100)throw new HttpError(400,'Limite de 100 fotos atingido.');
      const body=await boundedBody(request,MAX_FILE+16384);
      let form;try{form=await new Response(body,{headers:{'content-type':contentType}}).formData();}catch{throw new InputError('Upload inválido.');}
      const files=form.getAll('file');
      if(files.length!==1||!(files[0] instanceof File)||Array.from(form.keys()).some(k=>k!=='file'))throw new InputError('Envie uma foto por vez.');
      const file=files[0];
      if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new InputError('Tipo de imagem inválido.');
      const bytes=new Uint8Array(await file.arrayBuffer());
      const info=rasterHeader(bytes);
      if({'Png':'image/png','Jpeg':'image/jpeg','WebP':'image/webp'}[info.format]!==file.type)throw new InputError('O conteúdo não corresponde ao tipo informado.');
      if(processingImage)throw new HttpError(429,'Outra imagem está sendo processada. Aguarde.');
      let sanitized:Uint8Array;
      processingImage=true;
      try{
        await prepareWasm();
        sanitized=ImageMagick.read(bytes,MagickFormat[info.format as keyof typeof MagickFormat],image=>{
          if(image.width!==info.width||image.height!==info.height)throw new InputError('Dimensões de imagem inconsistentes.');
          image.autoOrient();
          const ratio=Math.min(1,1600/Math.max(image.width,image.height));
          if(ratio<1)image.resize(Math.max(1,Math.round(image.width*ratio)),Math.max(1,Math.round(image.height*ratio)));
          image.strip();image.quality=82;
          return image.write(MagickFormat.WebP,output=>new Uint8Array(output));
        });
      }catch(e){if(e instanceof HttpError||e instanceof InputError)throw e;throw new InputError('Não foi possível decodificar a imagem.');}
      finally{processingImage=false;}
      if(!sanitized!.length||sanitized!.length>MAX_FILE)throw new InputError('A imagem processada excede o limite.');
      const id=crypto.randomUUID(),path=id+'.webp';
      await checked(db.storage.from(PRIVATE).upload(path,sanitized!,{contentType:'image/webp',cacheControl:'300',upsert:false}));
      let snapshot:Snapshot;
      try{snapshot=await rpc('bene_admin_insert',{...actor,p_id:id,p_path:path});}
      catch(e){await removePaths(PRIVATE,[path]);throw e;}
      return reply(200,await present(snapshot));
    }
    if(!/^application\/json(?:\s*;|$)/i.test(contentType))throw new HttpError(415,'Use JSON ou um arquivo de imagem.');
    const bytes=await boundedBody(request,128*1024);
    let input;try{input=saveInput(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)));}catch(e){if(e instanceof InputError)throw e;throw new InputError('JSON inválido.');}
    const before:Snapshot=await rpc('bene_admin_snapshot',actor);
    if(before.revision!==input.revision)throw new HttpError(409,'A galeria foi alterada em outra sessão. Recarregue antes de salvar.');
    const rows=new Map(before.photos.map(p=>[p.id,p]));
    const prepared=[];const created:string[]=[];
    try{
      for(const photo of input.photos){
        const old=rows.get(photo.id);if(!old)throw new InputError('Foto desconhecida.');
        let publicPath=old.public_path;
        if(photo.visible&&old.private_path&&!publicPath){
          // Each publication has an immutable unique path. Concurrent stale
          // requests cannot delete/overwrite a newer publication's object.
          publicPath=crypto.randomUUID()+'/'+photo.id+'.webp';
          const {data,error}=await db.storage.from(PRIVATE).download(old.private_path);
          if(error||!data)throw new HttpError(503,'Não foi possível publicar a foto.');
          await checked(db.storage.from(PUBLIC).upload(publicPath,data,{contentType:'image/webp',cacheControl:'60',upsert:false}));
          created.push(publicPath);
        }
        prepared.push({...photo,public_path:publicPath});
      }
      let after:Snapshot;
      try{after=await rpc('bene_admin_save',{...actor,p_revision:input.revision,p_photos:prepared,...(Object.hasOwn(input,'settings')?{p_settings:input.settings}:{})});}
      catch(e){await removePaths(PUBLIC,created);created.length=0;throw e;}
      // Once SQL commits, never compensate by removing the current objects.
      created.length=0;
      const retained=new Set(after.photos.map(p=>p.public_path));
      await removePaths(PUBLIC,before.photos.flatMap(p=>p.public_path&&!retained.has(p.public_path)?[p.public_path]:[]));
      const ids=new Set(after.photos.map(p=>p.id));
      await removePaths(PRIVATE,before.photos.flatMap(p=>p.private_path&&!ids.has(p.id)?[p.private_path]:[]));
      return reply(200,await present(after));
    }catch(e){await removePaths(PUBLIC,created);throw e;}
  }catch(e){
    if(e instanceof InputError)return reply(400,{error:e.message});
    if(e instanceof HttpError)return reply(e.status,{error:e.message});
    console.error('gallery_operation_failed');
    return reply(500,{error:'Não foi possível concluir a operação.'});
  }
});
